import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, 'meeting-blocks.json');

function load() {
  if (!existsSync(FILE)) return [];
  try {
    const data = JSON.parse(readFileSync(FILE, 'utf-8'));
    return Array.isArray(data.blocks) ? data.blocks : [];
  } catch {
    return [];
  }
}

function save(blocks) {
  writeFileSync(FILE, JSON.stringify({ blocks }, null, 2), 'utf-8');
}

export function getMeetingBlocks() {
  return load();
}

export function addMeetingBlock({ title, startTime, endTime, recurrence, dayOfWeek, startDate, endDate }) {
  const blocks = load();
  const id = randomBytes(8).toString('hex');
  const block = {
    id,
    title: title || 'Meeting',
    startTime,
    endTime,
    recurrence,
    // dayOfWeek: 0=Sun,1=Mon,...,6=Sat (matches JS Date.getDay())
    dayOfWeek: dayOfWeek !== undefined && dayOfWeek !== null ? Number(dayOfWeek) : null,
    startDate: startDate || null,
    endDate: endDate || null,
  };
  blocks.push(block);
  save(blocks);
  return block;
}

export function updateMeetingBlock(id, updates) {
  const blocks = load();
  const idx = blocks.findIndex((b) => b.id === id);
  if (idx < 0) return null;
  blocks[idx] = { ...blocks[idx], ...updates };
  save(blocks);
  return blocks[idx];
}

export function removeMeetingBlock(id) {
  const blocks = load().filter((b) => b.id !== id);
  save(blocks);
}
