import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  classifyGoogleCalendarError,
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  updateGoogleCalendarEvent,
} from '../lib/googleCalendar.js';
import { getDemoStore, nextId } from '../lib/demoStore.js';
import { supabaseAdmin, supabaseConfigured } from '../lib/supabase.js';

const router = Router();

const ACTIVE_INTERVIEW_STATUSES = ['scheduled', 'rescheduled'];
const INTERVIEW_STATUSES = ['scheduled', 'completed', 'cancelled', 'rescheduled'];
const SYNC_STATUSES = ['not_connected', 'pending', 'synced', 'failed', 'deleted', 'demo'];
const INTERVIEW_TYPES = ['hr', 'technical', 'final', 'manager', 'custom'];
const SORT_COLUMNS = new Set(['start_at', 'created_at', 'updated_at', 'title', 'status', 'sync_status']);

const baseInterviewSchema = z.object({
  candidateId: z.string().min(1).optional(),
  candidate_id: z.string().min(1).optional(),
  jobId: z.string().min(1).nullable().optional(),
  job_id: z.string().min(1).nullable().optional(),
  availabilityId: z.string().min(1).nullable().optional(),
  availability_id: z.string().min(1).nullable().optional(),
  title: z.string().min(2).max(180),
  interviewType: z.string().max(80).optional(),
  interview_type: z.string().max(80).optional(),
  description: z.string().max(4000).optional().default(''),
  notes: z.string().max(4000).optional(),
  start: z.string().min(1).optional(),
  startAt: z.string().min(1).optional(),
  start_at: z.string().min(1).optional(),
  end: z.string().min(1).optional(),
  endAt: z.string().min(1).optional(),
  end_at: z.string().min(1).optional(),
  timezone: z.string().min(1).max(80).default('UTC'),
  location: z.string().max(300).optional().default(''),
  attendeeEmail: z.string().email().optional().or(z.literal('')),
  attendee_email: z.string().email().optional().or(z.literal('')),
  interviewerEmail: z.string().email().optional().or(z.literal('')),
  interviewer_email: z.string().email().optional().or(z.literal('')),
  createMeetLink: z.boolean().optional().default(false),
  sendUpdates: z.boolean().optional().default(false),
});

const patchInterviewSchema = baseInterviewSchema.partial().extend({
  status: z.enum(INTERVIEW_STATUSES).optional(),
});

const cancelSchema = z.object({
  reason: z.string().max(1000).optional().default(''),
  sendUpdates: z.boolean().optional().default(false),
});

function nowIso() {
  return new Date().toISOString();
}

function toDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
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

function getStart(payload = {}) {
  return payload.start_at || payload.startAt || payload.start;
}

function getEnd(payload = {}) {
  return payload.end_at || payload.endAt || payload.end;
}

function getInterviewType(payload = {}) {
  const type = String(payload.interview_type || payload.interviewType || 'custom').trim().toLowerCase();
  return INTERVIEW_TYPES.includes(type) ? type : 'custom';
}

function getAttendeeEmail(payload = {}) {
  return payload.attendee_email || payload.attendeeEmail || '';
}

function getInterviewerEmail(payload = {}) {
  return payload.interviewer_email || payload.interviewerEmail || '';
}

function getNotes(payload = {}) {
  return String(payload.notes ?? payload.description ?? '').trim();
}

