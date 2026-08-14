import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  buildCandidateInsert,
  candidateShape,
  parseCandidateResumeUpload,
  RESUME_UPLOAD_LIMIT_BYTES,
  tryEnsureCandidateEmbedding,
  uploadResumeToStorage,
  validatePublicApplicationResumeFile,
} from '../lib/candidateIntake.js';
import { getDemoStore, nextId } from '../lib/demoStore.js';
import { createEmailService } from '../lib/email/emailService.js';
import { supabaseAdmin, supabaseConfigured } from '../lib/supabase.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: RESUME_UPLOAD_LIMIT_BYTES } });
const emailService = createEmailService();
const DUPLICATE_APPLICATION_MESSAGE = 'You have already applied for this position.';

function parseApplicationUpload(req, res, next) {
  upload.single('resume')(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Resume file must be 8 MB or smaller.' });
    }
    console.warn('Public application upload parsing failed:', error?.message || error);
    return res.status(400).json({ error: 'Could not read uploaded resume.' });
  });
}

const applyLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
});

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;

const optionalUrlSchema = z.string().trim().max(2048).optional().default('').refine((value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}, 'Invalid URL');

const applicationSchema = z.object({
  full_name: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(7).max(60),
  cover_letter: z.string().trim().max(5000).optional().default(''),
  linkedin_url: optionalUrlSchema,
  portfolio_url: optionalUrlSchema,
  website_url: optionalUrlSchema,
});

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeJob(job = {}) {
  const status = job.status || (job.is_active === false ? 'closed' : 'published');
  return {
    ...job,
    requirements: normalizeArray(job.requirements),
    status,
    category: job.category || job.department || '',
    work_mode: job.work_mode || 'on-site',
    salary_currency: job.salary_currency || 'USD',
    show_salary_publicly: job.show_salary_publicly === true,
  };
}

function isExpired(job) {
  if (!job.application_deadline) return false;
  const deadline = new Date(job.application_deadline);
  if (Number.isNaN(deadline.getTime())) return false;
  return Date.now() > deadline.getTime();
}

function canApply(job) {
  const normalized = normalizeJob(job);
  return normalized.status === 'published'
    && normalized.is_active !== false
    && !normalized.closed_at
    && !isExpired(normalized);
}

function publicJobSummary(job) {
  const normalized = normalizeJob(job);
  const salary = normalized.show_salary_publicly ? {
    salary_min: normalized.salary_min,
    salary_max: normalized.salary_max,
    salary_currency: normalized.salary_currency,
    show_salary_publicly: true,
  } : {};
  const slug = normalized.slug || '';

  return {
    slug,
    title: normalized.title,
    department: normalized.department,
    category: normalized.category,
    location: normalized.location,
    job_type: normalized.job_type,
    work_mode: normalized.work_mode,
    application_deadline: normalized.application_deadline,
    published_at: normalized.published_at,
    can_apply: Boolean(slug) && canApply(normalized),
    is_expired: isExpired(normalized),
    ...salary,
  };
}

function publicJobDetail(job) {
  const normalized = normalizeJob(job);
  return {
    ...publicJobSummary(normalized),
    description: normalized.description,
    requirements: normalizeArray(normalized.requirements),
  };
}

function safeLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(parsed, 1), MAX_PAGE_SIZE);
}

function safePage(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(parsed, 1);
}

function matchesText(job, search) {
  if (!search) return true;
  const haystack = [job.title, job.department, job.category, job.location, job.description]
    .map((item) => String(item || '').toLowerCase())
    .join(' ');
  return haystack.includes(search.toLowerCase());
}

function applyPublicFilters(jobs, query = {}) {
  const search = String(query.search || '').trim();
  const category = String(query.category || '').trim();
  const jobType = String(query.job_type || '').trim();
  const workMode = String(query.work_mode || '').trim();
  const location = String(query.location || '').trim().toLowerCase();

  return jobs.filter((job) => {
    const normalized = normalizeJob(job);
    if (normalized.status !== 'published') return false;
    if (category && category !== 'all' && normalized.category !== category) return false;
    if (jobType && jobType !== 'all' && normalized.job_type !== jobType) return false;
    if (workMode && workMode !== 'all' && normalized.work_mode !== workMode) return false;
    if (location && !String(normalized.location || '').toLowerCase().includes(location)) return false;
    return matchesText(normalized, search);
  });
}

