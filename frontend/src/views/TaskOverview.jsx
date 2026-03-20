import { useState, useEffect } from 'react';
import { getOverview, refresh } from '../api';
import '../App.css';

function TaskItem({ task }) {
  return (
    <div className="task-row">
      <span className={`priority-dot ${task.priority}`} />
      <div>
        <div className="task-text">{task.text}</div>
        <div className="task-meta">
          {task.project && <span>{task.project}</span>}
          {task.section && <span>{task.section}</span>}
          {task.taskType && <span>#{task.taskType}</span>}
          {task.due && <span>Due {task.due}</span>}
        </div>
      </div>
    </div>
  );
}

function TaskGroup({ title, tasks, defaultOpen = true }) {
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
            <TaskItem key={`${task.text}-${i}`} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TaskOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [groupBy, setGroupBy] = useState('priority'); // priority | project | topic

  const load = async () => {
    setLoading(true);
    try {
      const d = await getOverview();
      setData(d);
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
        <h1 className="page-title">Overview</h1>
        <p className="empty-state">Loading…</p>
      </div>
    );
  }

  const byPriority = data?.byPriority ?? { high: [], normal: [], low: [] };
  const byTopic = data?.byTopic ?? { bySection: {}, byProject: {}, byTaskType: {} };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Overview</h1>
        <button className="refresh-btn" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <p className="page-subtitle">
        All open tasks from your Obsidian vault, grouped by priority or topic.
      </p>

      <div className="tabs">
        <button
          className={groupBy === 'priority' ? 'tab active' : 'tab'}
          onClick={() => setGroupBy('priority')}
        >
          By priority
        </button>
        <button
          className={groupBy === 'project' ? 'tab active' : 'tab'}
          onClick={() => setGroupBy('project')}
        >
          By project
        </button>
        <button
          className={groupBy === 'topic' ? 'tab active' : 'tab'}
          onClick={() => setGroupBy('topic')}
        >
          By topic
        </button>
      </div>

      {groupBy === 'priority' && (
        <div className="card">
          <div className="card-body">
            <TaskGroup title="High priority (with due/scheduled date)" tasks={byPriority.high} />
            <TaskGroup title="Normal" tasks={byPriority.normal} />
            <TaskGroup title="Low priority (archived)" tasks={byPriority.low} />
            {!byPriority.high?.length && !byPriority.normal?.length && !byPriority.low?.length && (
              <p className="empty-state">No open tasks.</p>
            )}
          </div>
        </div>
      )}

      {groupBy === 'project' && (
        <div className="card">
          <div className="card-body">
            {Object.entries(byTopic.byProject).length === 0 ? (
              <p className="empty-state">No open tasks.</p>
            ) : (
              Object.entries(byTopic.byProject)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([project, tasks]) => (
                  <TaskGroup key={project} title={project} tasks={tasks} />
                ))
            )}
          </div>
        </div>
      )}

      {groupBy === 'topic' && (
        <div className="card">
          <div className="card-body">
            {Object.entries(byTopic.bySection).length === 0 ? (
              <p className="empty-state">No open tasks.</p>
            ) : (
              Object.entries(byTopic.bySection)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([section, tasks]) => (
                  <TaskGroup key={section} title={section} tasks={tasks} />
                ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
