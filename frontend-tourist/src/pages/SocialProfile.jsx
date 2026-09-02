import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link, createSearchParams } from 'react-router-dom';
import { getSocialProfile, updateSocialProfile, getUserPosts, sendFriendRequest, unfriend } from '../api/client';
import { fileToDownscaledDataUrl } from '../utils/image';
import Avatar from '../components/social/Avatar';

// Go Social — a user's social profile (stage 1). Own profile is editable
// (avatar + bio); anyone else's is read-only. The post grid and the
// friend/message actions are filled in by later stages — for now the grid
// is an empty state and the counts come straight from the API (0 until
// posts/friends exist).
export default function SocialProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    setError('');
    getSocialProfile(userId)
      .then((d) => setProfile(d.profile))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!localStorage.getItem('atollisle_token')) {
      navigate('/login');
      return;
    }
    load();
  }, [userId]);

  if (loading) {
    return <div style={wrap}><p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading…</p></div>;
  }
  if (error) {
    return <div style={wrap}><p className="error-text">{error}</p></div>;
  }
  if (!profile) return null;

  return (
    <div style={wrap}>
      <button className="btn-secondary" onClick={() => navigate(-1)} style={{ marginBottom: 16 }}>
        ← Back
      </button>

      <ProfileHeader profile={profile} onChanged={setProfile} />

      <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)', margin: '24px 0 12px' }}>Posts</h2>
      <PostGrid userId={profile.user_id} isSelf={profile.is_self} name={profile.name} />
    </div>
  );
}

function PostGrid({ userId, isSelf, name }) {
  const [posts, setPosts] = useState(null);

  useEffect(() => {
    getUserPosts(userId).then((d) => setPosts(d.posts)).catch(() => setPosts([]));
  }, [userId]);

  if (posts === null) {
    return <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>;
  }
  if (posts.length === 0) {
    return (
      <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        {isSelf ? "You haven't posted anything yet." : `${name} hasn't posted anything yet.`}
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
      {posts.map((p) => (
        <Link
          key={p.id}
          to={`/social/post/${p.id}`}
          style={{ position: 'relative', aspectRatio: '1', background: 'var(--sand)', overflow: 'hidden' }}
        >
          {p.media[0] && (
            <img src={p.media[0]} alt={p.caption || 'Post'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
          {p.media.length > 1 && (
            <span style={{ position: 'absolute', top: 4, right: 4, color: '#fff', fontSize: 12, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>▣</span>
          )}
        </Link>
      ))}
    </div>
  );
}

function ProfileHeader({ profile, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState(profile.bio || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);

  async function pickAvatar(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr('');
    setSaving(true);
    try {
      const dataUrl = await fileToDownscaledDataUrl(file, { maxDim: 512, quality: 0.85 });
      const d = await updateSocialProfile({ avatar_url: dataUrl });
      onChanged(d.profile);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveBio() {
    setErr('');
    setSaving(true);
    try {
      const d = await updateSocialProfile({ bio: bio.trim() });
      onChanged(d.profile);
      setEditing(false);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <Avatar name={profile.name} src={profile.avatar_url} size={72} />
          {profile.is_self && (
            <>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="Change profile photo"
                style={{
                  position: 'absolute', right: -2, bottom: -2, width: 26, height: 26,
                  borderRadius: '50%', border: '2px solid var(--surface)', background: 'var(--lagoon)',
                  color: '#fff', fontSize: 13, cursor: 'pointer', lineHeight: 1,
                }}
              >
                ✎
              </button>
              <input ref={fileRef} type="file" accept="image/*" onChange={pickAvatar} style={{ display: 'none' }} />
            </>
          )}
        </div>

        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--navy)', margin: '0 0 2px' }}>{profile.name}</p>
          <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
            <span><strong style={{ color: 'var(--navy)' }}>{profile.post_count}</strong> posts</span>
            <span><strong style={{ color: 'var(--navy)' }}>{profile.friend_count}</strong> friends</span>
          </div>
        </div>
      </div>

      {!editing && (
        <p style={{ fontSize: 13, color: profile.bio ? 'var(--navy)' : 'var(--text-muted)', margin: '14px 0 0', whiteSpace: 'pre-wrap' }}>
          {profile.bio || (profile.is_self ? 'Add a bio so friends know it’s you.' : 'No bio yet.')}
        </p>
      )}

      {editing && (
        <div style={{ marginTop: 14 }}>
          <textarea
            className="input-field"
            value={bio}
            maxLength={300}
            rows={3}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A short bio"
            style={{ width: '100%', resize: 'vertical' }}
          />
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 8px', textAlign: 'right' }}>{bio.length}/300</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" style={{ flex: 1 }} disabled={saving} onClick={saveBio}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="btn-secondary" disabled={saving} onClick={() => { setBio(profile.bio || ''); setEditing(false); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {err && <p className="error-text" style={{ marginTop: 8 }}>{err}</p>}

      {profile.is_self && !editing && (
        <button
          className="btn-secondary"
          style={{ marginTop: 14, width: '100%' }}
          disabled={saving}
          onClick={() => setEditing(true)}
        >
          Edit profile
        </button>
      )}

      {!profile.is_self && <FriendButton profile={profile} onChanged={onChanged} />}
    </div>
  );
}

function FriendButton({ profile, onChanged }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const rel = profile.relationship;

  async function act(fn, optimisticRel) {
    setBusy(true);
    try {
      await fn();
      onChanged({ ...profile, relationship: optimisticRel });
    } finally {
      setBusy(false);
    }
  }

  if (rel === 'friends') {
    return (
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button
          className="btn-primary"
          style={{ flex: 1 }}
          onClick={() => navigate({
            pathname: '/messages',
            search: `?${createSearchParams({ tab: 'social', dm: profile.user_id, name: profile.name })}`,
          })}
        >
          Message
        </button>
        <button
          className="btn-secondary"
          style={{ flex: 1 }}
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Remove ${profile.name} as a friend?`)) {
              act(() => unfriend(profile.user_id), 'none');
            }
          }}
        >
          ✓ Friends
        </button>
      </div>
    );
  }
  if (rel === 'request_sent') {
    return <button className="btn-secondary" style={{ marginTop: 14, width: '100%' }} disabled>Request sent</button>;
  }
  // 'none' or 'request_received' — sending a request when one is already
  // incoming auto-accepts it (backend), so both become "friends".
  return (
    <button
      className="btn-primary"
      style={{ marginTop: 14, width: '100%' }}
      disabled={busy}
      onClick={() => act(
        () => sendFriendRequest(profile.user_id),
        rel === 'request_received' ? 'friends' : 'request_sent',
      )}
    >
      {rel === 'request_received' ? 'Accept friend request' : 'Add friend'}
    </button>
  );
}

const wrap = { maxWidth: 480, margin: '0 auto', padding: 16 };
