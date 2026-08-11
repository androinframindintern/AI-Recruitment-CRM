'use client';
import { createBrowserClient } from '@supabase/ssr';

let client = null;
const REFRESH_SKEW_SEC = 60;
const DEMO_AUTH_KEY = 'ai-recruitment-crm-demo-auth-v1';
const DEMO_SESSION_TTL_SEC = 60 * 60 * 24 * 7;

function authStorageKey(url) {
  try {
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  } catch {
    return null;
  }
}

function readStoredSession(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed[0] || null;
    if (parsed?.currentSession) return parsed.currentSession;
    return parsed;
  } catch {
    return null;
  }
}

function clearStaleStoredSession(url) {
  if (typeof window === 'undefined') return;
  const key = authStorageKey(url);
  if (!key) return;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return;
    const session = readStoredSession(raw);
    const expiresAt = session?.expires_at;
    const nowSec = Math.floor(Date.now() / 1000);
    if (!expiresAt || expiresAt <= nowSec + REFRESH_SKEW_SEC) {
      window.localStorage.removeItem(key);
    }
  } catch {}
}

function unavailableError(message) {
  return { message };
}

function normalizeDemoRole(role) {
  return ['recruiter', 'candidate'].includes(role) ? role : 'candidate';
}

function demoUserFromCredentials(email, metadata = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const role = metadata.role || (normalizedEmail === 'demo@recruitcrm.local' ? 'recruiter' : 'candidate');
  return {
    id: `demo-${normalizedEmail || 'user'}`,
    email: normalizedEmail,
    user_metadata: {
      full_name: metadata.full_name || normalizedEmail.split('@')[0] || 'Demo User',
      role: normalizeDemoRole(role),
    },
  };
}

function demoSessionFromUser(user) {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    access_token: `demo-token-${user.id}`,
    refresh_token: `demo-refresh-${user.id}`,
    expires_at: nowSec + DEMO_SESSION_TTL_SEC,
    expires_in: DEMO_SESSION_TTL_SEC,
    token_type: 'bearer',
    user,
  };
}

function readDemoSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DEMO_AUTH_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    const nowSec = Math.floor(Date.now() / 1000);
    if (!session?.user?.email || !session.expires_at || session.expires_at <= nowSec + REFRESH_SKEW_SEC) {
      window.localStorage.removeItem(DEMO_AUTH_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function saveDemoSession(session) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_AUTH_KEY, JSON.stringify(session));
}

function clearDemoSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(DEMO_AUTH_KEY);
}

function createStubClient() {
  const authUnavailable = unavailableError('Supabase auth is not configured');
  const storageUnavailable = unavailableError('Supabase storage is not configured');
  const subscribers = new Set();

  function notify(event, session) {
    for (const callback of subscribers) callback(event, session);
  }

  function authenticate(email, password, metadata = {}) {
    if (!String(email || '').trim()) return { data: { user: null, session: null }, error: unavailableError('Email is required') };
    if (!String(password || '').trim()) return { data: { user: null, session: null }, error: unavailableError('Password is required') };
    const user = demoUserFromCredentials(email, metadata);
    const session = demoSessionFromUser(user);
    saveDemoSession(session);
    notify('SIGNED_IN', session);
    return { data: { user, session }, error: null };
  }

  return {
    auth: {
      async getSession() {
        return { data: { session: readDemoSession() }, error: null };
      },
      async refreshSession() {
        const current = readDemoSession();
        if (!current?.user) return { data: { session: null }, error: authUnavailable };
        const session = demoSessionFromUser(current.user);
        saveDemoSession(session);
        return { data: { session }, error: null };
      },
      async signOut() {
        clearDemoSession();
        notify('SIGNED_OUT', null);
        return { error: null };
      },
      async signInWithPassword({ email, password } = {}) {
        return authenticate(email, password);
      },
      async signUp({ email, password, options } = {}) {
        return authenticate(email, password, options?.data || {});
      },
      async resetPasswordForEmail() {
        return { data: {}, error: null };
      },
      async updateUser({ data } = {}) {
        const current = readDemoSession();
        if (!current?.user) return { data: { user: null }, error: authUnavailable };
        const user = {
          ...current.user,
          user_metadata: {
            ...current.user.user_metadata,
            ...(data || {}),
            role: normalizeDemoRole(data?.role || current.user.user_metadata?.role),
          },
        };
        const session = demoSessionFromUser(user);
        saveDemoSession(session);
        notify('USER_UPDATED', session);
        return { data: { user }, error: null };
      },
      onAuthStateChange(callback) {
        subscribers.add(callback);
        return {
          data: {
            subscription: {
              unsubscribe() {
                subscribers.delete(callback);
              },
            },
          },
        };
      },
    },
    storage: {
      from() {
        return {
          async upload() {
            return { data: null, error: storageUnavailable };
          },
          getPublicUrl(path = '') {
            return { data: { publicUrl: path } };
          },
        };
      },
    },
  };
}

function getClient() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    if (typeof window !== 'undefined') {
      console.warn('Supabase env vars missing — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
    }
    client = createStubClient();
    return client;
  }
  clearStaleStoredSession(url);
  client = createBrowserClient(url, key);
  return client;
}

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function canUseSupabaseAuth() {
  const value = getClient();
  return typeof value.auth?.onAuthStateChange === 'function' && typeof value.auth?.getSession === 'function';
}

export async function safeGetSession() {
  if (!canUseSupabaseAuth()) return { data: { session: null }, error: null };
  try {
    return await supabase.auth.getSession();
  } catch {
    return { data: { session: null }, error: null };
  }
}

export async function safeSignOut() {
  if (!canUseSupabaseAuth()) return { error: null };
  try {
    return await supabase.auth.signOut();
  } catch {
    return { error: null };
  }
}

export const supabase = new Proxy({}, {
  get(_target, prop) {
    const value = getClient();
    const item = value[prop];
    return typeof item === 'function' ? item.bind(value) : item;
  },
});
