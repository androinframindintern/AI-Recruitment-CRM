import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { scoreCandidateMatch } from '../lib/gemini.js';
import { scoreSimilarity } from '../lib/faiss.js';
import { getDemoStore, nextId } from '../lib/demoStore.js';
import { supabaseAdmin, supabaseConfigured } from '../lib/supabase.js';

const router = Router();

const scoreSchema = z.object({
  candidateId: z.string().min(1),
  jobId: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
});

router.post('/score', requireAuth, async (req, res) => {
  const parsed = scoreSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid score payload' });

  const { candidateId, jobId, title, description } = parsed.data;

  if (!supabaseConfigured) {
    const store = getDemoStore();
    const candidate = store.candidates.find((item) => item.id === candidateId);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    let job = jobId ? store.jobs.find((item) => item.id === jobId) : null;
    if (!job) {
      job = {
        id: nextId('job'),
        title: title || 'Untitled role',
        description: description || '',
        requirements: [],
        created_at: new Date().toISOString(),
      };
      if (!jobId) store.jobs.unshift(job);
    }

    const similarity = scoreSimilarity(candidate, job);
    const aiScore = await scoreCandidateMatch({ candidate, job });
    const score = {
      id: nextId('score'),
      candidate_id: candidate.id,
      job_id: job.id,
      score: aiScore.score,
      skill_match_percent: aiScore.skill_match_percent || similarity.score,
      matched_skills: aiScore.matched_skills || similarity.matchedSkills,
      missing_skills: aiScore.missing_skills || [],
      explanation: aiScore.explanation,
      created_at: new Date().toISOString(),
    };
    store.scores.unshift(score);
    return res.json({ score, job });
  }

  const [{ data: candidate }, jobResponse] = await Promise.all([
    supabaseAdmin.from('candidates').select('*').eq('id', candidateId).maybeSingle(),
    jobId
      ? supabaseAdmin.from('jobs').select('*').eq('id', jobId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  let job = jobResponse.data;
  if (!job) {
    const { data: createdJob, error: jobError } = await supabaseAdmin
      .from('jobs')
      .insert({
        owner_id: req.user.id,
        title: title || 'Untitled role',
        description: description || '',
        requirements: [],
      })
      .select('*')
      .single();
    if (jobError) return res.status(500).json({ error: jobError.message });
    job = createdJob;
  }

  const similarity = scoreSimilarity(candidate, job);
  const aiScore = await scoreCandidateMatch({ candidate, job });
  const payload = {
    candidate_id: candidate.id,
    job_id: job.id,
    score: aiScore.score,
    skill_match_percent: aiScore.skill_match_percent || similarity.score,
    matched_skills: aiScore.matched_skills || similarity.matchedSkills,
    missing_skills: aiScore.missing_skills || [],
    explanation: aiScore.explanation,
  };

  const { data: score, error } = await supabaseAdmin.from('candidate_job_scores').insert(payload).select('*').single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ score, job });
});

export default router;
