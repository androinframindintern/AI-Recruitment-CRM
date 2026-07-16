import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { createEmailService } from '../lib/email/emailService.js';

const router = Router();
const emailService = createEmailService();

const EMAIL_TYPES = ['shortlisted', 'interview_scheduled', 'rejected', 'custom'];

const variablesSchema = z.record(z.string(), z.string().max(500)).optional().default({});

const previewSchema = z.object({
  candidateId: z.string().min(1, 'Candidate is required'),
  type: z.enum(EMAIL_TYPES).default('custom'),
  templateId: z.string().optional().nullable(),
  jobId: z.string().optional().nullable(),
  subject: z.string().max(240).optional(),
  body: z.string().max(8000).optional(),
  to: z.string().email().optional().or(z.literal('')),
  variables: variablesSchema,
});

const templateUpdateSchema = z.object({
  type: z.enum(EMAIL_TYPES),
  subject: z.string().trim().min(1, 'Subject is required').max(240),
  body: z.string().trim().min(1, 'Body is required').max(8000),
});

function requestContext(req) {
  return {
    user: req.user,
    profile: req.profile,
  };
}

function sendError(res, error) {
  const status = Number(error?.status || 500);
  const response = {
    error: error?.message || 'Email request failed',
  };

  if (error?.details?.code) response.code = error.details.code;
  if (error?.details?.emailLog) response.emailLog = error.details.emailLog;

  return res.status(status).json(response);
}

router.get('/status', requireAuth, async (_req, res) => {
  res.json(emailService.getStatus());
});

router.get('/templates', requireAuth, async (req, res) => {
  try {
    const type = req.query.type ? String(req.query.type) : undefined;
    if (type && !EMAIL_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid email template type' });
    const result = await emailService.listTemplates(requestContext(req), { type });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

router.patch('/templates/:id', requireAuth, async (req, res) => {
  try {
    const payload = templateUpdateSchema.parse(req.body || {});
    const result = await emailService.updateTemplate(requestContext(req), req.params.id, payload);
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(422).json({ error: error.issues[0]?.message || 'Invalid template payload' });
    sendError(res, error);
  }
});

router.post('/preview', requireAuth, async (req, res) => {
  try {
    const payload = previewSchema.parse(req.body || {});
    const result = await emailService.previewCandidateEmail(requestContext(req), payload);
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(422).json({ error: error.issues[0]?.message || 'Invalid preview payload' });
    sendError(res, error);
  }
});

async function sendByType(req, res, type) {
  try {
    const payload = previewSchema.parse({ ...(req.body || {}), type });
    const result = await emailService.sendCandidateEmail(requestContext(req), payload);
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(422).json({ error: error.issues[0]?.message || 'Invalid email payload' });
    sendError(res, error);
  }
}

router.post('/shortlist', requireAuth, async (req, res) => sendByType(req, res, 'shortlisted'));
router.post('/rejection', requireAuth, async (req, res) => sendByType(req, res, 'rejected'));

router.post('/send', requireAuth, async (req, res) => {
  try {
    const payload = previewSchema.parse(req.body || {});
    const result = await emailService.sendCandidateEmail(requestContext(req), payload);
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(422).json({ error: error.issues[0]?.message || 'Invalid email payload' });
    sendError(res, error);
  }
});

router.get('/logs', requireAuth, async (req, res) => {
  try {
    const candidateId = String(req.query.candidateId || '').trim();
    if (!candidateId) return res.status(400).json({ error: 'candidateId is required' });
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
    const result = await emailService.listLogs(requestContext(req), { candidateId, limit });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
