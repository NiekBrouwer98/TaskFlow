import { useState, useEffect } from 'react';
import { getOverview, refresh } from '../api';
import '../App.css';

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function TaskItem({ task, today }) {
  const overdue = task.due && task.due < today;
  return (
    <div className="task-row">
      <span className={`priority-dot ${task.priority}`} />
      <div>
        <div className="task-text">{task.text}</div>
        <div className="task-meta">
          {task.project && <span>{task.project}</span>}
          {task.section && <span>{task.section}</span>}
          {task.taskType && <span>#{task.taskType}</span>}
          {task.due && <span className={overdue ? 'overdue-label' : ''}>Due {task.due}</span>}
          {task.start && task.start !== task.due && <span>Start {task.start}</span>}
        </div>
      </div>
    </div>
  );
}

function TaskGroup({ title, tasks, today, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!tasks?.length) return null;
  return (
    <div className="task-group">
      <button className="task-group-header" onClick={() => setOpen(!open)}>
        <span className="task-group-title">{title}</span>
        <span className="task-group-count">{tasks.length}</span>
      </button>
      {open && (
        <div className="task-group-body">
          {tasks.map((task, i) => (
            <TaskItem key={`${task.text}-${i}`} task={task} today={today} />
          ))}
        </div>
      )}
    </div>
  );
}

function dateTitle(ymd, today) {
  const d = new Date(ymd + 'T12:00:00');
  const opts = { weekday: 'short', day: 'numeric', month: 'short' };
  if (ymd.slice(0, 4) !== today.slice(0, 4)) opts.year = 'numeric';
  const label = d.toLocaleDateString('en-GB', opts);
  return ymd === today ? `Today · ${label}` : label;
}

// Overdue first, then one group per date (due, else start), then undated.
function groupByDate(tasks, today) {
  const overdue = [];
  const inProgress = [];
  const undated = [];
  const byDate = {};
  for (const t of tasks) {
    const date = t.due || t.start;
    if (!date) undated.push(t);
    else if (t.due && t.due < today) overdue.push(t);
    else if (date < today) inProgress.push(t);
    else (byDate[date] ||= []).push(t);
  }
  overdue.sort((a, b) => a.due.localeCompare(b.due));
  return { overdue, inProgress, undated, dates: Object.keys(byDate).sort().map((d) => [d, byDate[d]]) };
}

const VIEWS = [
  ['date', 'By date'],
  ['priority', 'By priority'],
  ['project', 'By project'],
  ['topic', 'By topic'],
];

export default function TaskOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [groupBy, setGroupBy] = useState('date');

  const load = async () => {
    setLoading(true);
    try {
      setData(await getOverview());
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
        <h1 className="page-title">Tasks</h1>
        <p className="empty-state">Loading…</p>
      </div>
    );
  }

  const today = localToday();
  const byPriority = data?.byPriority ?? { high: [], normal: [], low: [], all: [] };
  const byTopic = data?.byTopic ?? { bySection: {}, byProject: {}, byTaskType: {} };
  const noTasks = !byPriority.all?.length;

  const groupedBy = (map) =>
    Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, tasks]) => <TaskGroup key={name} title={name} tasks={tasks} today={today} />);

  let body;
  if (noTasks) {
    body = <p className="empty-state">No open tasks.</p>;
  } else if (groupBy === 'date') {
    const g = groupByDate(byPriority.all, today);
    body = (
      <>
        <TaskGroup title="Overdue" tasks={g.overdue} today={today} />
        <TaskGroup title="In progress (started, no due date)" tasks={g.inProgress} today={today} />
        {g.dates.map(([date, tasks]) => (
          <TaskGroup key={date} title={dateTitle(date, today)} tasks={tasks} today={today} />
        ))}
        <TaskGroup title="No date" tasks={g.undated} today={today} defaultOpen={false} />
      </>
    );
  } else if (groupBy === 'priority') {
    body = (
      <>
        <TaskGroup title="High priority (with due/scheduled date)" tasks={byPriority.high} today={today} />
        <TaskGroup title="Normal" tasks={byPriority.normal} today={today} />
        <TaskGroup title="Low priority (archived)" tasks={byPriority.low} today={today} />
      </>
    );
  } else if (groupBy === 'project') {
    body = groupedBy(byTopic.byProject);
  } else {
    body = groupedBy(byTopic.bySection);
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Tasks</h1>
        <button className="refresh-btn" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <p className="page-subtitle">
        All open tasks from your Obsidian vault, by date, priority, project or topic.
      </p>

      <div className="tabs">
        {VIEWS.map(([key, label]) => (
          <button
            key={key}
            className={groupBy === key ? 'tab active' : 'tab'}
            onClick={() => setGroupBy(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-body">{body}</div>
      </div>
    </div>
  );
}
