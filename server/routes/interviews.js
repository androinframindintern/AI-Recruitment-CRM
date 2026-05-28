import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { createInterviewEvent } from '../lib/googleCalendar.js';
import { getDemoStore, nextId } from '../lib/demoStore.js';
import { supabaseAdmin, supabaseConfigured } from '../lib/supabase.js';

const router = Router();

const interviewSchema = z.object({
  candidateId: z.string().min(1),
  title: z.string().min(2).max(180),
  description: z.string().max(2000).optional().default(''),
  start: z.string().min(1),
  end: z.string().min(1),
  attendeeEmail: z.string().email().optional().or(z.literal('')),
});

router.post('/schedule', requireAuth, async (req, res) => {
  const parsed = interviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid interview payload' });

  const payload = parsed.data;
  const event = await createInterviewEvent({
    title: payload.title,
    description: payload.description,
    start: payload.start,
    end: payload.end,
    attendees: payload.attendeeEmail ? [payload.attendeeEmail] : [],
  });

  if (!supabaseConfigured) {
    const store = getDemoStore();
    const interview = {
      id: nextId('interview'),
      candidate_id: payload.candidateId,
      title: payload.title,
      description: payload.description,
      start_at: payload.start,
      end_at: payload.end,
      attendee_email: payload.attendeeEmail || '',
      external_event_id: event.id,
      external_event_link: event.htmlLink,
      status: event.status,
      created_at: new Date().toISOString(),
    };
    store.interviews.unshift(interview);

    const candidate = store.candidates.find((item) => item.id === payload.candidateId);
    if (candidate) candidate.stage = 'interview_scheduled';

    return res.status(201).json({ interview, event });
  }

  const { data: interview, error } = await supabaseAdmin
    .from('interviews')
    .insert({
      candidate_id: payload.candidateId,
      title: payload.title,
      description: payload.description,
      start_at: payload.start,
      end_at: payload.end,
      attendee_email: payload.attendeeEmail || '',
      external_event_id: event.id,
      external_event_link: event.htmlLink,
      status: event.status,
      created_by: req.user.id,
    })
    .select('*')
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabaseAdmin.from('candidates').update({ stage: 'interview_scheduled', updated_at: new Date().toISOString() }).eq('id', payload.candidateId);

  res.status(201).json({ interview, event });
});

export default router;
