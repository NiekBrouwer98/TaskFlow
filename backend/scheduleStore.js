import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEDULE_FILE = join(__dirname, 'scheduled.json');

function loadSchedules() {
  if (!existsSync(SCHEDULE_FILE)) return [];
  try {
    const data = JSON.parse(readFileSync(SCHEDULE_FILE, 'utf-8'));
    return Array.isArray(data.schedules) ? data.schedules : [];
  } catch {
    return [];
  }
}

function saveSchedules(schedules) {
  writeFileSync(SCHEDULE_FILE, JSON.stringify({ schedules }, null, 2), 'utf-8');
}

export function getTaskKey(task) {
  const project = task.project || '';
  const text = (task.text || '').trim();
  const file = task.sourceFile || '';
  const raw = `${project}|${text}|${file}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

export function getSchedulesInRange(startYmd, endYmd) {
  const schedules = loadSchedules();
  return schedules.filter((s) => s.date >= startYmd && s.date <= endYmd);
}

export function addOrUpdateSchedule({ taskKey, date, startTime, endTime, project, text }) {
  const schedules = loadSchedules();
  const end = endTime || (startTime ? addMinutes(startTime, 30) : null);
  const existing = schedules.findIndex((s) => s.taskKey === taskKey && s.date === date);
  const entry = {
    taskKey,
    date,
    startTime: startTime || '09:00',
    endTime: end || '09:30',
    project: project || null,
    text: text || null,
  };
  if (existing >= 0) {
    schedules[existing] = entry;
  } else {
    schedules.push(entry);
  }
  saveSchedules(schedules);
  return entry;
}

export function removeSchedule(taskKey, date) {
  const schedules = loadSchedules().filter((s) => !(s.taskKey === taskKey && s.date === date));
  saveSchedules(schedules);
}

function addMinutes(timeStr, minutes) {
  const [h, m] = timeStr.split(':').map(Number);
  const total = (h || 0) * 60 + (m || 0) + minutes;
  const h2 = Math.floor(total / 60) % 24;
  const m2 = total % 60;
  return `${String(h2).padStart(2, '0')}:${String(m2).padStart(2, '0')}`;
}
