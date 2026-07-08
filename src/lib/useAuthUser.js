'use client';
import { useEffect, useState } from 'react';
import { getCurrentProfile } from './recruitmentData';
import { canUseSupabaseAuth, safeGetSession, supabase } from './supabaseClient';

const authState = {
  user: null,
  profile: null,
  loading: true,
  initialized: false,
  initPromise: null,
  refreshPromise: null,
  subscription: null,
};

const listeners = new Set();

function snapshot() {
  return {
    user: authState.user,
    profile: authState.profile,
    role: authState.profile?.role ?? null,
    loading: authState.loading,
  };
}

function emit() {
  const next = snapshot();
  for (const listener of listeners) listener(next);
}

async function loadProfile(user) {
  if (!user) return null;
  try {
    return await getCurrentProfile(user);
  } catch {
    return {
      id: user.id,
      email: user.email || '',
      full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Recruiter',
      role: user.user_metadata?.role || 'recruiter',
    };
  }
}

async function syncSession(session, { loading = false } = {}) {
  authState.loading = loading;
  authState.user = session?.user ?? null;
  emit();
  authState.profile = await loadProfile(authState.user);
  authState.loading = false;
  authState.initialized = true;
  emit();
}

async function refreshAuthState({ loading = false } = {}) {
  if (authState.refreshPromise) return authState.refreshPromise;
  authState.refreshPromise = (async () => {
    try {
      if (!canUseSupabaseAuth()) {
        authState.user = {
          id: 'demo-user',
          email: 'demo@recruitcrm.local',
        };
        authState.profile = {
          id: 'demo-user',
          email: 'demo@recruitcrm.local',
          full_name: 'Demo Recruiter',
          role: 'recruiter',
        };
        authState.loading = false;
        authState.initialized = true;
        emit();
        return;
      }
      const { data } = await safeGetSession();
      await syncSession(data.session ?? null, { loading });
    } catch {
      authState.user = null;
      authState.profile = null;
      authState.loading = false;
      authState.initialized = true;
      emit();
    }
  })().finally(() => {
    authState.refreshPromise = null;
  });
  return authState.refreshPromise;
}

function ensureInitialized() {
  if (authState.initialized) return Promise.resolve();
  if (authState.initPromise) return authState.initPromise;
  authState.initPromise = refreshAuthState({ loading: true }).finally(() => {
    authState.initPromise = null;
    if (!authState.subscription) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        void syncSession(session ?? null);
      });
      authState.subscription = data.subscription;
    }
  });
  return authState.initPromise;
}

export function useAuthUser() {
  const [state, setState] = useState(snapshot);

  useEffect(() => {
    listeners.add(setState);
    void ensureInitialized();
    return () => {
      listeners.delete(setState);
    };
  }, []);

  return {
    ...state,
    refresh: () => refreshAuthState({ loading: true }),
  };
}
