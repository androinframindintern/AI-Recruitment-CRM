import { Router } from 'express';
import { supabaseAdmin, supabaseConfigured } from '../../lib/supabase.js';

const router = Router();

// POST /api/auth/reset — trigger a password reset email
router.post('/', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Email is required' });

  // Always return success to avoid email enumeration
  if (!supabaseConfigured) {
    return res.json({ message: 'If that email exists, a reset link has been sent.' });
  }

  try {
    await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.FRONTEND_ORIGIN || 'http://localhost:3000'}/reset-password/confirm`,
    });
  } catch {
    // Silently ignore errors to prevent enumeration
  }

  res.json({ message: 'If that email exists, a reset link has been sent.' });
});

export default router;
