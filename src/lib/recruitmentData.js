'use client';

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

const DEMO_STORE_KEY = 'ai-recruitment-crm-frontend-demo-store-v1';
const DEMO_SCORING_METHOD = 'client_demo';

const DEFAULT_STORE = {
  candidates: [],
  resumes: [],
  notes: [],
  scores: [],
  history: [],
  interviews: [],
  jobs: [],
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

function normalizeCandidate(candidate = {}) {
  const jobScores = (candidate.candidate_job_scores || candidate.job_scores || [])
    .map(normalizeScore)
    .filter(Boolean)
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

  return {
    ...candidate,
    skills: normalizeArray(candidate.skills),
    education: Array.isArray(candidate.education) ? candidate.education : [],
    experience: Array.isArray(candidate.experience) ? candidate.experience : [],
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
  return {
    ...job,
    requirements: normalizeArray(job.requirements),
    is_active: job.is_active !== false,
  };
}

function sortNewest(items) {
  return [...items].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
}

function requireSupabaseClient() {
  if (!isSupabaseConfigured()) return false;
  if (typeof supabase.from !== 'function') return false;
  return true;
}

export async function getActiveUser() {
  if (!isSupabaseConfigured()) return DEMO_USER;

  const { data, error } = await safeGetSession();
  if (error) throw new Error(error.message || 'Could not read Supabase session.');
  const user = data?.session?.user;
  if (!user) throw new Error('Please sign in to continue.');
  return user;
}

function profilePayloadFromUser(user) {
  return {
    id: user.id,
    email: user.email || '',
    full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Recruiter',
    role: 'recruiter',
  };
}

async function ensureProfileWithRpc(user) {
  const { data, error } = await supabase.rpc('ensure_my_profile');
  if (error) {
    throw new Error(`Account profile is missing in Supabase. Run the ensure_my_profile SQL patch once, then sign in again. Supabase said: ${error.message}`);
  }
  return data || profilePayloadFromUser(user);
}

export async function getCurrentProfile(userArg = null) {
  const user = userArg || await getActiveUser();
  if (!requireSupabaseClient() || user.id === DEMO_USER.id) return DEMO_PROFILE;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw new Error(error.message || 'Could not load profile.');
  if (data) return data;

  return ensureProfileWithRpc(user);
}

async function ensureCurrentProfile(userArg = null) {
  const user = userArg || await getActiveUser();
  if (!requireSupabaseClient() || user.id === DEMO_USER.id) return DEMO_PROFILE;

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

export async function listJobs() {
  const user = await getActiveUser();

  if (!requireSupabaseClient()) {
    const store = loadDemoStore();
    return { jobs: sortNewest(store.jobs).map(normalizeJob) };
  }

  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message || 'Could not load jobs.');
  return { jobs: (data || []).map(normalizeJob) };
}

export async function createJob(payload) {
  const user = await getActiveUser();
  await ensureCurrentProfile(user);
  const jobPayload = {
    title: String(payload.title || '').trim(),
    department: String(payload.department || '').trim(),
    location: String(payload.location || '').trim(),
    description: String(payload.description || '').trim(),
    requirements: normalizeArray(payload.requirements),
    owner_id: user.id,
  };

  if (!jobPayload.title || !jobPayload.description) {
    throw new Error('Job title and description are required.');
  }

  if (!requireSupabaseClient()) {
    const store = loadDemoStore();
    const job = normalizeJob({
      id: createId('job'),
      ...jobPayload,
      is_active: true,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
    store.jobs.unshift(job);
    saveDemoStore(store);
    return { job };
  }

  const { data, error } = await supabase
    .from('jobs')
    .insert(jobPayload)
    .select('*')
    .single();

  if (error) throw new Error(error.message || 'Could not create job.');
  return { job: normalizeJob(data) };
}

export async function updateJob(id, payload) {
  const user = await getActiveUser();
  const updates = { ...payload };
  if (updates.requirements !== undefined) updates.requirements = normalizeArray(updates.requirements);

  if (!requireSupabaseClient()) {
    const store = loadDemoStore();
    const index = store.jobs.findIndex((job) => job.id === id);
    if (index === -1) throw new Error('Job not found.');
    store.jobs[index] = normalizeJob({ ...store.jobs[index], ...updates, updated_at: nowIso() });
    saveDemoStore(store);
    return { job: store.jobs[index] };
  }

  const { data, error } = await supabase
    .from('jobs')
    .update(updates)
    .eq('id', id)
    .eq('owner_id', user.id)
    .select('*')
    .single();

  if (error) throw new Error(error.message || 'Could not update job.');
  return { job: normalizeJob(data) };
}

export async function deleteJob(id) {
  const user = await getActiveUser();

  if (!requireSupabaseClient()) {
    const store = loadDemoStore();
    store.jobs = store.jobs.filter((job) => job.id !== id);
    store.scores = store.scores.filter((score) => score.job_id !== id);
    saveDemoStore(store);
    return { success: true };
  }

  const { error } = await supabase
    .from('jobs')
    .delete()
    .eq('id', id)
    .eq('owner_id', user.id);

  if (error) throw new Error(error.message || 'Could not delete job.');
  return { success: true };
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
    education: [],
    experience: [],
    tags: [],
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
    if (!candidate) return { candidate: null, resume: null, notes: [], scores: [], history: [], interviews: [] };
    return {
      candidate: normalizeCandidate(candidate),
      resume: sortNewest(store.resumes.filter((item) => item.candidate_id === candidateId))[0] || null,
      notes: sortNewest(store.notes.filter((item) => item.candidate_id === candidateId)),
      scores: sortNewest(store.scores.filter((item) => item.candidate_id === candidateId)).map(normalizeScore),
      history: sortNewest(store.history.filter((item) => item.candidate_id === candidateId)),
      interviews: sortNewest(store.interviews.filter((item) => item.candidate_id === candidateId)),
    };
  }

  const { data: candidate, error } = await supabase
    .from('candidates')
    .select('*')
    .eq('id', candidateId)
    .eq('owner_id', user.id)
    .maybeSingle();

  if (error) throw new Error(error.message || 'Could not load candidate.');
  if (!candidate) return { candidate: null, resume: null, notes: [], scores: [], history: [], interviews: [] };

  const [resumeRes, notesRes, scoresRes, historyRes, interviewsRes] = await Promise.all([
    supabase.from('candidate_resumes').select('*').eq('candidate_id', candidateId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('candidate_notes').select('*').eq('candidate_id', candidateId).order('created_at', { ascending: false }),
    supabase.from('candidate_job_scores').select('*').eq('candidate_id', candidateId).order('created_at', { ascending: false }),
    supabase.from('candidate_stage_history').select('*').eq('candidate_id', candidateId).order('created_at', { ascending: false }),
    supabase.from('interviews').select('*').eq('candidate_id', candidateId).order('created_at', { ascending: false }),
  ]);

  const firstError = [resumeRes, notesRes, scoresRes, historyRes, interviewsRes].find((result) => result.error)?.error;
  if (firstError) throw new Error(firstError.message || 'Could not load candidate details.');

  return {
    candidate: normalizeCandidate(candidate),
    resume: resumeRes.data || null,
    notes: notesRes.data || [],
    scores: (scoresRes.data || []).map(normalizeScore),
    history: historyRes.data || [],
    interviews: interviewsRes.data || [],
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

export async function rankCandidatesForJobDemo(jobId, { limit = 50 } = {}) {
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
  return { matches };
}

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
    candidate_id: candidateId,
    job_id: payload.jobId || null,
    title: String(payload.title || 'Demo Interview').trim(),
    description: String(payload.description || 'Frontend-only demo interview. No calendar invite was sent.').trim(),
    attendee_email: payload.attendeeEmail || detail.candidate.email || '',
    interviewer_email: user.email || '',
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    external_event_id: createId('demo-event'),
    external_event_link: '',
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

export function summarizeRecruitment(candidates, scores, interviews) {
  const stageCounts = candidates.reduce((acc, candidate) => {
    acc[candidate.stage] = (acc[candidate.stage] || 0) + 1;
    return acc;
  }, {});

  const totalScore = scores.reduce((sum, item) => sum + Number(item.score || 0), 0);
  const averageScore = scores.length ? Math.round(totalScore / scores.length) : 0;

  const weekly = candidates.reduce((acc, candidate) => {
    const date = new Date(candidate.created_at || nowIso());
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return {
    totals: {
      candidates: candidates.length,
      shortlisted: stageCounts.shortlisted || 0,
      interviews: interviews.length,
      selected: stageCounts.selected || 0,
      rejected: stageCounts.rejected || 0,
      averageScore,
    },
    funnel: [
      { stage: 'New', count: stageCounts.new || 0 },
      { stage: 'Parsed', count: stageCounts.parsed || 0 },
      { stage: 'Shortlisted', count: stageCounts.shortlisted || 0 },
      { stage: 'Interview Scheduled', count: stageCounts.interview_scheduled || 0 },
      { stage: 'Selected', count: stageCounts.selected || 0 },
      { stage: 'Rejected', count: stageCounts.rejected || 0 },
    ],
    scoreDistribution: [
      { label: '0-40', count: scores.filter((item) => item.score < 40).length },
      { label: '40-60', count: scores.filter((item) => item.score >= 40 && item.score < 60).length },
      { label: '60-80', count: scores.filter((item) => item.score >= 60 && item.score < 80).length },
      { label: '80-100', count: scores.filter((item) => item.score >= 80).length },
    ],
    weeklyTrend: Object.entries(weekly)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count })),
  };
}

export async function getAnalyticsSummary() {
  if (!requireSupabaseClient()) {
    const store = loadDemoStore();
    return summarizeRecruitment(store.candidates, store.scores, store.interviews);
  }

  const { candidates } = await listCandidates();
  const candidateIds = candidates.map((candidate) => candidate.id);
  if (!candidateIds.length) return summarizeRecruitment([], [], []);

  const [scoresRes, interviewsRes] = await Promise.all([
    supabase.from('candidate_job_scores').select('*').in('candidate_id', candidateIds),
    supabase.from('interviews').select('*').in('candidate_id', candidateIds),
  ]);

  if (scoresRes.error || interviewsRes.error) {
    throw new Error(scoresRes.error?.message || interviewsRes.error?.message || 'Could not load analytics.');
  }

  return summarizeRecruitment(candidates, (scoresRes.data || []).map(normalizeScore), interviewsRes.data || []);
}
