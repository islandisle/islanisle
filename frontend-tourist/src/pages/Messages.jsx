import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyThreads } from '../api/client';
import ChatPanel from '../components/ChatPanel';

// Batch 22 — a tourist could message a business from a listing, but had no
// way to see or reply to a thread someone else started (an agent, most
// notably — Section 5.3's agent↔tourist chat had no frontend-tourist side
// at all). Backed by the same generic messages.js already used
// everywhere else; only new here is threads/mine resolving each thread's
// other-party name so this list has something to show.
export default function Messages() {
  const navigate = useNavigate();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openThread, setOpenThread] = useState(null); // { other_role, other_id, other_name }

  function load() {
    setLoading(true);
    getMyThreads()
      .then((d) => setThreads(d.threads || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!localStorage.getItem('atollisle_token')) {
      navigate('/login');
      return;
    }
    load();
  }, []);

  const ROLE_LABEL = { business: 'Business', agent: 'Agent', user: 'Tourist' };

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <button className="btn-secondary" onClick={() => navigate('/profile')} style={{ marginBottom: 16 }}>
        ← Back
      </button>

      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', marginBottom: 16 }}>
        Messages
      </h1>

      {loading && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading…</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && threads.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No conversations yet.</p>
      )}

      {threads.map((t) => (
        <button
          key={t.thread_key}
          type="button"
          onClick={() => setOpenThread(t)}
          className="card"
          style={{
            display: 'block', width: '100%', textAlign: 'left', padding: 12, marginBottom: 8,
            border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer',
          }}
        >
          <p style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 2px', fontWeight: 500 }}>
            {t.other_name} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({ROLE_LABEL[t.other_role] || t.other_role})</span>
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {t.text}
          </p>
        </button>
      ))}

      {openThread && (
        <ChatPanel
          otherRole={openThread.other_role}
          otherId={openThread.other_id}
          otherName={openThread.other_name}
          onClose={() => { setOpenThread(null); load(); }}
        />
      )}
    </div>
  );
}
