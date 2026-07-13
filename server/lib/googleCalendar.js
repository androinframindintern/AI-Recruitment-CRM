import crypto from 'node:crypto';
import { google } from 'googleapis';

export const GOOGLE_CALENDAR_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
];

const DEFAULT_REDIRECT_URI = 'http://localhost:1573/api/integrations/google-calendar/oauth2callback';

function getRedirectUri() {
  return process.env.GOOGLE_REDIRECT_URI || DEFAULT_REDIRECT_URI;
}

export function getGoogleCalendarConfigStatus() {
  return {
    clientId: Boolean(process.env.GOOGLE_CLIENT_ID),
    clientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    redirectUri: Boolean(getRedirectUri()),
    stateSecret: Boolean(process.env.GOOGLE_OAUTH_STATE_SECRET),
    tokenEncryptionKey: Boolean(process.env.GOOGLE_TOKEN_ENCRYPTION_KEY),
    ready: Boolean(
      process.env.GOOGLE_CLIENT_ID
      && process.env.GOOGLE_CLIENT_SECRET
      && getRedirectUri()
      && process.env.GOOGLE_OAUTH_STATE_SECRET
      && process.env.GOOGLE_TOKEN_ENCRYPTION_KEY
    ),
  };
}

export function hasGoogleOAuthConfig() {
  return getGoogleCalendarConfigStatus().ready;
}

function createOAuthClient(credentials = null) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri(),
  );

  if (credentials) client.setCredentials(credentials);
  return client;
}

function toBase64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64');
}

function getStateSecret() {
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET;
  if (!secret) throw new Error('GOOGLE_OAUTH_STATE_SECRET is not configured.');
  return secret;
}

export function buildOAuthState({ ownerId, returnTo = '/settings' }) {
  const payload = {
    ownerId,
    returnTo: String(returnTo || '/settings').startsWith('/') ? returnTo : '/settings',
    issuedAt: Date.now(),
    expiresAt: Date.now() + (10 * 60 * 1000),
  };
  const body = toBase64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', getStateSecret())
    .update(body)
    .digest('base64url');
  return `${body}.${signature}`;
}

export function verifyOAuthState(state) {
  const [body, signature] = String(state || '').split('.');
  if (!body || !signature) throw new Error('Invalid Google OAuth state.');

  const expected = crypto
    .createHmac('sha256', getStateSecret())
    .update(body)
    .digest('base64url');

  const supplied = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (supplied.length !== expectedBuffer.length || !crypto.timingSafeEqual(supplied, expectedBuffer)) {
    throw new Error('Invalid Google OAuth state signature.');
  }

  const payload = JSON.parse(fromBase64Url(body).toString('utf8'));
  if (!payload.ownerId) throw new Error('Google OAuth state is missing the user scope.');
  if (!payload.expiresAt || Date.now() > Number(payload.expiresAt)) {
    throw new Error('Google OAuth state expired. Please reconnect Google Calendar.');
  }
  return payload;
}

export function buildGoogleCalendarAuthUrl({ ownerId, returnTo = '/settings' }) {
  if (!hasGoogleOAuthConfig()) {
    throw new Error('Google Calendar OAuth environment variables are not fully configured.');
  }

  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: GOOGLE_CALENDAR_SCOPES,
    state: buildOAuthState({ ownerId, returnTo }),
  });
}

export async function exchangeGoogleCalendarCode(code) {
  if (!hasGoogleOAuthConfig()) {
    throw new Error('Google Calendar OAuth environment variables are not fully configured.');
  }

  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  return { client, tokens };
}

function getEncryptionKey() {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY is not configured.');

  const trimmed = raw.trim();
  const candidates = [];

  try { candidates.push(Buffer.from(trimmed, 'base64')); } catch {}
  try { candidates.push(Buffer.from(trimmed, 'hex')); } catch {}
  candidates.push(Buffer.from(trimmed, 'utf8'));

  const valid = candidates.find((candidate) => candidate.length === 32);
  if (!valid) {
    throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  }
  return valid;
}

export function encryptRefreshToken(refreshToken) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(String(refreshToken), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    refresh_token_ciphertext: ciphertext.toString('base64'),
    refresh_token_iv: iv.toString('base64'),
    refresh_token_tag: tag.toString('base64'),
  };
}

