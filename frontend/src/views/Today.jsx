import { useState, useEffect } from 'react';
import { getToday, refresh, getDailyBrief } from '../api';
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

function getTodayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Today() {
  const [data, setData] = useState(null);
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const dateStr = getTodayDateStr();

  const load = async () => {
    setLoading(true);
    const [todayResult, briefResult] = await Promise.allSettled([
      getToday(),
      getDailyBrief(),
    ]);
    if (todayResult.status === 'fulfilled') setData(todayResult.value);
    if (briefResult.status === 'fulfilled') setBrief(briefResult.value);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
      await load();
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

  const tasks = (data?.allRelevant ?? []).map(t => ({ ...t, _today: dateStr }));
  const scheduledSlots = data?.scheduledSlots ?? [];
  const googleEvents = data?.googleEvents ?? [];
  const sortedSlots = [...scheduledSlots].sort((a, b) =>
    (a.startTime || '').localeCompare(b.startTime || '')
  );

  // Only show brief if it was generated today
  const briefIsToday = brief?.date === dateStr;

  function formatEventTime(isoString) {
    const d = new Date(isoString);
    return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Today</h1>
        <button className="refresh-btn" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <p className="page-subtitle">
        Your day at a glance.
      </p>

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

      <section className="section">
        <h2 className="section-title">Daily brief</h2>
        <div className="card">
          <div className="card-body">
            {briefIsToday ? (
              <div className="brief-content">
                {brief.topPriority && (
                  <div className="brief-top-priority">
                    <span className="brief-label">Top priority</span>
                    <span className="brief-priority-text">{brief.topPriority}</span>
                  </div>
                )}
                {brief.dueOrOverdue?.length > 0 && (
                  <div className="brief-section">
                    <span className="brief-label">Due / overdue</span>
                    <ul className="brief-list">
                      {brief.dueOrOverdue.map((item, i) => (
                        <li key={i} className="brief-item">
                          <div className="brief-item-body">
                            <span className="brief-item-action">{item.action}</span>
                            <span className="brief-item-project">{item.project}</span>
                          </div>
                          <span className="brief-item-status">{item.status}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {brief.newlyDiscovered?.length > 0 && (
                  <div className="brief-section">
                    <span className="brief-label">Needs triage</span>
                    <ul className="brief-list">
                      {brief.newlyDiscovered.map((item, i) => (
                        <li key={i} className="brief-item">
                          <div className="brief-item-body">
                            <span className="brief-item-action">{item.action}</span>
                            <span className="brief-item-project">{item.project}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {brief.reminders?.length > 0 && (
                  <div className="brief-section">
                    <span className="brief-label">Reminders</span>
                    <ul className="brief-list">
                      {brief.reminders.map((r, i) => (
                        <li key={i} className="brief-item brief-item-reminder">{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="brief-generated">
                  Generated {new Date(brief.generatedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            ) : (
              <p className="empty-state small">
                No brief yet today. Run <code>/daily-brief</code> in Claude to generate one.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Tasks for today</h2>
        <div className="card">
          <div className="card-body">
            {sortedSlots.length > 0 && (
              <ul className="today-scheduled-list">
                {sortedSlots.map((slot, i) => (
                  <li key={`${slot.taskKey}-${slot.date}-${i}`} className="today-scheduled-item">
                    <div className="today-scheduled-main">
                      <span className="today-scheduled-time">
                        {slot.startTime} – {slot.endTime}
                      </span>
                      <span className="today-scheduled-text">{slot.text || 'Task'}</span>
                    </div>
                    {slot.project && <span className="today-scheduled-project">{slot.project}</span>}
                  </li>
                ))}
              </ul>
            )}
            {!briefIsToday && tasks.length > 0 && (
              <ul className="today-tasks-list">
                {tasks.map((task, i) => (
                  <li key={task.taskKey || i}>
                    <TaskItem task={task} />
                  </li>
                ))}
              </ul>
            )}
            {sortedSlots.length === 0 && (briefIsToday || tasks.length === 0) && (
              <p className="empty-state">No time slots scheduled for today.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
