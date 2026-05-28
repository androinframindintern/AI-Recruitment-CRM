'use client';
import { safeGetSession, supabase } from './supabaseClient';

const configuredApiBase = process.env.NEXT_PUBLIC_API_URL?.trim();
export const API_BASE = configuredApiBase || '';
const REFRESH_SKEW_SEC = 60;

async function currentToken({ forceRefresh = false } = {}) {
  try {
    const { data } = await safeGetSession();
    const session = data.session;
    if (!session) return null;
    const expiresAt = session.expires_at || 0;
    const nowSec = Math.floor(Date.now() / 1000);
    const stale = expiresAt && expiresAt - nowSec < REFRESH_SKEW_SEC;
    if (forceRefresh || stale) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      return refreshed?.session?.access_token || session.access_token;
    }
    return session.access_token;
  } catch {
    return null;
  }
}

async function authHeader({ forceRefresh = false } = {}) {
  const token = await currentToken({ forceRefresh });
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function sendRequest({ method, path, data, auth = false, rawBody = false }) {
  async function send(headers) {
    const init = { method, headers };
    if (data !== undefined) {
      init.body = rawBody ? data : JSON.stringify(data);
    }
    const response = await fetch(`${API_BASE}${path}`, init);
    const body = rawBody ? null : await response.json().catch(() => ({}));
    return { response, body };
  }

  const baseHeaders = rawBody ? {} : data !== undefined ? { 'Content-Type': 'application/json' } : {};
  const headers = { ...baseHeaders, ...(auth ? await authHeader() : {}) };
  let result = await send(headers);

  if (result.response.status === 401 && auth) {
    const retryAuth = await authHeader({ forceRefresh: true });
    if (retryAuth.Authorization) {
      result = await send({ ...baseHeaders, ...retryAuth });
    }
  }

  if (!result.response.ok) {
    throw Object.assign(new Error(result.body?.error || result.response.statusText), {
      status: result.response.status,
      body: result.body,
    });
  }

  if (rawBody) return result.response;
  return result.body;
}

export function apiGet(path, options = {}) {
  return sendRequest({ method: 'GET', path, auth: options.auth });
}

export function apiPost(path, data, options = {}) {
  return sendRequest({ method: 'POST', path, data, auth: options.auth ?? true, rawBody: options.rawBody });
}

export async function apiPostForm(path, formData, options = {}) {
  const headers = options.auth === false ? {} : await authHeader();
  let response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (response.status === 401 && options.auth !== false) {
    const retryAuth = await authHeader({ forceRefresh: true });
    if (retryAuth.Authorization) {
      response = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: retryAuth,
        body: formData,
      });
    }
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(body?.error || response.statusText), {
      status: response.status,
      body,
    });
  }

  return body;
}

export function apiPatch(path, data, options = {}) {
  return sendRequest({ method: 'PATCH', path, data, auth: options.auth ?? true });
}

export function apiDelete(path, options = {}) {
  return sendRequest({ method: 'DELETE', path, auth: options.auth ?? true });
}
