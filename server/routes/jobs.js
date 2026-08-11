import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireCompanyAccount } from '../middleware/auth.js';
import { getDemoStore, nextId } from '../lib/demoStore.js';
import { ensureJobEmbedding } from '../lib/embeddings.js';
import { supabaseAdmin, supabaseConfigured } from '../lib/supabase.js';

const router = Router();

const JOB_STATUSES = ['draft', 'published', 'closed'];
const JOB_TYPES = ['full-time', 'part-time', 'contract', 'internship', 'temporary'];
const WORK_MODES = ['remote', 'hybrid', 'on-site'];
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const nullableInteger = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z.number().int().nonnegative().nullable().optional(),
);

const nullableDeadline = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z.string().nullable().optional(),
);

const jobFieldsSchema = z.object({
  title: z.string().trim().min(2).max(180),
  department: z.string().trim().max(120).optional().default(''),
  category: z.string().trim().max(120).optional().default(''),
  location: z.string().trim().max(120).optional().default(''),
  job_type: z.enum(JOB_TYPES).optional().default('full-time'),
  work_mode: z.enum(WORK_MODES).optional().default('on-site'),
  description: z.string().trim().min(10).max(30000),
  requirements: z.array(z.string().trim().min(1).max(500)).max(30).optional().default([]),
  salary_min: nullableInteger,
  salary_max: nullableInteger,
  salary_currency: z.string().trim().min(3).max(3).optional().default('USD'),
  show_salary_publicly: z.boolean().optional().default(false),
  application_deadline: nullableDeadline,
  status: z.enum(JOB_STATUSES).optional().default('draft'),
});

function validateJobBusinessRules(value, ctx) {
  if (value.salary_min != null && value.salary_max != null && value.salary_min > value.salary_max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['salary_min'],
      message: 'Minimum salary cannot be greater than maximum salary',
    });
  }

  if (value.application_deadline) {
    const deadline = new Date(value.application_deadline);
    if (Number.isNaN(deadline.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['application_deadline'],
        message: 'Application deadline must be a valid date',
      });
    }
  }
}

const jobSchema = jobFieldsSchema.superRefine(validateJobBusinessRules);

const patchSchema = jobFieldsSchema.partial().extend({
  is_active: z.boolean().optional(),
}).superRefine(validateJobBusinessRules);

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizeJob(job = {}) {
  const inferredStatus = job.status || (job.is_active === false ? 'closed' : 'published');
  return {
    ...job,
    requirements: normalizeArray(job.requirements),
    status: inferredStatus,
    category: job.category || job.department || '',
    work_mode: job.work_mode || 'on-site',
    salary_currency: job.salary_currency || 'USD',
    show_salary_publicly: job.show_salary_publicly === true,
    is_active: inferredStatus === 'published',
  };
}

function isSemanticJobChange(updates = {}) {
  return ['title', 'department', 'category', 'location', 'job_type', 'work_mode', 'description', 'requirements']
    .some((key) => Object.hasOwn(updates, key));
}

function slugify(value) {
  const slug = String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'job';
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

function cleanDeadline(value) {
  if (!value) return null;
  const raw = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T23:59:59.999Z`) : new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function lifecycleFields(status, existing = {}) {
  const now = new Date().toISOString();
  const fields = {
    status,
    is_active: status === 'published',
  };

  if (status === 'published' && !existing.published_at) fields.published_at = now;
  if (status === 'closed') fields.closed_at = now;
  if (status !== 'closed') fields.closed_at = null;

  return fields;
}

function buildJobPayload(data, existing = {}) {
  const hasExisting = Boolean(existing.id);
  const status = data.status || (data.is_active === false ? 'closed' : data.is_active === true ? 'published' : existing.status || 'draft');
  const payload = { ...data };

  delete payload.is_active;

  if (Object.hasOwn(data, 'requirements') || !hasExisting) payload.requirements = normalizeArray(data.requirements);
  if (Object.hasOwn(data, 'salary_min') || !hasExisting) payload.salary_min = data.salary_min ?? null;
  if (Object.hasOwn(data, 'salary_max') || !hasExisting) payload.salary_max = data.salary_max ?? null;
  if (Object.hasOwn(data, 'salary_currency') || !hasExisting) {
    payload.salary_currency = String(data.salary_currency || existing.salary_currency || 'USD').toUpperCase();
  }
  if (Object.hasOwn(data, 'application_deadline') || !hasExisting) {
    payload.application_deadline = cleanDeadline(data.application_deadline);
  }

  return {
    ...payload,
    ...lifecycleFields(status, existing),
  };
}

function matchesText(job, search) {
  if (!search) return true;
  const haystack = [job.title, job.department, job.category, job.location, job.description]
    .map((item) => String(item || '').toLowerCase())
    .join(' ');
  return haystack.includes(search.toLowerCase());
}

function applyJobFilters(jobs, query = {}) {
  const search = String(query.search || '').trim();
  const status = String(query.status || '').trim();
  const category = String(query.category || '').trim();
  const jobType = String(query.job_type || '').trim();
  const workMode = String(query.work_mode || '').trim();

  return jobs.filter((job) => {
    const normalized = normalizeJob(job);
    if (status && status !== 'all' && normalized.status !== status) return false;
    if (category && category !== 'all' && normalized.category !== category) return false;
    if (jobType && jobType !== 'all' && normalized.job_type !== jobType) return false;
    if (workMode && workMode !== 'all' && normalized.work_mode !== workMode) return false;
    return matchesText(normalized, search);
  });
}

function paginate(items, query = {}) {
  const page = safePage(query.page);
  const limit = safeLimit(query.limit);
  const total = items.length;
  const start = (page - 1) * limit;
  return {
    page,
    limit,
    total,
    jobs: items.slice(start, start + limit),
  };
}

async function tryEnsureJobEmbedding(job) {
  try {
    await ensureJobEmbedding(job);
    return { status: 'ready' };
  } catch (error) {
    console.warn('Job embedding generation failed:', error?.message || error);
    return { status: 'failed', error: error?.message || 'Job embedding generation failed' };
  }
}

async function generateUniqueSlug(title, { currentId = null } = {}) {
  const base = slugify(title);

  if (!supabaseConfigured) {
    const store = getDemoStore();
    for (let index = 0; index < 100; index += 1) {
      const candidate = index === 0 ? base : `${base}-${index + 1}`;
      const exists = store.jobs.some((job) => job.slug === candidate && job.id !== currentId);
      if (!exists) return candidate;
    }
    return `${base}-${Date.now()}`;
  }

  for (let index = 0; index < 100; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`;
    let query = supabaseAdmin.from('jobs').select('id').eq('slug', candidate).limit(1);
    if (currentId) query = query.neq('id', currentId);
    const { data, error } = await query;
    if (error) {
      console.warn('Slug lookup failed:', error.message);
      return candidate;
    }
    if (!data?.length) return candidate;
  }

  return `${base}-${Date.now()}`;
}

