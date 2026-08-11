import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireCompanyAccount } from '../middleware/auth.js';
import {
  buildGoogleCalendarAuthUrl,
  classifyGoogleCalendarError,
  createOAuthClientFromConnection,
  encryptRefreshToken,
  exchangeGoogleCalendarCode,
  getCalendarSummary,
  getGoogleAccountEmail,
  getGoogleCalendarConfigStatus,
  listGoogleCalendars,
  verifyOAuthState,
} from '../lib/googleCalendar.js';
import { getDemoStore, nextId } from '../lib/demoStore.js';
import { supabaseAdmin, supabaseConfigured } from '../lib/supabase.js';
import { loadGoogleCalendarConnection, syncOwnerInterviewsWithGoogle } from './interviews.js';

const router = Router();

const settingsSchema = z.object({
  calendarId: z.string().min(1).max(300),
});

function nowIso() {
  return new Date().toISOString();
}

function sanitizedConnection(connection) {
  if (!connection) return null;
  return {
    connected: !connection.revoked_at,
    accountEmail: connection.google_account_email || '',
    calendarId: connection.calendar_id || 'primary',
    calendarSummary: connection.calendar_summary || connection.calendar_id || 'Primary calendar',
    scopes: connection.scopes || [],
    connectedAt: connection.connected_at || connection.created_at || null,
    lastSyncAt: connection.last_sync_at || connection.last_sync_at || null,
    syncStatus: connection.sync_status || 'connected',
    syncError: connection.sync_error || '',
  };
}

function redirectWithStatus(res, returnTo, status, message = '') {
  const safeReturnTo = String(returnTo || '/settings').startsWith('/') ? returnTo : '/settings';
  const url = new URL(safeReturnTo, 'http://local.invalid');
  url.searchParams.set('googleCalendar', status);
  if (message) url.searchParams.set('message', message);
  return res.redirect(`${url.pathname}${url.search}`);
}

