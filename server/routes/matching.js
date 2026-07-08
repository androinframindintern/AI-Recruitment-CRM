import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { scoreCandidateMatch } from '../lib/gemini.js';
import { cosineSimilarity, ensureCandidateEmbedding, ensureJobEmbedding, EMBEDDING_MODEL } from '../lib/embeddings.js';
import { getDemoStore, nextId } from '../lib/demoStore.js';
import { supabaseAdmin, supabaseConfigured } from '../lib/supabase.js';

const router = Router();

const scoreSchema = z.object({
  candidateId: z.string().min(1),
  jobId: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
});

const rankSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(50),
  minSimilarity: z.number().min(0).max(1).optional().default(0),
  backfillMissing: z.boolean().optional().default(true),
});

const backfillSchema = z.object({
  jobs: z.boolean().optional().default(true),
  candidates: z.boolean().optional().default(true),
  limit: z.number().int().min(1).max(100).optional().default(25),
});

function sendAiScoringError(res, error) {
  console.warn('Gemini candidate scoring failed:', error?.message || error);
  return res.status(error?.status || 502).json({
    error: error?.message || 'Gemini AI scoring failed. No fallback score was generated.',
    code: error?.code || 'AI_SCORING_UNAVAILABLE',
    provider: error?.provider || 'gemini',
  });
}

function sendEmbeddingError(res, error) {
  console.warn('Embedding matching failed:', error?.message || error);
  return res.status(error?.status || 502).json({
    error: error?.message || 'Embedding matching failed.',
    code: error?.code || 'EMBEDDING_MATCHING_FAILED',
    provider: error?.provider || 'gemini',
  });
}

function buildJobPayload({ ownerId, title, description }) {
  return {
    owner_id: ownerId,
    title: title || 'Untitled role',
    description: description || '',
    requirements: [],
  };
}

function toMatchScore(similarity) {
  const bounded = Math.max(0, Math.min(1, Number(similarity) || 0));
  return Math.round(bounded * 100);
}

function buildEmbeddingScorePayload({ candidateId, jobId, similarity }) {
  const score = toMatchScore(similarity);
  return {
    candidate_id: candidateId,
    job_id: jobId,
    score,
    skill_match_percent: score,
    matched_skills: [],
    missing_skills: [],
    explanation: 'Semantic embedding match based on the job description and candidate resume/profile.',
    embedding_similarity: Math.max(0, Math.min(1, Number(similarity) || 0)),
    embedding_model: EMBEDDING_MODEL,
    scoring_method: 'embedding',
  };
}

function isMissingScoreColumnError(error) {
  return /embedding_similarity|embedding_model|scoring_method|updated_at/i.test(error?.message || '');
}

function isMissingConflictConstraintError(error) {
  return /no unique or exclusion constraint matching the on conflict specification/i.test(error?.message || '');
}

function toLegacyScorePayload(payload) {
  const legacyPayload = { ...payload };
  delete legacyPayload.embedding_similarity;
  delete legacyPayload.embedding_model;
  delete legacyPayload.scoring_method;
  delete legacyPayload.updated_at;
  return legacyPayload;
}

async function manualUpsertCandidateJobScore(payload) {
  const { data: existingScore, error: selectError } = await supabaseAdmin
    .from('candidate_job_scores')
    .select('id')
    .eq('candidate_id', payload.candidate_id)
    .eq('job_id', payload.job_id)
    .maybeSingle();

  if (selectError) return { data: null, error: selectError };

  if (existingScore) {
    return supabaseAdmin
      .from('candidate_job_scores')
      .update(payload)
      .eq('id', existingScore.id)
      .select('*')
      .single();
  }

  return supabaseAdmin
    .from('candidate_job_scores')
    .insert(payload)
    .select('*')
    .single();
}

