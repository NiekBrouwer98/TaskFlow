const API = '/api';

export async function getConfig() {
  const r = await fetch(`${API}/config`);
  if (!r.ok) throw new Error('Failed to load config');
  return r.json();
}

export async function getTasks() {
  const r = await fetch(`${API}/tasks`);
  if (!r.ok) throw new Error('Failed to load tasks');
  return r.json();
}

export async function getOverview() {
  const r = await fetch(`${API}/tasks/overview`);
  if (!r.ok) throw new Error('Failed to load overview');
  return r.json();
}

export async function getPlanning(view = 'week') {
  const r = await fetch(`${API}/planning?view=${encodeURIComponent(view)}`);
  if (!r.ok) throw new Error('Failed to load planning');
  return r.json();
}

export async function getToday() {
  const r = await fetch(`${API}/today`);
  if (!r.ok) throw new Error('Failed to load today');
  return r.json();
}

export async function getCalendarEvents(dateOrStart, end) {
  let url = `${API}/calendar/events`;
  if (end) {
    url += `?start=${encodeURIComponent(dateOrStart)}&end=${encodeURIComponent(end)}`;
  } else if (dateOrStart) {
    url += `?date=${encodeURIComponent(dateOrStart)}`;
  }
  const r = await fetch(url);
  if (!r.ok) return { outlook: [], byDate: null };
  return r.json();
}

export async function getSchedule(start, end) {
  const e = end || start;
  const r = await fetch(`${API}/schedule?start=${encodeURIComponent(start)}&end=${encodeURIComponent(e)}`);
  if (!r.ok) throw new Error('Failed to load schedule');
  return r.json();
}

export async function postSchedule({ taskKey, date, startTime, endTime, project, text }) {
  const r = await fetch(`${API}/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskKey, date, startTime, endTime, project, text }),
  });
  if (!r.ok) throw new Error('Failed to save schedule');
  return r.json();
}

export async function patchSchedule(taskKey, date, updates) {
  const r = await fetch(`${API}/schedule`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskKey, date, ...updates }),
  });
  if (!r.ok) throw new Error('Failed to update schedule');
  return r.json();
}

export async function deleteSchedule(taskKey, date) {
  const r = await fetch(`${API}/schedule`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskKey, date }),
  });
  if (!r.ok) throw new Error('Failed to remove schedule');
  return r.json();
}

export async function getDailyBrief() {
  const r = await fetch(`${API}/daily-brief`);
  if (!r.ok) return null;
  return r.json();
}

// Streams one chat turn; calls onEvent for each {type: session|text|tool|error|done}
export async function streamChat(message, sessionId, onEvent) {
  const r = await fetch(`${API}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sessionId }),
  });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const j = await r.json(); if (j.error) msg = j.error; } catch (_) {}
    throw new Error(msg);
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) if (line.trim()) onEvent(JSON.parse(line));
  }
}

export async function getQuickTodos(date) {
  const r = await fetch(`${API}/quick-todos?date=${encodeURIComponent(date)}`);
  if (!r.ok) throw new Error('Failed to load quick todos');
  return r.json();
}

export async function addQuickTodo(date, text) {
  const r = await fetch(`${API}/quick-todos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, text }),
  });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const j = await r.json(); if (j.error) msg = j.error; } catch (_) {}
    throw new Error(msg);
  }
  return r.json();
}

export async function updateQuickTodo(id, updates) {
  const r = await fetch(`${API}/quick-todos/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!r.ok) throw new Error('Failed to update quick todo');
  return r.json();
}

export async function deleteQuickTodo(id) {
  const r = await fetch(`${API}/quick-todos/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!r.ok) throw new Error('Failed to delete quick todo');
  return r.json();
}

export async function refresh() {
  const r = await fetch(`${API}/refresh`, { method: 'POST' });
  if (!r.ok) throw new Error('Failed to refresh');
  return r.json();
}

export async function getMeetingBlocks() {
  const r = await fetch(`${API}/meeting-blocks`);
  if (!r.ok) throw new Error('Failed to load meeting blocks');
  return r.json();
}

export async function postMeetingBlock(block) {
  const r = await fetch(`${API}/meeting-blocks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(block),
  });
  if (!r.ok) throw new Error('Failed to save meeting block');
  return r.json();
}

export async function deleteMeetingBlock(id) {
  const r = await fetch(`${API}/meeting-blocks/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!r.ok) throw new Error('Failed to delete meeting block');
  return r.json();
}
