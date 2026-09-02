import { useState } from 'react';
import { Link } from 'react-router-dom';
import { likePost, unlikePost, deletePost, getPostComments, addPostComment, deletePostComment } from '../../api/client';
import Avatar from './Avatar';

export function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// One feed post — author, photo carousel, like, comments, delete-own.
// `onDeleted(id)` lets the parent list drop it.
export default function PostCard({ post, onDeleted }) {
  const [liked, setLiked] = useState(post.liked_by_me);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [idx, setIdx] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function toggleLike() {
    const next = !liked;
    setLiked(next);
    setLikeCount((n) => n + (next ? 1 : -1));
    try {
      const r = await (next ? likePost(post.id) : unlikePost(post.id));
      setLikeCount(r.like_count);
    } catch {
      setLiked(!next);
      setLikeCount((n) => n + (next ? -1 : 1));
    }
  }

  async function openComments() {
    const next = !showComments;
    setShowComments(next);
    if (next && comments === null) {
      try {
        const d = await getPostComments(post.id);
        setComments(d.comments);
      } catch (e) {
        setErr(e.message);
      }
    }
  }

  async function submitComment(e) {
    e.preventDefault();
    if (!commentText.trim()) return;
    setBusy(true);
    try {
      const { comment } = await addPostComment(post.id, commentText.trim());
      setComments((prev) => [...(prev || []), { ...comment, author_name: 'You' }]);
      setCommentCount((n) => n + 1);
      setCommentText('');
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeComment(commentId) {
    try {
      await deletePostComment(post.id, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setCommentCount((n) => Math.max(0, n - 1));
    } catch (e) {
      setErr(e.message);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this post?')) return;
    try {
      await deletePost(post.id);
      onDeleted?.(post.id);
    } catch (e) {
      setErr(e.message);
    }
  }

  const media = post.media || [];

  return (
    <div className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
        <Link to={post.is_mine ? '/social/me' : `/social/u/${post.user_id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flex: 1 }}>
          <Avatar name={post.author_name} src={post.author_avatar_url} size={34} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{post.author_name}</span>
        </Link>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo(post.created_at)}</span>
        {post.is_mine && (
          <button
            type="button"
            aria-label="Delete post"
            onClick={handleDelete}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: 4 }}
          >🗑</button>
        )}
      </div>

      {media.length > 0 && (
        <div style={{ position: 'relative', background: 'var(--sand)' }}>
          <img
            src={media[idx]}
            alt={post.caption || 'Post photo'}
            style={{ width: '100%', maxHeight: 460, objectFit: 'cover', display: 'block' }}
          />
          {media.length > 1 && (
            <>
              {idx > 0 && (
                <button type="button" aria-label="Previous photo" onClick={() => setIdx(idx - 1)} style={navBtn('left')}>‹</button>
              )}
              {idx < media.length - 1 && (
                <button type="button" aria-label="Next photo" onClick={() => setIdx(idx + 1)} style={navBtn('right')}>›</button>
              )}
              <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5 }}>
                {media.map((_, i) => (
                  <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i === idx ? '#fff' : 'rgba(255,255,255,0.5)' }} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 6 }}>
          <button type="button" onClick={toggleLike} aria-pressed={liked} style={actionBtn}>
            <span style={{ color: liked ? 'var(--coral)' : 'var(--navy)', fontSize: 16 }}>{liked ? '♥' : '♡'}</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{likeCount}</span>
          </button>
          <button type="button" onClick={openComments} style={actionBtn}>
            <span style={{ fontSize: 15 }}>💬</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{commentCount}</span>
          </button>
        </div>

        {post.caption && (
          <p style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 4px', whiteSpace: 'pre-wrap' }}>
            <strong>{post.author_name}</strong> {post.caption}
          </p>
        )}

        {showComments && (
          <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            {comments === null && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</p>}
            {comments?.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No comments yet.</p>}
            {comments?.map((c) => (
              <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
                <p style={{ fontSize: 12, color: 'var(--navy)', margin: 0, flex: 1, whiteSpace: 'pre-wrap' }}>
                  <strong>{c.author_name}</strong> {c.text}
                </p>
                {c.is_mine && (
                  <button type="button" aria-label="Delete comment" onClick={() => removeComment(c.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11 }}>×</button>
                )}
              </div>
            ))}
            <form onSubmit={submitComment} style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input className="input-field" placeholder="Add a comment…" value={commentText} onChange={(e) => setCommentText(e.target.value)} style={{ flex: 1 }} />
              <button className="btn-primary" type="submit" disabled={busy || !commentText.trim()} style={{ padding: '6px 12px', fontSize: 12 }}>Post</button>
            </form>
          </div>
        )}

        {err && <p className="error-text" style={{ marginTop: 6 }}>{err}</p>}
      </div>
    </div>
  );
}

const actionBtn = { display: 'flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', cursor: 'pointer', padding: 0 };
const navBtn = (side) => ({
  position: 'absolute', top: '50%', transform: 'translateY(-50%)', [side]: 8,
  width: 28, height: 28, borderRadius: '50%', border: 'none',
  background: 'rgba(11,46,61,0.55)', color: '#fff', fontSize: 18, cursor: 'pointer', lineHeight: 1,
});
