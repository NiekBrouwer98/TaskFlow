import { useState, useEffect } from 'react';
import { getPlanning, refresh } from '../api';
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
          {task.start && <span>Start {task.start}</span>}
        </div>
      </div>
    </div>
  );
}

function WeekView({ byDate, today }) {
  const dates = Object.keys(byDate || {}).sort();
  if (dates.length === 0) {
    return <p className="empty-state">No tasks planned for this week.</p>;
  }
  return (
    <div className="planning-days">
      {dates.map((date) => (
        <div key={date} className={`planning-day ${date === today ? 'today' : ''}`}>
          <h3 className="planning-day-title">
            {date}
            {date === today && <span className="badge">Today</span>}
          </h3>
          <div className="planning-day-tasks">
            {byDate[date].map((task, i) => (
              <TaskItem key={i} task={task} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MonthView({ byDate, today, start, end }) {
  const startD = new Date(start);
  const endD = new Date(end);
  const days = [];
  for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  const byDateMap = byDate || {};
  if (days.length === 0) {
    return <p className="empty-state">No days in this month.</p>;
  }
  return (
    <div className="planning-days">
      {days.map((date) => (
        <div key={date} className={`planning-day ${date === today ? 'today' : ''}`}>
          <h3 className="planning-day-title">
            {date}
            {date === today && <span className="badge">Today</span>}
          </h3>
          <div className="planning-day-tasks">
            {(byDateMap[date] || []).map((task, i) => (
              <TaskItem key={i} task={task} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function YearView({ planned, today }) {
  const byMonth = {};
  (planned || []).forEach((task) => {
    const date = task.due || task.start;
    if (!date) return;
    const month = date.slice(0, 7);
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(task);
  });
  const months = Object.keys(byMonth).sort();
  if (months.length === 0) {
    return <p className="empty-state">No tasks planned for this year.</p>;
  }
  return (
    <div className="planning-months">
      {months.map((month) => (
        <div key={month} className="planning-month">
          <h3 className="planning-month-title">{month}</h3>
          <div className="planning-month-tasks">
            {byMonth[month].map((task, i) => (
              <TaskItem key={i} task={task} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Planning() {
  const [view, setView] = useState('week');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const d = await getPlanning(view);
      setData(d);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [view]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const setViewAndLoad = (v) => {
    setView(v);
  };

  if (loading && !data) {
    return (
      <div className="page">
        <h1 className="page-title">Planning</h1>
        <p className="empty-state">Loading…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Planning</h1>
        <button className="refresh-btn" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <p className="page-subtitle">
        Tasks with a due or start date. Toggle week, month, or year.
      </p>

      <div className="tabs">
        <button
          className={view === 'week' ? 'tab active' : 'tab'}
          onClick={() => setViewAndLoad('week')}
        >
          Week
        </button>
        <button
          className={view === 'month' ? 'tab active' : 'tab'}
          onClick={() => setViewAndLoad('month')}
        >
          Month
        </button>
        <button
          className={view === 'year' ? 'tab active' : 'tab'}
          onClick={() => setViewAndLoad('year')}
        >
          Year
        </button>
      </div>

      {data && (
        <>
          <div className="planning-label">{data.label}</div>
          <div className="card">
            <div className="card-body">
              {view === 'week' && (
                <WeekView byDate={data.byDate} today={data.today} />
              )}
              {view === 'month' && (
                <MonthView
                  byDate={data.byDate}
                  today={data.today}
                  start={data.start}
                  end={data.end}
                />
              )}
              {view === 'year' && (
                <YearView planned={data.planned} today={data.today} />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
