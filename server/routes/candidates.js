import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth, requireCompanyAccount } from '../middleware/auth.js';
import { extractResumeText } from '../lib/tika.js';
import { candidateShape, processCandidateResumeUpload, RESUME_UPLOAD_LIMIT_BYTES } from '../lib/candidateIntake.js';
import { getDemoStore, nextId } from '../lib/demoStore.js';
import { supabaseAdmin, supabaseConfigured } from '../lib/supabase.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: RESUME_UPLOAD_LIMIT_BYTES } });

function isAdmin(req) {
  return req.profile?.role === 'admin' || req.user?.user_metadata?.role === 'admin';
}

function parseResumeUpload(req, res, next) {
  upload.single('resume')(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Resume file must be 8 MB or smaller.' });
    }
    console.warn('Resume upload parsing failed:', error?.message || error);
    return res.status(400).json({ error: 'Could not read uploaded resume.' });
  });
}

const stageSchema = z.object({
  stage: z.enum(['new', 'parsed', 'shortlisted', 'interview_scheduled', 'selected', 'rejected']),
});

const noteSchema = z.object({
  note: z.string().min(1).max(2000),
  tags: z.array(z.string()).max(12).optional().default([]),
});

function getMissingSchemaColumn(error) {
  const message = error?.message || '';
  const match = message.match(/Could not find the '([^']+)' column of '([^']+)' in the schema cache/i);
  if (!match) return null;

  return {
    column: match[1],
    table: match[2],
  };
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

function sendSafeDbError(res, error, fallback) {
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}

router.get('/', requireAuth, requireCompanyAccount, async (req, res) => {
  if (!supabaseConfigured) {
    const store = getDemoStore();
    const candidates = store.candidates
      .filter((candidate) => isAdmin(req) || candidate.owner_id === req.user.id)
      .map((candidate) => ({
        ...candidate,
        latest_score: store.scores.find((score) => score.candidate_id === candidate.id) || null,
        job_scores: store.scores.filter((score) => score.candidate_id === candidate.id),
        notes_count: store.notes.filter((note) => note.candidate_id === candidate.id).length,
      }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return res.json({ candidates, stages: store.pipelineStages });
  }

  let query = supabaseAdmin
    .from('candidates')
    .select('*, candidate_job_scores(score, skill_match_percent, explanation, job_id), candidate_notes(id)')
    .order('created_at', { ascending: false });

  if (!isAdmin(req)) query = query.eq('owner_id', req.user.id);

  const { data, error } = await query;

  if (error) return sendSafeDbError(res, error, 'Could not load candidates.');

  const candidates = (data || []).map((candidate) => ({
    ...candidateShape(candidate),
    latest_score: candidate.candidate_job_scores?.[0] || null,
    job_scores: candidate.candidate_job_scores || [],
    notes_count: candidate.candidate_notes?.length || 0,
  }));

  res.json({ candidates });
});


router.get('/:id', requireAuth, requireCompanyAccount, async (req, res) => {
  const { id } = req.params;

  if (!supabaseConfigured) {
    const store = getDemoStore();
    const candidate = store.candidates.find((item) => item.id === id && (isAdmin(req) || item.owner_id === req.user.id));
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

  let candidateQuery = supabaseAdmin.from('candidates').select('*').eq('id', id);
  if (!isAdmin(req)) candidateQuery = candidateQuery.eq('owner_id', req.user.id);

  const { data: candidate, error: candidateError } = await candidateQuery.maybeSingle();
  if (candidateError) return sendSafeDbError(res, candidateError, 'Could not load candidate.');
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  const [{ data: resume }, { data: notes }, { data: scores }, { data: history }, { data: interviews }] = await Promise.all([
    supabaseAdmin.from('candidate_resumes').select('*').eq('candidate_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from('candidate_notes').select('*').eq('candidate_id', id).order('created_at', { ascending: false }),
    supabaseAdmin.from('candidate_job_scores').select('*').eq('candidate_id', id).order('created_at', { ascending: false }),
    supabaseAdmin.from('candidate_stage_history').select('*').eq('candidate_id', id).order('created_at', { ascending: false }),
    supabaseAdmin.from('interviews').select('*').eq('candidate_id', id).order('created_at', { ascending: false }),
  ]);

  res.json({
    candidate: candidateShape(candidate),
    resume: resume || null,
    notes: notes || [],
    scores: scores || [],
    history: history || [],
    interviews: interviews || [],
  });
});

router.post('/extract-text', requireAuth, requireCompanyAccount, parseResumeUpload, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Resume file is required' });
    const text = await extractResumeText({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
    });
    return res.json({
      text,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
    });
  } catch (error) {
    console.warn('Resume text extraction failed:', error?.message || error);
    return res.status(422).json({ error: 'Could not extract readable text from this resume.' });
  }
});

router.post('/upload', requireAuth, requireCompanyAccount, parseResumeUpload, async (req, res) => {
  try {
    const { candidate, resume, embedding } = await processCandidateResumeUpload({
      file: req.file,
      ownerId: req.user.id,
      changedBy: req.user.id,
    });

    res.status(201).json({ candidate, resume, embedding });
  } catch (err) {
    console.error('Unhandled candidate upload error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Could not upload candidate resume.' });
  }
});

router.patch('/:id/stage', requireAuth, requireCompanyAccount, async (req, res) => {
  const parsed = stageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid stage' });

  const { id } = req.params;
  const { stage } = parsed.data;

  if (!supabaseConfigured) {
    const store = getDemoStore();
    const candidate = store.candidates.find((item) => item.id === id && (isAdmin(req) || item.owner_id === req.user.id));
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

  let existingQuery = supabaseAdmin.from('candidates').select('id, stage').eq('id', id);
  if (!isAdmin(req)) existingQuery = existingQuery.eq('owner_id', req.user.id);

  const { data: existing } = await existingQuery.maybeSingle();
  if (!existing) return res.status(404).json({ error: 'Candidate not found' });

  let updateQuery = supabaseAdmin
    .from('candidates')
    .update({ stage, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (!isAdmin(req)) updateQuery = updateQuery.eq('owner_id', req.user.id);

  const { data: candidate, error } = await updateQuery
    .select('*')
    .single();

  if (error) return sendSafeDbError(res, error, 'Could not update candidate stage.');

  await supabaseAdmin.from('candidate_stage_history').insert({
    candidate_id: id,
    from_stage: existing.stage,
    to_stage: stage,
    changed_by: req.user.id,
  });

  res.json({ candidate: candidateShape(candidate) });
});

router.post('/:id/notes', requireAuth, requireCompanyAccount, async (req, res) => {
  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid note payload' });

  const { id } = req.params;
  const payload = parsed.data;

  if (!supabaseConfigured) {
    const store = getDemoStore();
    const candidate = store.candidates.find((item) => item.id === id && (isAdmin(req) || item.owner_id === req.user.id));
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

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

  let candidateQuery = supabaseAdmin.from('candidates').select('id').eq('id', id);
  if (!isAdmin(req)) candidateQuery = candidateQuery.eq('owner_id', req.user.id);

  const { data: candidate } = await candidateQuery.maybeSingle();
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  const { data: note, error } = await insertNoteWithSchemaFallback({
    candidate_id: id,
    note: payload.note,
    tags: payload.tags,
    created_by: req.user.id,
  });

  if (error) return sendSafeDbError(res, error, 'Could not save candidate note.');
  res.status(201).json({ note });
});

router.delete('/:id', requireAuth, requireCompanyAccount, async (req, res) => {
  const { id } = req.params;

  if (!supabaseConfigured) {
    const store = getDemoStore();
    const index = store.candidates.findIndex((item) => item.id === id && (isAdmin(req) || item.owner_id === req.user.id));
    if (index === -1) return res.status(404).json({ error: 'Candidate not found' });

    store.candidates.splice(index, 1);
    store.resumes = store.resumes.filter((item) => item.candidate_id !== id);
    store.notes = store.notes.filter((item) => item.candidate_id !== id);
    store.scores = store.scores.filter((item) => item.candidate_id !== id);
    store.stageHistory = store.stageHistory.filter((item) => item.candidate_id !== id);
    store.interviews = store.interviews.filter((item) => item.candidate_id !== id);
    store.jobApplications = (store.jobApplications || []).filter((application) => application.candidate_id !== id);

    return res.json({ success: true });
  }

  let deleteQuery = supabaseAdmin
    .from('candidates')
    .delete()
    .eq('id', id);
  if (!isAdmin(req)) deleteQuery = deleteQuery.eq('owner_id', req.user.id);

  const { error } = await deleteQuery;

  if (error) return sendSafeDbError(res, error, 'Could not delete candidate.');

  res.json({ success: true });
});

export default router;
