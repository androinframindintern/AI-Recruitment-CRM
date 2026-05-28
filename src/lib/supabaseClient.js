'use client';
import { createBrowserClient } from '@supabase/ssr';

let client = null;
const REFRESH_SKEW_SEC = 60;

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

function createStubClient() {
  const authUnavailable = unavailableError('Supabase auth is not configured');
  const storageUnavailable = unavailableError('Supabase storage is not configured');
  return {
    auth: {
      async getSession() {
        return { data: { session: null }, error: null };
      },
      async refreshSession() {
        return { data: { session: null }, error: authUnavailable };
      },
      async signOut() {
        return { error: null };
      },
      async signInWithPassword() {
        return { data: { user: null, session: null }, error: authUnavailable };
      },
      async signUp() {
        return { data: { user: null, session: null }, error: authUnavailable };
      },
      onAuthStateChange() {
        return {
          data: {
            subscription: {
              unsubscribe() {},
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
