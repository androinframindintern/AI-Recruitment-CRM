import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { supabaseAdmin } from '../../lib/supabase.js';

const router = Router();

router.post('/check-email', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.json({ exists: false });

    const { data, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) return res.json({ exists: false });

    const users = data?.users || [];
    const exists = users.some((user) => user.email?.toLowerCase() === email);
    res.json({ exists });
  } catch {
    res.json({ exists: false });
  }
});

router.get('/', requireAuth, async (req, res) => {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', req.user.id)
    .maybeSingle();

  res.json({
    profile: profile || {
      id: req.user.id,
      email: req.user.email,
      full_name: req.user.user_metadata?.full_name || '',
      role: req.user.user_metadata?.role || 'recruiter',
    },
  });
});

export default router;
