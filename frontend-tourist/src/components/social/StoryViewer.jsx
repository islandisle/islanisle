import { useState, useEffect, useRef, useCallback } from 'react';
import { viewStory, getStoryViewers, deleteStory } from '../../api/client';
import { timeAgo } from './PostCard';
import Avatar from './Avatar';

const STORY_MS = 5000;

// Full-screen story viewer — Instagram/WhatsApp pattern. Segmented progress
// bar, auto-advance, tap-left = back / tap-right = forward, runs through
// every group from `startIndex` then closes. Records a view per story;
// the story owner gets a "Seen by" list.
export default function StoryViewer({ groups, startIndex, onClose, onChanged }) {
  const [gi, setGi] = useState(startIndex);
  const [si, setSi] = useState(0);
  const [progress, setProgress] = useState(0);
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState([]);
  const timerRef = useRef(null);
  const startRef = useRef(Date.now());

  const group = groups[gi];
  const story = group?.stories[si];

  const advance = useCallback(() => {
    setProgress(0);
    if (si + 1 < group.stories.length) {
      setSi(si + 1);
    } else if (gi + 1 < groups.length) {
      setGi(gi + 1);
      setSi(0);
    } else {
      onClose();
    }
  }, [gi, si, group, groups.length, onClose]);

  const back = useCallback(() => {
    setProgress(0);
    if (si > 0) setSi(si - 1);
    else if (gi > 0) {
      const prev = groups[gi - 1];
      setGi(gi - 1);
      setSi(prev.stories.length - 1);
    }
  }, [gi, si, groups]);

  // Per-story timer + view record.
  useEffect(() => {
    if (!story) return undefined;
    if (!group.is_self) viewStory(story.id).then(() => onChanged?.()).catch(() => {});
    startRef.current = Date.now();
    setProgress(0);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const pct = Math.min(1, (Date.now() - startRef.current) / STORY_MS);
      setProgress(pct);
      if (pct >= 1) { clearInterval(timerRef.current); advance(); }
    }, 50);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gi, si]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') advance();
      else if (e.key === 'ArrowLeft') back();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, back, onClose]);

  async function openViewers() {
    clearInterval(timerRef.current);
    try {
      const d = await getStoryViewers(story.id);
      setViewers(d.viewers);
      setShowViewers(true);
    } catch { /* ignore */ }
  }

  async function removeStory() {
    if (!window.confirm('Delete this story?')) return;
    try {
      await deleteStory(story.id);
      onChanged?.();
      advance();
    } catch { /* ignore */ }
  }

  if (!story) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 400, display: 'flex', flexDirection: 'column' }}>
      {/* progress segments */}
      <div style={{ display: 'flex', gap: 4, padding: '10px 12px 6px' }}>
        {group.stories.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.3)', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#fff', width: `${i < si ? 100 : i === si ? progress * 100 : 0}%` }} />
          </div>
        ))}
      </div>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 12px 8px', color: '#fff' }}>
        <Avatar name={group.name} src={group.avatar_url} size={30} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>{group.is_self ? 'Your story' : group.name}</span>
        <span style={{ fontSize: 11, opacity: 0.7 }}>{timeAgo(story.created_at)}</span>
        <div style={{ flex: 1 }} />
        {group.is_self && (
          <button type="button" aria-label="Delete story" onClick={removeStory} style={iconBtn}>🗑</button>
        )}
        <button type="button" aria-label="Close" onClick={onClose} style={{ ...iconBtn, fontSize: 22 }}>×</button>
      </div>

      {/* image + tap zones */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={story.image_url} alt={story.caption || 'Story'} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        {story.caption && (
          <p style={{ position: 'absolute', left: 0, right: 0, bottom: 48, textAlign: 'center', color: '#fff', fontSize: 18, fontWeight: 600, textShadow: '0 2px 8px rgba(0,0,0,0.7)', padding: '0 20px', margin: 0 }}>
            {story.caption}
          </p>
        )}
        <button type="button" aria-label="Previous" onClick={back} style={{ ...tapZone, left: 0, width: '33%' }} />
        <button type="button" aria-label="Next" onClick={advance} style={{ ...tapZone, right: 0, width: '67%' }} />
      </div>

      {group.is_self && (
        <button type="button" onClick={openViewers} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.85)', fontSize: 13, padding: '12px', cursor: 'pointer' }}>
          👁 Seen by — tap to view
        </button>
      )}

      {showViewers && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end' }} onClick={() => { setShowViewers(false); startRef.current = Date.now(); }}>
          <div className="card" style={{ width: '100%', maxWidth: 480, margin: '0 auto', borderRadius: '20px 20px 0 0', padding: 16, maxHeight: '60vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)', margin: '0 0 12px' }}>Seen by {viewers.length}</p>
            {viewers.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No views yet.</p>}
            {viewers.map((v) => (
              <div key={v.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                <Avatar name={v.name} src={v.avatar_url} size={32} />
                <span style={{ fontSize: 13, color: 'var(--navy)', flex: 1 }}>{v.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo(v.viewed_at)}</span>
              </div>
            ))}
            <button className="btn-secondary" style={{ width: '100%', marginTop: 12 }} onClick={() => { setShowViewers(false); startRef.current = Date.now(); }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

const iconBtn = { border: 'none', background: 'none', color: '#fff', cursor: 'pointer', fontSize: 16, padding: 4, lineHeight: 1 };
const tapZone = { position: 'absolute', top: 0, bottom: 0, background: 'transparent', border: 'none', cursor: 'pointer', zIndex: 2 };