function isValidTimezone(timezone) {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function validateTimeRange({ startValue, endValue, timezone, allowPast = false }) {
  const start = toDate(startValue);
  const end = toDate(endValue);
  if (!start || !end) throw Object.assign(new Error('Valid interview start and end times are required.'), { status: 400 });
  if (end <= start) throw Object.assign(new Error('Interview end time must be greater than start time.'), { status: 400 });
  if (!allowPast && start < new Date()) throw Object.assign(new Error('Interviews cannot be scheduled in the past.'), { status: 400 });
  if (!isValidTimezone(timezone)) throw Object.assign(new Error('Timezone is invalid.'), { status: 400 });
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function overlaps(row, startIso, endIso) {
  return new Date(row.start_at).getTime() < new Date(endIso).getTime()
    && new Date(row.end_at).getTime() > new Date(startIso).getTime();
}

function demoInterviewShape(row, store) {
  const candidate = store.candidates.find((item) => item.id === row.candidate_id) || null;
  const job = store.jobs.find((item) => item.id === row.job_id) || null;
  return {
    ...row,
    candidate,
    job,
  };
}

function normalizeInterview(row = {}) {
  return {
    ...row,
    candidate: row.candidate || row.candidates || null,
    job: row.job || row.jobs || null,
    sync_status: row.sync_status || (row.external_event_id ? 'synced' : 'not_connected'),
    interview_type: row.interview_type || 'custom',
    location: row.location || '',
    description: row.description || row.notes || '',
  };
}

async function loadCandidateForOwner(candidateId, ownerId) {
  if (!candidateId) return null;
  if (!supabaseConfigured) {
    return getDemoStore().candidates.find((candidate) => candidate.id === candidateId && candidate.owner_id === ownerId) || null;
  }

  const { data, error } = await supabaseAdmin
    .from('candidates')
    .select('id, owner_id, full_name, email, stage')
    .eq('id', candidateId)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (error) throw Object.assign(new Error(error.message), { status: 500 });
  return data || null;
}

async function loadJobForOwner(jobId, ownerId) {
  if (!jobId) return null;
  if (!supabaseConfigured) {
    return getDemoStore().jobs.find((job) => job.id === jobId && job.owner_id === ownerId) || null;
  }

  const { data, error } = await supabaseAdmin
    .from('jobs')
    .select('id, owner_id, title')
    .eq('id', jobId)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (error) throw Object.assign(new Error(error.message), { status: 500 });
  return data || null;
}

async function loadAvailabilityForOwner(availabilityId, ownerId) {
  if (!availabilityId) return null;
  if (!supabaseConfigured) {
    return getDemoStore().availability.find((slot) => slot.id === availabilityId && slot.owner_id === ownerId) || null;
  }

  const { data, error } = await supabaseAdmin
    .from('candidate_availability')
    .select('*')
    .eq('id', availabilityId)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (error) throw Object.assign(new Error(error.message), { status: 500 });
  return data || null;
}

async function loadInterviewForOwner(id, ownerId) {
  if (!supabaseConfigured) {
    const store = getDemoStore();
    const row = store.interviews.find((interview) => interview.id === id && interview.owner_id === ownerId);
    return row ? demoInterviewShape(row, store) : null;
  }

  const { data, error } = await supabaseAdmin
    .from('interviews')
    .select('*, candidate:candidates(id, full_name, email, owner_id), job:jobs(id, title, owner_id)')
    .eq('id', id)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (error) throw Object.assign(new Error(error.message), { status: 500 });
  return data ? normalizeInterview(data) : null;
}

export async function loadGoogleCalendarConnection(ownerId) {
  if (!supabaseConfigured) {
    return getDemoStore().googleCalendarConnections.find((connection) => connection.owner_id === ownerId && !connection.revoked_at) || null;
  }

  const { data, error } = await supabaseAdmin
    .from('google_calendar_connections')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('provider', 'google')
    .is('revoked_at', null)
    .maybeSingle();

  if (error) throw Object.assign(new Error(error.message), { status: 500 });
  return data || null;
}

async function markGoogleConnection(ownerId, updates) {
  if (!supabaseConfigured) {
    const connection = getDemoStore().googleCalendarConnections.find((item) => item.owner_id === ownerId && !item.revoked_at);
    if (connection) Object.assign(connection, updates, { updated_at: nowIso() });
    return;
  }

  await supabaseAdmin
    .from('google_calendar_connections')
    .update({ ...updates, updated_at: nowIso() })
    .eq('owner_id', ownerId)
    .eq('provider', 'google');
}

async function updateInterviewFields(id, ownerId, updates) {
  if (!supabaseConfigured) {
    const store = getDemoStore();
    const interview = store.interviews.find((item) => item.id === id && item.owner_id === ownerId);
    if (!interview) return null;
    Object.assign(interview, updates, { updated_at: nowIso() });
    return normalizeInterview(demoInterviewShape(interview, store));
  }

  const { data, error } = await supabaseAdmin
    .from('interviews')
    .update({ ...updates, updated_at: nowIso() })
    .eq('id', id)
    .eq('owner_id', ownerId)
    .select('*, candidate:candidates(id, full_name, email, owner_id), job:jobs(id, title, owner_id)')
    .single();

  if (error) throw Object.assign(new Error(error.message), { status: 500 });
  return normalizeInterview(data);
}

async function releaseAvailability(availabilityId, ownerId) {
  if (!availabilityId) return;
  if (!supabaseConfigured) {
    const slot = getDemoStore().availability.find((item) => item.id === availabilityId && item.owner_id === ownerId);
    if (slot && slot.status === 'booked') Object.assign(slot, { status: 'available', updated_at: nowIso() });
    return;
  }

  await supabaseAdmin
    .from('candidate_availability')
    .update({ status: 'available', updated_at: nowIso() })
    .eq('id', availabilityId)
    .eq('owner_id', ownerId)
    .eq('status', 'booked');
}

async function bookAvailability(availabilityId, ownerId) {
  if (!availabilityId) return;
  if (!supabaseConfigured) {
    const slot = getDemoStore().availability.find((item) => item.id === availabilityId && item.owner_id === ownerId);
    if (slot) Object.assign(slot, { status: 'booked', updated_at: nowIso() });
    return;
  }

  await supabaseAdmin
    .from('candidate_availability')
    .update({ status: 'booked', updated_at: nowIso() })
    .eq('id', availabilityId)
    .eq('owner_id', ownerId);
}

async function ensureNoInterviewOverlap({ ownerId, candidateId, interviewerEmail, startIso, endIso, excludeId = null }) {
  if (!supabaseConfigured) {
    const conflict = getDemoStore().interviews.find((interview) => (
      interview.owner_id === ownerId
      && interview.id !== excludeId
      && ACTIVE_INTERVIEW_STATUSES.includes(interview.status)
      && (interview.candidate_id === candidateId || (interviewerEmail && interview.interviewer_email === interviewerEmail))
      && overlaps(interview, startIso, endIso)
    ));
    if (conflict) throw Object.assign(new Error('This interview overlaps an existing scheduled interview.'), { status: 409 });
    return;
  }

  let query = supabaseAdmin
    .from('interviews')
    .select('id')
    .eq('owner_id', ownerId)
    .in('status', ACTIVE_INTERVIEW_STATUSES)
    .lt('start_at', endIso)
    .gt('end_at', startIso)
    .limit(1);

  const filters = [`candidate_id.eq.${candidateId}`];
  if (interviewerEmail) filters.push(`interviewer_email.eq.${interviewerEmail}`);
  query = query.or(filters.join(','));
  if (excludeId) query = query.neq('id', excludeId);

  const { data, error } = await query;
  if (error) throw Object.assign(new Error(error.message), { status: 500 });
  if (data?.length) throw Object.assign(new Error('This interview overlaps an existing scheduled interview.'), { status: 409 });
}

function applyListFilters(items, query) {
  const now = Date.now();
  const q = String(query.q || '').trim().toLowerCase();
  return items.filter((item) => {
    if (query.status && item.status !== query.status) return false;
    if (query.syncStatus && item.sync_status !== query.syncStatus) return false;
    if (query.candidateId && item.candidate_id !== query.candidateId) return false;
    if (query.jobId && item.job_id !== query.jobId) return false;
    if (query.from && new Date(item.start_at).getTime() < new Date(query.from).getTime()) return false;
    if (query.to && new Date(item.start_at).getTime() > new Date(query.to).getTime()) return false;
    if (query.view === 'upcoming' && (new Date(item.start_at).getTime() < now || ['cancelled', 'completed'].includes(item.status))) return false;
    if (query.view === 'history' && !(new Date(item.start_at).getTime() < now || ['cancelled', 'completed'].includes(item.status))) return false;
    if (!q) return true;
    const text = [
      item.title,
      item.description,
      item.location,
      item.attendee_email,
      item.interviewer_email,
      item.candidate?.full_name,
      item.candidate?.email,
      item.job?.title,
    ].join(' ').toLowerCase();
    return text.includes(q);
  });
}

async function updateCandidateStage(candidateId, ownerId) {
  if (!candidateId) return;
  if (!supabaseConfigured) {
    const candidate = getDemoStore().candidates.find((item) => item.id === candidateId && item.owner_id === ownerId);
    if (candidate) candidate.stage = 'interview_scheduled';
    return;
  }

  await supabaseAdmin
    .from('candidates')
    .update({ stage: 'interview_scheduled', updated_at: nowIso() })
    .eq('id', candidateId)
    .eq('owner_id', ownerId);
}

export async function syncInterviewRowWithGoogle(interview, ownerId, options = {}) {
  if (!supabaseConfigured) {
    return normalizeInterview({ ...interview, sync_status: 'demo', calendar_provider: 'demo' });
  }

  const connection = await loadGoogleCalendarConnection(ownerId);
  if (!connection) {
    return updateInterviewFields(interview.id, ownerId, {
      calendar_provider: 'none',
      sync_status: 'not_connected',
      sync_error: '',
    });
  }

  try {
    let event = null;
    if (interview.status === 'cancelled') {
      if (interview.external_event_id) {
        await deleteGoogleCalendarEvent(connection, interview.external_event_id, { sendUpdates: options.sendUpdates });
      }
      return updateInterviewFields(interview.id, ownerId, {
        calendar_provider: 'google',
        calendar_id: connection.calendar_id || 'primary',
        calendar_event_status: 'cancelled',
        sync_status: 'deleted',
        sync_error: '',
        last_synced_at: nowIso(),
      });
    }

    const googlePayload = {
      ...interview,
      owner_id: ownerId,
      candidate_name: interview.candidate?.full_name,
      candidate_email: interview.candidate?.email || interview.attendee_email,
      job_title: interview.job?.title,
    };

    if (interview.external_event_id) {
      try {
        event = await updateGoogleCalendarEvent(connection, interview.external_event_id, googlePayload, options);
      } catch (error) {
        const classified = classifyGoogleCalendarError(error);
        if (!classified.notFound) throw error;
        event = await createGoogleCalendarEvent(connection, googlePayload, options);
      }
    } else {
      event = await createGoogleCalendarEvent(connection, googlePayload, options);
    }

    await markGoogleConnection(ownerId, { last_sync_at: nowIso(), sync_status: 'connected', sync_error: '' });
    return updateInterviewFields(interview.id, ownerId, {
      external_event_id: event.id,
      external_event_link: event.htmlLink || '',
      meeting_url: event.meetingUrl || interview.meeting_url || '',
      calendar_provider: 'google',
      calendar_id: connection.calendar_id || 'primary',
      calendar_event_status: event.status || 'confirmed',
      sync_status: 'synced',
      sync_error: '',
      last_synced_at: nowIso(),
    });
  } catch (error) {
    const classified = classifyGoogleCalendarError(error);
    if (classified.requiresReconnect) {
      await markGoogleConnection(ownerId, { sync_status: 'requires_reconnect', sync_error: 'Google authorization expired. Please reconnect Google Calendar.' });
    }

    return updateInterviewFields(interview.id, ownerId, {
      sync_status: 'failed',
      sync_error: classified.requiresReconnect
        ? 'Google authorization expired. Please reconnect Google Calendar.'
        : classified.message || 'Google Calendar sync failed.',
      last_synced_at: nowIso(),
    });
  }
}

export async function syncOwnerInterviewsWithGoogle(ownerId, options = {}) {
  if (!supabaseConfigured) return { synced: 0, failed: 0, skipped: 0, interviews: [] };

  const connection = await loadGoogleCalendarConnection(ownerId);
  if (!connection) return { synced: 0, failed: 0, skipped: 0, interviews: [] };

  const from = options.from || new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const to = options.to || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('interviews')
    .select('*, candidate:candidates(id, full_name, email, owner_id), job:jobs(id, title, owner_id)')
    .eq('owner_id', ownerId)
    .gte('start_at', from)
    .lte('start_at', to)
    .order('start_at', { ascending: true })
    .limit(200);

  if (error) throw Object.assign(new Error(error.message), { status: 500 });

  const results = [];
  let synced = 0;
  let failed = 0;

  for (const row of data || []) {
    const updated = await syncInterviewRowWithGoogle(normalizeInterview(row), ownerId, options);
    results.push(updated);
    if (updated?.sync_status === 'failed') failed += 1;
    else synced += 1;
  }

  await markGoogleConnection(ownerId, {
    last_sync_at: nowIso(),
    sync_status: failed ? 'failed' : 'connected',
    sync_error: failed ? `${failed} interview(s) failed to sync.` : '',
  });

  return { synced, failed, skipped: 0, interviews: results };
}

async function buildCreatePayload(rawPayload, ownerId) {
  const candidateId = getCandidateId(rawPayload);
  const candidate = await loadCandidateForOwner(candidateId, ownerId);
  if (!candidate) throw Object.assign(new Error('Candidate not found.'), { status: 404 });

  const jobId = getJobId(rawPayload);
  const job = jobId ? await loadJobForOwner(jobId, ownerId) : null;
  if (jobId && !job) throw Object.assign(new Error('Selected job is no longer available.'), { status: 404 });

  const availabilityId = getAvailabilityId(rawPayload);
  const availability = availabilityId ? await loadAvailabilityForOwner(availabilityId, ownerId) : null;
  if (availabilityId && !availability) throw Object.assign(new Error('Candidate availability slot not found.'), { status: 404 });
  if (availability && availability.candidate_id !== candidateId) throw Object.assign(new Error('Availability slot belongs to a different candidate.'), { status: 400 });
  if (availability && availability.status !== 'available') throw Object.assign(new Error('Availability slot is no longer available.'), { status: 409 });

  const timezone = rawPayload.timezone || availability?.timezone || 'UTC';
  const startValue = getStart(rawPayload) || availability?.start_at;
  const endValue = getEnd(rawPayload) || availability?.end_at;
  const { startIso, endIso } = validateTimeRange({ startValue, endValue, timezone });
  const interviewerEmail = getInterviewerEmail(rawPayload);

  await ensureNoInterviewOverlap({
    ownerId,
    candidateId,
    interviewerEmail,
    startIso,
    endIso,
  });

  return {
    owner_id: ownerId,
    candidate_id: candidateId,
    job_id: jobId || null,
    availability_id: availabilityId || null,
    title: String(rawPayload.title || 'Interview').trim(),
    interview_type: getInterviewType(rawPayload),
    description: getNotes(rawPayload),
    attendee_email: getAttendeeEmail(rawPayload) || candidate.email || '',
    interviewer_email: interviewerEmail,
    start_at: startIso,
    end_at: endIso,
    timezone,
    location: String(rawPayload.location || '').trim(),
    status: 'scheduled',
    calendar_provider: 'none',
    sync_status: 'not_connected',
    sync_error: '',
    created_by: ownerId,
  };
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 10)));
    const sortBy = SORT_COLUMNS.has(String(req.query.sortBy || 'start_at')) ? String(req.query.sortBy || 'start_at') : 'start_at';
    const sortDir = String(req.query.sortDir || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
    const queryParams = {
      q: req.query.q,
      status: req.query.status && INTERVIEW_STATUSES.includes(String(req.query.status)) ? String(req.query.status) : '',
      syncStatus: req.query.syncStatus && SYNC_STATUSES.includes(String(req.query.syncStatus)) ? String(req.query.syncStatus) : '',
      candidateId: req.query.candidateId,
      jobId: req.query.jobId,
      from: req.query.from,
      to: req.query.to,
      view: ['upcoming', 'history', 'all'].includes(String(req.query.view)) ? String(req.query.view) : 'upcoming',
    };

    if (!supabaseConfigured) {
      const store = getDemoStore();
      let interviews = store.interviews
        .filter((interview) => interview.owner_id === req.user.id)
        .map((interview) => normalizeInterview(demoInterviewShape(interview, store)));
      interviews = applyListFilters(interviews, queryParams)
        .sort((a, b) => {
          const dir = sortDir === 'desc' ? -1 : 1;
          const av = sortBy.includes('_at') ? new Date(a[sortBy] || 0).getTime() : String(a[sortBy] || '');
          const bv = sortBy.includes('_at') ? new Date(b[sortBy] || 0).getTime() : String(b[sortBy] || '');
          return av > bv ? dir : av < bv ? -dir : 0;
        });
      const total = interviews.length;
      const paged = interviews.slice((page - 1) * pageSize, page * pageSize);
      return res.json({ interviews: paged, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
    }

    let query = supabaseAdmin
      .from('interviews')
      .select('*, candidate:candidates(id, full_name, email, owner_id), job:jobs(id, title, owner_id)', { count: 'exact' })
      .eq('owner_id', req.user.id);

    if (queryParams.status) query = query.eq('status', queryParams.status);
    if (queryParams.syncStatus) query = query.eq('sync_status', queryParams.syncStatus);
    if (queryParams.candidateId) query = query.eq('candidate_id', queryParams.candidateId);
    if (queryParams.jobId) query = query.eq('job_id', queryParams.jobId);
    if (queryParams.from) query = query.gte('start_at', new Date(queryParams.from).toISOString());
    if (queryParams.to) query = query.lte('start_at', new Date(queryParams.to).toISOString());
    if (queryParams.view === 'upcoming') query = query.gte('start_at', nowIso()).not('status', 'in', '(cancelled,completed)');
    if (queryParams.view === 'history') query = query.or(`start_at.lt.${nowIso()},status.in.(cancelled,completed)`);
    if (queryParams.q) {
      const q = String(queryParams.q).replace(/[,%]/g, '').trim();
      if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%,attendee_email.ilike.%${q}%,interviewer_email.ilike.%${q}%,location.ilike.%${q}%`);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count } = await query
      .order(sortBy, { ascending: sortDir !== 'desc' })
      .range(from, to);

    if (error) return res.status(500).json({ error: error.message });
    const total = count || 0;
    return res.json({
      interviews: (data || []).map(normalizeInterview),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Could not load interviews.' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const interview = await loadInterviewForOwner(req.params.id, req.user.id);
    if (!interview) return res.status(404).json({ error: 'Interview not found.' });
    return res.json({ interview });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Could not load interview.' });
  }
});

async function createInterview(req, res) {
  try {
    const parsed = baseInterviewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid interview payload.' });

    const insertPayload = await buildCreatePayload(parsed.data, req.user.id);
    const connection = supabaseConfigured ? await loadGoogleCalendarConnection(req.user.id) : null;
    insertPayload.sync_status = supabaseConfigured ? (connection ? 'pending' : 'not_connected') : 'demo';
    insertPayload.calendar_provider = supabaseConfigured ? (connection ? 'google' : 'none') : 'demo';

    let interview;
    if (!supabaseConfigured) {
      const store = getDemoStore();
      interview = {
        id: nextId('interview'),
        ...insertPayload,
        external_event_id: nextId('demo-event'),
        external_event_link: '',
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      store.interviews.unshift(interview);
    } else {
      const { data, error } = await supabaseAdmin
        .from('interviews')
        .insert(insertPayload)
        .select('*, candidate:candidates(id, full_name, email, owner_id), job:jobs(id, title, owner_id)')
        .single();
      if (error) return res.status(500).json({ error: error.message });
      interview = normalizeInterview(data);
    }

    await bookAvailability(insertPayload.availability_id, req.user.id);
    await updateCandidateStage(insertPayload.candidate_id, req.user.id);

    if (connection) {
      interview = await syncInterviewRowWithGoogle(interview, req.user.id, {
        createMeetLink: parsed.data.createMeetLink,
        sendUpdates: parsed.data.sendUpdates,
      });
    }

    return res.status(201).json({ interview: normalizeInterview(interview) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Could not schedule interview.' });
  }
}

router.post('/', requireAuth, createInterview);
router.post('/schedule', requireAuth, createInterview);

router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const parsed = patchInterviewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid interview update payload.' });

    const existing = await loadInterviewForOwner(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Interview not found.' });
    if (existing.status === 'cancelled') return res.status(409).json({ error: 'Cancelled interviews cannot be edited.' });

    const payload = parsed.data;
    const candidateId = getCandidateId(payload) || existing.candidate_id;
    const candidate = await loadCandidateForOwner(candidateId, req.user.id);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found.' });

    const jobId = getJobId(payload) !== null ? getJobId(payload) : existing.job_id;
    const job = jobId ? await loadJobForOwner(jobId, req.user.id) : null;
    if (jobId && !job) return res.status(404).json({ error: 'Selected job is no longer available.' });

    const availabilityId = getAvailabilityId(payload) !== null ? getAvailabilityId(payload) : existing.availability_id;
    const availability = availabilityId && availabilityId !== existing.availability_id
      ? await loadAvailabilityForOwner(availabilityId, req.user.id)
      : null;
    if (availability && availability.candidate_id !== candidateId) return res.status(400).json({ error: 'Availability slot belongs to a different candidate.' });
    if (availability && availability.status !== 'available') return res.status(409).json({ error: 'Availability slot is no longer available.' });

    const timezone = payload.timezone || availability?.timezone || existing.timezone || 'UTC';
    const startValue = getStart(payload) || availability?.start_at || existing.start_at;
    const endValue = getEnd(payload) || availability?.end_at || existing.end_at;
    const nextStatus = payload.status || existing.status;
    const { startIso, endIso } = validateTimeRange({
      startValue,
      endValue,
      timezone,
      allowPast: nextStatus === 'completed',
    });

    const interviewerEmail = getInterviewerEmail(payload) || existing.interviewer_email || '';
    if (ACTIVE_INTERVIEW_STATUSES.includes(nextStatus)) {
      await ensureNoInterviewOverlap({
        ownerId: req.user.id,
        candidateId,
        interviewerEmail,
        startIso,
        endIso,
        excludeId: existing.id,
      });
    }

    if (availabilityId !== existing.availability_id) {
      await releaseAvailability(existing.availability_id, req.user.id);
      await bookAvailability(availabilityId, req.user.id);
    }

    let interview = await updateInterviewFields(existing.id, req.user.id, {
      candidate_id: candidateId,
      job_id: jobId || null,
      availability_id: availabilityId || null,
      title: payload.title ?? existing.title,
      interview_type: payload.interviewType || payload.interview_type ? getInterviewType(payload) : existing.interview_type,
      description: payload.notes !== undefined || payload.description !== undefined ? getNotes(payload) : existing.description,
      attendee_email: getAttendeeEmail(payload) || existing.attendee_email || candidate.email || '',
      interviewer_email: interviewerEmail,
      start_at: startIso,
      end_at: endIso,
      timezone,
      location: payload.location !== undefined ? String(payload.location || '').trim() : existing.location,
      status: nextStatus === 'scheduled' && existing.status === 'scheduled' ? 'rescheduled' : nextStatus,
      sync_status: supabaseConfigured ? 'pending' : 'demo',
      sync_error: '',
    });

    if (supabaseConfigured) {
      interview = await syncInterviewRowWithGoogle(interview, req.user.id, {
        createMeetLink: payload.createMeetLink,
        sendUpdates: payload.sendUpdates,
      });
    }

    return res.json({ interview: normalizeInterview(interview) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Could not update interview.' });
  }
});

router.post('/:id/cancel', requireAuth, async (req, res) => {
  try {
    const parsed = cancelSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid cancellation payload.' });

    const existing = await loadInterviewForOwner(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Interview not found.' });
    if (existing.status === 'cancelled') return res.json({ interview: existing });

    let interview = await updateInterviewFields(existing.id, req.user.id, {
      status: 'cancelled',
      cancelled_at: nowIso(),
      cancel_reason: parsed.data.reason || '',
      sync_status: supabaseConfigured ? 'pending' : 'demo',
      sync_error: '',
    });

    await releaseAvailability(existing.availability_id, req.user.id);
    if (supabaseConfigured) {
      interview = await syncInterviewRowWithGoogle(interview, req.user.id, { sendUpdates: parsed.data.sendUpdates });
    }

    return res.json({ interview: normalizeInterview(interview) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Could not cancel interview.' });
  }
});

router.post('/:id/sync', requireAuth, async (req, res) => {
  try {
    const interview = await loadInterviewForOwner(req.params.id, req.user.id);
    if (!interview) return res.status(404).json({ error: 'Interview not found.' });
    const synced = await syncInterviewRowWithGoogle(interview, req.user.id, {
      createMeetLink: Boolean(req.body?.createMeetLink),
      sendUpdates: Boolean(req.body?.sendUpdates),
    });
    return res.json({ interview: normalizeInterview(synced) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Could not sync interview.' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const existing = await loadInterviewForOwner(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Interview not found.' });

    if (supabaseConfigured && existing.external_event_id) {
      const connection = await loadGoogleCalendarConnection(req.user.id);
      if (connection) {
        try {
          await deleteGoogleCalendarEvent(connection, existing.external_event_id, { sendUpdates: req.query.sendUpdates === 'true' });
        } catch (error) {
          if (req.query.forceLocal !== 'true') {
            const classified = classifyGoogleCalendarError(error);
            return res.status(502).json({ error: classified.message || 'Google Calendar event could not be deleted.' });
          }
        }
      }
    }

    await releaseAvailability(existing.availability_id, req.user.id);

    if (!supabaseConfigured) {
      const store = getDemoStore();
      store.interviews = store.interviews.filter((interview) => interview.id !== existing.id);
      return res.json({ success: true });
    }

    const { error } = await supabaseAdmin
      .from('interviews')
      .delete()
      .eq('id', existing.id)
      .eq('owner_id', req.user.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Could not delete interview.' });
  }
});

export default router;
