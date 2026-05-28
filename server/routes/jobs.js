import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { getDemoStore, nextId } from '../lib/demoStore.js';
import { supabaseAdmin, supabaseConfigured } from '../lib/supabase.js';

const router = Router();

const jobSchema = z.object({
  title: z.string().min(2).max(180),
  department: z.string().max(120).optional().default(''),
  location: z.string().max(120).optional().default(''),
  description: z.string().min(10),
  requirements: z.array(z.string()).max(30).optional().default([]),
});

router.get('/', requireAuth, async (_req, res) => {
  if (!supabaseConfigured) {
    const jobs = getDemoStore().jobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return res.json({ jobs });
  }

  const { data, error } = await supabaseAdmin.from('jobs').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ jobs: data || [] });
});

router.post('/', requireAuth, async (req, res) => {
  const parsed = jobSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid job payload' });

  const payload = {
    ...parsed.data,
    owner_id: req.user.id,
  };

  if (!supabaseConfigured) {
    const job = {
      id: nextId('job'),
      ...payload,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    getDemoStore().jobs.unshift(job);
    return res.status(201).json({ job });
  }

  const { data: job, error } = await supabaseAdmin.from('jobs').insert(payload).select('*').single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ job });
});

export default router;