async function upsertCandidateJobScore(payload) {
  let activePayload = payload;
  let result = await supabaseAdmin
    .from('candidate_job_scores')
    .upsert(activePayload, { onConflict: 'candidate_id,job_id' })
    .select('*')
    .single();

  if (result.error && isMissingScoreColumnError(result.error)) {
    activePayload = toLegacyScorePayload(payload);
    result = await supabaseAdmin
      .from('candidate_job_scores')
      .upsert(activePayload, { onConflict: 'candidate_id,job_id' })
      .select('*')
      .single();
  }

  if (result.error && isMissingConflictConstraintError(result.error)) {
    result = await manualUpsertCandidateJobScore(activePayload);
    if (result.error && isMissingScoreColumnError(result.error)) {
      result = await manualUpsertCandidateJobScore(toLegacyScorePayload(activePayload));
    }
  }

  return result;
}

function storeDemoScore(store, payload) {
  const score = {
    id: nextId('score'),
    ...payload,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  store.scores = store.scores.filter((item) => !(item.candidate_id === payload.candidate_id && item.job_id === payload.job_id));
  store.scores.unshift(score);
  return score;
}

async function tryEnsureJobEmbedding(job) {
  try {
    return await ensureJobEmbedding(job);
  } catch (error) {
    console.warn('Job embedding generation failed:', error?.message || error);
    throw error;
  }
}

async function tryEnsureCandidateEmbedding(candidate, resume) {
  try {
    return await ensureCandidateEmbedding(candidate, resume);
  } catch (error) {
    console.warn('Candidate embedding generation failed:', error?.message || error);
    throw error;
  }
}

router.post('/embeddings/backfill', requireAuth, async (req, res) => {
  const parsed = backfillSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'Invalid backfill payload' });
  const options = parsed.data;

  const result = {
    jobs_scanned: 0,
    jobs_embedded: 0,
    candidates_scanned: 0,
    candidates_embedded: 0,
    failures: [],
  };

  try {
    if (!supabaseConfigured) {
      const store = getDemoStore();
      if (options.jobs) {
        for (const job of store.jobs.slice(0, options.limit)) {
          result.jobs_scanned += 1;
          await ensureJobEmbedding(job);
          result.jobs_embedded += 1;
        }
      }
      if (options.candidates) {
        for (const candidate of store.candidates.slice(0, options.limit)) {
          result.candidates_scanned += 1;
          const resume = store.resumes.find((item) => item.candidate_id === candidate.id) || null;
          await ensureCandidateEmbedding(candidate, resume);
          result.candidates_embedded += 1;
        }
      }
      return res.json(result);
    }

    if (options.jobs) {
      const { data: jobs, error } = await supabaseAdmin
        .from('jobs')
        .select('*')
        .eq('owner_id', req.user.id)
        .limit(options.limit);
      if (error) return res.status(500).json({ error: error.message });

      for (const job of jobs || []) {
        result.jobs_scanned += 1;
        try {
          await ensureJobEmbedding(job);
          result.jobs_embedded += 1;
        } catch (error) {
          result.failures.push({ type: 'job', id: job.id, error: error.message });
        }
      }
    }

    if (options.candidates) {
      const { data: candidates, error } = await supabaseAdmin
        .from('candidates')
        .select('*')
        .eq('owner_id', req.user.id)
        .limit(options.limit);
      if (error) return res.status(500).json({ error: error.message });

      for (const candidate of candidates || []) {
        result.candidates_scanned += 1;
        try {
          const { data: resume } = await supabaseAdmin
            .from('candidate_resumes')
            .select('extracted_text')
            .eq('candidate_id', candidate.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          await ensureCandidateEmbedding(candidate, resume);
          result.candidates_embedded += 1;
        } catch (error) {
          result.failures.push({ type: 'candidate', id: candidate.id, error: error.message });
        }
      }
    }

    return res.json(result);
  } catch (error) {
    return sendEmbeddingError(res, error);
  }
});