async function sendSafeDbError(res, error, fallback) {
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}

router.get('/', requireAuth, requireCompanyAccount, async (req, res) => {
  if (!supabaseConfigured) {
    const filtered = applyJobFilters(getDemoStore().jobs.map(normalizeJob), req.query)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return res.json(paginate(filtered, req.query));
  }

  const { data, error } = await supabaseAdmin
    .from('jobs')
    .select('*')
    .eq('owner_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) return sendSafeDbError(res, error, 'Could not load jobs.');

  const filtered = applyJobFilters((data || []).map(normalizeJob), req.query);
  res.json(paginate(filtered, req.query));
});

router.get('/:id', requireAuth, requireCompanyAccount, async (req, res) => {
  const { id } = req.params;

  if (!supabaseConfigured) {
    const job = getDemoStore().jobs.find((item) => item.id === id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    return res.json({ job: normalizeJob(job) });
  }

  const { data: job, error } = await supabaseAdmin
    .from('jobs')
    .select('*')
    .eq('id', id)
    .eq('owner_id', req.user.id)
    .maybeSingle();

  if (error) return sendSafeDbError(res, error, 'Could not load job.');
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ job: normalizeJob(job) });
});

router.post('/', requireAuth, requireCompanyAccount, async (req, res) => {
  const parsed = jobSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid job payload' });

  const payload = buildJobPayload(parsed.data);
  payload.owner_id = req.user.id;
  payload.slug = await generateUniqueSlug(payload.title);

  if (!supabaseConfigured) {
    const job = normalizeJob({
      id: nextId('job'),
      ...payload,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    getDemoStore().jobs.unshift(job);
    const embedding = await tryEnsureJobEmbedding(job);
    return res.status(201).json({ job, embedding });
  }

  const { data: job, error } = await supabaseAdmin.from('jobs').insert(payload).select('*').single();
  if (error) return sendSafeDbError(res, error, 'Could not create job.');

  const embedding = await tryEnsureJobEmbedding(job);
  res.status(201).json({ job: normalizeJob(job), embedding });
});

router.patch('/:id', requireAuth, requireCompanyAccount, async (req, res) => {
  const { id } = req.params;
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid update payload' });

  if (!supabaseConfigured) {
    const store = getDemoStore();
    const job = store.jobs.find((item) => item.id === id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const updates = buildJobPayload(parsed.data, job);
    if (parsed.data.title && (!job.slug || job.status !== 'published')) {
      updates.slug = await generateUniqueSlug(parsed.data.title, { currentId: id });
    }
    Object.assign(job, updates, { updated_at: new Date().toISOString() });
    const normalizedJob = normalizeJob(job);
    const embedding = isSemanticJobChange(updates) ? await tryEnsureJobEmbedding(normalizedJob) : { status: 'unchanged' };
    return res.json({ job: normalizedJob, embedding });
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('jobs')
    .select('*')
    .eq('id', id)
    .eq('owner_id', req.user.id)
    .maybeSingle();

  if (existingError) return sendSafeDbError(res, existingError, 'Could not load job.');
  if (!existing) return res.status(404).json({ error: 'Job not found' });

  const updates = buildJobPayload(parsed.data, existing);
  if (parsed.data.title && (!existing.slug || existing.status !== 'published')) {
    updates.slug = await generateUniqueSlug(parsed.data.title, { currentId: id });
  }

  const { data: job, error } = await supabaseAdmin
    .from('jobs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('owner_id', req.user.id)
    .select('*')
    .single();

  if (error) return sendSafeDbError(res, error, 'Could not update job.');

  const embedding = isSemanticJobChange(updates) ? await tryEnsureJobEmbedding(job) : { status: 'unchanged' };
  res.json({ job: normalizeJob(job), embedding });
});

router.delete('/:id', requireAuth, requireCompanyAccount, async (req, res) => {
  const { id } = req.params;

  if (!supabaseConfigured) {
    const store = getDemoStore();
    const index = store.jobs.findIndex((item) => item.id === id);
    if (index === -1) return res.status(404).json({ error: 'Job not found' });

    store.jobs.splice(index, 1);
    store.scores = store.scores.filter((s) => s.job_id !== id);
    store.jobApplications = (store.jobApplications || []).filter((application) => application.job_id !== id);
    return res.json({ success: true });
  }

  const { error } = await supabaseAdmin
    .from('jobs')
    .delete()
    .eq('id', id)
    .eq('owner_id', req.user.id);

  if (error) return sendSafeDbError(res, error, 'Could not delete job.');
  res.json({ success: true });
});

export default router;
