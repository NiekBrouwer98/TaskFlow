import React, { useState, useEffect, useCallback } from 'react';
import {
  getSchedule, postSchedule, deleteSchedule, getTasks, refresh,
  getMeetingBlocks, postMeetingBlock, deleteMeetingBlock,
} from '../api';
import '../App.css';

const HOUR_START = 8;
const HOUR_END = 18;
const SLOT_MINUTES = 30;

function timeSlots() {
  const slots = [];
  for (let h = HOUR_START; h < HOUR_END; h++) {
    for (let m = 0; m < 60; m += SLOT_MINUTES) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return slots;
}

const SLOTS = timeSlots();

// Extended time options for meeting start/end pickers (07:00–20:00)
function allTimeOptions() {
  const opts = [];
  for (let h = 7; h <= 20; h++) {
    for (let m = 0; m < 60; m += 30) {
      if (h === 20 && m > 0) break;
      opts.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return opts;
}
const TIME_OPTIONS = allTimeOptions();

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// Mon-Sun order for the picker (European week)
const DOW_OPTIONS = [
  { label: 'Monday', value: 1 },
  { label: 'Tuesday', value: 2 },
  { label: 'Wednesday', value: 3 },
  { label: 'Thursday', value: 4 },
  { label: 'Friday', value: 5 },
  { label: 'Saturday', value: 6 },
  { label: 'Sunday', value: 0 },
];

function timeToRow(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const total = (h - HOUR_START) * 60 + (m || 0);
  return Math.floor(total / SLOT_MINUTES);
}

function rowToTime(row) {
  const total = row * SLOT_MINUTES;
  const h = HOUR_START + Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function weekStart(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const mon = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + mon);
  return d.toISOString().slice(0, 10);
}

function weekDates(dateStr) {
  const start = weekStart(dateStr);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start + 'T12:00:00');
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * Returns the meeting blocks that apply on the given date, based on recurrence rules.
 * dayOfWeek follows JS convention: 0=Sun, 1=Mon, ..., 6=Sat.
 */
function expandMeetingBlocksForDate(meetingBlocks, dateYmd) {
  const d = new Date(dateYmd + 'T12:00:00');
  const dow = d.getDay();
  const isWeekday = dow >= 1 && dow <= 5;
  return (meetingBlocks || []).filter((b) => {
    if (b.startDate && dateYmd < b.startDate) return false;
    if (b.endDate && dateYmd > b.endDate) return false;
    switch (b.recurrence) {
      case 'daily':
        return true;
      case 'weekdays':
        return isWeekday;
      case 'weekly':
        return b.dayOfWeek === dow;
      case 'biweekly': {
        if (b.dayOfWeek !== dow) return false;
        // Without an anchor, show on all matching weeks
        if (!b.startDate) return true;
        const anchor = new Date(b.startDate + 'T12:00:00');
        const diffDays = Math.round((d - anchor) / (24 * 60 * 60 * 1000));
        if (diffDays < 0) return false;
        return Math.floor(diffDays / 7) % 2 === 0;
      }
      default:
        return false;
    }
  });
}

function buildBlocksForDay(dateYmd, schedules, meetingInstances) {
  const blocks = [];
  // Meeting blocks (recurring, manual)
  (meetingInstances || []).forEach((b) => {
    const startRow = Math.max(0, timeToRow(b.startTime));
    const endRow = Math.max(0, timeToRow(b.endTime));
    blocks.push({
      startRow,
      endRow: Math.max(endRow, startRow + 1),
      title: b.title,
      type: 'meeting',
      meetingId: b.id,
    });
  });
  // User-scheduled tasks
  (schedules || []).forEach((s) => {
    if (s.date !== dateYmd) return;
    const startRow = timeToRow(s.startTime || '09:00');
    const endRow = timeToRow(s.endTime || '09:30');
    blocks.push({
      startRow,
      endRow: Math.max(endRow, startRow + 1),
      title: s.text || 'Task',
      type: 'scheduled',
      taskKey: s.taskKey,
      project: s.project,
    });
  });
  blocks.sort((a, b) => a.startRow - b.startRow);
  return blocks;
}

function addMinutesToTime(timeStr, minutes) {
  const [h, m] = timeStr.split(':').map(Number);
  const total = (h || 0) * 60 + (m || 0) + minutes;
  const h2 = Math.floor(total / 60) % 24;
  const m2 = total % 60;
  return `${String(h2).padStart(2, '0')}:${String(m2).padStart(2, '0')}`;
}

const DURATION_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8].map((hours) => ({
  label: `${hours} hr${hours > 1 ? 's' : ''}`,
  minutes: hours * 60,
}));

const RECURRENCE_OPTIONS = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Every weekday (Mon-Fri)' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
];

function recurrenceLabel(block) {
  switch (block.recurrence) {
    case 'daily': return 'Daily';
    case 'weekdays': return 'Weekdays';
    case 'weekly': return `Weekly on ${DAY_NAMES[block.dayOfWeek] || '?'}`;
    case 'biweekly': return `Bi-weekly on ${DAY_NAMES[block.dayOfWeek] || '?'}`;
    default: return block.recurrence;
  }
}

// ── Manage Meeting Blocks modal ──────────────────────────────────────────────

const EMPTY_FORM = {
  title: '',
  startTime: '09:00',
  endTime: '10:00',
  recurrence: 'weekly',
  dayOfWeek: 1,   // Monday
  startDate: '',
  endDate: '',
};

function MeetingBlocksModal({ blocks, onClose, onAdd, onDelete }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleAdd = async () => {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (form.startTime >= form.endTime) { setError('End time must be after start time.'); return; }
    setError('');
    setSaving(true);
    try {
      await onAdd({
        title: form.title.trim(),
        startTime: form.startTime,
        endTime: form.endTime,
        recurrence: form.recurrence,
        dayOfWeek: ['weekly', 'biweekly'].includes(form.recurrence) ? Number(form.dayOfWeek) : null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
      });
      setForm(EMPTY_FORM);
    } finally {
      setSaving(false);
    }
  };

  const needsDow = form.recurrence === 'weekly' || form.recurrence === 'biweekly';

  return (
    <div className="meeting-modal-overlay" onClick={onClose}>
      <div className="meeting-modal" onClick={(e) => e.stopPropagation()}>
        <div className="meeting-modal-header">
          <h3 className="meeting-modal-title">Meeting Blocks</h3>
          <button type="button" className="meeting-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Existing blocks */}
        {blocks.length > 0 ? (
          <ul className="meeting-block-list">
            {blocks.map((b) => (
              <li key={b.id} className="meeting-block-item">
                <div className="meeting-block-item-info">
                  <span className="meeting-block-item-title">{b.title}</span>
                  <span className="meeting-block-item-meta">
                    {b.startTime}–{b.endTime} &middot; {recurrenceLabel(b)}
                  </span>
                </div>
                <button
                  type="button"
                  className="meeting-block-item-delete"
                  onClick={() => onDelete(b.id)}
                  title="Delete"
                  aria-label={`Delete ${b.title}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="meeting-block-empty">No meeting blocks yet. Add one below.</p>
        )}

        {/* Add new block */}
        <div className="meeting-modal-form">
          <h4 className="meeting-modal-form-title">Add a block</h4>
          {error && <p className="meeting-modal-error">{error}</p>}
          <div className="meeting-form-group">
            <label className="meeting-form-label">Title</label>
            <input
              type="text"
              className="meeting-form-input"
              placeholder="e.g. Supervision meeting"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
            />
          </div>
          <div className="meeting-form-row">
            <div className="meeting-form-group">
              <label className="meeting-form-label">Start</label>
              <select className="meeting-form-select" value={form.startTime} onChange={(e) => set('startTime', e.target.value)}>
                {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="meeting-form-group">
              <label className="meeting-form-label">End</label>
              <select className="meeting-form-select" value={form.endTime} onChange={(e) => set('endTime', e.target.value)}>
                {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="meeting-form-group">
            <label className="meeting-form-label">Repeats</label>
            <select className="meeting-form-select full" value={form.recurrence} onChange={(e) => set('recurrence', e.target.value)}>
              {RECURRENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {needsDow && (
            <div className="meeting-form-group">
              <label className="meeting-form-label">Day of week</label>
              <select className="meeting-form-select full" value={form.dayOfWeek} onChange={(e) => set('dayOfWeek', Number(e.target.value))}>
                {DOW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
          {form.recurrence === 'biweekly' && (
            <div className="meeting-form-group">
              <label className="meeting-form-label">Anchor start date <span className="meeting-form-hint">(first occurrence)</span></label>
              <input
                type="date"
                className="meeting-form-input"
                value={form.startDate}
                onChange={(e) => set('startDate', e.target.value)}
              />
            </div>
          )}
          <div className="meeting-modal-actions">
            <button type="button" className="meeting-modal-add-btn" onClick={handleAdd} disabled={saving}>
              {saving ? 'Saving…' : 'Add block'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Schedule component ──────────────────────────────────────────────────

export default function Schedule() {
  const [view, setView] = useState('day');
  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [schedules, setSchedules] = useState([]);
  const [meetingBlocks, setMeetingBlocks] = useState([]);
  const [openTasks, setOpenTasks] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(null);
  const [durationPicker, setDurationPicker] = useState(null);
  const [taskSearchQuery, setTaskSearchQuery] = useState('');
  const [showMeetingModal, setShowMeetingModal] = useState(false);

  const start = view === 'week' ? weekStart(currentDate) : currentDate;
  const end = view === 'week' ? (() => {
    const d = new Date(start + 'T12:00:00');
    d.setDate(d.getDate() + 6);
    return d.toISOString().slice(0, 10);
  })() : currentDate;
  const dates = view === 'week' ? weekDates(currentDate) : [currentDate];
  const todayYmd = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [schedRes, tasksRes, blocksRes] = await Promise.all([
        getSchedule(start, end),
        getTasks(),
        getMeetingBlocks(),
      ]);
      setSchedules(schedRes.schedules || []);
      setOpenTasks(tasksRes.openTasks || []);
      setAllTasks(tasksRes.allTasks || []);
      setMeetingBlocks(blocksRes.blocks || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = async () => {
    await refresh();
    await load();
  };

  const handleAddMeetingBlock = async (block) => {
    await postMeetingBlock(block);
    const res = await getMeetingBlocks();
    setMeetingBlocks(res.blocks || []);
  };

  const handleDeleteMeetingBlock = async (id) => {
    await deleteMeetingBlock(id);
    const res = await getMeetingBlocks();
    setMeetingBlocks(res.blocks || []);
  };

  const onDragStart = (e, task) => {
    setDragging(task);
    e.dataTransfer.setData('application/json', JSON.stringify({ taskKey: task.taskKey, project: task.project, text: task.text }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const onDragEnd = () => {
    setDragging(null);
  };

  const onDrop = (e, dateYmd, startTime) => {
    e.preventDefault();
    let data;
    try {
      data = JSON.parse(e.dataTransfer.getData('application/json'));
    } catch {
      return;
    }
    const { taskKey, project, text } = data;
    if (!taskKey || !dateYmd || !startTime) return;
    setDurationPicker({ dateYmd, startTime, taskKey, project, text });
  };

  const onDurationSelect = async (minutes) => {
    if (!durationPicker) return;
    const { dateYmd, startTime, taskKey, project, text } = durationPicker;
    const endTime = addMinutesToTime(startTime, minutes);
    setDurationPicker(null);
    try {
      await postSchedule({ taskKey, date: dateYmd, startTime, endTime, project, text });
      const schedRes = await getSchedule(start, end);
      setSchedules(schedRes.schedules || []);
    } catch (err) {
      console.error(err);
    }
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const onRemoveScheduled = async (taskKey, dateYmd) => {
    try {
      await deleteSchedule(taskKey, dateYmd);
      const schedRes = await getSchedule(start, end);
      setSchedules(schedRes.schedules || []);
    } catch (err) {
      console.error(err);
    }
  };

  const goPrev = () => {
    const d = new Date((view === 'week' ? weekStart(currentDate) : currentDate) + 'T12:00:00');
    d.setDate(d.getDate() - (view === 'week' ? 7 : 1));
    setCurrentDate(d.toISOString().slice(0, 10));
  };

  const goNext = () => {
    const d = new Date((view === 'week' ? weekStart(currentDate) : currentDate) + 'T12:00:00');
    d.setDate(d.getDate() + (view === 'week' ? 7 : 1));
    setCurrentDate(d.toISOString().slice(0, 10));
  };

  const goToday = () => {
    const d = new Date();
    setCurrentDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  };

  const q = (taskSearchQuery || '').trim().toLowerCase();
  const filterTask = (t) =>
    !q || (t.text || '').toLowerCase().includes(q) || (t.project || '').toLowerCase().includes(q);
  const filteredOpenTasks = openTasks.filter(filterTask);
  const finishedTasks = allTasks.filter((t) => t.done && filterTask(t));
  const taskKeyToTask = React.useMemo(() => {
    const m = {};
    (allTasks || []).forEach((t) => {
      if (t.taskKey) m[t.taskKey] = t;
    });
    return m;
  }, [allTasks]);

  if (loading) {
    return (
      <div className="page">
        <h1 className="page-title">Schedule</h1>
        <p className="empty-state">Loading…</p>
      </div>
    );
  }

  return (
    <div className="page schedule-page">
      <div className="page-header">
        <h1 className="page-title">Schedule</h1>
        <div className="schedule-actions">
          <button className="refresh-btn" onClick={handleRefresh}>Refresh</button>
          <button className="meeting-blocks-btn" onClick={() => setShowMeetingModal(true)}>
            Meeting Blocks {meetingBlocks.length > 0 && <span className="meeting-blocks-count">{meetingBlocks.length}</span>}
          </button>
          <button onClick={goPrev} className="nav-btn">&#8592;</button>
          <button onClick={goToday} className="nav-btn">Today</button>
          <button onClick={goNext} className="nav-btn">&#8594;</button>
          <span className="schedule-range">
            {view === 'day' ? currentDate : `${start} \u2013 ${end}`}
          </span>
          <div className="tabs" style={{ marginBottom: 0 }}>
            <button className={view === 'day' ? 'tab active' : 'tab'} onClick={() => setView('day')}>Day</button>
            <button className={view === 'week' ? 'tab active' : 'tab'} onClick={() => setView('week')}>Week</button>
          </div>
        </div>
      </div>
      <p className="page-subtitle">
        Drag open tasks onto a time slot to schedule them. Use <strong>Meeting Blocks</strong> to mark recurring meetings so you can plan around them.
      </p>

      {showMeetingModal && (
        <MeetingBlocksModal
          blocks={meetingBlocks}
          onClose={() => setShowMeetingModal(false)}
          onAdd={handleAddMeetingBlock}
          onDelete={handleDeleteMeetingBlock}
        />
      )}

      {durationPicker && (
        <div className="duration-picker-overlay" onClick={() => setDurationPicker(null)}>
          <div className="duration-picker" onClick={(e) => e.stopPropagation()}>
            <h4 className="duration-picker-title">Schedule for how long?</h4>
            <p className="duration-picker-time">
              {durationPicker.startTime} on {new Date(durationPicker.dateYmd + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            </p>
            <div className="duration-picker-buttons">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.minutes}
                  type="button"
                  className="duration-picker-btn"
                  onClick={() => onDurationSelect(opt.minutes)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button type="button" className="duration-picker-cancel" onClick={() => setDurationPicker(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="schedule-layout">
        <aside className="schedule-sidebar">
          <h3 className="schedule-sidebar-title">Tasks</h3>
          <p className="schedule-sidebar-hint">Drag open tasks to a time slot</p>
          <input
            type="search"
            className="schedule-task-search"
            placeholder="Search tasks\u2026"
            value={taskSearchQuery}
            onChange={(e) => setTaskSearchQuery(e.target.value)}
            aria-label="Search tasks"
          />
          <ul className="schedule-task-list">
            {filteredOpenTasks.map((t, i) => (
              <li
                key={t.taskKey || i}
                className={`schedule-task-item ${dragging?.taskKey === t.taskKey ? 'dragging' : ''}`}
                draggable
                onDragStart={(e) => onDragStart(e, t)}
                onDragEnd={onDragEnd}
              >
                <span className="schedule-task-text">{t.text}</span>
                {t.project && <span className="schedule-task-project">{t.project}</span>}
              </li>
            ))}
            {finishedTasks.map((t, i) => (
              <li
                key={`done-${t.taskKey || i}`}
                className="schedule-task-item task-finished"
              >
                <span className="schedule-task-text">{t.text}</span>
                {t.project && <span className="schedule-task-project">{t.project}</span>}
              </li>
            ))}
          </ul>
          {openTasks.length === 0 && finishedTasks.length === 0 && (
            <p className="empty-state small">No tasks</p>
          )}
          {openTasks.length + finishedTasks.length > 0 && filteredOpenTasks.length === 0 && finishedTasks.length === 0 && (
            <p className="empty-state small">No tasks match your search</p>
          )}
        </aside>

        <div className="schedule-grid-wrap">
          <div
            className="schedule-grid"
            style={{
              gridTemplateRows: `var(--schedule-header-row-height, 44px) repeat(${SLOTS.length}, minmax(0, 1fr))`,
              gridTemplateColumns: `56px repeat(${dates.length}, minmax(0, 1fr))`,
            }}
          >
            <div className="schedule-corner" style={{ gridRow: 1, gridColumn: 1 }} />
            {dates.map((d, colIndex) => (
              <div
                key={d}
                className={`schedule-day-header ${d === todayYmd ? 'today' : ''}`}
                style={{ gridRow: 1, gridColumn: colIndex + 2 }}
              >
                {new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
            ))}
            {SLOTS.map((timeStr, rowIndex) => (
              <React.Fragment key={rowIndex}>
                <div
                  className="schedule-time-label"
                  style={{ gridRow: rowIndex + 2, gridColumn: 1 }}
                >
                  {timeStr}
                </div>
                {dates.map((dateYmd, colIndex) => {
                  const startTime = rowToTime(rowIndex);
                  const cellStyle = { gridRow: rowIndex + 2, gridColumn: colIndex + 2 };
                  return (
                    <div
                      key={`${dateYmd}-${rowIndex}`}
                      className={`schedule-cell slot ${dateYmd === todayYmd ? 'today' : ''}`}
                      style={cellStyle}
                      data-date={dateYmd}
                      data-time={startTime}
                      onDrop={(e) => onDrop(e, dateYmd, startTime)}
                      onDragOver={onDragOver}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>
          <div
            className="schedule-blocks-overlay"
            style={{
              gridTemplateRows: `var(--schedule-header-row-height, 44px) repeat(${SLOTS.length}, minmax(0, 1fr))`,
              gridTemplateColumns: `56px repeat(${dates.length}, minmax(0, 1fr))`,
            }}
          >
            {dates.map((dateYmd, colIndex) => {
              const instances = expandMeetingBlocksForDate(meetingBlocks, dateYmd);
              const blocks = buildBlocksForDay(dateYmd, schedules, instances);
              return blocks.map((block, i) => {
                const task = block.taskKey ? taskKeyToTask[block.taskKey] : null;
                const isFinished = task && task.done;
                return (
                  <div
                    key={`${dateYmd}-${block.startRow}-${i}-${block.taskKey || block.meetingId || ''}`}
                    className={`schedule-block ${block.type} ${isFinished ? 'task-finished' : ''}`}
                    style={{
                      gridRow: `${block.startRow + 2} / span ${block.endRow - block.startRow}`,
                      gridColumn: colIndex + 2,
                    }}
                  >
                    <span className="schedule-block-title">{block.title}</span>
                    {block.type === 'scheduled' && block.taskKey && (
                      <button
                        type="button"
                        className="schedule-block-remove"
                        onClick={() => onRemoveScheduled(block.taskKey, dateYmd)}
                        title="Remove from schedule"
                        aria-label="Remove from schedule"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                );
              });
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