router.post('/jobs/:jobId/candidates', requireAuth, async (req, res) => {
  const parsed = rankSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'Invalid ranking payload' });

  const { jobId } = req.params;
  const { limit, minSimilarity, backfillMissing } = parsed.data;

  try {
    if (!supabaseConfigured) {
      const store = getDemoStore();
      const job = store.jobs.find((item) => item.id === jobId);
      if (!job) return res.status(404).json({ error: 'Job not found' });

      const { embedding: jobEmbedding } = await tryEnsureJobEmbedding(job);
      const matches = [];
      for (const candidate of store.candidates) {
        const resume = store.resumes.find((item) => item.candidate_id === candidate.id) || null;
        const { embedding: candidateEmbedding } = await tryEnsureCandidateEmbedding(candidate, resume);
        const similarity = cosineSimilarity(jobEmbedding, candidateEmbedding);
        if (similarity < minSimilarity) continue;
        const score = storeDemoScore(store, buildEmbeddingScorePayload({ candidateId: candidate.id, jobId: job.id, similarity }));
        matches.push({ candidate, score, similarity });
      }

      matches.sort((a, b) => b.similarity - a.similarity);
      return res.json({ job, matches: matches.slice(0, limit), generated: matches.length });
    }

    const { data: job, error: jobError } = await supabaseAdmin
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .eq('owner_id', req.user.id)
      .maybeSingle();

    if (jobError) return res.status(500).json({ error: jobError.message });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const { embedding: jobEmbedding } = await tryEnsureJobEmbedding(job);

    const { data: candidates, error: candidatesError } = await supabaseAdmin
      .from('candidates')
      .select('*')
      .eq('owner_id', req.user.id)
      .limit(Math.max(limit, 100));

    if (candidatesError) return res.status(500).json({ error: candidatesError.message });

    const candidateRows = candidates || [];
    const resumeResponses = candidateRows.length
      ? await supabaseAdmin
        .from('candidate_resumes')
        .select('candidate_id, extracted_text, created_at')
        .in('candidate_id', candidateRows.map((candidate) => candidate.id))
        .order('created_at', { ascending: false })
      : { data: [] };

    const resumesByCandidate = new Map();
    for (const resume of resumeResponses.data || []) {
      if (!resumesByCandidate.has(resume.candidate_id)) resumesByCandidate.set(resume.candidate_id, resume);
    }

    const candidateEmbeddings = new Map();
    if (backfillMissing) {
      for (const candidate of candidateRows) {
        const resume = resumesByCandidate.get(candidate.id) || null;
        const { embedding } = await tryEnsureCandidateEmbedding(candidate, resume);
        candidateEmbeddings.set(candidate.id, embedding);
      }
    }

    let ranked = [];
    const { data: rpcMatches, error: rpcError } = await supabaseAdmin.rpc('match_candidates_for_job', {
      p_job_id: job.id,
      p_owner_id: req.user.id,
      p_limit: limit,
      p_min_similarity: minSimilarity,
    });

    if (!rpcError && Array.isArray(rpcMatches) && rpcMatches.length) {
      ranked = rpcMatches.map((item) => ({ candidate_id: item.candidate_id, similarity: Number(item.similarity) || 0 }));
    } else {
      if (rpcError) console.warn('match_candidates_for_job RPC failed, using app-side cosine fallback:', rpcError.message);
      ranked = candidateRows
        .map((candidate) => {
          const candidateEmbedding = candidateEmbeddings.get(candidate.id);
          if (!candidateEmbedding) return null;
          const similarity = cosineSimilarity(jobEmbedding, candidateEmbedding);
          return similarity >= minSimilarity ? { candidate_id: candidate.id, similarity } : null;
        })
        .filter(Boolean)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
    }

    const candidatesById = new Map(candidateRows.map((candidate) => [candidate.id, candidate]));
    const matches = [];

    for (const rankedItem of ranked) {
      const candidate = candidatesById.get(rankedItem.candidate_id);
      if (!candidate) continue;
      const payload = buildEmbeddingScorePayload({ candidateId: candidate.id, jobId: job.id, similarity: rankedItem.similarity });
      const { data: score, error } = await upsertCandidateJobScore(payload);
      if (error) return res.status(500).json({ error: error.message });
      matches.push({ candidate, score, similarity: rankedItem.similarity });
    }

    return res.json({ job, matches, generated: matches.length });
  } catch (error) {
    return sendEmbeddingError(res, error);
  }
});

