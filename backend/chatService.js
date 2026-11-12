import { spawn } from 'child_process';
import { config } from './config.js';

const SESSION_ID = /^[0-9a-f-]{36}$/i;

const ALLOWED_TOOLS = [
  'Skill', 'Read', 'Glob', 'Grep',
  // ponytail: prefix match only, a second URL later in the command would still pass
  'Bash(curl http://localhost:3111/*)',
  'Bash(date:*)', 'Bash(mkdir:*)', 'Bash(touch:*)',
].join(',');

// Passed through cmd.exe on Windows, so keep it free of quotes and & | < > ^ %
const SYSTEM_NOTE =
  'You are talking to the user through a chat panel in their task app. ' +
  'Ask every question in plain text in your reply, never with AskUserQuestion. ' +
  'Keep replies short and use simple markdown. ' +
  'The Obsidian MCP is not available here. Your working directory is the Obsidian vault root, ' +
  'so read and edit the vault-relative paths from the skill directly as files with Read, Edit and Write.';

function buildArgs(sessionId) {
  const args = [
    '-p', '--output-format', 'stream-json', '--verbose',
    '--allowedTools', `"${ALLOWED_TOOLS}"`,
    '--disallowedTools', 'AskUserQuestion',
    // Auto-approves Edit/Write only inside the working directory (the vault).
    '--permission-mode', 'acceptEdits',
    '--append-system-prompt', `"${SYSTEM_NOTE}"`,
  ];
  if (sessionId) args.push('--resume', sessionId);
  return args;
}

// Streams one turn as NDJSON events: session, text, tool, done, error.
export function runChatTurn({ message, sessionId }, res) {
  if (sessionId && !SESSION_ID.test(sessionId)) {
    res.status(400).json({ error: 'Invalid sessionId' });
    return;
  }

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();
  const send = (event) => res.write(JSON.stringify(event) + '\n');

  // The prompt goes over stdin so user text never touches the shell.
  const child = spawn('claude', buildArgs(sessionId), {
    cwd: config.vaultPath,
    shell: process.platform === 'win32',
    windowsHide: true,
  });
  child.stdin.end(message);

  let currentSession = sessionId || null;
  let buffer = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }
      if (ev.session_id && ev.session_id !== currentSession) {
        currentSession = ev.session_id;
        send({ type: 'session', sessionId: currentSession });
      }
      if (ev.type === 'assistant') {
        for (const block of ev.message?.content || []) {
          if (block.type === 'text' && block.text.trim()) send({ type: 'text', text: block.text });
          if (block.type === 'tool_use') send({ type: 'tool', name: block.name });
        }
      }
    }
  });

  child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });

  child.on('error', (err) => {
    send({ type: 'error', error: `Could not start Claude Code: ${err.message}` });
    res.end();
  });

  child.on('close', (code) => {
    if (code !== 0) send({ type: 'error', error: stderr.trim().slice(-500) || `claude exited with code ${code}` });
    send({ type: 'done', sessionId: currentSession });
    res.end();
  });
}
