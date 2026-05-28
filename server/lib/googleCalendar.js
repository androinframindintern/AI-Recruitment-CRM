import { google } from 'googleapis';

function hasCalendarCredentials() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN && process.env.GOOGLE_CALENDAR_ID);
}

function createOAuthClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'https://developers.google.com/oauthplayground'
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  return oauth2Client;
}

export async function createInterviewEvent({ title, description, start, end, attendees = [] }) {
  if (!hasCalendarCredentials()) {
    return {
      id: `demo-event-${Date.now()}`,
      htmlLink: 'https://calendar.google.com/',
      status: 'demo',
    };
  }

  const calendar = google.calendar({ version: 'v3', auth: createOAuthClient() });
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

  return {
    id: response.data.id,
    htmlLink: response.data.htmlLink,
    status: response.data.status,
  };
}
