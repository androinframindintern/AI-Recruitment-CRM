import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { getDemoStore, nextId } from '../lib/demoStore.js';
import { supabaseAdmin, supabaseConfigured } from '../lib/supabase.js';

const router = Router();

const ACTIVE_STATUSES = ['available', 'held', 'booked'];
const AVAILABILITY_STATUSES = ['available', 'held', 'booked', 'cancelled', 'expired'];

const availabilitySchema = z.object({
  candidateId: z.string().min(1),
  startAt: z.string().min(1).optional(),
  start_at: z.string().min(1).optional(),
  endAt: z.string().min(1).optional(),
  end_at: z.string().min(1).optional(),
  timezone: z.string().min(1).max(80).default('UTC'),
  notes: z.string().max(1000).optional().default(''),
  status: z.enum(AVAILABILITY_STATUSES).optional().default('available'),
});

const availabilityPatchSchema = z.object({
  startAt: z.string().min(1).optional(),
  start_at: z.string().min(1).optional(),
  endAt: z.string().min(1).optional(),
  end_at: z.string().min(1).optional(),
  timezone: z.string().min(1).max(80).optional(),
  notes: z.string().max(1000).optional(),
  status: z.enum(AVAILABILITY_STATUSES).optional(),
});

function nowIso() {
  return new Date().toISOString();
}

function parseDateInput(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date;
}

function isValidTimezone(timezone) {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function getStart(payload = {}) {
  return payload.start_at || payload.startAt;
}

function getEnd(payload = {}) {
  return payload.end_at || payload.endAt;
}

function overlap(slot, startIso, endIso) {
  return new Date(slot.start_at).getTime() < new Date(endIso).getTime()
    && new Date(slot.end_at).getTime() > new Date(startIso).getTime();
}

async function loadCandidateForOwner(candidateId, ownerId) {
  if (!supabaseConfigured) {
    return getDemoStore().candidates.find((candidate) => candidate.id === candidateId && candidate.owner_id === ownerId) || null;
  }

  const { data, error } = await supabaseAdmin
    .from('candidates')
    .select('id, owner_id, full_name, email')
    .eq('id', candidateId)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (error) throw Object.assign(new Error(error.message), { status: 500 });
  return data || null;
}

async function loadAvailabilityForOwner(id, ownerId) {
  if (!supabaseConfigured) {
    return getDemoStore().availability.find((slot) => slot.id === id && slot.owner_id === ownerId) || null;
  }

  const { data, error } = await supabaseAdmin
    .from('candidate_availability')
    .select('*')
    .eq('id', id)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (error) throw Object.assign(new Error(error.message), { status: 500 });
  return data || null;
}

async function ensureNoAvailabilityOverlap({ ownerId, candidateId, startIso, endIso, excludeId = null }) {
  if (!supabaseConfigured) {
    const conflict = getDemoStore().availability.find((slot) => (
      slot.owner_id === ownerId
      && slot.candidate_id === candidateId
      && slot.id !== excludeId
      && ACTIVE_STATUSES.includes(slot.status)
      && overlap(slot, startIso, endIso)
    ));
    if (conflict) throw Object.assign(new Error('This availability overlaps an existing active availability slot.'), { status: 409 });
    return;
  }

  let query = supabaseAdmin
    .from('candidate_availability')
    .select('id')
    .eq('owner_id', ownerId)
    .eq('candidate_id', candidateId)
    .in('status', ACTIVE_STATUSES)
    .lt('start_at', endIso)
    .gt('end_at', startIso)
    .limit(1);

  if (excludeId) query = query.neq('id', excludeId);

  const { data, error } = await query;
  if (error) throw Object.assign(new Error(error.message), { status: 500 });
  if (data?.length) throw Object.assign(new Error('This availability overlaps an existing active availability slot.'), { status: 409 });
}

function validateAvailabilityTimes({ startValue, endValue, timezone, allowPast = false }) {
  const start = parseDateInput(startValue);
  const end = parseDateInput(endValue);

  if (!start || !end) throw Object.assign(new Error('Valid availability start and end times are required.'), { status: 400 });
  if (end <= start) throw Object.assign(new Error('Availability end time must be greater than start time.'), { status: 400 });
  if (!allowPast && end < new Date()) throw Object.assign(new Error('Availability cannot be entirely in the past.'), { status: 400 });
  if (!isValidTimezone(timezone)) throw Object.assign(new Error('Timezone is invalid.'), { status: 400 });

  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const candidateId = String(req.query.candidateId || '');
    if (!candidateId) return res.status(400).json({ error: 'candidateId is required.' });

    const candidate = await loadCandidateForOwner(candidateId, req.user.id);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found.' });

    if (!supabaseConfigured) {
      const availability = getDemoStore().availability
        .filter((slot) => slot.owner_id === req.user.id && slot.candidate_id === candidateId)
        .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
      return res.json({ availability });
    }

    const { data, error } = await supabaseAdmin
      .from('candidate_availability')
      .select('*')
      .eq('owner_id', req.user.id)
      .eq('candidate_id', candidateId)
      .order('start_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ availability: data || [] });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Could not load candidate availability.' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const parsed = availabilitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid availability payload.' });

    const payload = parsed.data;
    const candidate = await loadCandidateForOwner(payload.candidateId, req.user.id);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found.' });

    const { startIso, endIso } = validateAvailabilityTimes({
      startValue: getStart(payload),
      endValue: getEnd(payload),
      timezone: payload.timezone,
      allowPast: payload.status !== 'available',
    });

    await ensureNoAvailabilityOverlap({
      ownerId: req.user.id,
      candidateId: payload.candidateId,
      startIso,
      endIso,
    });

    const insertPayload = {
      owner_id: req.user.id,
      candidate_id: payload.candidateId,
      start_at: startIso,
      end_at: endIso,
      timezone: payload.timezone,
      status: payload.status,
      source: 'manual',
      notes: String(payload.notes || '').trim(),
      created_by: req.user.id,
    };

    if (!supabaseConfigured) {
      const slot = {
        id: nextId('availability'),
        ...insertPayload,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      getDemoStore().availability.unshift(slot);
      return res.status(201).json({ availability: slot });
    }

    const { data, error } = await supabaseAdmin
      .from('candidate_availability')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ availability: data });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Could not create candidate availability.' });
  }
});

