'use client';

import { apiDelete, apiGet, apiPatch, apiPost } from './api';
import { DEFAULT_TIMEZONE } from './timezones';
import { isSupabaseConfigured } from './supabaseClient';
import { getActiveUser } from './recruitmentData';

const DEMO_STORE_KEY = 'ai-recruitment-crm-frontend-demo-store-v1';

const DEFAULT_STORE = {
  candidates: [],
  resumes: [],
  notes: [],
  scores: [],
  history: [],
  interviews: [],
  availability: [],
  jobs: [],
};

const ACTIVE_INTERVIEW_STATUSES = ['scheduled', 'rescheduled'];
const ACTIVE_AVAILABILITY_STATUSES = ['available', 'held', 'booked'];

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

function queryString(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

function toDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function assertTimeRange(startValue, endValue, { allowPast = false, label = 'Interview' } = {}) {
  const start = toDate(startValue);
  const end = toDate(endValue);
  if (!start || !end) throw new Error(`Valid ${label.toLowerCase()} start and end times are required.`);
  if (end <= start) throw new Error(`${label} end time must be greater than start time.`);
  if (!allowPast && start < new Date()) throw new Error(`${label} cannot be scheduled in the past.`);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function getStart(payload = {}) {
  return payload.start_at || payload.startAt || payload.start;
}

function getEnd(payload = {}) {
  return payload.end_at || payload.endAt || payload.end;
}

function getCandidateId(payload = {}) {
  return payload.candidateId || payload.candidate_id;
}

function getJobId(payload = {}) {
  return payload.jobId ?? payload.job_id ?? null;
}

function getAvailabilityId(payload = {}) {
  return payload.availabilityId ?? payload.availability_id ?? null;
}

function getInterviewType(payload = {}) {
  return payload.interviewType || payload.interview_type || 'custom';
}

function getAttendeeEmail(payload = {}) {
  return payload.attendeeEmail || payload.attendee_email || '';
}

function getInterviewerEmail(payload = {}) {
  return payload.interviewerEmail || payload.interviewer_email || '';
}

function overlaps(row, startIso, endIso) {
  return new Date(row.start_at).getTime() < new Date(endIso).getTime()
    && new Date(row.end_at).getTime() > new Date(startIso).getTime();
}

function shapeInterview(interview, store) {
  return {
    ...interview,
    candidate: store.candidates.find((candidate) => candidate.id === interview.candidate_id) || null,
    job: store.jobs.find((job) => job.id === interview.job_id) || null,
    sync_status: interview.sync_status || 'demo',
    interview_type: interview.interview_type || 'custom',
    location: interview.location || '',
  };
}

function filterDemoInterviews(interviews, params = {}) {
  const now = Date.now();
  const q = String(params.q || '').trim().toLowerCase();

  return interviews.filter((interview) => {
    if (params.status && interview.status !== params.status) return false;
    if (params.syncStatus && interview.sync_status !== params.syncStatus) return false;
    if (params.candidateId && interview.candidate_id !== params.candidateId) return false;
    if (params.jobId && interview.job_id !== params.jobId) return false;
    if (params.from && new Date(interview.start_at).getTime() < new Date(params.from).getTime()) return false;
    if (params.to && new Date(interview.start_at).getTime() > new Date(params.to).getTime()) return false;
    if ((params.view || 'upcoming') === 'upcoming' && (new Date(interview.start_at).getTime() < now || ['cancelled', 'completed'].includes(interview.status))) return false;
    if (params.view === 'history' && !(new Date(interview.start_at).getTime() < now || ['cancelled', 'completed'].includes(interview.status))) return false;
    if (!q) return true;
    return [
      interview.title,
      interview.description,
      interview.location,
      interview.attendee_email,
      interview.interviewer_email,
      interview.candidate?.full_name,
      interview.candidate?.email,
      interview.job?.title,
    ].join(' ').toLowerCase().includes(q);
  });
}

function assertNoDemoInterviewOverlap(store, { ownerId, candidateId, interviewerEmail, startIso, endIso, excludeId = null }) {
  const conflict = store.interviews.find((interview) => (
    interview.owner_id === ownerId
    && interview.id !== excludeId
    && ACTIVE_INTERVIEW_STATUSES.includes(interview.status)
    && (interview.candidate_id === candidateId || (interviewerEmail && interview.interviewer_email === interviewerEmail))
    && overlaps(interview, startIso, endIso)
  ));
  if (conflict) throw new Error('This interview overlaps an existing scheduled interview.');
}

function assertNoDemoAvailabilityOverlap(store, { ownerId, candidateId, startIso, endIso, excludeId = null }) {
  const conflict = store.availability.find((slot) => (
    slot.owner_id === ownerId
    && slot.candidate_id === candidateId
    && slot.id !== excludeId
    && ACTIVE_AVAILABILITY_STATUSES.includes(slot.status)
    && overlaps(slot, startIso, endIso)
  ));
  if (conflict) throw new Error('This availability overlaps an existing active availability slot.');
}

export async function listInterviews(params = {}) {
  if (isSupabaseConfigured()) return apiGet(`/api/interviews${queryString(params)}`, { auth: true });

  const user = await getActiveUser();
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.max(1, Number(params.pageSize || 10));
  const sortBy = params.sortBy || 'start_at';
  const sortDir = params.sortDir === 'desc' ? -1 : 1;
  const store = loadDemoStore();
  const all = filterDemoInterviews(
    store.interviews
      .filter((interview) => interview.owner_id === user.id)
      .map((interview) => shapeInterview(interview, store)),
    params,
  ).sort((a, b) => {
    const av = sortBy.includes('_at') ? new Date(a[sortBy] || 0).getTime() : String(a[sortBy] || '');
    const bv = sortBy.includes('_at') ? new Date(b[sortBy] || 0).getTime() : String(b[sortBy] || '');
    return av > bv ? sortDir : av < bv ? -sortDir : 0;
  });
  const total = all.length;
  const interviews = all.slice((page - 1) * pageSize, page * pageSize);
  return { interviews, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getInterview(id) {
  if (isSupabaseConfigured()) return apiGet(`/api/interviews/${id}`, { auth: true });
  const user = await getActiveUser();
  const store = loadDemoStore();
  const interview = store.interviews.find((item) => item.id === id && item.owner_id === user.id);
  if (!interview) throw new Error('Interview not found.');
  return { interview: shapeInterview(interview, store) };
}

export async function scheduleInterview(payload) {
  if (isSupabaseConfigured()) return apiPost('/api/interviews', payload, { auth: true });

  const user = await getActiveUser();
  const store = loadDemoStore();
  const candidateId = getCandidateId(payload);
  const candidate = store.candidates.find((item) => item.id === candidateId && item.owner_id === user.id);
  if (!candidate) throw new Error('Candidate not found.');

  const jobId = getJobId(payload);
  if (jobId && !store.jobs.some((job) => job.id === jobId && job.owner_id === user.id)) {
    throw new Error('Selected job is no longer available.');
  }

  const availabilityId = getAvailabilityId(payload);
  const availability = availabilityId ? store.availability.find((slot) => slot.id === availabilityId && slot.owner_id === user.id) : null;
  if (availabilityId && !availability) throw new Error('Availability slot not found.');
  if (availability && availability.status !== 'available') throw new Error('Availability slot is no longer available.');

  const timezone = payload.timezone || availability?.timezone || DEFAULT_TIMEZONE;
  const { startIso, endIso } = assertTimeRange(getStart(payload) || availability?.start_at, getEnd(payload) || availability?.end_at);
  const interviewerEmail = getInterviewerEmail(payload) || user.email || '';
  assertNoDemoInterviewOverlap(store, { ownerId: user.id, candidateId, interviewerEmail, startIso, endIso });

  const interview = {
    id: createId('interview'),
    owner_id: user.id,
    candidate_id: candidateId,
    job_id: jobId || null,
    availability_id: availabilityId || null,
    title: String(payload.title || 'Interview').trim(),
    interview_type: getInterviewType(payload),
    description: String(payload.notes ?? payload.description ?? '').trim(),
    attendee_email: getAttendeeEmail(payload) || candidate.email || '',
    interviewer_email: interviewerEmail,
    start_at: startIso,
    end_at: endIso,
    timezone,
    location: String(payload.location || '').trim(),
    external_event_id: createId('demo-event'),
    external_event_link: '',
    meeting_url: '',
    calendar_provider: 'demo',
    sync_status: 'demo',
    status: 'scheduled',
    created_by: user.id,
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  store.interviews.unshift(interview);
  if (availability) Object.assign(availability, { status: 'booked', updated_at: nowIso() });
  candidate.stage = 'interview_scheduled';
  candidate.updated_at = nowIso();
  saveDemoStore(store);
  return { interview: shapeInterview(interview, store) };
}

export async function updateInterview(id, payload) {
  if (isSupabaseConfigured()) return apiPatch(`/api/interviews/${id}`, payload, { auth: true });

  const user = await getActiveUser();
  const store = loadDemoStore();
  const interview = store.interviews.find((item) => item.id === id && item.owner_id === user.id);
  if (!interview) throw new Error('Interview not found.');
  if (interview.status === 'cancelled') throw new Error('Cancelled interviews cannot be edited.');

  const candidateId = getCandidateId(payload) || interview.candidate_id;
  const candidate = store.candidates.find((item) => item.id === candidateId && item.owner_id === user.id);
  if (!candidate) throw new Error('Candidate not found.');

  const availabilityId = getAvailabilityId(payload) !== null ? getAvailabilityId(payload) : interview.availability_id;
  const nextAvailability = availabilityId && availabilityId !== interview.availability_id
    ? store.availability.find((slot) => slot.id === availabilityId && slot.owner_id === user.id)
    : null;
  if (availabilityId && availabilityId !== interview.availability_id && !nextAvailability) throw new Error('Availability slot not found.');
  if (nextAvailability && nextAvailability.status !== 'available') throw new Error('Availability slot is no longer available.');

  const timezone = payload.timezone || nextAvailability?.timezone || interview.timezone || 'UTC';
  const startValue = getStart(payload) || nextAvailability?.start_at || interview.start_at;
  const endValue = getEnd(payload) || nextAvailability?.end_at || interview.end_at;
  const { startIso, endIso } = assertTimeRange(startValue, endValue, { allowPast: payload.status === 'completed' });
  const interviewerEmail = getInterviewerEmail(payload) || interview.interviewer_email || user.email || '';
  assertNoDemoInterviewOverlap(store, { ownerId: user.id, candidateId, interviewerEmail, startIso, endIso, excludeId: id });

  if (availabilityId !== interview.availability_id) {
    const old = store.availability.find((slot) => slot.id === interview.availability_id && slot.owner_id === user.id);
    if (old && old.status === 'booked') old.status = 'available';
    if (nextAvailability) nextAvailability.status = 'booked';
  }

  Object.assign(interview, {
    candidate_id: candidateId,
    job_id: getJobId(payload) !== null ? getJobId(payload) : interview.job_id,
    availability_id: availabilityId || null,
    title: payload.title ?? interview.title,
    interview_type: payload.interviewType || payload.interview_type || interview.interview_type,
    description: payload.notes !== undefined || payload.description !== undefined ? String(payload.notes ?? payload.description ?? '').trim() : interview.description,
    attendee_email: getAttendeeEmail(payload) || interview.attendee_email || candidate.email || '',
    interviewer_email: interviewerEmail,
    start_at: startIso,
    end_at: endIso,
    timezone,
    location: payload.location !== undefined ? String(payload.location || '').trim() : interview.location,
    status: payload.status || (interview.status === 'scheduled' ? 'rescheduled' : interview.status),
    sync_status: 'demo',
    updated_at: nowIso(),
  });

  saveDemoStore(store);
  return { interview: shapeInterview(interview, store) };
}

export async function cancelInterview(id, payload = {}) {
  if (isSupabaseConfigured()) return apiPost(`/api/interviews/${id}/cancel`, payload, { auth: true });

  const user = await getActiveUser();
  const store = loadDemoStore();
  const interview = store.interviews.find((item) => item.id === id && item.owner_id === user.id);
  if (!interview) throw new Error('Interview not found.');
  interview.status = 'cancelled';
  interview.cancelled_at = nowIso();
  interview.cancel_reason = payload.reason || '';
  interview.updated_at = nowIso();
  const slot = store.availability.find((item) => item.id === interview.availability_id && item.owner_id === user.id);
  if (slot && slot.status === 'booked') slot.status = 'available';
  saveDemoStore(store);
  return { interview: shapeInterview(interview, store) };
}

export async function deleteInterview(id, options = {}) {
  if (isSupabaseConfigured()) return apiDelete(`/api/interviews/${id}${queryString(options)}`, { auth: true });

  const user = await getActiveUser();
  const store = loadDemoStore();
  const interview = store.interviews.find((item) => item.id === id && item.owner_id === user.id);
  if (!interview) throw new Error('Interview not found.');
  const slot = store.availability.find((item) => item.id === interview.availability_id && item.owner_id === user.id);
  if (slot && slot.status === 'booked') slot.status = 'available';
  store.interviews = store.interviews.filter((item) => item.id !== id);
  saveDemoStore(store);
  return { success: true };
}

export async function syncInterview(id, payload = {}) {
  if (isSupabaseConfigured()) return apiPost(`/api/interviews/${id}/sync`, payload, { auth: true });
  const { interview } = await getInterview(id);
  return { interview: { ...interview, sync_status: 'demo' } };
}

export async function listCandidateAvailability(candidateId) {
  if (isSupabaseConfigured()) return apiGet(`/api/candidate-availability${queryString({ candidateId })}`, { auth: true });

  const user = await getActiveUser();
  const store = loadDemoStore();
  const availability = store.availability
    .filter((slot) => slot.owner_id === user.id && slot.candidate_id === candidateId)
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  return { availability };
}

export async function createCandidateAvailability(payload) {
  if (isSupabaseConfigured()) return apiPost('/api/candidate-availability', payload, { auth: true });

  const user = await getActiveUser();
  const store = loadDemoStore();
  const candidateId = getCandidateId(payload);
  const candidate = store.candidates.find((item) => item.id === candidateId && item.owner_id === user.id);
  if (!candidate) throw new Error('Candidate not found.');
  const { startIso, endIso } = assertTimeRange(getStart(payload), getEnd(payload), { label: 'Availability' });
  assertNoDemoAvailabilityOverlap(store, { ownerId: user.id, candidateId, startIso, endIso });
  const availability = {
    id: createId('availability'),
    owner_id: user.id,
    candidate_id: candidateId,
    start_at: startIso,
    end_at: endIso,
    timezone: payload.timezone || DEFAULT_TIMEZONE,
    status: payload.status || 'available',
    source: 'manual',
    notes: String(payload.notes || '').trim(),
    created_by: user.id,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  store.availability.unshift(availability);
  saveDemoStore(store);
  return { availability };
}

export async function updateCandidateAvailability(id, payload) {
  if (isSupabaseConfigured()) return apiPatch(`/api/candidate-availability/${id}`, payload, { auth: true });

  const user = await getActiveUser();
  const store = loadDemoStore();
  const availability = store.availability.find((slot) => slot.id === id && slot.owner_id === user.id);
  if (!availability) throw new Error('Availability slot not found.');
  if (availability.status === 'booked' && payload.status !== 'cancelled') throw new Error('Booked availability can only be changed by updating or cancelling the linked interview.');
  const nextStatus = payload.status || availability.status;
  const { startIso, endIso } = assertTimeRange(getStart(payload) || availability.start_at, getEnd(payload) || availability.end_at, {
    label: 'Availability',
    allowPast: nextStatus !== 'available',
  });
  if (ACTIVE_AVAILABILITY_STATUSES.includes(nextStatus)) {
    assertNoDemoAvailabilityOverlap(store, { ownerId: user.id, candidateId: availability.candidate_id, startIso, endIso, excludeId: id });
  }
  Object.assign(availability, {
    start_at: startIso,
    end_at: endIso,
    timezone: payload.timezone || availability.timezone,
    status: nextStatus,
    notes: payload.notes !== undefined ? String(payload.notes || '').trim() : availability.notes,
    updated_at: nowIso(),
  });
  saveDemoStore(store);
  return { availability };
}

export async function deleteCandidateAvailability(id) {
  if (isSupabaseConfigured()) return apiDelete(`/api/candidate-availability/${id}`, { auth: true });

  const user = await getActiveUser();
  const store = loadDemoStore();
  const availability = store.availability.find((slot) => slot.id === id && slot.owner_id === user.id);
  if (!availability) throw new Error('Availability slot not found.');
  if (availability.status === 'booked') throw new Error('Booked availability cannot be deleted until the linked interview is cancelled or deleted.');
  store.availability = store.availability.filter((slot) => slot.id !== id);
  saveDemoStore(store);
  return { success: true };
}

export async function getGoogleCalendarStatus() {
  if (isSupabaseConfigured()) return apiGet('/api/integrations/google-calendar/status', { auth: true });
  return {
    configured: false,
    configuration: { ready: false },
    connection: null,
  };
}

export async function startGoogleCalendarConnect(returnTo = '/settings') {
  const response = await apiGet(`/api/integrations/google-calendar/connect${queryString({ returnTo })}`, { auth: true });
  if (response?.url && typeof window !== 'undefined') window.location.href = response.url;
  return response;
}

export async function disconnectGoogleCalendar() {
  if (isSupabaseConfigured()) return apiDelete('/api/integrations/google-calendar', { auth: true });
  return { success: true };
}

export async function listGoogleCalendars() {
  if (isSupabaseConfigured()) return apiGet('/api/integrations/google-calendar/calendars', { auth: true });
  return { calendars: [] };
}

export async function updateGoogleCalendarSettings(payload) {
  if (isSupabaseConfigured()) return apiPatch('/api/integrations/google-calendar/settings', payload, { auth: true });
  return { connection: null };
}

export async function syncGoogleCalendar(payload = {}) {
  if (isSupabaseConfigured()) return apiPost('/api/integrations/google-calendar/sync', payload, { auth: true });
  return { synced: 0, failed: 0, skipped: 0, interviews: [] };
}
