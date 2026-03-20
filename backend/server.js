import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import notifier from 'node-notifier';
import { config } from './config.js';
import { loadAllTasks, getOpenTasks, getTasksByPriority, getTasksByTopic, getTodaySummary } from './vaultParser.js';
import { fetchIcsEvents, fetchIcsEventsForRange, getOutlookComEvents, getEventsFromIcsFile, getEventsFromIcsFileForRange } from './calendarService.js';
import { getGoogleCalendarEvents, isGoogleCalendarConfigured } from './googleCalendarService.js';
import { getTaskKey, getSchedulesInRange, addOrUpdateSchedule, removeSchedule } from './scheduleStore.js';
import { getMeetingBlocks, addMeetingBlock, updateMeetingBlock, removeMeetingBlock } from './meetingBlocksStore.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

let cachedData = null;
let cachedAt = 0;
let loadPromise = null;
const CACHE_MS = 5000;

function getData() {
  const now = Date.now();
  if (cachedData && now - cachedAt < CACHE_MS) return cachedData;
  cachedData = loadAllTasks(config.vaultPath);
  cachedAt = now;
  return cachedData;
}

/** Async getData so concurrent requests share one vault parse (avoids 3x load when Schedule loads). */
async function getDataAsync() {
  const now = Date.now();
  if (cachedData && now - cachedAt < CACHE_MS) return cachedData;
  if (loadPromise) return loadPromise;
  loadPromise = Promise.resolve().then(() => {
    const data = loadAllTasks(config.vaultPath);
    cachedData = data;
    cachedAt = Date.now();
    loadPromise = null;
    return data;
  });
  return loadPromise;
}

app.get('/api/health', (_, res) => {
  res.json({ ok: true, vaultPath: config.vaultPath });
});

app.get('/api/config', (_, res) => {
  res.json({
    vaultPath: config.vaultPath,
    reminderTime: config.reminderTime,
    calendarConfigured: !!(config.calendar?.outlook || config.calendar?.google),
  });
});

app.post('/api/refresh', (_, res) => {
  cachedData = null;
  loadPromise = null;
  res.json({ ok: true });
});

app.get('/api/tasks', async (_, res) => {
  const data = await getDataAsync();
  const openTasks = getOpenTasks(data).map((t) => ({ ...t, taskKey: getTaskKey(t) }));
  const allTasksWithKey = data.allTasks.map((t) => ({ ...t, taskKey: getTaskKey(t) }));
  res.json({
    projects: data.projects,
    resourcesTasks: data.resourcesTasks,
    allTasks: allTasksWithKey,
    openTasks,
  });
});

app.get('/api/tasks/overview', async (_, res) => {
  const data = await getDataAsync();
  const byPriority = getTasksByPriority(data);
  const byTopic = getTasksByTopic(data);
  res.json({
    byPriority: {
      high: byPriority.high,
      normal: byPriority.normal,
      low: byPriority.low,
      all: byPriority.all,
    },
    byTopic: byTopic,
  });
});

app.get('/api/planning', async (req, res) => {
  const view = (req.query.view || 'week').toLowerCase();
  const data = await getDataAsync();
  const withDate = data.allTasks.filter((t) => t.due || t.start);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  function parseYMD(str) {
    if (!str) return null;
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function inRange(dateStr, start, end) {
    const d = parseYMD(dateStr);
    if (!d) return false;
    return d >= start && d <= end;
  }

  let start, end, label;
  if (view === 'year') {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear(), 11, 31);
    label = `${now.getFullYear()}`;
  } else if (view === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    label = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  } else {
    const day = now.getDay();
    const mon = day === 0 ? -6 : 1 - day;
    start = new Date(now);
    start.setDate(now.getDate() + mon);
    start.setHours(0, 0, 0, 0);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    label = `Week of ${start.toISOString().slice(0, 10)}`;
  }

  const planned = withDate.filter((t) => {
    const d = t.due || t.start;
    return inRange(d, start, end);
  });

  const byDate = {};
  planned.forEach((t) => {
    const d = t.due || t.start;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(t);
  });

  res.json({
    view,
    label,
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    planned,
    byDate,
    today,
  });
});

app.get('/api/today', async (_, res) => {
  const data = await getDataAsync();
  const summary = getTodaySummary(data);
  const today = getTodayLocal();
  const scheduledSlots = getSchedulesInRange(today, today);
  const googleEvents = await getGoogleCalendarEvents(today);
  res.json({ ...summary, scheduledSlots, googleEvents });
});

