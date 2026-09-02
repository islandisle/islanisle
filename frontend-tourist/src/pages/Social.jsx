import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getSocialFeed } from '../api/client';
import PostCard from '../components/social/PostCard';
import PostComposer from '../components/social/PostComposer';

// Go Social — the feed (stage 2). Landing view for the Go Social tab.
// Stories row lands at the top of this in stage 4.
export default function Social() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState('');
  const [composing, setComposing] = useState(false);

  function load() {
    getSocialFeed()
      .then((d) => setPosts(d.posts))
      .catch((err) => setError(err.message));
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
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/social/me" className="btn-secondary" style={{ padding: '6px 12px', fontSize: 13, textDecoration: 'none' }}>
            My profile
          </Link>
          <button className="btn-primary" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => setComposing(true)}>
            + Post
          </button>
        </div>
      </div>

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