function paginate(items, query = {}) {
  const page = safePage(query.page);
  const limit = safeLimit(query.limit);
  const total = items.length;
  const start = (page - 1) * limit;
  return {
    jobs: items.slice(start, start + limit),
    page,
    limit,
    total,
  };
}

function applicationHistoryNote(job, applicant = {}) {
  const note = [`Applied through public career site${job?.title ? ` for ${job.title}` : ''}.`];
  if (applicant.website_url) note.push(`Website: ${applicant.website_url}`);
  return note.join('\n');
}

function sendSafeError(res, error, fallback = 'Request could not be completed.') {
  console.error(fallback, error);
  return res.status(error?.status || 500).json({ error: fallback });
}

function isUniqueConflict(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || error?.details || '').toLowerCase();
  return code === '23505' || message.includes('duplicate key') || message.includes('unique constraint');
}

function isDuplicateApplicationConflict(error) {
  const message = String(error?.message || error?.details || '').toLowerCase();
  return isUniqueConflict(error) && (message.includes('job_applications') || message.includes('job_id') || message.includes('applicant_email'));
}

function emptyText(value) {
  return !String(value || '').trim();
}

function emptyArray(value) {
  return !Array.isArray(value) || value.length === 0;
}

function buildSafeCandidateUpdates(existing = {}, candidateInsert = {}) {
  const updates = {};
  const textFields = [
    'full_name',
    'phone',
    'summary',
    'current_company',
    'current_title',
    'location',
    'linkedin_url',
    'portfolio_url',
  ];

  textFields.forEach((field) => {
    if (emptyText(existing[field]) && !emptyText(candidateInsert[field])) updates[field] = candidateInsert[field];
  });

  if ((Number(existing.years_experience || 0) === 0) && Number(candidateInsert.years_experience || 0) > 0) {
    updates.years_experience = candidateInsert.years_experience;
  }

  ['skills', 'education', 'experience'].forEach((field) => {
    if (emptyArray(existing[field]) && Array.isArray(candidateInsert[field]) && candidateInsert[field].length) {
      updates[field] = candidateInsert[field];
    }
  });

  return updates;
}

