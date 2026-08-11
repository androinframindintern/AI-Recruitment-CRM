'use client';

import { apiDelete, apiGet, apiPatch, apiPost, apiPostForm } from './api';
import { DEFAULT_TIMEZONE } from './timezones';
import { isSupabaseConfigured, safeGetSession, supabase } from './supabaseClient';

const DEMO_USER = {
  id: 'demo-user',
  email: 'demo@recruitcrm.local',
};

const DEMO_PROFILE = {
  id: DEMO_USER.id,
  email: DEMO_USER.email,
  full_name: 'Demo Recruiter',
  role: 'recruiter',
};

function demoProfileFromUser(user = DEMO_USER) {
  return {
    id: user.id || DEMO_USER.id,
    email: user.email || DEMO_USER.email,
    full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || DEMO_PROFILE.full_name,
    role: normalizePublicSignupRole(user.user_metadata?.role || DEMO_PROFILE.role),
  };
}

const DEMO_STORE_KEY = 'ai-recruitment-crm-frontend-demo-store-v1';
const DEMO_SCORING_METHOD = 'client_demo';
const ACCOUNT_ROLES = ['admin', 'recruiter', 'candidate'];
const PUBLIC_SIGNUP_ROLES = ['recruiter', 'candidate'];

function normalizeAccountRole(role, fallback = 'candidate') {
  return ACCOUNT_ROLES.includes(role) ? role : fallback;
}

function normalizePublicSignupRole(role) {
  return PUBLIC_SIGNUP_ROLES.includes(role) ? role : 'candidate';
}

const DEFAULT_STORE = {
  candidates: [],
  resumes: [],
  notes: [],
  scores: [],
  history: [],
  interviews: [],
  availability: [],
  emails: [],
  jobs: [],
  jobApplications: [],
};

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function cloneStore(store) {
  return JSON.parse(JSON.stringify(store));
}

function loadDemoStore() {
  if (typeof window === 'undefined') return cloneStore(DEFAULT_STORE);
  try {
    const raw = window.localStorage.getItem(DEMO_STORE_KEY);
    if (!raw) return cloneStore(DEFAULT_STORE);
    return { ...cloneStore(DEFAULT_STORE), ...JSON.parse(raw) };
  } catch {
    return cloneStore(DEFAULT_STORE);
  }
}

function saveDemoStore(store) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(store));
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object' && item.name) return String(item.name).trim();
        return item ? String(item).trim() : '';
      })
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return normalizeArray(parsed);
    } catch {}
    return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
  }

  return [];
}

function normalizeStructuredList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [{ title: value.trim() }];
  return [];
}

function normalizeCandidate(candidate = {}) {
  const jobScores = (candidate.candidate_job_scores || candidate.job_scores || [])
    .map(normalizeScore)
    .filter(Boolean)
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

  return {
    ...candidate,
    skills: normalizeArray(candidate.skills),
    education: normalizeStructuredList(candidate.education),
    experience: normalizeStructuredList(candidate.experience),
    tags: normalizeArray(candidate.tags),
    latest_score: candidate.latest_score || jobScores[0] || null,
    job_scores: jobScores,
    notes_count: Number(candidate.notes_count ?? candidate.candidate_notes?.length ?? 0),
  };
}

function normalizeScore(score) {
  if (!score) return null;
  return {
    ...score,
    score: Math.round(Number(score.score || 0)),
    skill_match_percent: Math.round(Number(score.skill_match_percent || score.score || 0)),
    matched_skills: normalizeArray(score.matched_skills),
    missing_skills: normalizeArray(score.missing_skills),
  };
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
    is_active: status === 'published',
    public_url: job.slug ? `/careers/${job.slug}` : '',
  };
}

function sortNewest(items) {
  return [...items].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
}

function buildQuery(params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '' || value === 'all') return;
    searchParams.set(key, String(value));
  });
  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

