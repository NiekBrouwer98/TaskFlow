/**
 * Calendar events without Azure/Google app registration.
 *
 * 1. ICS URL: use a published calendar subscription link (Outlook on the web / Exchange).
 * 2. Outlook COM (Windows): read from Outlook desktop via PowerShell + COM.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);

/**
 * Parse ICS content and return events that occur on the given date (YYYY-MM-DD).
 * Handles DATE (all-day) and DATETIME (with or without TZID).
 */
function parseIcsForDate(icsText, dateYmd) {
  const events = [];
  const blocks = icsText.split(/\r?\nBEGIN:VEVENT\r?\n/i);
  const todayStart = new Date(dateYmd + 'T00:00:00');
  const todayEnd = new Date(dateYmd + 'T23:59:59.999');

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split(/\r?\nEND:VEVENT\r?\n/i)[0];
    const summary = block.match(/\r?\nSUMMARY(?:;[^:]*)?:(.*)/i)?.[1]?.trim?.()?.replace(/\\n/g, ' ') || 'No title';
    const dtStart = block.match(/\r?\nDTSTART(?:;[^:]*)?:(.*)/i)?.[1]?.trim();
    const dtEnd = block.match(/\r?\nDTEND(?:;[^:]*)?:(.*)/i)?.[1]?.trim();
    if (!dtStart) continue;

    const rawStart = dtStart.replace(/^VALUE=DATE:/, '').trim();
    const rawEnd = dtEnd ? dtEnd.replace(/^VALUE=DATE:/, '').trim() : null;
    let startDate;
    let endDate;
    if (rawStart.length === 8) {
      startDate = new Date(rawStart.slice(0, 4) + '-' + rawStart.slice(4, 6) + '-' + rawStart.slice(6, 8));
      endDate = rawEnd && rawEnd.length === 8
        ? new Date(rawEnd.slice(0, 4) + '-' + rawEnd.slice(4, 6) + '-' + rawEnd.slice(6, 8))
        : new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
    } else {
      const startStr = rawStart.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(?:Z)?/, '$1-$2-$3T$4:$5:$6');
      startDate = new Date(startStr);
      endDate = rawEnd
        ? new Date(rawEnd.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(?:Z)?/, '$1-$2-$3T$4:$5:$6'))
        : new Date(startDate.getTime() + 60 * 60 * 1000);
    }

    if (isNaN(startDate.getTime())) continue;
    if (endDate <= todayStart || startDate > todayEnd) continue;

    events.push({
      title: summary,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      allDay: dtStart.length === 8,
    });
  }

  events.sort((a, b) => new Date(a.start) - new Date(b.start));
  return events;
}

/**
 * Fetch ICS from URL and return events for one date.
 */
export async function fetchIcsEvents(url, authHeader, dateYmd) {
  if (!url) return [];
  const headers = { Accept: 'text/calendar, application/ics, */*' };
  if (authHeader) headers['Authorization'] = authHeader;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return [];
    const text = await res.text();
    return parseIcsForDate(text, dateYmd);
  } catch (e) {
    console.error('ICS fetch error:', e.message);
    return [];
  }
}

/**
 * Fetch ICS from URL once and return events per date (faster for week view).
 */
export async function fetchIcsEventsForRange(url, authHeader, datesYmd) {
  if (!url || !datesYmd?.length) return {};
  const headers = { Accept: 'text/calendar, application/ics, */*' };
  if (authHeader) headers['Authorization'] = authHeader;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return Object.fromEntries(datesYmd.map((d) => [d, []]));
    const text = await res.text();
    const byDate = {};
    for (const d of datesYmd) {
      byDate[d] = parseIcsForDate(text, d);
    }
    return byDate;
  } catch (e) {
    console.error('ICS fetch error:', e.message);
    return Object.fromEntries(datesYmd.map((d) => [d, []]));
  }
}

/**
 * Run PowerShell script to read Outlook calendar via COM (Windows only).
 * Returns array of { title, start, end } for today.
 */
export async function getOutlookComEvents(dateYmd) {
  const scriptPath = join(__dirname, 'scripts', 'Get-OutlookCalendar.ps1');
  if (!existsSync(scriptPath)) {
    console.error('Outlook COM: script not found at', scriptPath);
    return [];
  }
  if (process.platform !== 'win32') {
    console.error('Outlook COM: only supported on Windows');
    return [];
  }

  // Use execFileAsync so path with spaces (e.g. "Documenten Algemeen") is one argument; shell command string can mis-handle it
  const runScript = () =>
    execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, dateYmd],
      { timeout: 15000, encoding: 'utf-8', maxBuffer: 1024 * 1024 }
    );

  try {
    const { stdout, stderr } = await runScript();
    if (stderr && stderr.trim()) {
      console.error('Outlook COM (PowerShell):', stderr.trim());
    }
    let raw = (stdout || '').trim();
    if (raw.length === 0) {
      console.error('Outlook COM: script returned no output. Path:', scriptPath, 'Date:', dateYmd);
      return [];
    }
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    let data;
    try {
      data = JSON.parse(raw);
    } catch (parseErr) {
      console.error('Outlook COM: invalid JSON (first 200 chars):', raw.slice(0, 200));
      return [];
    }
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object' && !Array.isArray(data)) return [data];
    return [];
  } catch (e) {
    console.error('Outlook COM error:', e.message);
    return [];
  }
}

/**
 * Load events for one date from a local ICS file.
 */
export function getEventsFromIcsFile(filePath, dateYmd) {
  if (!filePath || !existsSync(filePath)) return [];
  try {
    const text = readFileSync(filePath, 'utf-8');
    return parseIcsForDate(text, dateYmd);
  } catch (e) {
    console.error('ICS file error:', e.message);
    return [];
  }
}

/**
 * Read ICS file once and return events per date (faster for week view).
 */
export function getEventsFromIcsFileForRange(filePath, datesYmd) {
  if (!filePath || !existsSync(filePath) || !datesYmd?.length) {
    return Object.fromEntries((datesYmd || []).map((d) => [d, []]));
  }
  try {
    const text = readFileSync(filePath, 'utf-8');
    const byDate = {};
    for (const d of datesYmd) {
      byDate[d] = parseIcsForDate(text, d);
    }
    return byDate;
  } catch (e) {
    console.error('ICS file error:', e.message);
    return Object.fromEntries(datesYmd.map((d) => [d, []]));
  }
}
