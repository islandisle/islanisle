import { useState, useEffect, useRef } from 'react';
import { getShotsFeed } from '../../api/client';
import { fileToDownscaledDataUrl } from '../../utils/image';
import Avatar from './Avatar';
import ShotViewer from './ShotViewer';
import ShotComposer from './ShotComposer';

// The circular shot row at the top of the feed. First bubble is always
// "Your shot" (+add / view own). The rest are friends, unseen first.
export default function ShotBar() {
  const [groups, setGroups] = useState([]);
  const [openAt, setOpenAt] = useState(null); // index into `groups`
  const [posting, setPosting] = useState(false);
  const [draftImage, setDraftImage] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  function load() {
    getShotsFeed().then((d) => setGroups(d.groups)).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  const mine = groups.find((g) => g.is_self) || null;
  const others = groups.filter((g) => !g.is_self);

  async function pickShot(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setPosting(true);
    try {
      setDraftImage(await fileToDownscaledDataUrl(file, { maxDim: 1080 }));
    } catch (err) {
      setError(err.message);
    } finally {
      setPosting(false);
    }
  }

  // The viewer only ever deals with groups that actually have shots.
  const viewable = groups.filter((g) => g.shots.length > 0);

  function openGroup(userId) {
    const idx = viewable.findIndex((g) => g.user_id === userId);
    if (idx >= 0) setOpenAt(idx);
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 14, overflowX: 'auto', padding: '4px 0 14px' }}>
        {/* Your shot — open the viewer if you have one, else the composer. */}
        <button
          type="button"
          onClick={() => ((mine?.shots?.length) ? openGroup(mine.user_id) : fileRef.current?.click())}
          style={bubble}
        >
          <div style={{ position: 'relative' }}>
            <Avatar name={mine?.name || 'You'} src={mine?.avatar_url} size={58} ring={mine?.shots?.length ? 'var(--border)' : undefined} />
            <span style={plus} onClick={(ev) => { ev.stopPropagation(); fileRef.current?.click(); }}>+</span>
          </div>
          <span style={label}>{posting ? '…' : 'Your shot'}</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={pickShot} style={{ display: 'none' }} />

        {others.map((g) => (
          <button key={g.user_id} type="button" onClick={() => openGroup(g.user_id)} style={bubble}>
            <Avatar name={g.name} src={g.avatar_url} size={58} ring={g.has_unseen ? 'var(--coral)' : 'var(--border)'} />
            <span style={label}>{g.name.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      {error && <p className="error-text" style={{ marginBottom: 8 }}>{error}</p>}

      {openAt !== null && viewable[openAt] && (
        <ShotViewer
          groups={viewable}
          startIndex={openAt}
          onClose={() => { setOpenAt(null); load(); }}
          onChanged={load}
        />
      )}

      {draftImage && (
        <ShotComposer
          image={draftImage}
          onClose={() => setDraftImage(null)}
          onPosted={load}
        />
      )}
    </>
  );
}

const bubble = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0, width: 66 };
const label = { fontSize: 11, color: 'var(--text-secondary)', maxWidth: 66, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const plus = { position: 'absolute', right: -2, bottom: -2, width: 20, height: 20, borderRadius: '50%', background: 'var(--lagoon)', color: '#fff', fontSize: 13, lineHeight: '20px', textAlign: 'center', border: '2px solid var(--surface)' };
