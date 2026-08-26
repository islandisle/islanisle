import { useState, useEffect } from 'react';
import { getThread, sendMessage } from '../api/client';
import { useModalA11y } from '../useModalA11y';

// Section 6.5's tourist↔business chat — reuses the same generic messages
// backend (routes/messages.js) and the same ChatPanel pattern already
// built for the agent portal (frontend-agent/src/pages/Dashboard.jsx),
// just always talking to other_role: 'business' here.
export default function ChatPanel({ businessId, businessName, onClose }) {
  const modalRef = useModalA11y(onClose);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    getThread('business', businessId)
      .then((d) => setMessages(d.messages || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [businessId]);

  async function handleSend(e) {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await sendMessage('business', businessId, text.trim());
      setText('');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(11, 46, 61, 0.5)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="card"
        role="dialog"
        aria-modal="true"
        aria-label={`Chat with ${businessName}`}
        style={{ width: '100%', maxWidth: 480, borderRadius: '20px 20px 0 0', padding: 16, maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', margin: 0 }}>Chat with {businessName}</p>
          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={onClose} aria-label="Close chat">Close</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 10 }}>
          {loading && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>}
          {error && <p className="error-text">{error}</p>}
          {!loading && messages.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No messages yet — say hello.</p>}
          {messages.map((m) => (
            <p key={m.id} style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 8px' }}>
              <strong>{m.sender_role === 'user' ? 'You' : businessName}:</strong> {m.text}
            </p>
          ))}
        </div>

        <form onSubmit={handleSend} style={{ display: 'flex', gap: 8 }}>
          <input className="input-field" placeholder="Message…" value={text} onChange={(e) => setText(e.target.value)} style={{ flex: 1 }} />
          <button className="btn-primary" type="submit">Send</button>
        </form>
      </div>
    </div>
  );
}
