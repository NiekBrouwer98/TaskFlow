import { useState, useEffect } from 'react';
import { getToday, getTasks, refresh, patchSchedule, getQuickTodos, updateQuickTodo } from '../api';
import CheckinChat from './CheckinChat';
import '../App.css';

function TaskItem({ task }) {
  const isOverdue = task.due && task.due < task._today;
  return (
    <div className={`task-row ${task.done ? 'task-finished' : ''}`}>
      <span className={`priority-dot ${task.priority}`} />
      <div>
        <div className="task-text">{task.text}</div>
        <div className="task-meta">
          {task.project && <span>{task.project}</span>}
          {task.due && (
            <span className={isOverdue ? 'overdue-label' : ''}>
              Due {task.due}
            </span>
          )}
          {task.start && task.start !== task.due && <span>Start {task.start}</span>}
        </div>
      </div>
    </div>
  );
}

function toYmd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getTodayDateStr() {
  return toYmd(new Date());
}

function addDays(ymd, n) {
  const d = new Date(ymd + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return toYmd(d);
}

// Sunday of the current week (Monday-start weeks)
function endOfWeek(ymd) {
  const day = new Date(ymd + 'T12:00:00').getDay();
  return addDays(ymd, day === 0 ? 0 : 7 - day);
}

// Today = overdue, due today or starting today; the rest by due (else start) date.
function groupPlanned(openTasks, today) {
  const tomorrow = addDays(today, 1);
  const weekEnd = endOfWeek(today);
  const groups = { today: [], tomorrow: [], week: [] };
  for (const t of openTasks) {
    const date = t.due || t.start;
    if (!date) continue;
    if ((t.due && t.due <= today) || t.start === today) groups.today.push(t);
    else if (date === tomorrow) groups.tomorrow.push(t);
    else if (date > tomorrow && date <= weekEnd) groups.week.push(t);
  }
  const byDate = (a, b) => (a.due || a.start).localeCompare(b.due || b.start);
  groups.today.sort(byDate);
  groups.week.sort(byDate);
  return groups;
}

const PLANNED_LIMIT = 4;

function PlannedGroup({ title, tasks, today, limit }) {
  const [expanded, setExpanded] = useState(false);
  const shown = limit && !expanded ? tasks.slice(0, limit) : tasks;
  const hidden = tasks.length - shown.length;
  return (
    <div className="planned-group">
      <p className="today-todos-label">{title}</p>
      {tasks.length === 0 ? (
        <p className="planned-empty">Nothing planned.</p>
      ) : (
        <ul className="today-tasks-list">
          {shown.map((task, i) => (
            <li key={task.taskKey || i}>
              <TaskItem task={{ ...task, _today: today }} />
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <button type="button" className="planned-more-btn" onClick={() => setExpanded(true)}>
          {hidden} more…
        </button>
      )}
      {expanded && limit && tasks.length > limit && (
        <button type="button" className="planned-more-btn" onClick={() => setExpanded(false)}>
          Show less
        </button>
      )}
    </div>
  );
}

export default function Today() {
  const [data, setData] = useState(null);
  const [openTasks, setOpenTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [slots, setSlots] = useState([]);
  const [todos, setTodos] = useState([]);

  const dateStr = getTodayDateStr();

  const load = async () => {
    setLoading(true);
    await reloadData();
    setLoading(false);
  };

  // No loading flag, so the chat panel stays mounted while data refreshes.
  const reloadData = async () => {
    const [todayResult, tasksResult, todosResult] = await Promise.allSettled([
      getToday(),
      getTasks(),
      getQuickTodos(dateStr),
    ]);
    if (todayResult.status === 'fulfilled') setData(todayResult.value);
    if (tasksResult.status === 'fulfilled') setOpenTasks(tasksResult.value.openTasks || []);
    if (todosResult.status === 'fulfilled') setTodos(todosResult.value.todos || []);
  };

  const reloadAfterChat = async () => {
    try { await refresh(); } catch (_) {}
    await reloadData();
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    setSlots((data?.scheduledSlots ?? []).sort((a, b) =>
      (a.startTime || '').localeCompare(b.startTime || '')
    ));
  }, [data]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
      await reloadData();
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <h1 className="page-title">Today</h1>
        <p className="empty-state">Loading…</p>
      </div>
    );
  }

  const planned = groupPlanned(openTasks, dateStr);
  const googleEvents = data?.googleEvents ?? [];

  const toggleSlotDone = async (slot) => {
    const newDone = !slot.done;
    setSlots(prev => prev.map(s =>
      s.taskKey === slot.taskKey && s.date === slot.date ? { ...s, done: newDone } : s
    ));
    try {
      await patchSchedule(slot.taskKey, slot.date, { done: newDone });
    } catch {
      setSlots(prev => prev.map(s =>
        s.taskKey === slot.taskKey && s.date === slot.date ? { ...s, done: slot.done } : s
      ));
    }
  };

  const toggleTodoDone = async (todo) => {
    const setDone = (done) =>
      setTodos(prev => prev.map(t => (t.id === todo.id ? { ...t, done } : t)));
    setDone(!todo.done);
    try {
      await updateQuickTodo(todo.id, { done: !todo.done });
    } catch {
      setDone(todo.done);
    }
  };

  function formatEventTime(isoString) {
    const d = new Date(isoString);
    return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="page today-page">
      <div className="page-header">
        <h1 className="page-title">Today</h1>
        <button className="refresh-btn" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <p className="page-subtitle">
        Your day at a glance.
      </p>

      <CheckinChat date={dateStr} onTurnDone={reloadAfterChat} />

      <div className="today-two-col">
      <section className="section">
        <h2 className="section-title">Planned</h2>
        <div className="card">
          <div className="card-body">
            <PlannedGroup title="Today" tasks={planned.today} today={dateStr} />
            <PlannedGroup title="Tomorrow" tasks={planned.tomorrow} today={dateStr} limit={PLANNED_LIMIT} />
            <PlannedGroup title="Rest of the week" tasks={planned.week} today={dateStr} limit={PLANNED_LIMIT} />
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Tasks for today</h2>
        <div className="card">
          <div className="card-body">
            {todos.length > 0 && (
              <>
                <p className="today-todos-label">To-dos</p>
                <ul className="today-scheduled-list today-todos-list">
                  {todos.map((todo) => (
                    <li key={todo.id} className={`today-scheduled-item${todo.done ? ' task-finished' : ''}`}>
                      <button
                        type="button"
                        className={`today-slot-check${todo.done ? ' checked' : ''}`}
                        onClick={() => toggleTodoDone(todo)}
                        aria-label={todo.done ? 'Mark undone' : 'Mark done'}
                      />
                      <div className="today-scheduled-main">
                        <span className="today-scheduled-text">{todo.text}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                {slots.length > 0 && <p className="today-todos-label">Schedule</p>}
              </>
            )}
            {slots.length > 0 && (
              <ul className="today-scheduled-list">
                {slots.map((slot, i) => (
                  <li key={`${slot.taskKey}-${slot.date}-${i}`} className={`today-scheduled-item${slot.done ? ' task-finished' : ''}`}>
                    <button
                      type="button"
                      className={`today-slot-check${slot.done ? ' checked' : ''}`}
                      onClick={() => toggleSlotDone(slot)}
                      aria-label={slot.done ? 'Mark undone' : 'Mark done'}
                    />
                    <div className="today-scheduled-main">
                      <div style={{display:'flex', alignItems:'baseline', gap:'8px'}}>
                        <span className="today-scheduled-time">{slot.startTime} – {slot.endTime}</span>
                        {slot.project && <span className="today-scheduled-project">{slot.project}</span>}
                      </div>
                      <span className="today-scheduled-text">{slot.text || 'Task'}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {slots.length === 0 && todos.length === 0 && (
              <p className="empty-state">No time slots scheduled for today.</p>
            )}
          </div>
        </div>
      </section>
      </div>

      {googleEvents.length > 0 && (
        <section className="section">
          <h2 className="section-title">Google Calendar</h2>
          <div className="card">
            <div className="card-body">
              <ul className="today-scheduled-list">
                {googleEvents.map((event, i) => (
                  <li key={i} className="today-scheduled-item">
                    <span className="today-scheduled-time">
                      {event.allDay ? 'All day' : `${formatEventTime(event.start)} – ${formatEventTime(event.end)}`}
                    </span>
                    <span className="today-scheduled-text">{event.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