async function upsertConnection(ownerId, values) {
  if (!supabaseConfigured) {
    const store = getDemoStore();
    const existing = store.googleCalendarConnections.find((connection) => connection.owner_id === ownerId && connection.provider === 'google');
    if (existing) {
      Object.assign(existing, values, { updated_at: nowIso(), revoked_at: null });
      return existing;
    }
    const connection = {
      id: nextId('google-calendar'),
      owner_id: ownerId,
      provider: 'google',
      ...values,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    store.googleCalendarConnections.unshift(connection);
    return connection;
  }

  const { data, error } = await supabaseAdmin
    .from('google_calendar_connections')
    .upsert({ owner_id: ownerId, provider: 'google', ...values }, { onConflict: 'owner_id,provider' })
    .select('*')
    .single();

  if (error) throw Object.assign(new Error(error.message), { status: 500 });
  return data;
}

async function deleteConnection(ownerId) {
  if (!supabaseConfigured) {
    const store = getDemoStore();
    store.googleCalendarConnections = store.googleCalendarConnections.filter((connection) => connection.owner_id !== ownerId || connection.provider !== 'google');
    return;
  }

  const { error } = await supabaseAdmin
    .from('google_calendar_connections')
    .delete()
    .eq('owner_id', ownerId)
    .eq('provider', 'google');

  if (error) throw Object.assign(new Error(error.message), { status: 500 });
}

router.get('/google-calendar/status', requireAuth, requireCompanyAccount, async (req, res) => {
  try {
    const config = getGoogleCalendarConfigStatus();
    const connection = await loadGoogleCalendarConnection(req.user.id);
    return res.json({
      configured: config.ready,
      configuration: config,
      connection: sanitizedConnection(connection),
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Could not load Google Calendar status.' });
  }
});

router.get('/google-calendar/connect', requireAuth, requireCompanyAccount, async (req, res) => {
  try {
    const url = buildGoogleCalendarAuthUrl({
      ownerId: req.user.id,
      returnTo: req.query.returnTo || '/settings',
    });
    return res.json({ url });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Google Calendar OAuth is not configured.' });
  }
});

router.get('/google-calendar/oauth2callback', async (req, res) => {
  let returnTo = '/settings';
  try {
    if (req.query.error) {
      return redirectWithStatus(res, returnTo, 'error', String(req.query.error));
    }

    const state = verifyOAuthState(req.query.state);
    returnTo = state.returnTo || '/settings';
    const code = String(req.query.code || '');
    if (!code) return redirectWithStatus(res, returnTo, 'error', 'Missing OAuth authorization code.');

    const { client, tokens } = await exchangeGoogleCalendarCode(code);
    if (!tokens.refresh_token) {
      return redirectWithStatus(res, returnTo, 'error', 'Google did not return a refresh token. Disconnect the app in Google Account permissions, then connect again.');
    }

    const accountEmail = await getGoogleAccountEmail(client);
    const encrypted = encryptRefreshToken(tokens.refresh_token);
    const connectionValues = {
      google_account_email: accountEmail,
      calendar_id: 'primary',
      calendar_summary: 'Primary calendar',
      ...encrypted,
      scopes: tokens.scope ? String(tokens.scope).split(/\s+/).filter(Boolean) : [],
      connected_at: nowIso(),
      revoked_at: null,
      sync_status: 'connected',
      sync_error: '',
    };

    const connection = await upsertConnection(state.ownerId, connectionValues);
    try {
      const primary = await getCalendarSummary(connection, 'primary');
      await upsertConnection(state.ownerId, {
        ...connectionValues,
        calendar_id: primary.id || 'primary',
        calendar_summary: primary.summary || 'Primary calendar',
      });
    } catch {
      // A connected account can still use primary even if summary lookup fails.
    }

    return redirectWithStatus(res, returnTo, 'connected');
  } catch (error) {
    return redirectWithStatus(res, returnTo, 'error', error.message || 'Google Calendar connection failed.');
  }
});

router.get('/google-calendar/calendars', requireAuth, requireCompanyAccount, async (req, res) => {
  try {
    const connection = await loadGoogleCalendarConnection(req.user.id);
    if (!connection) return res.status(404).json({ error: 'Google Calendar is not connected.' });
    const calendars = await listGoogleCalendars(connection);
    return res.json({ calendars });
  } catch (error) {
    const classified = classifyGoogleCalendarError(error);
    return res.status(classified.requiresReconnect ? 401 : 502).json({
      error: classified.requiresReconnect ? 'Google authorization expired. Please reconnect Google Calendar.' : classified.message,
    });
  }
});

router.patch('/google-calendar/settings', requireAuth, requireCompanyAccount, async (req, res) => {
  try {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid Google Calendar settings payload.' });

    const connection = await loadGoogleCalendarConnection(req.user.id);
    if (!connection) return res.status(404).json({ error: 'Google Calendar is not connected.' });

    const calendar = await getCalendarSummary(connection, parsed.data.calendarId);
    const values = {
      calendar_id: calendar.id || parsed.data.calendarId,
      calendar_summary: calendar.summary || parsed.data.calendarId,
      sync_status: 'connected',
      sync_error: '',
      updated_at: nowIso(),
    };

    const updated = await upsertConnection(req.user.id, {
      ...connection,
      ...values,
      refresh_token_ciphertext: connection.refresh_token_ciphertext,
      refresh_token_iv: connection.refresh_token_iv,
      refresh_token_tag: connection.refresh_token_tag,
      scopes: connection.scopes || [],
      google_account_email: connection.google_account_email || '',
      connected_at: connection.connected_at || nowIso(),
      revoked_at: null,
    });

    return res.json({ connection: sanitizedConnection(updated) });
  } catch (error) {
    const classified = classifyGoogleCalendarError(error);
    return res.status(error.status || (classified.requiresReconnect ? 401 : 502)).json({
      error: classified.requiresReconnect ? 'Google authorization expired. Please reconnect Google Calendar.' : (error.message || classified.message),
    });
  }
});

router.post('/google-calendar/sync', requireAuth, requireCompanyAccount, async (req, res) => {
  try {
    const connection = await loadGoogleCalendarConnection(req.user.id);
    if (!connection) return res.status(404).json({ error: 'Google Calendar is not connected.' });

    const result = await syncOwnerInterviewsWithGoogle(req.user.id, {
      from: req.body?.from,
      to: req.body?.to,
      sendUpdates: Boolean(req.body?.sendUpdates),
      createMeetLink: Boolean(req.body?.createMeetLink),
    });
    const updatedConnection = await loadGoogleCalendarConnection(req.user.id);
    return res.json({ ...result, connection: sanitizedConnection(updatedConnection) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Google Calendar sync failed.' });
  }
});

router.delete('/google-calendar', requireAuth, requireCompanyAccount, async (req, res) => {
  try {
    const connection = await loadGoogleCalendarConnection(req.user.id);
    if (connection) {
      try {
        const auth = createOAuthClientFromConnection(connection);
        await auth.revokeCredentials();
      } catch {
        // Continue with local token removal even if Google token revocation fails.
      }
      await deleteConnection(req.user.id);
    }
    return res.json({ success: true });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Could not disconnect Google Calendar.' });
  }
});

export default router;
