import { useState, useRef } from 'react';
import { createPost } from '../../api/client';
import { fileToDownscaledDataUrl } from '../../utils/image';
import { useModalA11y } from '../../useModalA11y';

const MAX_IMAGES = 10;

// Bottom-sheet composer: pick 1..10 photos (downscaled client-side), add a
// caption, post. `onPosted(post)` fires with the created post so the feed
// can prepend it without a refetch.
export default function PostComposer({ onClose, onPosted }) {
  const modalRef = useModalA11y(onClose);
  const fileRef = useRef(null);
  const [images, setImages] = useState([]); // data URIs
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function addFiles(e) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setError('');
    setBusy(true);
    try {
      const room = MAX_IMAGES - images.length;
      const next = [];
      for (const file of files.slice(0, room)) {
        next.push(await fileToDownscaledDataUrl(file));
      }
      setImages((prev) => [...prev, ...next]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!images.length) { setError('Add at least one photo.'); return; }
    setBusy(true);
    setError('');
    try {
      const { post } = await createPost({ caption: caption.trim(), images });
      onPosted(post);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="glass-scrim" style={overlay} onClick={onClose}>
      <div
        ref={modalRef}
        className="card"
        role="dialog"
        aria-modal="true"
        aria-label="New post"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 480, borderRadius: '20px 20px 0 0', padding: 16, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)', margin: 0 }}>New post</p>
          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={onClose}>Close</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {images.length > 0 && (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 10 }}>
              {images.map((src, i) => (
                <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
                  <img src={src} alt="" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 10 }} />
                  <button
                    type="button"
                    aria-label={`Remove photo ${i + 1}`}
                    onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                    style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'rgba(11,46,61,0.7)', color: '#fff', fontSize: 12, cursor: 'pointer', lineHeight: 1 }}
                  >×</button>
                </div>
              ))}
            </div>
          )}

          {images.length < MAX_IMAGES && (
            <button
              type="button"
              className="btn-secondary"
              style={{ width: '100%', marginBottom: 12 }}
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? 'Processing…' : images.length ? 'Add more photos' : 'Choose photos'}
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={addFiles} style={{ display: 'none' }} />

          <textarea
            className="input-field"
            placeholder="Write a caption…"
            value={caption}
            maxLength={2200}
            rows={3}
            onChange={(e) => setCaption(e.target.value)}
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>

        {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}

        <button className="btn-primary" style={{ marginTop: 12 }} disabled={busy || !images.length} onClick={submit}>
          {busy ? 'Posting…' : 'Share'}
        </button>
      </div>
    </div>
  );
}

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(11, 46, 61, 0.5)',
  display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200,
};
