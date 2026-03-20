import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const TASK_LINE = /^(\s*)-\s*\[([ x])\]\s*(.+)$/;
const DUE = /\s*📅\s*(\d{4}-\d{2}-\d{2})/;
const DONE_DATE = /\s*✅\s*(\d{4}-\d{2}-\d{2})?/;
const START = /\s*🛫\s*(\d{4}-\d{2}-\d{2})/;
const RECURRENCE = /\s*🔁\s*([^\s]+)/;
const AT_DUE = /\s*@due\((\d{4}-\d{2}-\d{2})\)/;
const TAG = /#([a-zA-Z0-9/-]+)/g;

const PROJECT_TAG = /#project\/([a-zA-Z0-9-]+)/;
const TASK_TYPE_TAG = /#task\/([a-zA-Z0-9-]+)/;
const ARCHIVED = /#archived/;

function extractTags(text) {
  const tags = [];
  let m;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(text)) !== null) {
    tags.push(m[1]);
  }
  return tags;
}

function parseTaskLine(line, currentSection) {
  const m = line.match(TASK_LINE);
  if (!m) return null;
  const [, indent, doneChar, rest] = m;
  let text = rest.trim();

  let due = null;
  let start = null;
  let doneDate = null;
  let recurrence = null;

  const dueM = text.match(DUE);
  if (dueM) {
    due = dueM[1];
    text = text.replace(DUE, '').trim();
  }
  const atDueM = text.match(AT_DUE);
  if (atDueM) {
    if (!due) due = atDueM[1];
    text = text.replace(AT_DUE, '').trim();
  }
  const startM = text.match(START);
  if (startM) {
    start = startM[1];
    text = text.replace(START, '').trim();
  }
  const doneM = text.match(DONE_DATE);
  if (doneM) {
    doneDate = doneM[1] || '';
    text = text.replace(DONE_DATE, '').trim();
  }
  const recM = text.match(RECURRENCE);
  if (recM) {
    recurrence = recM[1];
    text = text.replace(RECURRENCE, '').trim();
  }

  const tags = extractTags(text);
  text = text.replace(/#[a-zA-Z0-9/-]+/g, '').replace(/\s+/g, ' ').trim();

  const projectTag = rest.match(PROJECT_TAG);
  const taskTypeTag = rest.match(TASK_TYPE_TAG);
  const isArchived = ARCHIVED.test(rest);

  return {
    text,
    done: doneChar === 'x',
    due,
    start,
    doneDate,
    recurrence,
    section: currentSection || null,
    projectTag: projectTag ? projectTag[1] : null,
    taskType: taskTypeTag ? taskTypeTag[1] : null,
    tags,
    priority: isArchived ? 'low' : (due || start ? 'high' : 'normal'),
  };
}

function collectTasksFromFile(filePath, projectName) {
  const tasks = [];
  let currentSection = null;
  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return tasks;
  }
  for (const line of content.split('\n')) {
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      currentSection = heading[1].trim();
      continue;
    }
    const task = parseTaskLine(line, currentSection);
    if (task) {
      task.project = projectName;
      task.sourceFile = filePath;
      tasks.push(task);
    }
  }
  return tasks;
}

export function loadAllTasks(vaultPath) {
  const projectsDir = join(vaultPath, 'PROJECTS');
  const result = { projects: [], resourcesTasks: [], allTasks: [] };

  if (!existsSync(projectsDir)) {
    return result;
  }

  const dirs = readdirSync(projectsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const dir of dirs) {
    const execPath = join(projectsDir, dir.name, 'Execution plan.md');
    const tasks = existsSync(execPath)
      ? collectTasksFromFile(execPath, dir.name)
      : [];
    result.projects.push({
      name: dir.name,
      path: join(projectsDir, dir.name),
      tasks,
    });
    result.allTasks.push(...tasks.map((t) => ({ ...t, project: dir.name })));
  }

  const resourcesPath = join(vaultPath, 'RESOURCES', 'Open and recurring tasks.md');
  if (existsSync(resourcesPath)) {
    result.resourcesTasks = collectTasksFromFile(resourcesPath, 'Resources');
    result.allTasks.push(...result.resourcesTasks);
  }

  return result;
}

export function getOpenTasks(data) {
  return data.allTasks.filter((t) => !t.done);
}

export function getTasksByPriority(data) {
  const open = getOpenTasks(data);
  const high = open.filter((t) => t.priority === 'high');
  const normal = open.filter((t) => t.priority === 'normal');
  const low = open.filter((t) => t.priority === 'low');
  return { high, normal, low, all: open };
}

export function getTasksByTopic(data) {
  const open = getOpenTasks(data);
  const bySection = {};
  const byProject = {};
  const byTaskType = {};
  for (const t of open) {
    const section = t.section || 'Other';
    bySection[section] = bySection[section] || [];
    bySection[section].push(t);
    const proj = t.project || 'Other';
    byProject[proj] = byProject[proj] || [];
    byProject[proj].push(t);
    const type = t.taskType || 'other';
    byTaskType[type] = byTaskType[type] || [];
    byTaskType[type].push(t);
  }
  return { bySection, byProject, byTaskType };
}

export function getTodaySummary(data) {
  const today = new Date().toISOString().slice(0, 10);
  const withDateToday = data.allTasks.filter((t) => t.due === today || t.start === today);
  const dueToday = withDateToday.filter((t) => t.due === today);
  const scheduledToday = withDateToday.filter((t) => t.start === today);
  return {
    date: today,
    dueToday,
    scheduledToday,
    allRelevant: [...new Set([...dueToday, ...scheduledToday])],
  };
}
