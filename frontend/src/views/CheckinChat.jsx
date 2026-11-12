import { useState, useEffect, useRef } from 'react';
import { streamChat } from '../api';

const storageKey = (date) => `checkin-chat-${date}`;

function loadSaved(date) {
  try { return JSON.parse(localStorage.getItem(storageKey(date))) || {}; } catch { return {}; }
}

function toolLabel(name) {
  if (name === 'Edit' || name === 'Write') return 'Writing to Obsidian…';
  if (name === 'Bash') return 'Updating the task app…';
  if (name === 'Skill') return 'Loading the routine…';
  return 'Reading your vault…';
}

// Renders **bold** without innerHTML; everything else stays plain text.
function RichText({ text }) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part
  );
}

export default function CheckinChat({ date, onTurnDone }) {
  const [messages, setMessages] = useState(() => loadSaved(date).messages || []);
  const [sessionId, setSessionId] = useState(() => loadSaved(date).sessionId || null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(storageKey(date), JSON.stringify({ sessionId, messages })); } catch {}
  }, [date, sessionId, messages]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  const send = async (text, { fresh = false, label } = {}) => {
    const msg = text.trim();
    if (!msg || busy) return;
    const sid = fresh ? null : sessionId;
    if (fresh) setSessionId(null);
    setMessages((m) => [...(fresh ? [] : m), { role: 'user', text: label || msg }]);
    setInput('');
    setBusy(true);
    setStatus('Thinking…');
    try {
      await streamChat(msg, sid, (ev) => {
        if (ev.type === 'session') setSessionId(ev.sessionId);
        else if (ev.type === 'text') {
          setMessages((m) => [...m, { role: 'assistant', text: ev.text }]);
          setStatus('Thinking…');
        } else if (ev.type === 'tool') setStatus(toolLabel(ev.name));
        else if (ev.type === 'error') setMessages((m) => [...m, { role: 'error', text: ev.error }]);
      });
    } catch (e) {
      setMessages((m) => [...m, { role: 'error', text: e.message }]);
    } finally {
      setBusy(false);
      setStatus('');
      onTurnDone?.();
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <section className="section">
      <div className="chat-header">
        <h2 className="section-title">Check-in</h2>
        <div className="chat-actions">
          <button type="button" className="refresh-btn" disabled={busy}
            onClick={() => send('/daily-checkin', { fresh: true, label: 'Start check-in' })}>
            Check in
          </button>
          <button type="button" className="refresh-btn" disabled={busy}
            onClick={() => send('/daily-checkout', { fresh: true, label: 'Start check-out' })}>
            Check out
          </button>
        </div>
      </div>
      <div className="card chat-card">
        <div className="chat-messages" ref={listRef} aria-live="polite">
          {messages.length === 0 && !busy && (
            <p className="empty-state small">
              Start your morning check-in or end-of-day check-out.
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg chat-msg-${m.role}`}>
              <RichText text={m.text} />
            </div>
          ))}
          {busy && <div className="chat-status">{status}</div>}
        </div>
        <div className="chat-input-row">
          <textarea
            className="chat-input"
            rows={2}
            placeholder={sessionId ? 'Reply… (Enter to send, Shift+Enter for a new line)' : 'Press Check in or Check out to start'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={busy || !sessionId}
            aria-label="Message"
          />
          <button type="button" className="chat-send-btn" onClick={() => send(input)}
            disabled={busy || !sessionId || !input.trim()}>
            Send
          </button>
        </div>
      </div>
    </section>
  );
}
