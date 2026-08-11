import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { processCandidateResumeUpload, RESUME_UPLOAD_LIMIT_BYTES } from '../lib/candidateIntake.js';
import { getDemoStore, nextId } from '../lib/demoStore.js';
import { supabaseAdmin, supabaseConfigured } from '../lib/supabase.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: RESUME_UPLOAD_LIMIT_BYTES } });

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

const applicationSchema = z.object({
  full_name: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(60).optional().default(''),
  cover_letter: z.string().trim().max(5000).optional().default(''),
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
  return normalizeJob(job).status === 'published' && !isExpired(job);
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

function applicationHistoryNote(job) {
  return `Applied through public career site${job?.title ? ` for ${job.title}` : ''}.`;
}

function sendSafeError(res, error, fallback = 'Request could not be completed.') {
  console.error(fallback, error);
  return res.status(error?.status || 500).json({ error: fallback });
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
  if (!parsed.success) return res.status(400).json({ error: 'Invalid application payload' });

  try {
    const job = await findPublicJobBySlug(req.params.slug);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!canApply(job)) return res.status(409).json({ error: 'This job is no longer accepting applications.' });

    const applicant = {
      full_name: parsed.data.full_name,
      email: parsed.data.email.toLowerCase(),
      phone: parsed.data.phone,
    };

    if (!supabaseConfigured) {
      const store = getDemoStore();
      const duplicate = (store.jobApplications || []).find(
        (application) => application.job_id === job.id && application.applicant_email === applicant.email,
      );
      if (duplicate) return res.status(409).json({ error: 'You have already applied for this job.' });

      const { candidate } = await processCandidateResumeUpload({
        file: req.file,
        ownerId: job.owner_id,
        changedBy: job.owner_id,
        applicant,
        historyNote: applicationHistoryNote(job),
      });

      const application = {
        id: nextId('application'),
        owner_id: job.owner_id,
        job_id: job.id,
        candidate_id: candidate.id,
        source: 'public_careers',
        status: 'submitted',
        cover_letter: parsed.data.cover_letter,
        applicant_email: applicant.email,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.jobApplications.unshift(application);
      return res.status(201).json({ success: true, message: 'Application submitted successfully.' });
    }

    const { data: existingApplication, error: duplicateError } = await supabaseAdmin
      .from('job_applications')
      .select('id')
      .eq('job_id', job.id)
      .eq('applicant_email', applicant.email)
      .maybeSingle();

    if (duplicateError) return sendSafeError(res, duplicateError, 'Could not submit application.');
    if (existingApplication) return res.status(409).json({ error: 'You have already applied for this job.' });

    const { candidate } = await processCandidateResumeUpload({
      file: req.file,
      ownerId: job.owner_id,
      changedBy: job.owner_id,
      applicant,
      historyNote: applicationHistoryNote(job),
    });

    const { error: applicationError } = await supabaseAdmin
      .from('job_applications')
      .insert({
        owner_id: job.owner_id,
        job_id: job.id,
        candidate_id: candidate.id,
        source: 'public_careers',
        status: 'submitted',
        cover_letter: parsed.data.cover_letter,
        applicant_email: applicant.email,
      });

    if (applicationError) return sendSafeError(res, applicationError, 'Could not submit application.');

    return res.status(201).json({ success: true, message: 'Application submitted successfully.' });
  } catch (error) {
    if (error?.status && error.status < 500) {
      return res.status(error.status).json({ error: error.message || 'Could not submit application.' });
    }
    return sendSafeError(res, error, 'Could not submit application.');
  }
});

export default router;
