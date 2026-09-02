import { useState, useEffect, useRef } from 'react';
import { getSocialDmThread, sendSocialDm } from '../../api/client';
import { useModalA11y } from '../../useModalA11y';
import { timeAgo } from './PostCard';

// Friend-to-friend DM panel. Separate from the business/trip ChatPanel —
// this one is user↔user, so "You" is decided by from_me, not by role.
export default function SocialChatPanel({ userId, name, onClose, onMessageSent }) {
  const modalRef = useModalA11y(onClose);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  function load() {
    getSocialDmThread(userId)
      .then((d) => setMessages(d.messages || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [userId]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      const { message } = await sendSocialDm(userId, text.trim());
      setMessages((prev) => [...prev, message]);
      setText('');
      onMessageSent?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div
        ref={modalRef}
        className="card"
        role="dialog"
        aria-modal="true"
        aria-label={`Chat with ${name}`}
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 480, borderRadius: '20px 20px 0 0', padding: 16, maxHeight: '75vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)', margin: 0 }}>{name}</p>
          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={onClose}>Close</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {loading && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>}
          {!loading && messages.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No messages yet — say hello.</p>}
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                alignSelf: m.from_me ? 'flex-end' : 'flex-start',
                maxWidth: '78%',
                background: m.from_me ? 'var(--lagoon)' : 'var(--lagoon-tint)',
                color: m.from_me ? '#fff' : 'var(--navy)',
                borderRadius: 12,
                padding: '7px 11px',
              }}
            >
              <p style={{ fontSize: 13, margin: 0, whiteSpace: 'pre-wrap' }}>{m.text}</p>
              <p style={{ fontSize: 10, margin: '2px 0 0', opacity: 0.7 }}>{timeAgo(m.created_at)}</p>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {error && <p className="error-text">{error}</p>}

        <form onSubmit={send} style={{ display: 'flex', gap: 8 }}>
          <input className="input-field" placeholder="Message…" value={text} onChange={(e) => setText(e.target.value)} style={{ flex: 1 }} />
          <button className="btn-primary" type="submit" disabled={sending || !text.trim()}>Send</button>
        </form>
      </div>
    </div>
  );
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(11, 46, 61, 0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 };
