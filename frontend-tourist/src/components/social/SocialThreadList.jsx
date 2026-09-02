import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getSocialDmThreads } from '../../api/client';
import Avatar from './Avatar';
import SocialChatPanel from './SocialChatPanel';
import { timeAgo } from './PostCard';

// The friend-DM conversation list. Its own component so it can live both on
// its own screen and inside the shared message bar's "Friends" tab.
//
// Deep-link: any route rendering this can pass ?dm=<userId>&name=<name> to
// open a thread straight away (the "Message" buttons on profiles / the
// friends list do this).
export default function SocialThreadList() {
  const [params, setParams] = useSearchParams();
  const [threads, setThreads] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null); // { user_id, name }

  const load = useCallback(() => {
    getSocialDmThreads().then((d) => setThreads(d.threads)).catch((err) => setError(err.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const dm = params.get('dm');
    if (dm) {
      setOpen({ user_id: dm, name: params.get('name') || 'Friend' });
      params.delete('dm'); params.delete('name');
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {error && <p className="error-text">{error}</p>}
      {threads === null && !error && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading…</p>}
      {threads?.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          No conversations yet. Open a friend’s profile and tap “Message”.
        </p>
      )}

      {threads?.map((t) => (
        <button
          key={t.thread_key}
          type="button"
          onClick={() => setOpen({ user_id: t.other_user_id, name: t.other_name })}
          className="card"
          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: 12, marginBottom: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}
        >
          <Avatar name={t.other_name} src={t.other_avatar_url} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', margin: '0 0 2px' }}>{t.other_name}</p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.last_from_me ? 'You: ' : ''}{t.last_text}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{timeAgo(t.last_at)}</span>
            {t.unread_count > 0 && (
              <span style={{ minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: 'var(--coral)', color: '#fff', fontSize: 10, fontWeight: 700, lineHeight: '16px', textAlign: 'center' }}>
                {t.unread_count}
              </span>
            )}
          </div>
        </button>
      ))}

      {open && (
        <SocialChatPanel
          userId={open.user_id}
          name={open.name}
          onMessageSent={load}
          onClose={() => { setOpen(null); load(); }}
        />
      )}
    </>
  );
}
