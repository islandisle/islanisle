import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPost } from '../api/client';
import PostCard from '../components/social/PostCard';

// Single post — the target of a profile-grid tap or a shared link.
export default function SocialPost() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('atollisle_token')) {
      navigate('/login');
      return;
    }
    getPost(id).then((d) => setPost(d.post)).catch((err) => setError(err.message));
  }, [id]);

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <button className="btn-secondary" onClick={() => navigate(-1)} style={{ marginBottom: 16 }}>← Back</button>
      {error && <p className="error-text">{error}</p>}
      {!post && !error && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading…</p>}
      {post && <PostCard post={post} onDeleted={() => navigate('/social')} />}
    </div>
  );
}
