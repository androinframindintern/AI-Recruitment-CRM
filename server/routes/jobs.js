import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { getDemoStore, nextId } from '../lib/demoStore.js';
import { ensureJobEmbedding } from '../lib/embeddings.js';
import { supabaseAdmin, supabaseConfigured } from '../lib/supabase.js';

const router = Router();

const jobSchema = z.object({
  title: z.string().min(2).max(180),
  department: z.string().max(120).optional().default(''),
  location: z.string().max(120).optional().default(''),
  description: z.string().min(10),
  requirements: z.array(z.string()).max(30).optional().default([]),
});

async function tryEnsureJobEmbedding(job) {
  try {
    await ensureJobEmbedding(job);
    return { status: 'ready' };
  } catch (error) {
    console.warn('Job embedding generation failed:', error?.message || error);
    return { status: 'failed', error: error?.message || 'Job embedding generation failed' };
  }
}

router.get('/', requireAuth, async (req, res) => {
  if (!supabaseConfigured) {
    const jobs = getDemoStore().jobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return res.json({ jobs });
  }

  const { data, error } = await supabaseAdmin
    .from('jobs')
    .select('*')
    .eq('owner_id', req.user.id)
    .order('created_at', { ascending: false });
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
    const embedding = await tryEnsureJobEmbedding(job);
    return res.status(201).json({ job, embedding });
  }

  const { data: job, error } = await supabaseAdmin.from('jobs').insert(payload).select('*').single();
  if (error) return res.status(500).json({ error: error.message });
  const embedding = await tryEnsureJobEmbedding(job);
  res.status(201).json({ job, embedding });
});

router.patch('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  
  // Create a schema that allows partial updates and handles is_active
  const patchSchema = jobSchema.extend({
    is_active: z.boolean().optional(),
  }).partial();

  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid update payload' });

  const updates = parsed.data;

  if (!supabaseConfigured) {
    const store = getDemoStore();
    const job = store.jobs.find((item) => item.id === id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    Object.assign(job, updates, { updated_at: new Date().toISOString() });
    const embedding = await tryEnsureJobEmbedding(job);
    return res.json({ job, embedding });
  }

  const { data: job, error } = await supabaseAdmin
    .from('jobs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('owner_id', req.user.id)
    .select('*')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  const embedding = await tryEnsureJobEmbedding(job);
  res.json({ job, embedding });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  if (!supabaseConfigured) {
    const store = getDemoStore();
    const index = store.jobs.findIndex((item) => item.id === id);
    if (index === -1) return res.status(404).json({ error: 'Job not found' });

    store.jobs.splice(index, 1);
    store.scores = store.scores.filter((s) => s.job_id !== id);
    return res.json({ success: true });
  }

  const { error } = await supabaseAdmin
    .from('jobs')
    .delete()
    .eq('id', id)
    .eq('owner_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

export default router;

