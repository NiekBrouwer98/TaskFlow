import { useState, useEffect } from 'react';
import { getToday, refresh } from '../api';
import '../App.css';

function TaskItem({ task }) {
  return (
    <div className={`task-row ${task.done ? 'task-finished' : ''}`}>
      <span className={`priority-dot ${task.priority}`} />
      <div>
        <div className="task-text">{task.text}</div>
        <div className="task-meta">
          {task.project && <span>{task.project}</span>}
          {task.due && <span>Due {task.due}</span>}
          {task.start && task.start !== task.due && <span>Start {task.start}</span>}
        </div>
      </div>
    </div>
  );
}

export default function Today() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const todayData = await getToday();
      setData(todayData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

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

  const tasks = data?.allRelevant ?? [];
  const scheduledSlots = data?.scheduledSlots ?? [];
  const googleEvents = data?.googleEvents ?? [];
  // Scheduled slots sorted by start time for display
  const sortedSlots = [...scheduledSlots].sort((a, b) =>
    (a.startTime || '').localeCompare(b.startTime || '')
  );

  function formatEventTime(isoString, allDay) {
    if (allDay || !isoString) return 'All day';
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
        Your day at a glance. A reminder is sent at 9:00 on weekdays with a summary.
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
                      {event.allDay
                        ? 'All day'
                        : `${formatEventTime(event.start)} – ${formatEventTime(event.end)}`}
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
        <h2 className="section-title">Tasks for today</h2>
        <div className="card">
          <div className="card-body">
            {sortedSlots.length > 0 && (
              <ul className="today-scheduled-list">
                {sortedSlots.map((slot, i) => (
                  <li key={`${slot.taskKey}-${slot.date}-${i}`} className="today-scheduled-item">
                    <span className="today-scheduled-time">
                      {slot.startTime} – {slot.endTime}
                    </span>
                    <span className="today-scheduled-text">{slot.text || 'Task'}</span>
                    {slot.project && <span className="today-scheduled-project">{slot.project}</span>}
                  </li>
                ))}
              </ul>
            )}
            {tasks.length > 0 && (
              <ul className="today-tasks-list">
                {tasks.map((task, i) => (
                  <li key={task.taskKey || i}>
                    <TaskItem task={task} />
                  </li>
                ))}
              </ul>
            )}
            {sortedSlots.length === 0 && tasks.length === 0 && (
              <p className="empty-state">No tasks due or scheduled for today.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