router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const parsed = availabilityPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid availability update payload.' });

    const existing = await loadAvailabilityForOwner(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Availability slot not found.' });
    if (existing.status === 'booked' && parsed.data.status !== 'cancelled') {
      return res.status(409).json({ error: 'Booked availability can only be changed by updating or cancelling the linked interview.' });
    }

    const startValue = getStart(parsed.data) || existing.start_at;
    const endValue = getEnd(parsed.data) || existing.end_at;
    const timezone = parsed.data.timezone || existing.timezone;
    const nextStatus = parsed.data.status || existing.status;
    const { startIso, endIso } = validateAvailabilityTimes({
      startValue,
      endValue,
      timezone,
      allowPast: nextStatus !== 'available',
    });

    if (ACTIVE_STATUSES.includes(nextStatus)) {
      await ensureNoAvailabilityOverlap({
        ownerId: req.user.id,
        candidateId: existing.candidate_id,
        startIso,
        endIso,
        excludeId: existing.id,
      });
    }

    const updates = {
      start_at: startIso,
      end_at: endIso,
      timezone,
      status: nextStatus,
      notes: parsed.data.notes !== undefined ? String(parsed.data.notes || '').trim() : existing.notes,
      updated_at: nowIso(),
    };

    if (!supabaseConfigured) {
      Object.assign(existing, updates);
      return res.json({ availability: existing });
    }

    const { data, error } = await supabaseAdmin
      .from('candidate_availability')
      .update(updates)
      .eq('id', existing.id)
      .eq('owner_id', req.user.id)
      .select('*')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ availability: data });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Could not update candidate availability.' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const existing = await loadAvailabilityForOwner(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Availability slot not found.' });
    if (existing.status === 'booked') {
      return res.status(409).json({ error: 'Booked availability cannot be deleted until the linked interview is cancelled or deleted.' });
    }

    if (!supabaseConfigured) {
      const store = getDemoStore();
      store.availability = store.availability.filter((slot) => slot.id !== existing.id);
      return res.json({ success: true });
    }

    const { error } = await supabaseAdmin
      .from('candidate_availability')
      .delete()
      .eq('id', existing.id)
      .eq('owner_id', req.user.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Could not delete candidate availability.' });
  }
});

export default router;
