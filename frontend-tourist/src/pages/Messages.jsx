import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getMyThreads, getSocialDmUnreadCount } from '../api/client';
import ChatPanel from '../components/ChatPanel';
import EmptyState from '../components/EmptyState';
import Tabs from '../components/Tabs';
import SocialThreadList from '../components/social/SocialThreadList';

// The one message-bar entry point, now two tabs (Go Social feature brief):
//   - Friends  — friend-to-friend DMs (social_dm_messages, stage 5)
//   - Business & trips — the existing business/agent/group chat
//     (messages.js), unchanged in function
// ?tab=social opens straight to the Friends tab (used by the Go Social
// feed's Messages link and the profile "Message" buttons).
export default function Messages() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [dmUnread, setDmUnread] = useState(0);

  const tab = params.get('tab') === 'social' ? 'social' : 'trips';

  useEffect(() => {
    if (!localStorage.getItem('atollisle_token')) navigate('/login');
    getSocialDmUnreadCount().then((d) => setDmUnread(d.count)).catch(() => {});
  }, []);

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <button className="btn-secondary" onClick={() => navigate('/profile')} style={{ marginBottom: 16 }}>
        ← Back
      </button>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', marginBottom: 16 }}>Messages</h1>

      <Tabs
        value={tab}
        onChange={(id) => {
          if (id === 'trips') params.delete('tab'); else params.set('tab', id);
          setParams(params, { replace: true });
        }}
        tabs={[
          { id: 'trips', label: 'Business & trips', content: <TripThreadList /> },
          { id: 'social', label: 'Friends', badge: dmUnread || undefined, content: <SocialThreadList /> },
        ]}
      />
    </div>
  );
}

// The pre-existing business/agent/group conversation list (was the whole of
// this page before the tab merge).
function TripThreadList() {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openThread, setOpenThread] = useState(null);

  function load() {
    setLoading(true);
    getMyThreads()
      .then((d) => setThreads(d.threads || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  const ROLE_LABEL = { business: 'Business', agent: 'Agent', user: 'Tourist' };

  return (
    <>
      {loading && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading…</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && threads.length === 0 && (
        <EmptyState
          message="No conversations yet. Open any listing and tap “Message business” to ask about availability, dietary needs or custom timing before you book."
          actionLabel="Browse listings"
          actionTo="/"
        />
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
    </>
  );
}