router.post('/score', requireAuth, async (req, res) => {
  const parsed = scoreSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid score payload' });

  const { candidateId, jobId, title, description } = parsed.data;

  if (!supabaseConfigured) {
    const store = getDemoStore();
    const candidate = store.candidates.find((item) => item.id === candidateId);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    let job = null;
    let shouldStoreJob = false;

    if (jobId) {
      job = store.jobs.find((item) => item.id === jobId);
      if (!job) return res.status(404).json({ error: 'Job not found' });
    } else {
      job = {
        id: nextId('job'),
        ...buildJobPayload({ ownerId: req.user.id, title, description }),
        created_at: new Date().toISOString(),
      };
      shouldStoreJob = true;
    }

    const resumeText = store.resumes.find((item) => item.candidate_id === candidate.id)?.extracted_text || '';

    let aiScore;
    try {
      aiScore = await scoreCandidateMatch({ candidate, job, resumeText });
    } catch (geminiError) {
      return sendAiScoringError(res, geminiError);
    }

    if (shouldStoreJob) store.jobs.unshift(job);

    const score = storeDemoScore(store, {
      candidate_id: candidate.id,
      job_id: job.id,
      score: aiScore.score,
      skill_match_percent: aiScore.skill_match_percent,
      matched_skills: aiScore.matched_skills || [],
      missing_skills: aiScore.missing_skills || [],
      explanation: aiScore.explanation,
      scoring_method: 'gemini_llm',
    });

    return res.json({ score, job });
  }

  const [{ data: candidate }, { data: resume }, jobResponse] = await Promise.all([
    supabaseAdmin.from('candidates').select('*').eq('id', candidateId).eq('owner_id', req.user.id).maybeSingle(),
    supabaseAdmin
      .from('candidate_resumes')
      .select('extracted_text')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    jobId
      ? supabaseAdmin.from('jobs').select('*').eq('id', jobId).eq('owner_id', req.user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  let job = jobResponse.data;
  if (jobId && !job) return res.status(404).json({ error: 'Job not found' });

  const pendingJob = job || buildJobPayload({ ownerId: req.user.id, title, description });
  const resumeText = resume?.extracted_text || '';

  let aiScore;
  try {
    aiScore = await scoreCandidateMatch({ candidate, job: pendingJob, resumeText });
  } catch (geminiError) {
    return sendAiScoringError(res, geminiError);
  }

  if (!job) {
    const { data: createdJob, error: jobError } = await supabaseAdmin
      .from('jobs')
      .insert(pendingJob)
      .select('*')
      .single();
    if (jobError) return res.status(500).json({ error: jobError.message });
    job = createdJob;
  }

  void ensureJobEmbedding(job).catch((error) => console.warn('Job embedding refresh after scoring failed:', error?.message || error));
  void ensureCandidateEmbedding(candidate, resume).catch((error) => console.warn('Candidate embedding refresh after scoring failed:', error?.message || error));

  const payload = {
    candidate_id: candidate.id,
    job_id: job.id,
    score: aiScore.score,
    skill_match_percent: aiScore.skill_match_percent,
    matched_skills: aiScore.matched_skills || [],
    missing_skills: aiScore.missing_skills || [],
    explanation: aiScore.explanation,
    scoring_method: 'gemini_llm',
  };

  const { data: score, error } = await upsertCandidateJobScore(payload);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ score, job });
});

export default router;