async function findPublicJobBySlug(slug) {
  if (!slug) return null;

  if (!supabaseConfigured) {
    return getDemoStore().jobs.find((job) => normalizeJob(job).slug === slug && normalizeJob(job).status === 'published') || null;
  }

  const { data, error } = await supabaseAdmin
    .from('jobs')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .not('slug', 'is', null)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function findRecruiterProfile(ownerId) {
  if (!ownerId) return null;

  if (!supabaseConfigured) {
    return (getDemoStore().profiles || []).find((profile) => profile.id === ownerId) || null;
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id,email,full_name')
    .eq('id', ownerId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function sendApplicationNotificationsSafely({ candidate, job, application, applicant }) {
  try {
    const recruiter = await findRecruiterProfile(job.owner_id);
    await emailService.sendPublicApplicationNotifications({
      user: { id: job.owner_id, email: recruiter?.email || '' },
      profile: recruiter || { id: job.owner_id },
    }, {
      candidate,
      job,
      application,
      applicant,
      recruiter,
    });
  } catch (error) {
    console.warn('Public application notification workflow failed:', error?.message || error);
  }
}

function findDemoCandidate(store, ownerId, email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return null;
  return (store.candidates || []).find(
    (candidate) => candidate.owner_id === ownerId && String(candidate.email || '').trim().toLowerCase() === normalizedEmail,
  ) || null;
}

function createDemoResume({ store, candidate, file, extractedText }) {
  const resume = {
    id: nextId('resume'),
    candidate_id: candidate.id,
    file_name: file.originalname,
    mime_type: file.mimetype,
    extracted_text: extractedText,
    storage_path: null,
    parse_status: 'parsed',
    created_at: new Date().toISOString(),
  };
  store.resumes.unshift(resume);
  return resume;
}

async function createDemoPublicApplication({ store, job, applicant, parsedCandidate, file, extractedText, coverLetter }) {
  let candidate = findDemoCandidate(store, job.owner_id, applicant.email);
  const candidateInsert = buildCandidateInsert({ parsed: parsedCandidate, file, ownerId: job.owner_id });

  if (candidate) {
    const updates = buildSafeCandidateUpdates(candidate, candidateInsert);
    Object.assign(candidate, updates, { updated_at: new Date().toISOString() });
  } else {
    candidate = {
      id: nextId('candidate'),
      ...candidateInsert,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.candidates.unshift(candidate);
    store.stageHistory.unshift({
      id: nextId('history'),
      candidate_id: candidate.id,
      from_stage: 'new',
      to_stage: 'parsed',
      changed_by: job.owner_id,
      note: applicationHistoryNote(job, applicant),
      created_at: new Date().toISOString(),
    });
  }

  const resume = createDemoResume({ store, candidate, file, extractedText });
  const application = {
    id: nextId('application'),
    owner_id: job.owner_id,
    job_id: job.id,
    candidate_id: candidate.id,
    source: 'public_careers',
    status: 'submitted',
    cover_letter: coverLetter,
    applicant_email: applicant.email,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  store.jobApplications.unshift(application);
  const embedding = await tryEnsureCandidateEmbedding(candidate, resume);
  return { candidate, resume, application, embedding };
}

async function findSupabaseCandidate(ownerId, email) {
  const { data, error } = await supabaseAdmin
    .from('candidates')
    .select('*')
    .eq('owner_id', ownerId)
    .ilike('email', email)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function createOrUpdateSupabaseCandidate({ ownerId, parsedCandidate, file }) {
  const candidateInsert = buildCandidateInsert({ parsed: parsedCandidate, file, ownerId });
  const existingCandidate = await findSupabaseCandidate(ownerId, candidateInsert.email);

  if (!existingCandidate) {
    const { data: candidate, error } = await supabaseAdmin
      .from('candidates')
      .insert(candidateInsert)
      .select('*')
      .single();

    if (error) throw error;
    return { candidate: candidateShape(candidate), isNew: true };
  }

  const updates = buildSafeCandidateUpdates(existingCandidate, candidateInsert);
  if (!Object.keys(updates).length) return { candidate: candidateShape(existingCandidate), isNew: false };

  const { data: candidate, error } = await supabaseAdmin
    .from('candidates')
    .update(updates)
    .eq('id', existingCandidate.id)
    .select('*')
    .single();

  if (error) throw error;
  return { candidate: candidateShape(candidate), isNew: false };
}

async function insertSupabaseResume({ candidate, file, extractedText }) {
  const storagePath = await uploadResumeToStorage({ file, candidateId: candidate.id });

  const { data: resume, error } = await supabaseAdmin
    .from('candidate_resumes')
    .insert({
      candidate_id: candidate.id,
      file_name: file.originalname,
      mime_type: file.mimetype,
      extracted_text: extractedText,
      storage_path: storagePath,
      parse_status: 'parsed',
    })
    .select('*')
    .single();

  if (error) throw error;
  return resume;
}

async function cleanupSupabasePartialPublicApplication({ candidate, resume, createdCandidate }) {
  try {
    if (resume?.id) await supabaseAdmin.from('candidate_resumes').delete().eq('id', resume.id);
  } catch (error) {
    console.warn('Public application resume cleanup failed:', error?.message || error);
  }

  try {
    if (createdCandidate && candidate?.id) await supabaseAdmin.from('candidates').delete().eq('id', candidate.id);
  } catch (error) {
    console.warn('Public application candidate cleanup failed:', error?.message || error);
  }
}

async function createSupabasePublicApplication({ job, applicant, parsedCandidate, file, extractedText, coverLetter }) {
  const { candidate, isNew } = await createOrUpdateSupabaseCandidate({
    ownerId: job.owner_id,
    parsedCandidate,
    file,
  });
  let resume = null;

  try {
    resume = await insertSupabaseResume({ candidate, file, extractedText });

    if (isNew) {
      await supabaseAdmin.from('candidate_stage_history').insert({
        candidate_id: candidate.id,
        from_stage: 'new',
        to_stage: 'parsed',
        changed_by: job.owner_id,
        note: applicationHistoryNote(job, applicant),
      });
    }

    const { data: application, error: applicationError } = await supabaseAdmin
      .from('job_applications')
      .insert({
        owner_id: job.owner_id,
        job_id: job.id,
        candidate_id: candidate.id,
        source: 'public_careers',
        status: 'submitted',
        cover_letter: coverLetter,
        applicant_email: applicant.email,
      })
      .select('*')
      .single();

    if (applicationError) throw applicationError;

    const embedding = await tryEnsureCandidateEmbedding(candidate, resume);
    return { candidate, resume, application, embedding };
  } catch (error) {
    await cleanupSupabasePartialPublicApplication({ candidate, resume, createdCandidate: isNew });
    throw error;
  }
}

router.get('/', async (req, res) => {
  try {
    if (!supabaseConfigured) {
      const filtered = applyPublicFilters(getDemoStore().jobs.map(normalizeJob), req.query)
        .filter((job) => job.slug)
        .sort((a, b) => new Date(b.published_at || b.created_at).getTime() - new Date(a.published_at || a.created_at).getTime())
        .map(publicJobSummary);
      return res.json(paginate(filtered, req.query));
    }

    const { data, error } = await supabaseAdmin
      .from('jobs')
      .select('slug,title,department,category,location,job_type,work_mode,salary_min,salary_max,salary_currency,show_salary_publicly,application_deadline,published_at,status,description')
      .eq('status', 'published')
      .order('published_at', { ascending: false, nullsFirst: false });

    if (error) return sendSafeError(res, error, 'Could not load public jobs.');

    const filtered = applyPublicFilters((data || []).map(normalizeJob), req.query)
      .filter((job) => job.slug)
      .map(publicJobSummary);
    return res.json(paginate(filtered, req.query));
  } catch (error) {
    return sendSafeError(res, error, 'Could not load public jobs.');
  }
});

router.get('/:slug', async (req, res) => {
  try {
    const job = await findPublicJobBySlug(req.params.slug);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    return res.json({ job: publicJobDetail(job) });
  } catch (error) {
    return sendSafeError(res, error, 'Could not load job.');
  }
});

router.post('/:slug/apply', applyLimiter, parseApplicationUpload, async (req, res) => {
  const parsed = applicationSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'Please check the application fields and try again.' });

  try {
    const job = await findPublicJobBySlug(req.params.slug);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!canApply(job)) return res.status(409).json({ error: 'This job is no longer accepting applications.' });

    const applicant = {
      full_name: parsed.data.full_name,
      email: String(parsed.data.email || '').trim().toLowerCase(),
      phone: parsed.data.phone,
      linkedin_url: parsed.data.linkedin_url,
      portfolio_url: parsed.data.portfolio_url,
      website_url: parsed.data.website_url,
    };

    validatePublicApplicationResumeFile(req.file);

    if (!supabaseConfigured) {
      const store = getDemoStore();
      const duplicate = (store.jobApplications || []).find(
        (application) => application.job_id === job.id && String(application.applicant_email || '').trim().toLowerCase() === applicant.email,
      );
      if (duplicate) return res.status(409).json({ error: DUPLICATE_APPLICATION_MESSAGE });

      const { parsed: parsedCandidate, extractedText } = await parseCandidateResumeUpload({
        file: req.file,
        applicant,
        validator: validatePublicApplicationResumeFile,
      });
      const { candidate, application } = await createDemoPublicApplication({
        store,
        job,
        applicant,
        parsedCandidate,
        file: req.file,
        extractedText,
        coverLetter: parsed.data.cover_letter,
      });
      await sendApplicationNotificationsSafely({ candidate, job, application, applicant });
      return res.status(201).json({ success: true, message: 'Application submitted successfully.' });
    }

    const { data: existingApplication, error: duplicateError } = await supabaseAdmin
      .from('job_applications')
      .select('id')
      .eq('job_id', job.id)
      .eq('applicant_email', applicant.email)
      .maybeSingle();

    if (duplicateError) return sendSafeError(res, duplicateError, 'Could not submit application.');
    if (existingApplication) return res.status(409).json({ error: DUPLICATE_APPLICATION_MESSAGE });

    const { parsed: parsedCandidate, extractedText } = await parseCandidateResumeUpload({
      file: req.file,
      applicant,
      validator: validatePublicApplicationResumeFile,
    });

    const { candidate, application } = await createSupabasePublicApplication({
      job,
      applicant,
      parsedCandidate,
      file: req.file,
      extractedText,
      coverLetter: parsed.data.cover_letter,
    });
    await sendApplicationNotificationsSafely({ candidate, job, application, applicant });

    return res.status(201).json({ success: true, message: 'Application submitted successfully.' });
  } catch (error) {
    if (isDuplicateApplicationConflict(error)) {
      return res.status(409).json({ error: DUPLICATE_APPLICATION_MESSAGE });
    }
    if (error?.status && error.status < 500) {
      return res.status(error.status).json({ error: error.message || 'Could not submit application.' });
    }
    return sendSafeError(res, error, 'Could not submit application.');
  }
});

export default router;
