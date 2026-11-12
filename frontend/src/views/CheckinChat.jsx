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

const ROUTINES = {
  checkin: { command: '/daily-checkin', title: 'Morning check-in', button: 'Start check-in' },
  checkout: { command: '/daily-checkout', title: 'End-of-day check-out', button: 'Start check-out' },
};

export default function CheckinChat({ date, onTurnDone }) {
  const [messages, setMessages] = useState(() => loadSaved(date).messages || []);
  const [sessionId, setSessionId] = useState(() => loadSaved(date).sessionId || null);
  const [mode, setMode] = useState(() => loadSaved(date).mode || null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(storageKey(date), JSON.stringify({ sessionId, messages, mode })); } catch {}
  }, [date, sessionId, messages, mode]);

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

  const start = (key) => {
    setMode(key);
    send(ROUTINES[key].command, { fresh: true, label: ROUTINES[key].button });
  };

  const startOver = () => {
    setMessages([]);
    setSessionId(null);
    setMode(null);
  };

  const started = messages.length > 0 || busy;
  // ponytail: fixed 14:00 switch; read checkout_reminder from config if it should follow it
  const suggested = new Date().getHours() < 14 ? 'checkin' : 'checkout';
  const other = suggested === 'checkin' ? 'checkout' : 'checkin';

  return (
    <section className="section">
      <h2 className="section-title">Check-in</h2>
      <div className="card chat-card">
        {started && (
          <div className="chat-topbar">
            <span className="chat-topbar-title">{ROUTINES[mode]?.title || 'Conversation'}</span>
            <button type="button" className="chat-ghost-btn" onClick={startOver} disabled={busy}>
              Start over
            </button>
          </div>
        )}
        <div className="chat-messages" ref={listRef} aria-live="polite">
          {!started && (
            <div className="chat-start">
              <p className="chat-start-text">
                {suggested === 'checkin'
                  ? 'Good morning. Ready to plan your day?'
                  : 'Wrapping up? Close the day with a short check-out.'}
              </p>
              <div className="chat-start-actions">
                <button type="button" className="chat-primary-btn" onClick={() => start(suggested)}>
                  {ROUTINES[suggested].button}
                </button>
                <button type="button" className="chat-secondary-btn" onClick={() => start(other)}>
                  {ROUTINES[other].button}
                </button>
              </div>
            </div>
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
            placeholder={sessionId ? 'Reply… (Enter to send, Shift+Enter for a new line)' : 'Start a check-in or check-out above'}
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
