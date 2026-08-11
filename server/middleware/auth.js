import { supabaseAdmin, supabaseAsUser, supabaseConfigured } from '../lib/supabase.js';

export const ACCOUNT_ROLES = ['admin', 'recruiter', 'candidate'];
export const COMPANY_ROLES = ['admin', 'recruiter'];

export function normalizeRole(role, fallback = 'candidate') {
  return ACCOUNT_ROLES.includes(role) ? role : fallback;
}

export function profileRole(req, fallback = 'candidate') {
  return normalizeRole(req.profile?.role || req.user?.user_metadata?.role, fallback);
}

/**
 * requireAuth — verifies the Bearer JWT from Supabase Auth.
 * In demo mode (no Supabase configured) it injects a fake demo user.
 */
export async function requireAuth(req, res, next) {
  try {
    if (!supabaseConfigured) {
      req.user = {
        id: 'demo-user',
        email: 'demo@recruitcrm.local',
        user_metadata: { full_name: 'Demo Recruiter', role: 'recruiter' },
      };
      req.profile = {
        id: 'demo-user',
        email: 'demo@recruitcrm.local',
        full_name: 'Demo Recruiter',
        role: 'recruiter',
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

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();

    req.profile = profile ? {
      ...profile,
      role: normalizeRole(profile.role),
    } : {
      id: data.user.id,
      email: data.user.email,
      full_name: data.user.user_metadata?.full_name || '',
      role: normalizeRole(data.user.user_metadata?.role),
    };

    next();
  } catch {
    res.status(401).json({ error: 'Auth failed' });
  }
}

/**
 * requireRole — factory that creates middleware to restrict access by role.
 * Usage: router.delete('/...', requireAuth, requireRole('admin'), handler)
 */
export function requireRole(role) {
  return function roleGuard(req, res, next) {
    const userRole = profileRole(req);
    if (userRole !== role) {
      return res.status(403).json({ error: `Requires ${role} role` });
    }
    next();
  };
}

export function requireAnyRole(...roles) {
  return function anyRoleGuard(req, res, next) {
    const allowedRoles = roles.flat();
    const userRole = profileRole(req);
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: 'Not authorized for this account type' });
    }
    next();
  };
}

export const requireCompanyAccount = requireAnyRole(COMPANY_ROLES);