// Today's date in local time (YYYY-MM-DD) so calendar matches user's day
function getTodayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Calendar events: ICS URL, local ICS file, or Outlook COM (Windows). Optional ?date=YYYY-MM-DD or ?start=&end= for schedule view.
app.get('/api/calendar/events', async (req, res) => {
  const dateParam = req.query.date;
  const startParam = req.query.start;
  const endParam = req.query.end;
  let dates = [];
  if (startParam && endParam) {
    const start = new Date(startParam + 'T00:00:00');
    const end = new Date(endParam + 'T00:00:00');
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
  } else {
    dates = [dateParam || getTodayLocal()];
  }

  const cal = config.calendar || {};
  const byDate = {};
  const isRange = dates.length > 1;

  if (isRange) {
    // Week view: one ICS fetch, one file read; Outlook COM sequential (multiple processes can break COM)
    const [icsByDate, fileByDate] = await Promise.all([
      cal.outlookIcsUrl ? fetchIcsEventsForRange(cal.outlookIcsUrl, cal.outlookIcsAuth || null, dates) : Promise.resolve({}),
      cal.outlookIcsFile ? Promise.resolve(getEventsFromIcsFileForRange(cal.outlookIcsFile, dates)) : Promise.resolve({}),
    ]);
    for (const dateYmd of dates) {
      let outlook = [...(icsByDate[dateYmd] || []), ...(fileByDate[dateYmd] || [])];
      if (cal.outlookUseCom) {
        const comEvents = await getOutlookComEvents(dateYmd);
        outlook = outlook.concat(comEvents);
      }
      outlook.sort((a, b) => new Date(a.start) - new Date(b.start));
      byDate[dateYmd] = outlook;
    }
  } else {
    const dateYmd = dates[0];
    let outlook = [];
    if (cal.outlookIcsUrl) {
      outlook = outlook.concat(await fetchIcsEvents(cal.outlookIcsUrl, cal.outlookIcsAuth || null, dateYmd));
    }
    if (cal.outlookIcsFile) {
      outlook = outlook.concat(getEventsFromIcsFile(cal.outlookIcsFile, dateYmd));
    }
    if (cal.outlookUseCom) {
      outlook = outlook.concat(await getOutlookComEvents(dateYmd));
    }
    outlook.sort((a, b) => new Date(a.start) - new Date(b.start));
    byDate[dateYmd] = outlook;
  }

  const singleDate = dates.length === 1 ? dates[0] : null;
  const outlook = singleDate ? (byDate[singleDate] || []) : null;

  res.json({
    outlook,
    byDate: dates.length > 1 ? byDate : null,
    google: [],
    message: singleDate && (!outlook || outlook.length === 0) ? 'Add outlookIcsUrl, outlookIcsFile, or outlookUseCom (Windows) in config.json.' : null,
  });
});

// Recurring meeting blocks (stored in backend/meeting-blocks.json)
app.get('/api/meeting-blocks', (_, res) => {
  res.json({ blocks: getMeetingBlocks() });
});

app.post('/api/meeting-blocks', (req, res) => {
  const { title, startTime, endTime, recurrence, dayOfWeek, startDate, endDate } = req.body || {};
  if (!title || !startTime || !endTime || !recurrence) {
    return res.status(400).json({ error: 'title, startTime, endTime, recurrence required' });
  }
  const block = addMeetingBlock({ title, startTime, endTime, recurrence, dayOfWeek, startDate, endDate });
  res.json(block);
});

app.put('/api/meeting-blocks/:id', (req, res) => {
  const block = updateMeetingBlock(req.params.id, req.body || {});
  if (!block) return res.status(404).json({ error: 'Not found' });
  res.json(block);
});

app.delete('/api/meeting-blocks/:id', (req, res) => {
  removeMeetingBlock(req.params.id);
  res.json({ ok: true });
});

// Schedule: user-assigned time slots for tasks (stored in backend/scheduled.json)
app.get('/api/schedule', (req, res) => {
  const start = req.query.start || getTodayLocal();
  const end = req.query.end || start;
  const schedules = getSchedulesInRange(start, end);
  res.json({ schedules });
});

app.post('/api/schedule', (req, res) => {
  const { taskKey, date, startTime, endTime, project, text } = req.body || {};
  if (!taskKey || !date || !startTime) {
    return res.status(400).json({ error: 'taskKey, date, and startTime required' });
  }
  const entry = addOrUpdateSchedule({ taskKey, date, startTime, endTime, project, text });
  res.json(entry);
});

app.delete('/api/schedule', (req, res) => {
  const { taskKey, date } = req.body || req.query || {};
  if (!taskKey || !date) {
    return res.status(400).json({ error: 'taskKey and date required' });
  }
  removeSchedule(taskKey, date);
  res.json({ ok: true });
});

async function sendMorningReminder() {
  const data = await getDataAsync();
  const summary = getTodaySummary(data);
  const taskCount = summary.allRelevant.length;
  const today = getTodayLocal();
  let outlookCount = 0;
  const cal = config.calendar || {};
  if (cal.outlookIcsUrl) {
    const ics = await fetchIcsEvents(cal.outlookIcsUrl, cal.outlookIcsAuth || null, today);
    outlookCount += ics.length;
  }
  if (cal.outlookIcsFile) {
    outlookCount += getEventsFromIcsFile(cal.outlookIcsFile, today).length;
  }
  if (cal.outlookUseCom) {
    outlookCount += (await getOutlookComEvents(today)).length;
  }
  const parts = [];
  if (taskCount > 0) parts.push(`${taskCount} task(s)`);
  if (outlookCount > 0) parts.push(`${outlookCount} meeting(s)`);
  const message =
    parts.length === 0
      ? "Good morning. No tasks or meetings scheduled for today."
      : `Good morning. Today: ${parts.join(', ')}. Open the task app for your full overview.`;
  notifier.notify({
    title: 'Your day',
    message,
    sound: true,
  });
}

// Weekdays at 9:00 (configurable via config.reminderTime and config.reminderTimezone)
const [reminderHour, reminderMin] = config.reminderTime.split(':').map(Number);
cron.schedule(
  `${reminderMin ?? 0} ${reminderHour ?? 9} * * 1-5`,
  sendMorningReminder,
  { timezone: config.reminderTimezone }
);

const PORT = config.port;
app.listen(PORT, () => {
  console.log(`Task app backend running at http://localhost:${PORT}`);
  console.log(`Vault path: ${config.vaultPath}`);
  console.log(`Reminder: weekdays at ${config.reminderTime}`);
  if (config.calendar?.outlookUseCom) {
    console.log('Outlook COM: enabled (calendar events from Outlook desktop)');
  } else if (process.platform === 'win32') {
    console.log('Outlook COM: disabled. Set "outlookUseCom": true in backend/config.json to show meetings.');
  }
  if (isGoogleCalendarConfigured()) {
    console.log('Google Calendar: enabled');
  } else {
    console.log('Google Calendar: not configured. Run "node setup-google-auth.js" in the backend folder to set up.');
  }
});
