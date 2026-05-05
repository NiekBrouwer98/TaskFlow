import { useState, useEffect } from 'react';
import { getToday, refresh, getQuickTodos, addQuickTodo, updateQuickTodo, deleteQuickTodo } from '../api';
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [quickTodos, setQuickTodos] = useState([]);
  const [newTodoText, setNewTodoText] = useState('');
  const [addingTodo, setAddingTodo] = useState(false);
  const [addError, setAddError] = useState(null);

  const dateStr = getTodayDateStr();

  const load = async () => {
    setLoading(true);
    const [todayResult, todosResult] = await Promise.allSettled([
      getToday(),
      getQuickTodos(dateStr),
    ]);
    if (todayResult.status === 'fulfilled') setData(todayResult.value);
    if (todosResult.status === 'fulfilled') setQuickTodos(todosResult.value.todos || []);
    setLoading(false);
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

  const handleAddTodo = async () => {
    const text = newTodoText.trim();
    if (!text) return;
    setAddingTodo(true);
    setAddError(null);
    try {
      const todo = await addQuickTodo(dateStr, text);
      setQuickTodos(prev => [...prev, todo]);
      setNewTodoText('');
    } catch (e) {
      setAddError(`Could not save: ${e.message}`);
    } finally {
      setAddingTodo(false);
    }
  };

  const handleToggleTodo = async (todo) => {
    try {
      const updated = await updateQuickTodo(todo.id, { done: !todo.done });
      setQuickTodos(prev => prev.map(t => t.id === todo.id ? updated : t));
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteTodo = async (id) => {
    try {
      await deleteQuickTodo(id);
      setQuickTodos(prev => prev.filter(t => t.id !== id));
    } catch (e) {
      console.error(e);
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
        <h2 className="section-title">Quick to-dos</h2>
        <div className="card">
          <div className="card-body">
            <div className="quick-todo-input-row">
              <input
                className="quick-todo-input"
                type="text"
                placeholder="Add a quick to-do…"
                value={newTodoText}
                onChange={e => setNewTodoText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddTodo()}
                disabled={addingTodo}
              />
              <button
                className="quick-todo-add-btn"
                onClick={handleAddTodo}
                disabled={addingTodo || !newTodoText.trim()}
              >
                Add
              </button>
            </div>
            {addError && <p className="quick-todo-error">{addError}</p>}
            {quickTodos.length > 0 && (
              <ul className="quick-todo-list">
                {quickTodos.map(todo => (
                  <li key={todo.id} className={`quick-todo-item ${todo.done ? 'done' : ''}`}>
                    <input
                      type="checkbox"
                      className="task-checkbox"
                      checked={todo.done}
                      onChange={() => handleToggleTodo(todo)}
                    />
                    <span className="quick-todo-text">{todo.text}</span>
                    <button
                      className="quick-todo-delete"
                      onClick={() => handleDeleteTodo(todo.id)}
                      title="Remove"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {quickTodos.length === 0 && !addError && (
              <p className="empty-state small">No quick to-dos yet. Add one above.</p>
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