function toNullableNumber(value) {
  if (value === '' || value === undefined || value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeJobPayload(payload = {}) {
  const normalized = {
    title: String(payload.title || '').trim(),
    department: String(payload.department || '').trim(),
    category: String(payload.category || payload.department || '').trim(),
    location: String(payload.location || '').trim(),
    job_type: payload.job_type || 'full-time',
    work_mode: payload.work_mode || 'on-site',
    description: String(payload.description || '').trim(),
    requirements: normalizeArray(payload.requirements),
    salary_min: toNullableNumber(payload.salary_min),
    salary_max: toNullableNumber(payload.salary_max),
    salary_currency: String(payload.salary_currency || 'USD').trim().toUpperCase(),
    show_salary_publicly: payload.show_salary_publicly === true || payload.show_salary_publicly === 'true',
    application_deadline: payload.application_deadline || null,
    status: payload.status || 'draft',
  };

  if (payload.is_active !== undefined && payload.status === undefined) {
    normalized.status = payload.is_active ? 'published' : 'closed';
  }

  return normalized;
}

function normalizeJobPatchPayload(payload = {}) {
  const normalized = { ...payload };
  if (Object.hasOwn(payload, 'title')) normalized.title = String(payload.title || '').trim();
  if (Object.hasOwn(payload, 'department')) normalized.department = String(payload.department || '').trim();
  if (Object.hasOwn(payload, 'category')) normalized.category = String(payload.category || '').trim();
  if (Object.hasOwn(payload, 'location')) normalized.location = String(payload.location || '').trim();
  if (Object.hasOwn(payload, 'description')) normalized.description = String(payload.description || '').trim();
  if (Object.hasOwn(payload, 'requirements')) normalized.requirements = normalizeArray(payload.requirements);
  if (Object.hasOwn(payload, 'salary_min')) normalized.salary_min = toNullableNumber(payload.salary_min);
  if (Object.hasOwn(payload, 'salary_max')) normalized.salary_max = toNullableNumber(payload.salary_max);
  if (Object.hasOwn(payload, 'salary_currency')) normalized.salary_currency = String(payload.salary_currency || 'USD').trim().toUpperCase();
  if (Object.hasOwn(payload, 'show_salary_publicly')) normalized.show_salary_publicly = payload.show_salary_publicly === true || payload.show_salary_publicly === 'true';
  if (Object.hasOwn(payload, 'application_deadline')) normalized.application_deadline = payload.application_deadline || null;
  if (Object.hasOwn(payload, 'is_active') && !Object.hasOwn(payload, 'status')) normalized.status = payload.is_active ? 'published' : 'closed';
  delete normalized.is_active;
  return normalized;
}

function requireSupabaseClient() {
  if (!isSupabaseConfigured()) return false;
  if (typeof supabase.from !== 'function') return false;
  return true;
}

export async function getActiveUser() {
  const { data, error } = await safeGetSession();
  if (error && isSupabaseConfigured()) throw new Error(error.message || 'Could not read Supabase session.');
  const user = data?.session?.user;
  if (!isSupabaseConfigured()) return user || DEMO_USER;
  if (!user) throw new Error('Please sign in to continue.');
  return user;
}

function profilePayloadFromUser(user) {
  return {
    id: user.id,
    email: user.email || '',
    full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Job Seeker',
    role: normalizePublicSignupRole(user.user_metadata?.role),
  };
}

async function ensureProfileWithRpc(user) {
  const { data, error } = await supabase.rpc('ensure_my_profile');
  if (error) {
    throw new Error(`Account profile is missing in Supabase. Run the ensure_my_profile SQL patch once, then sign in again. Supabase said: ${error.message}`);
  }
  const profile = data || profilePayloadFromUser(user);
  return { ...profile, role: normalizeAccountRole(profile.role) };
}

export async function getCurrentProfile(userArg = null) {
  const user = userArg || await getActiveUser();
  if (!requireSupabaseClient()) return demoProfileFromUser(user);
  if (user.id === DEMO_USER.id) return DEMO_PROFILE;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw new Error(error.message || 'Could not load profile.');
  if (data) return { ...data, role: normalizeAccountRole(data.role) };

  return ensureProfileWithRpc(user);
}

async function ensureCurrentProfile(userArg = null) {
  const user = userArg || await getActiveUser();
  if (!requireSupabaseClient()) return demoProfileFromUser(user);
  if (user.id === DEMO_USER.id) return DEMO_PROFILE;

  const profile = await getCurrentProfile(user);
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (!data) {
    return ensureProfileWithRpc(user);
  }

  return profile;
}

export async function listJobs(filters = {}) {
  if (!requireSupabaseClient()) {
    const store = loadDemoStore();
    const jobs = sortNewest(store.jobs).map(normalizeJob);
    return { jobs };
  }

  const data = await apiGet(`/api/jobs${buildQuery(filters)}`, { auth: true });
  return { ...data, jobs: (data.jobs || []).map(normalizeJob) };
}

export async function createJob(payload) {
  const user = await getActiveUser();
  await ensureCurrentProfile(user);
  const jobPayload = normalizeJobPayload(payload);

  if (!jobPayload.title || !jobPayload.description) {
    throw new Error('Job title and description are required.');
  }
  if (jobPayload.salary_min != null && jobPayload.salary_max != null && jobPayload.salary_min > jobPayload.salary_max) {
    throw new Error('Minimum salary cannot be greater than maximum salary.');
  }

  if (!requireSupabaseClient()) {
    const store = loadDemoStore();
    const createdAt = nowIso();
    const job = normalizeJob({
      id: createId('job'),
      owner_id: user.id,
      ...jobPayload,
      slug: `${jobPayload.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'job'}-${Date.now()}`,
      is_active: jobPayload.status === 'published',
      published_at: jobPayload.status === 'published' ? createdAt : null,
      closed_at: jobPayload.status === 'closed' ? createdAt : null,
      created_at: createdAt,
      updated_at: createdAt,
    });
    store.jobs.unshift(job);
    saveDemoStore(store);
    return { job };
  }

  const data = await apiPost('/api/jobs', jobPayload, { auth: true });
  return { ...data, job: normalizeJob(data.job) };
}

export async function updateJob(id, payload) {
  const updates = normalizeJobPatchPayload(payload);
  if (updates.salary_min != null && updates.salary_max != null && updates.salary_min > updates.salary_max) {
    throw new Error('Minimum salary cannot be greater than maximum salary.');
  }

  if (!requireSupabaseClient()) {
    const store = loadDemoStore();
    const index = store.jobs.findIndex((job) => job.id === id);
    if (index === -1) throw new Error('Job not found.');
    const previous = normalizeJob(store.jobs[index]);
    const status = updates.status || previous.status;
    const updatedAt = nowIso();
    store.jobs[index] = normalizeJob({
      ...previous,
      ...updates,
      is_active: status === 'published',
      status,
      published_at: status === 'published' ? (previous.published_at || updatedAt) : previous.published_at,
      closed_at: status === 'closed' ? updatedAt : null,
      updated_at: updatedAt,
    });
    saveDemoStore(store);
    return { job: store.jobs[index] };
  }

  const data = await apiPatch(`/api/jobs/${id}`, updates, { auth: true });
  return { ...data, job: normalizeJob(data.job) };
}

export async function deleteJob(id) {
  if (!requireSupabaseClient()) {
    const store = loadDemoStore();
    store.jobs = store.jobs.filter((job) => job.id !== id);
    store.scores = store.scores.filter((score) => score.job_id !== id);
    store.jobApplications = (store.jobApplications || []).filter((application) => application.job_id !== id);
    saveDemoStore(store);
    return { success: true };
  }

  return apiDelete(`/api/jobs/${id}`, { auth: true });
}

export async function listPublicJobs(filters = {}) {
  const data = await apiGet(`/api/careers${buildQuery(filters)}`, { auth: false });
  return { ...data, jobs: (data.jobs || []).map(normalizeJob) };
}

export async function getPublicJob(slug) {
  const data = await apiGet(`/api/careers/${encodeURIComponent(slug)}`, { auth: false });
  return { ...data, job: normalizeJob(data.job) };
}

export async function submitPublicApplication(slug, formData) {
  return apiPostForm(`/api/careers/${encodeURIComponent(slug)}/apply`, formData, { auth: false });
}

export async function listCandidates() {
  const user = await getActiveUser();

  if (!requireSupabaseClient()) {
    const store = loadDemoStore();
    const candidates = sortNewest(store.candidates).map((candidate) => normalizeCandidate({
      ...candidate,
      candidate_job_scores: store.scores.filter((score) => score.candidate_id === candidate.id),
      notes_count: store.notes.filter((note) => note.candidate_id === candidate.id).length,
    }));
    return { candidates };
  }

  const { data, error } = await supabase
    .from('candidates')
    .select('*, candidate_job_scores(*), candidate_notes(id)')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message || 'Could not load candidates.');
  return { candidates: (data || []).map(normalizeCandidate) };
}

export async function createDemoCandidate(payload = {}) {
  const user = await getActiveUser();
  await ensureCurrentProfile(user);
  const skills = normalizeArray(payload.skills);
  const resumeText = String(payload.resumeText || '').trim();
  const fullName = String(payload.full_name || payload.fullName || '').trim();

  if (!fullName) throw new Error('Candidate name is required.');

  const candidatePayload = {
    owner_id: user.id,
    full_name: fullName,
    email: String(payload.email || '').trim(),
    phone: String(payload.phone || '').trim(),
    summary: String(payload.summary || 'Frontend-only demo candidate. Resume parsing and Gemini AI are disabled.').trim(),
    current_company: String(payload.current_company || payload.currentCompany || '').trim(),
    current_title: String(payload.current_title || payload.currentTitle || 'Candidate').trim(),
    years_experience: Number(payload.years_experience || payload.yearsExperience || 0),
    location: String(payload.location || '').trim(),
    stage: payload.stage || 'parsed',
    skills,
    education: normalizeStructuredList(payload.education),
    experience: normalizeStructuredList(payload.experience),
    tags: normalizeArray(payload.tags),
  };

  if (!requireSupabaseClient()) {
    const store = loadDemoStore();
    const candidate = normalizeCandidate({
      id: createId('candidate'),
      ...candidatePayload,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
    const resume = {
      id: createId('resume'),
      candidate_id: candidate.id,
      file_name: payload.fileName || 'manual-demo-candidate.txt',
      mime_type: 'text/plain',
      extracted_text: resumeText,
      storage_path: null,
      parse_status: 'parsed',
      created_at: nowIso(),
    };
    store.candidates.unshift(candidate);
    if (resumeText) store.resumes.unshift(resume);
    store.history.unshift({
      id: createId('history'),
      candidate_id: candidate.id,
      from_stage: 'new',
      to_stage: candidate.stage,
      changed_by: user.id,
      note: 'Manual frontend demo candidate created.',
      created_at: nowIso(),
    });
    saveDemoStore(store);
    return { candidate, resume: resumeText ? resume : null };
  }

  const { data: candidate, error } = await supabase
    .from('candidates')
    .insert(candidatePayload)
    .select('*')
    .single();

  if (error) throw new Error(error.message || 'Could not create candidate.');

  let resume = null;
  if (resumeText) {
    const { data: resumeRow } = await supabase
      .from('candidate_resumes')
      .insert({
        candidate_id: candidate.id,
        file_name: payload.fileName || 'manual-demo-candidate.txt',
        mime_type: 'text/plain',
        extracted_text: resumeText,
        storage_path: null,
        parse_status: 'parsed',
      })
      .select('*')
      .single();
    resume = resumeRow || null;
  }

  await supabase.from('candidate_stage_history').insert({
    candidate_id: candidate.id,
    from_stage: 'new',
    to_stage: candidate.stage,
    changed_by: user.id,
    note: 'Manual frontend demo candidate created.',
  });

  return { candidate: normalizeCandidate(candidate), resume };
}

export async function updateCandidateStage(candidateId, stage) {
  const user = await getActiveUser();

  if (!requireSupabaseClient()) {
    const store = loadDemoStore();
    const candidate = store.candidates.find((item) => item.id === candidateId);
    if (!candidate) throw new Error('Candidate not found.');
    const fromStage = candidate.stage;
    candidate.stage = stage;
    candidate.updated_at = nowIso();
    store.history.unshift({
      id: createId('history'),
      candidate_id: candidateId,
      from_stage: fromStage,
      to_stage: stage,
      changed_by: user.id,
      note: 'Stage updated in frontend demo mode.',
      created_at: nowIso(),
    });
    saveDemoStore(store);
    return { candidate: normalizeCandidate(candidate) };
  }

  const { data: existing, error: loadError } = await supabase
    .from('candidates')
    .select('id, stage')
    .eq('id', candidateId)
    .eq('owner_id', user.id)
    .maybeSingle();

  if (loadError) throw new Error(loadError.message || 'Could not load candidate.');
  if (!existing) throw new Error('Candidate not found.');

  const { data, error } = await supabase
    .from('candidates')
    .update({ stage })
    .eq('id', candidateId)
    .eq('owner_id', user.id)
    .select('*')
    .single();

  if (error) throw new Error(error.message || 'Could not update candidate stage.');

  await supabase.from('candidate_stage_history').insert({
    candidate_id: candidateId,
    from_stage: existing.stage,
    to_stage: stage,
    changed_by: user.id,
    note: 'Stage updated in frontend-only mode.',
  });

  return { candidate: normalizeCandidate(data) };
}

export async function getCandidateDetail(candidateId) {
  const user = await getActiveUser();

  if (!requireSupabaseClient()) {
    const store = loadDemoStore();
    const candidate = store.candidates.find((item) => item.id === candidateId);
    if (!candidate) return { candidate: null, resume: null, notes: [], scores: [], history: [], interviews: [], availability: [] };
    return {
      candidate: normalizeCandidate(candidate),
      resume: sortNewest(store.resumes.filter((item) => item.candidate_id === candidateId))[0] || null,
      notes: sortNewest(store.notes.filter((item) => item.candidate_id === candidateId)),
      scores: sortNewest(store.scores.filter((item) => item.candidate_id === candidateId)).map(normalizeScore),
      history: sortNewest(store.history.filter((item) => item.candidate_id === candidateId)),
      interviews: sortNewest(store.interviews.filter((item) => item.candidate_id === candidateId)),
      availability: store.availability
        .filter((item) => item.candidate_id === candidateId)
        .sort((a, b) => new Date(a.start_at || 0).getTime() - new Date(b.start_at || 0).getTime()),
    };
  }

  const { data: candidate, error } = await supabase
    .from('candidates')
    .select('*')
    .eq('id', candidateId)
    .eq('owner_id', user.id)
    .maybeSingle();

  if (error) throw new Error(error.message || 'Could not load candidate.');
  if (!candidate) return { candidate: null, resume: null, notes: [], scores: [], history: [], interviews: [], availability: [] };

  const [resumeRes, notesRes, scoresRes, historyRes, interviewsRes, availabilityRes] = await Promise.all([
    supabase.from('candidate_resumes').select('*').eq('candidate_id', candidateId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('candidate_notes').select('*').eq('candidate_id', candidateId).order('created_at', { ascending: false }),
    supabase.from('candidate_job_scores').select('*').eq('candidate_id', candidateId).order('created_at', { ascending: false }),
    supabase.from('candidate_stage_history').select('*').eq('candidate_id', candidateId).order('created_at', { ascending: false }),
    supabase.from('interviews').select('*').eq('candidate_id', candidateId).order('created_at', { ascending: false }),
    supabase.from('candidate_availability').select('*').eq('candidate_id', candidateId).order('start_at', { ascending: true }),
  ]);

  const safeAvailabilityRes = availabilityRes.error?.message?.toLowerCase().includes('candidate_availability')
    ? { data: [], error: null }
    : availabilityRes;
  const firstError = [resumeRes, notesRes, scoresRes, historyRes, interviewsRes, safeAvailabilityRes].find((result) => result.error)?.error;
  if (firstError) throw new Error(firstError.message || 'Could not load candidate details.');

  return {
    candidate: normalizeCandidate(candidate),
    resume: resumeRes.data || null,
    notes: notesRes.data || [],
    scores: (scoresRes.data || []).map(normalizeScore),
    history: historyRes.data || [],
    interviews: interviewsRes.data || [],
    availability: safeAvailabilityRes.data || [],
  };
}

export async function addCandidateNote(candidateId, { note, tags = [] }) {
  const user = await getActiveUser();
  const cleanNote = String(note || '').trim();
  if (!cleanNote) throw new Error('Note text is required.');

  if (!requireSupabaseClient()) {
    const store = loadDemoStore();
    const noteRow = {
      id: createId('note'),
      candidate_id: candidateId,
      note: cleanNote,
      tags: normalizeArray(tags),
      created_by: user.id,
      created_at: nowIso(),
    };
    store.notes.unshift(noteRow);
    saveDemoStore(store);
    return { note: noteRow };
  }

  const { data, error } = await supabase
    .from('candidate_notes')
    .insert({
      candidate_id: candidateId,
      note: cleanNote,
      tags: normalizeArray(tags),
      created_by: user.id,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message || 'Could not add note.');
  return { note: data };
}

export async function deleteCandidate(candidateId) {
  const user = await getActiveUser();

  if (!requireSupabaseClient()) {
    const store = loadDemoStore();
    store.candidates = store.candidates.filter((item) => item.id !== candidateId);
    store.resumes = store.resumes.filter((item) => item.candidate_id !== candidateId);
    store.notes = store.notes.filter((item) => item.candidate_id !== candidateId);
    store.scores = store.scores.filter((item) => item.candidate_id !== candidateId);
    store.history = store.history.filter((item) => item.candidate_id !== candidateId);
    store.interviews = store.interviews.filter((item) => item.candidate_id !== candidateId);
    store.availability = store.availability.filter((item) => item.candidate_id !== candidateId);
    saveDemoStore(store);
    return { success: true };
  }

  const { error } = await supabase
    .from('candidates')
    .delete()
    .eq('id', candidateId)
    .eq('owner_id', user.id);

  if (error) throw new Error(error.message || 'Could not delete candidate.');
  return { success: true };
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 2);
}

function extractRequirements(job = {}) {
  const fromRequirements = normalizeArray(job.requirements);
  if (fromRequirements.length) return fromRequirements;

  const lines = String(job.description || '')
    .split(/[\n,;]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 2 && item.length < 80);

  if (lines.length) return lines.slice(0, 12);

  return Array.from(new Set(tokenize(`${job.title || ''} ${job.description || ''}`))).slice(0, 12);
}

function calculateDemoScore(candidate, job) {
  const shapedCandidate = normalizeCandidate(candidate);
  const shapedJob = normalizeJob(job);
  const requirements = extractRequirements(shapedJob);
  const candidateSkills = normalizeArray(shapedCandidate.skills);
  const candidateText = `${shapedCandidate.full_name || ''} ${shapedCandidate.current_title || ''} ${shapedCandidate.current_company || ''} ${shapedCandidate.summary || ''} ${candidateSkills.join(' ')}`.toLowerCase();
  const jobTokens = Array.from(new Set(tokenize(`${shapedJob.title || ''} ${shapedJob.description || ''} ${requirements.join(' ')}`)));
  const candidateTokens = new Set(tokenize(candidateText));

  const matchedSkills = requirements.filter((requirement) => {
    const text = String(requirement).toLowerCase();
    return candidateText.includes(text) || tokenize(text).some((token) => candidateTokens.has(token));
  });
  const missingSkills = requirements.filter((requirement) => !matchedSkills.includes(requirement)).slice(0, 8);

  const tokenMatches = jobTokens.filter((token) => candidateTokens.has(token)).length;
  const skillRatio = requirements.length ? matchedSkills.length / requirements.length : 0;
  const tokenRatio = jobTokens.length ? tokenMatches / jobTokens.length : 0;
  const experienceBonus = Math.min(10, Number(shapedCandidate.years_experience || 0));
  const score = Math.max(15, Math.min(98, Math.round((skillRatio * 65) + (tokenRatio * 25) + experienceBonus)));

  return {
    score,
    skill_match_percent: Math.max(0, Math.min(100, Math.round(skillRatio * 100))),
    matched_skills: matchedSkills,
    missing_skills: missingSkills,
    explanation: `Frontend-only demo score based on keyword and skill overlap. Matched ${matchedSkills.length} of ${requirements.length || 0} listed requirements. No Gemini API or backend server was called.`,
    embedding_similarity: score / 100,
    embedding_model: null,
    scoring_method: DEMO_SCORING_METHOD,
  };
}

async function saveScore(candidate, job, scoreData) {
  const scorePayload = {
    candidate_id: candidate.id,
    job_id: job.id,
    ...scoreData,
  };

  if (!requireSupabaseClient()) {
    const store = loadDemoStore();
    const existingIndex = store.scores.findIndex((score) => score.candidate_id === candidate.id && score.job_id === job.id);
    const score = normalizeScore({
      id: existingIndex >= 0 ? store.scores[existingIndex].id : createId('score'),
      ...scorePayload,
      created_at: existingIndex >= 0 ? store.scores[existingIndex].created_at : nowIso(),
      updated_at: nowIso(),
    });
    if (existingIndex >= 0) store.scores[existingIndex] = score;
    else store.scores.unshift(score);
    saveDemoStore(store);
    return score;
  }

  const { data, error } = await supabase
    .from('candidate_job_scores')
    .upsert(scorePayload, { onConflict: 'candidate_id,job_id' })
    .select('*')
    .single();

  if (!error && data) return normalizeScore(data);

  const insertResult = await supabase
    .from('candidate_job_scores')
    .insert(scorePayload)
    .select('*')
    .single();

  if (!insertResult.error && insertResult.data) return normalizeScore(insertResult.data);

  return normalizeScore({
    id: createId('score-local'),
    ...scorePayload,
    created_at: nowIso(),
    updated_at: nowIso(),
    explanation: `${scorePayload.explanation} The demo score is shown locally because Supabase score write policies blocked saving it.`,
  });
}

async function ensureJobForScoring({ jobId, title, description }) {
  if (jobId) {
    const { jobs } = await listJobs();
    const existing = jobs.find((job) => job.id === jobId);
    if (!existing) throw new Error('Selected job is no longer available.');
    return existing;
  }

  const requirements = extractRequirements({ title, description });
  const { job } = await createJob({
    title: title || 'Custom Demo Role',
    department: 'Demo scoring',
    location: 'Remote',
    description: description || title || 'Custom role used for a frontend-only demo score.',
    requirements,
  });
  return job;
}

export async function scoreCandidateDemo({ candidateId, jobId, title, description }) {
  const detail = await getCandidateDetail(candidateId);
  if (!detail.candidate) throw new Error('Candidate not found.');
  const job = await ensureJobForScoring({ jobId, title, description });
  const scoreData = calculateDemoScore(detail.candidate, job);
  const score = await saveScore(detail.candidate, job, scoreData);
  return { score, job };
}

export async function rankCandidatesForJob(jobId, { limit = 50, minSimilarity = 0, backfillMissing = true } = {}) {
  if (!requireSupabaseClient()) {
    const { jobs } = await listJobs();
    const job = jobs.find((item) => item.id === jobId);
    if (!job) throw new Error('Job not found.');

    const { candidates } = await listCandidates();
    const matches = [];

    for (const candidate of candidates.slice(0, limit)) {
      const scoreData = calculateDemoScore(candidate, job);
      const score = await saveScore(candidate, job, scoreData);
      matches.push({
        candidate,
        score,
        similarity: score.score / 100,
      });
    }

    matches.sort((a, b) => Number(b.score?.score || 0) - Number(a.score?.score || 0));
    return { job, matches, generated: matches.length };
  }

  const data = await apiPost(`/api/matching/jobs/${jobId}/candidates`, { limit, minSimilarity, backfillMissing }, { auth: true });
  return {
    ...data,
    job: data.job ? normalizeJob(data.job) : null,
    matches: (data.matches || []).map((match) => ({
      ...match,
      candidate: normalizeCandidate(match.candidate),
      score: normalizeScore(match.score),
    })),
  };
}

export const rankCandidatesForJobDemo = rankCandidatesForJob;

export async function scheduleInterviewDemo(candidateId, payload) {
  const user = await getActiveUser();
  const detail = await getCandidateDetail(candidateId);
  if (!detail.candidate) throw new Error('Candidate not found.');

  const startAt = new Date(payload.start || payload.start_at);
  const endAt = new Date(payload.end || payload.end_at);
  if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime())) {
    throw new Error('Valid interview start and end times are required.');
  }
  if (endAt < startAt) throw new Error('End time cannot be earlier than start time.');

  const interviewPayload = {
    owner_id: user.id,
    candidate_id: candidateId,
    job_id: payload.jobId || null,
    availability_id: payload.availabilityId || null,
    title: String(payload.title || 'Demo Interview').trim(),
    interview_type: payload.interviewType || 'custom',
    description: String(payload.description || payload.notes || 'Frontend-only demo interview. No calendar invite was sent.').trim(),
    attendee_email: payload.attendeeEmail || detail.candidate.email || '',
    interviewer_email: payload.interviewerEmail || user.email || '',
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    timezone: payload.timezone || DEFAULT_TIMEZONE,
    location: payload.location || '',
    external_event_id: createId('demo-event'),
    external_event_link: '',
    meeting_url: '',
    calendar_provider: 'demo',
    sync_status: 'demo',
    status: 'scheduled',
    created_by: user.id,
  };

  if (!requireSupabaseClient()) {
    const store = loadDemoStore();
    const interview = {
      id: createId('interview'),
      ...interviewPayload,
      created_at: nowIso(),
    };
    store.interviews.unshift(interview);
    const availability = store.availability.find((item) => item.id === interview.availability_id);
    if (availability) availability.status = 'booked';
    saveDemoStore(store);
    await updateCandidateStage(candidateId, 'interview_scheduled');
    return { interview };
  }

  const { data, error } = await supabase
    .from('interviews')
    .insert(interviewPayload)
    .select('*')
    .single();

  if (error) throw new Error(error.message || 'Could not schedule demo interview.');
  await updateCandidateStage(candidateId, 'interview_scheduled');
  return { interview: data };
}

function dayKey(value) {
  const date = new Date(value || nowIso());
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function mapSeries(map, dateKey = 'date', valueKey = 'count') {
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({ [dateKey]: key, [valueKey]: value }));
}

function avg(values) {
  const numbers = values.map(Number).filter((value) => Number.isFinite(value));
  return numbers.length ? Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length) : 0;
}

export function summarizeRecruitment(candidates, scores, interviews, jobs = [], emails = []) {
  const stageCounts = candidates.reduce((acc, candidate) => {
    acc[candidate.stage] = (acc[candidate.stage] || 0) + 1;
    return acc;
  }, {});

  const scoreValues = scores.map((item) => Number(item.score || 0)).filter((score) => Number.isFinite(score));
  const averageScore = avg(scoreValues);
  const highScoreIds = [...new Set(scores.filter((item) => Number(item.score || 0) >= 80).map((item) => item.candidate_id).filter(Boolean))];

  const daily = {};
  const month = {};
  candidates.forEach((candidate) => {
    const day = dayKey(candidate.created_at || nowIso());
    daily[day] = (daily[day] || 0) + 1;
    const date = new Date(candidate.created_at || nowIso());
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    month[key] = (month[key] || 0) + 1;
  });

  const funnelBase = Math.max(candidates.length, 1);
  const funnel = [
    { id: 'new', stage: 'Applied', count: stageCounts.new || 0 },
    { id: 'parsed', stage: 'Parsed', count: stageCounts.parsed || 0 },
    { id: 'screened', stage: 'Screened', count: Math.max(stageCounts.parsed || 0, scores.length) },
    { id: 'shortlisted', stage: 'Shortlisted', count: stageCounts.shortlisted || 0 },
    { id: 'interview_scheduled', stage: 'Interview', count: stageCounts.interview_scheduled || 0 },
    { id: 'selected', stage: 'Selected', count: stageCounts.selected || 0 },
    { id: 'hired', stage: 'Hired', count: stageCounts.hired || stageCounts.selected || 0 },
    { id: 'rejected', stage: 'Rejected', count: stageCounts.rejected || 0 },
  ].map((item, index, all) => {
    const previous = index ? all[index - 1].count : item.count;
    return {
      ...item,
      conversionRate: previous ? Math.round((item.count / previous) * 100) : 0,
      overallRate: Math.round((item.count / funnelBase) * 100),
    };
  });

  const skillMap = {};
  candidates.forEach((candidate) => {
    normalizeArray(candidate.skills).forEach((skill) => {
      const key = skill.toLowerCase();
      skillMap[key] = (skillMap[key] || 0) + 1;
    });
  });

  const emailStatus = {};
  const emailType = {};
  emails.forEach((email) => {
    emailStatus[email.status || 'sent'] = (emailStatus[email.status || 'sent'] || 0) + 1;
    emailType[email.type || 'custom'] = (emailType[email.type || 'custom'] || 0) + 1;
  });

  const sentEmails = emails.filter((email) => email.status === 'sent' || email.status === 'demo').length;
  const failedEmails = emails.filter((email) => email.status === 'failed').length;

  return {
    totals: {
      candidates: candidates.length,
      parsed: stageCounts.parsed || 0,
      shortlisted: stageCounts.shortlisted || 0,
      interviewScheduled: stageCounts.interview_scheduled || 0,
      interviews: interviews.length,
      interviewCount: interviews.length,
      selected: stageCounts.selected || 0,
      hired: stageCounts.hired || stageCounts.selected || 0,
      offerAccepted: stageCounts.hired || stageCounts.selected || 0,
      rejected: stageCounts.rejected || 0,
      averageScore,
      highScoreCandidates: highScoreIds.length,
      emails: emails.length,
      emailsSent: sentEmails,
      emailsFailed: failedEmails,
      emailSuccessRate: emails.length ? Math.round((sentEmails / emails.length) * 100) : 0,
    },
    funnel,
    candidatesByStage: funnel.filter((item) => item.id !== 'hired'),
    scoreDistribution: [
      { label: '0-40', count: scoreValues.filter((item) => item < 40).length },
      { label: '40-60', count: scoreValues.filter((item) => item >= 40 && item < 60).length },
      { label: '60-80', count: scoreValues.filter((item) => item >= 60 && item < 80).length },
      { label: '80-100', count: scoreValues.filter((item) => item >= 80).length },
    ],
    weeklyTrend: mapSeries(daily),
    dailyApplications: mapSeries(daily),
    monthlyHiring: mapSeries(month, 'month', 'count'),
    topSkills: Object.entries(skillMap).map(([skill, count]) => ({ skill, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    candidatesByJob: jobs.map((job) => ({ jobId: job.id, title: job.title, count: scores.filter((score) => score.job_id === job.id).length, averageScore: avg(scores.filter((score) => score.job_id === job.id).map((score) => score.score)) })).filter((item) => item.count > 0).slice(0, 8),
    experienceBreakdown: [
      { label: '0-2 yrs', count: candidates.filter((candidate) => Number(candidate.years_experience || 0) <= 2).length },
      { label: '3-5 yrs', count: candidates.filter((candidate) => Number(candidate.years_experience || 0) >= 3 && Number(candidate.years_experience || 0) <= 5).length },
      { label: '6-10 yrs', count: candidates.filter((candidate) => Number(candidate.years_experience || 0) >= 6 && Number(candidate.years_experience || 0) <= 10).length },
      { label: '10+ yrs', count: candidates.filter((candidate) => Number(candidate.years_experience || 0) > 10).length },
    ],
    highScoreCandidates: candidates.filter((candidate) => highScoreIds.includes(candidate.id)).slice(0, 8).map((candidate) => ({ id: candidate.id, name: candidate.full_name || candidate.email || 'Candidate', stage: candidate.stage })),
    emailByStatus: Object.entries(emailStatus).map(([status, count]) => ({ status, label: status, count })),
    emailByType: Object.entries(emailType).map(([type, count]) => ({ type, label: type.replace(/_/g, ' '), count })),
    emailTrend: mapSeries(emails.reduce((acc, email) => {
      const key = dayKey(email.created_at || email.sent_at);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})),
    recentActivity: [...candidates, ...emails].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 10),
  };
}

export async function getAnalyticsSummary() {
  if (!requireSupabaseClient()) {
    const store = loadDemoStore();
    return summarizeRecruitment(store.candidates, store.scores, store.interviews, store.jobs, store.emails || []);
  }

  return apiGet('/api/analytics/summary', { auth: true });
}
