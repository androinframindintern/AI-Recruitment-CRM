import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { sendRecruitmentEmail } from '../lib/resend.js';
import { getDemoStore, nextId } from '../lib/demoStore.js';
import { supabaseAdmin, supabaseConfigured } from '../lib/supabase.js';

const router = Router();

const emailSchema = z.object({
  candidateId: z.string().min(1),
  type: z.enum(['shortlisted', 'interview_scheduled', 'rejected']),
  to: z.string().email(),
  candidateName: z.string().optional(),
  jobTitle: z.string().optional(),
  when: z.string().optional(),
  meetingLink: z.string().optional(),
});

router.post('/send', requireAuth, async (req, res) => {
  const parsed = emailSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid email payload' });

  const payload = parsed.data;
  const result = await sendRecruitmentEmail(payload);

  if (!supabaseConfigured) {
    const emailLog = {
      id: nextId('email'),
      candidate_id: payload.candidateId,
      type: payload.type,
      recipient_email: payload.to,
      external_message_id: result.id,
      status: result.status,
      subject: result.subject,
      created_at: new Date().toISOString(),
    };
    getDemoStore().emails.unshift(emailLog);
    return res.status(201).json({ email: emailLog, delivery: result });
  }

  const { data: emailLog, error } = await supabaseAdmin
    .from('email_logs')
    .insert({
      candidate_id: payload.candidateId,
      type: payload.type,
      recipient_email: payload.to,
      external_message_id: result.id,
      status: result.status,
      subject: result.subject,
      created_by: req.user.id,
    })
    .select('*')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ email: emailLog, delivery: result });
});

export default router;
