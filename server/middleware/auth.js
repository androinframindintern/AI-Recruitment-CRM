import { supabaseAdmin, supabaseAsUser, supabaseConfigured } from '../lib/supabase.js';

export async function requireAuth(req, res, next) {
  try {
    if (!supabaseConfigured) {
      req.user = {
        id: 'demo-user',
        email: 'demo@recruitcrm.local',
        user_metadata: { full_name: 'Demo Recruiter', role: 'recruiter' },
      };
      req.sb = null;
      return next();
    }

    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing token' });

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Invalid token' });

    req.user = data.user;
    req.sb = supabaseAsUser(token);
    next();
  } catch {
    res.status(401).json({ error: 'Auth failed' });
  }
}
