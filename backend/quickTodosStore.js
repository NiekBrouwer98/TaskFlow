import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_FILE = join(__dirname, 'quick-todos.json');

function load() {
  if (!existsSync(STORE_FILE)) return { todos: [] };
  try {
    return JSON.parse(readFileSync(STORE_FILE, 'utf8'));
  } catch {
    return { todos: [] };
  }
}

function save(data) {
  writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

export function getTodosForDate(date) {
  const { todos } = load();
  return todos.filter(t => t.date === date);
}

export function addTodo({ date, text }) {
  const data = load();
  const todo = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    date,
    text,
    done: false,
  };
  data.todos.push(todo);
  save(data);
  return todo;
}

export function updateTodo(id, updates) {
  const data = load();
  const todo = data.todos.find(t => t.id === id);
  if (!todo) return null;
  if (updates.done !== undefined) todo.done = updates.done;
  if (updates.text !== undefined) todo.text = updates.text;
  save(data);
  return todo;
}

export function deleteTodo(id) {
  const data = load();
  data.todos = data.todos.filter(t => t.id !== id);
  save(data);
}
