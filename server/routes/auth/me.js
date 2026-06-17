import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { supabaseAdmin, supabaseConfigured } from '../../lib/supabase.js';

const router = Router();

const updateProfileSchema = z.object({
  full_name: z.string().min(1).max(120).optional(),
  avatar_url: z.string().url().optional().or(z.literal('')),
});

// POST /api/me/check-email — check if an email is already registered
router.post('/check-email', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.json({ exists: false });

    if (!supabaseConfigured) return res.json({ exists: false });

    const { data, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) return res.json({ exists: false });

    const users = data?.users || [];
    const exists = users.some((user) => user.email?.toLowerCase() === email);
    res.json({ exists });
  } catch {
    res.json({ exists: false });
  }
});

// GET /api/me — return the authenticated user's profile (upsert on first visit)
router.get('/', requireAuth, async (req, res) => {
  if (!supabaseConfigured) {
    return res.json({ profile: req.profile });
  }

  // Try to get existing profile
  let { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', req.user.id)
    .maybeSingle();

  // Upsert if not found (first login after trigger might race)
  if (!profile) {
    const { data: upserted } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: req.user.id,
        email: req.user.email,
        full_name: req.user.user_metadata?.full_name || '',
        role: req.user.user_metadata?.role || 'recruiter',
      }, { onConflict: 'id' })
      .select('*')
      .single();
    profile = upserted;
  }

  res.json({
    profile: profile || {
      id: req.user.id,
      email: req.user.email,
      full_name: req.user.user_metadata?.full_name || '',
      role: req.user.user_metadata?.role || 'recruiter',
    },
  });
});

// PATCH /api/me — update current user's profile
router.patch('/', requireAuth, async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid profile data' });

  if (!supabaseConfigured) {
    return res.json({ profile: { ...req.profile, ...parsed.data } });
  }

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', req.user.id)
    .select('*')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ profile });
});

// GET /api/me/users — admin only: list all users
router.get('/users', requireAuth, async (req, res) => {
  const role = req.profile?.role || 'recruiter';
  if (role !== 'admin') return res.status(403).json({ error: 'Requires admin role' });

  if (!supabaseConfigured) {
    return res.json({ users: [req.profile] });
  }

  const { data: users, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ users: users || [] });
});

// PATCH /api/me/users/:id/role — admin only: change a user's role
router.patch('/users/:id/role', requireAuth, async (req, res) => {
  const role = req.profile?.role || 'recruiter';
  if (role !== 'admin') return res.status(403).json({ error: 'Requires admin role' });

  const newRole = req.body?.role;
  if (!['admin', 'recruiter'].includes(newRole)) {
    return res.status(400).json({ error: 'Invalid role. Must be admin or recruiter' });
  }

  if (!supabaseConfigured) {
    return res.json({ success: true });
  }

  const { data: updated, error } = await supabaseAdmin
    .from('profiles')
    .update({ role: newRole })
    .eq('id', req.params.id)
    .select('*')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ profile: updated });
});

export default router;
