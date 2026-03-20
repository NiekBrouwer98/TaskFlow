import { google } from 'googleapis';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_PATH = join(__dirname, 'credentials.json');
const TOKEN_PATH = join(__dirname, 'token.json');

export function isGoogleCalendarConfigured() {
  return existsSync(CREDENTIALS_PATH) && existsSync(TOKEN_PATH);
}

function getAuthClient() {
  if (!existsSync(CREDENTIALS_PATH) || !existsSync(TOKEN_PATH)) return null;
  try {
    const creds = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf-8'));
    const { client_secret, client_id, redirect_uris } = creds.installed || creds.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    const token = JSON.parse(readFileSync(TOKEN_PATH, 'utf-8'));
    oAuth2Client.setCredentials(token);
    // Auto-save refreshed tokens
    oAuth2Client.on('tokens', (tokens) => {
      const existing = JSON.parse(readFileSync(TOKEN_PATH, 'utf-8'));
      writeFileSync(TOKEN_PATH, JSON.stringify({ ...existing, ...tokens }, null, 2));
    });
    return oAuth2Client;
  } catch (e) {
    console.error('Google Calendar auth error:', e.message);
    return null;
  }
}

export async function getGoogleCalendarEvents(dateYmd) {
  const auth = getAuthClient();
  if (!auth) return [];

  const calendarApi = google.calendar({ version: 'v3', auth });
  const [y, m, d] = dateYmd.split('-').map(Number);
  const timeMin = new Date(y, m - 1, d, 0, 0, 0).toISOString();
  const timeMax = new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();

  try {
    const response = await calendarApi.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    });
    return (response.data.items || []).map((event) => ({
      title: event.summary || 'No title',
      start: event.start.dateTime || event.start.date,
      end: event.end?.dateTime || event.end?.date || null,
      allDay: !event.start.dateTime,
    }));
  } catch (e) {
    console.error('Google Calendar fetch error:', e.message);
    return [];
  }
}
