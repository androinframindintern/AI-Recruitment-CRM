import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { extractResumeText } from '../lib/tika.js';
import { parseResumeWithGemini } from '../lib/gemini.js';
import { getDemoStore, nextId } from '../lib/demoStore.js';
import { supabaseAdmin, supabaseConfigured } from '../lib/supabase.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const stageSchema = z.object({
  stage: z.enum(['new', 'parsed', 'shortlisted', 'interview_scheduled', 'selected', 'rejected']),
});

const noteSchema = z.object({
  note: z.string().min(1).max(2000),
  tags: z.array(z.string()).max(12).optional().default([]),
});

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function candidateShape(candidate) {
  return {
    ...candidate,
    skills: normalizeArray(candidate.skills),
    education: normalizeArray(candidate.education),
    experience: normalizeArray(candidate.experience),
  };
}

function parseYearsExperience(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const match = String(val).match(/(\d+(\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

function getMissingSchemaColumn(error) {
  const message = error?.message || '';
  const match = message.match(/Could not find the '([^']+)' column of '([^']+)' in the schema cache/i);
  if (!match) return null;

  return {
    column: match[1],
    table: match[2],
  };
}

async function insertCandidateWithSchemaFallback(candidateInsert) {
  const ignoredColumns = new Set();

  while (true) {
    const payload = Object.fromEntries(
      Object.entries(candidateInsert).filter(([key]) => !ignoredColumns.has(key)),
    );

    const result = await supabaseAdmin
      .from('candidates')
      .insert(payload)
      .select('*')
      .single();

    if (!result.error) return result;

    const missingColumn = getMissingSchemaColumn(result.error);
    const shouldRetry = missingColumn
      && missingColumn.table === 'candidates'
      && Object.hasOwn(candidateInsert, missingColumn.column)
      && !ignoredColumns.has(missingColumn.column);

    if (!shouldRetry) return result;

    ignoredColumns.add(missingColumn.column);
    console.warn(
      `Supabase candidates table is missing "${missingColumn.column}". Retrying insert without that column.`,
    );
  }
}

async function insertNoteWithSchemaFallback(noteInsert) {
  const ignoredColumns = new Set();

  while (true) {
    const payload = Object.fromEntries(
      Object.entries(noteInsert).filter(([key]) => !ignoredColumns.has(key)),
    );

    const result = await supabaseAdmin
      .from('candidate_notes')
      .insert(payload)
      .select('*')
      .single();

    if (!result.error) return result;

    const missingColumn = getMissingSchemaColumn(result.error);
    const shouldRetry = missingColumn
      && missingColumn.table === 'candidate_notes'
      && Object.hasOwn(noteInsert, missingColumn.column)
      && !ignoredColumns.has(missingColumn.column);

    if (!shouldRetry) return result;

    ignoredColumns.add(missingColumn.column);
    console.warn(
      `Supabase candidate_notes table is missing "${missingColumn.column}". Retrying insert without that column.`,
    );
  }
}

router.get('/', requireAuth, async (_req, res) => {
  if (!supabaseConfigured) {
    const store = getDemoStore();
    const candidates = store.candidates
      .map((candidate) => ({
        ...candidate,
        latest_score: store.scores.find((score) => score.candidate_id === candidate.id) || null,
        notes_count: store.notes.filter((note) => note.candidate_id === candidate.id).length,
      }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return res.json({ candidates, stages: store.pipelineStages });
  }

  const { data, error } = await supabaseAdmin
    .from('candidates')
    .select('*, candidate_job_scores(score, skill_match_percent, explanation), candidate_notes(id)')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const candidates = (data || []).map((candidate) => ({
    ...candidateShape(candidate),
    latest_score: candidate.candidate_job_scores?.[0] || null,
    notes_count: candidate.candidate_notes?.length || 0,
  }));

  res.json({ candidates });
});

router.get('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  if (!supabaseConfigured) {
    const store = getDemoStore();
    const candidate = store.candidates.find((item) => item.id === id);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    return res.json({
      candidate,
      resume: store.resumes.find((item) => item.candidate_id === id) || null,
      notes: store.notes.filter((item) => item.candidate_id === id),
      scores: store.scores.filter((item) => item.candidate_id === id),
      history: store.stageHistory.filter((item) => item.candidate_id === id),
      interviews: store.interviews.filter((item) => item.candidate_id === id),
    });
  }

  const [{ data: candidate }, { data: resume }, { data: notes }, { data: scores }, { data: history }, { data: interviews }] = await Promise.all([
    supabaseAdmin.from('candidates').select('*').eq('id', id).maybeSingle(),
    supabaseAdmin.from('candidate_resumes').select('*').eq('candidate_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from('candidate_notes').select('*').eq('candidate_id', id).order('created_at', { ascending: false }),
    supabaseAdmin.from('candidate_job_scores').select('*').eq('candidate_id', id).order('created_at', { ascending: false }),
    supabaseAdmin.from('candidate_stage_history').select('*').eq('candidate_id', id).order('created_at', { ascending: false }),
    supabaseAdmin.from('interviews').select('*').eq('candidate_id', id).order('created_at', { ascending: false }),
  ]);

  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  res.json({
    candidate: candidateShape(candidate),
    resume: resume || null,
    notes: notes || [],
    scores: scores || [],
    history: history || [],
    interviews: interviews || [],
  });
});

router.post('/upload', requireAuth, upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Resume file is required' });

    console.log('Extracting text from uploaded file:', req.file.originalname);
    let text;
    try {
      text = await extractResumeText({
        buffer: req.file.buffer,
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
      });
    } catch (extractErr) {
      console.error('Text extraction failed:', extractErr);
      return res.status(500).json({ error: `Text extraction failed: ${extractErr.message}` });
    }

    let parsed;
    try {
      parsed = candidateShape(await parseResumeWithGemini(text));
    } catch (geminiError) {
      console.error('Gemini resume parsing failed, falling back to local fallback data:', geminiError);
      
      const emailMatch = text.match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/);
      const phoneMatch = text.match(/(\+?\d[\d -]{9,15}\d)/);
      const locationMatch = text.match(/([A-Z][a-zA-Z ]{1,30},\s*[A-Z][a-zA-Z ]{1,30})/);
      const expMatch = text.match(/(\d+)\s*\+?\s*years?\s+(of\s+)?experience/i);

      parsed = candidateShape({
        full_name: req.file.originalname.replace(/\.[^.]+$/, ''),
        email: emailMatch ? emailMatch[0] : '',
        phone: phoneMatch ? phoneMatch[0].trim() : '',
        summary: `Document text successfully extracted. AI structured parsing fell back due to: ${geminiError.message || 'Gemini error'}.`,
        current_company: '',
        current_title: 'Applicant',
        years_experience: expMatch ? Number(expMatch[1]) : 0,
        skills: [],
        education: [],
        experience: [],
        location: locationMatch ? locationMatch[0].trim() : '',
      });
    }

    if (!supabaseConfigured) {
      const store = getDemoStore();
      const candidate = {
        id: nextId('candidate'),
        owner_id: req.user.id,
        full_name: parsed.full_name || req.file.originalname.replace(/\.[^.]+$/, ''),
        email: parsed.email || '',
        phone: parsed.phone || '',
        summary: parsed.summary || '',
        current_company: parsed.current_company || '',
        current_title: parsed.current_title || '',
        years_experience: parseYearsExperience(parsed.years_experience || 0),
        skills: normalizeArray(parsed.skills),
        education: normalizeArray(parsed.education),
        experience: normalizeArray(parsed.experience),
        location: parsed.location || '',
        stage: 'parsed',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const resume = {
        id: nextId('resume'),
        candidate_id: candidate.id,
        file_name: req.file.originalname,
        mime_type: req.file.mimetype,
        extracted_text: text,
        storage_path: null,
        created_at: new Date().toISOString(),
      };

      store.candidates.unshift(candidate);
      store.resumes.unshift(resume);
      store.stageHistory.unshift({
        id: nextId('history'),
        candidate_id: candidate.id,
        from_stage: 'new',
        to_stage: 'parsed',
        changed_by: req.user.id,
        created_at: new Date().toISOString(),
      });

      return res.status(201).json({ candidate, resume });
    }

    const candidateInsert = {
      owner_id: req.user.id,
      full_name: parsed.full_name || req.file.originalname.replace(/\.[^.]+$/, ''),
      email: parsed.email || '',
      phone: parsed.phone || '',
      summary: parsed.summary || '',
      current_company: parsed.current_company || '',
      current_title: parsed.current_title || '',
      years_experience: parseYearsExperience(parsed.years_experience || 0),
      skills: normalizeArray(parsed.skills),
      education: normalizeArray(parsed.education),
      experience: normalizeArray(parsed.experience),
      location: parsed.location || '',
      stage: 'parsed',
    };

    console.log('Inserting candidate record into Supabase...');
    const { data: candidate, error: candidateError } = await insertCandidateWithSchemaFallback(candidateInsert);
    if (candidateError) {
      console.error('Candidate insert failed:', candidateError);
      return res.status(500).json({ error: `Candidate insert failed: ${candidateError.message}` });
    }

    if (!candidate) {
      console.error('Candidate insert returned empty result');
      return res.status(500).json({ error: 'Candidate insert returned empty result' });
    }

    let storagePath = null;
    try {
      const bucket = process.env.SUPABASE_RESUME_BUCKET || 'resumes';
      const uploadPath = `${candidate.id}/${Date.now()}-${req.file.originalname}`;
      console.log(`Uploading file to Supabase Storage in bucket "${bucket}"...`);
      const { error: storageError } = await supabaseAdmin.storage.from(bucket).upload(uploadPath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });
      if (!storageError) {
        storagePath = uploadPath;
      } else {
        console.warn('Supabase storage upload failed:', storageError);
      }
    } catch (err) {
      console.error('Supabase storage upload exception:', err);
    }

    console.log('Inserting resume record into Supabase...');
    const { data: resume, error: resumeError } = await supabaseAdmin
      .from('candidate_resumes')
      .insert({
        candidate_id: candidate.id,
        file_name: req.file.originalname,
        mime_type: req.file.mimetype,
        extracted_text: text,
        storage_path: storagePath,
        parse_status: 'parsed',
      })
      .select('*')
      .single();

    if (resumeError) {
      console.error('Resume insert failed:', resumeError);
      return res.status(500).json({ error: `Resume record insert failed: ${resumeError.message}` });
    }

    try {
      console.log('Logging initial stage transition history...');
      await supabaseAdmin.from('candidate_stage_history').insert({
        candidate_id: candidate.id,
        from_stage: 'new',
        to_stage: 'parsed',
        changed_by: req.user.id,
      });
    } catch (err) {
      console.warn('Candidate stage history insert exception (silenced):', err);
    }

    console.log('Resume parsed and candidate imported successfully:', candidate.id);
    res.status(201).json({ candidate: candidateShape(candidate), resume });
  } catch (err) {
    console.error('Unhandled candidate upload error:', err);
    res.status(500).json({ error: `Unhandled upload error: ${err.message}` });
  }
});

router.patch('/:id/stage', requireAuth, async (req, res) => {
  const parsed = stageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid stage' });

  const { id } = req.params;
  const { stage } = parsed.data;

  if (!supabaseConfigured) {
    const store = getDemoStore();
    const candidate = store.candidates.find((item) => item.id === id);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    const fromStage = candidate.stage;
    candidate.stage = stage;
    candidate.updated_at = new Date().toISOString();
    store.stageHistory.unshift({
      id: nextId('history'),
      candidate_id: id,
      from_stage: fromStage,
      to_stage: stage,
      changed_by: req.user.id,
      created_at: new Date().toISOString(),
    });

    return res.json({ candidate });
  }

  const { data: existing } = await supabaseAdmin.from('candidates').select('id, stage').eq('id', id).maybeSingle();
  if (!existing) return res.status(404).json({ error: 'Candidate not found' });

  const { data: candidate, error } = await supabaseAdmin
    .from('candidates')
    .update({ stage, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabaseAdmin.from('candidate_stage_history').insert({
    candidate_id: id,
    from_stage: existing.stage,
    to_stage: stage,
    changed_by: req.user.id,
  });

  res.json({ candidate: candidateShape(candidate) });
});

router.post('/:id/notes', requireAuth, async (req, res) => {
  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid note payload' });

  const { id } = req.params;
  const payload = parsed.data;

  if (!supabaseConfigured) {
    const store = getDemoStore();
    const note = {
      id: nextId('note'),
      candidate_id: id,
      note: payload.note,
      tags: payload.tags,
      created_by: req.user.id,
      created_at: new Date().toISOString(),
    };
    store.notes.unshift(note);
    return res.status(201).json({ note });
  }

  const { data: note, error } = await insertNoteWithSchemaFallback({
    candidate_id: id,
    note: payload.note,
    tags: payload.tags,
    created_by: req.user.id,
  });

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ note });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  if (!supabaseConfigured) {
    const store = getDemoStore();
    const index = store.candidates.findIndex((item) => item.id === id);
    if (index === -1) return res.status(404).json({ error: 'Candidate not found' });

    store.candidates.splice(index, 1);
    store.resumes = store.resumes.filter((item) => item.candidate_id !== id);
    store.notes = store.notes.filter((item) => item.candidate_id !== id);
    store.scores = store.scores.filter((item) => item.candidate_id !== id);
    store.stageHistory = store.stageHistory.filter((item) => item.candidate_id !== id);
    store.interviews = store.interviews.filter((item) => item.candidate_id !== id);

    return res.json({ success: true });
  }

  const { error } = await supabaseAdmin
    .from('candidates')
    .delete()
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ success: true });
});

export default router;
