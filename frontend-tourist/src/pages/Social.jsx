import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getSocialFeed, getFriendRequestCount, getSocialDmUnreadCount } from '../api/client';
import PostCard from '../components/social/PostCard';
import PostComposer from '../components/social/PostComposer';
import StoryBar from '../components/social/StoryBar';

// Go Social — the feed (stage 2). Landing view for the Go Social tab.
// Stories row lands at the top of this in stage 4.
export default function Social() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState('');
  const [composing, setComposing] = useState(false);
  const [requestCount, setRequestCount] = useState(0);
  const [dmUnread, setDmUnread] = useState(0);

  function load() {
    getSocialFeed()
      .then((d) => setPosts(d.posts))
      .catch((err) => setError(err.message));
    getFriendRequestCount().then((d) => setRequestCount(d.count)).catch(() => {});
    getSocialDmUnreadCount().then((d) => setDmUnread(d.count)).catch(() => {});
  }

  useEffect(() => {
    if (!localStorage.getItem('atollisle_token')) {
      navigate('/login');
      return;
    }
    load();
  }, []);

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', margin: 0 }}>Go Social</h1>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <HeaderLink to="/social/friends" label="Friends" badge={requestCount} />
          <HeaderLink to="/social/messages" label="Messages" badge={dmUnread} />
          <HeaderLink to="/social/me" label="Profile" />
          <button className="btn-primary" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => setComposing(true)}>
            + Post
          </button>
        </div>
      </div>

      <StoryBar />

      {error && <p className="error-text">{error}</p>}
      {posts === null && !error && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading…</p>}

      {posts?.length === 0 && (
        <div className="card" style={{ padding: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--navy)', margin: '0 0 4px' }}>Your feed is quiet.</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            Share your first post, or add friends to see theirs.
          </p>
        </div>
      )}

      {posts?.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
        />
      ))}

      {composing && (
        <PostComposer
          onClose={() => setComposing(false)}
          onPosted={(post) => setPosts((prev) => [post, ...(prev || [])])}
        />
      )}
    </div>
  );
}

function HeaderLink({ to, label, badge = 0 }) {
  return (
    <Link
      to={to}
      className="btn-secondary"
      style={{ padding: '6px 12px', fontSize: 13, textDecoration: 'none', position: 'relative' }}
    >
      {label}
      {badge > 0 && (
        <span style={{ position: 'absolute', top: -6, right: -6, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: 'var(--coral)', color: '#fff', fontSize: 10, fontWeight: 700, lineHeight: '16px', textAlign: 'center' }}>
          {badge}
        </span>
      )}
    </Link>
  );
}