export function decryptRefreshToken(connection) {
  if (!connection?.refresh_token_ciphertext || !connection?.refresh_token_iv || !connection?.refresh_token_tag) {
    throw new Error('Google Calendar connection is missing encrypted token material.');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(connection.refresh_token_iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(connection.refresh_token_tag, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(connection.refresh_token_ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function createOAuthClientFromConnection(connection) {
  return createOAuthClient({ refresh_token: decryptRefreshToken(connection) });
}

export function classifyGoogleCalendarError(error) {
  const code = error?.code || error?.response?.status;
  const reason = error?.errors?.[0]?.reason || error?.response?.data?.error || error?.message || 'google_calendar_error';
  const message = error?.response?.data?.error_description || error?.message || 'Google Calendar request failed.';

  return {
    code,
    reason,
    message,
    requiresReconnect: reason === 'invalid_grant' || String(message).toLowerCase().includes('invalid_grant'),
    notFound: Number(code) === 404,
    retryable: Number(code) === 429 || Number(code) >= 500,
  };
}

export async function getGoogleAccountEmail(auth) {
  const oauth2 = google.oauth2({ version: 'v2', auth });
  const response = await oauth2.userinfo.get();
  return response.data?.email || '';
}

export async function listGoogleCalendars(connection) {
  const auth = createOAuthClientFromConnection(connection);
  const calendar = google.calendar({ version: 'v3', auth });
  const response = await calendar.calendarList.list({ maxResults: 250 });
  return (response.data.items || []).map((item) => ({
    id: item.id,
    summary: item.summary || item.id,
    primary: Boolean(item.primary),
    accessRole: item.accessRole,
    timeZone: item.timeZone || 'UTC',
  }));
}

export async function getCalendarSummary(connection, calendarId = connection?.calendar_id || 'primary') {
  const auth = createOAuthClientFromConnection(connection);
  const calendar = google.calendar({ version: 'v3', auth });
  const response = await calendar.calendars.get({ calendarId });
  return {
    id: response.data.id || calendarId,
    summary: response.data.summary || calendarId,
    timeZone: response.data.timeZone || 'UTC',
  };
}

function attendeeList(interview = {}) {
  const raw = Array.isArray(interview.attendees)
    ? interview.attendees
    : [interview.attendee_email, interview.candidate_email].filter(Boolean);
  return raw
    .map((email) => String(email || '').trim())
    .filter(Boolean)
    .map((email) => ({ email }));
}

export function buildGoogleEventBody(interview = {}, options = {}) {
  const timezone = interview.timezone || options.timezone || 'UTC';
  const start = interview.start_at || interview.start || interview.startAt;
  const end = interview.end_at || interview.end || interview.endAt;
  const candidateName = interview.candidate_name || interview.candidate?.full_name || '';
  const notes = interview.notes || interview.description || '';
  const descriptionParts = [
    notes,
    candidateName ? `Candidate: ${candidateName}` : '',
    interview.job_title ? `Job: ${interview.job_title}` : '',
  ].filter(Boolean);

  const requestBody = {
    summary: interview.title || 'Interview',
    description: descriptionParts.join('\n\n'),
    location: interview.location || '',
    start: { dateTime: start, timeZone: timezone },
    end: { dateTime: end, timeZone: timezone },
    attendees: attendeeList(interview),
    extendedProperties: {
      private: {
        crmInterviewId: String(interview.id || ''),
        candidateId: String(interview.candidate_id || interview.candidateId || ''),
        ownerId: String(interview.owner_id || interview.ownerId || ''),
      },
    },
  };

  if (options.createMeetLink) {
    requestBody.conferenceData = {
      createRequest: {
        requestId: `crm-${String(interview.id || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '-')}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }

  return requestBody;
}

function eventResult(data = {}) {
  return {
    id: data.id,
    htmlLink: data.htmlLink,
    status: data.status,
    meetingUrl: data.hangoutLink || data.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === 'video')?.uri || '',
  };
}

export async function createGoogleCalendarEvent(connection, interview, options = {}) {
  const auth = createOAuthClientFromConnection(connection);
  const calendar = google.calendar({ version: 'v3', auth });
  const response = await calendar.events.insert({
    calendarId: connection.calendar_id || 'primary',
    conferenceDataVersion: options.createMeetLink ? 1 : 0,
    sendUpdates: options.sendUpdates ? 'all' : 'none',
    requestBody: buildGoogleEventBody(interview, options),
  });
  return eventResult(response.data);
}

export async function updateGoogleCalendarEvent(connection, eventId, interview, options = {}) {
  const auth = createOAuthClientFromConnection(connection);
  const calendar = google.calendar({ version: 'v3', auth });
  const response = await calendar.events.update({
    calendarId: connection.calendar_id || 'primary',
    eventId,
    conferenceDataVersion: options.createMeetLink ? 1 : 0,
    sendUpdates: options.sendUpdates ? 'all' : 'none',
    requestBody: buildGoogleEventBody(interview, options),
  });
  return eventResult(response.data);
}

export async function deleteGoogleCalendarEvent(connection, eventId, options = {}) {
  if (!eventId) return { deleted: false, skipped: true };
  const auth = createOAuthClientFromConnection(connection);
  const calendar = google.calendar({ version: 'v3', auth });
  try {
    await calendar.events.delete({
      calendarId: connection.calendar_id || 'primary',
      eventId,
      sendUpdates: options.sendUpdates ? 'all' : 'none',
    });
    return { deleted: true };
  } catch (error) {
    const classified = classifyGoogleCalendarError(error);
    if (classified.notFound) return { deleted: true, alreadyMissing: true };
    throw error;
  }
}

function hasLegacyCalendarCredentials() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID
    && process.env.GOOGLE_CLIENT_SECRET
    && process.env.GOOGLE_REFRESH_TOKEN
    && process.env.GOOGLE_CALENDAR_ID
  );
}

export async function createInterviewEvent({ title, description, start, end, attendees = [] }) {
  if (!hasLegacyCalendarCredentials()) {
    return {
      id: `demo-event-${Date.now()}`,
      htmlLink: 'https://calendar.google.com/',
      status: 'demo',
      meetingUrl: '',
    };
  }

  const auth = createOAuthClient({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const calendar = google.calendar({ version: 'v3', auth });
  const response = await calendar.events.insert({
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    requestBody: {
      summary: title,
      description,
      start: { dateTime: start },
      end: { dateTime: end },
      attendees: attendees.filter(Boolean).map((email) => ({ email })),
    },
  });

  return eventResult(response.data);
}
