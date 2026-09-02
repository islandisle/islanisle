import { useState } from 'react';
import { createStory } from '../../api/client';
import { useModalA11y } from '../../useModalA11y';

// Shown after picking a photo for a story: preview + optional text overlay
// + share. (A modal rather than window.prompt.)
export default function StoryComposer({ image, onClose, onPosted }) {
  const modalRef = useModalA11y(onClose);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function share() {
    setBusy(true);
    setError('');
    try {
      await createStory({ image, caption: caption.trim() || undefined });
      onPosted();
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="New story"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 420, background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: 16 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)', margin: 0 }}>New story</p>
          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={onClose}>Close</button>
        </div>

        <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#000', marginBottom: 12 }}>
          <img src={image} alt="Story preview" style={{ width: '100%', maxHeight: 380, objectFit: 'contain', display: 'block' }} />
          {caption && (
            <p style={{ position: 'absolute', left: 0, right: 0, bottom: 24, textAlign: 'center', color: '#fff', fontSize: 18, fontWeight: 600, textShadow: '0 2px 8px rgba(0,0,0,0.6)', padding: '0 16px', margin: 0 }}>
              {caption}
            </p>
          )}
        </div>

        <input
          className="input-field"
          placeholder="Add text (optional)"
          value={caption}
          maxLength={250}
          onChange={(e) => setCaption(e.target.value)}
          style={{ width: '100%', marginBottom: 12 }}
        />

        {error && <p className="error-text" style={{ marginBottom: 8 }}>{error}</p>}

        <button className="btn-primary" style={{ width: '100%' }} disabled={busy} onClick={share}>
          {busy ? 'Sharing…' : 'Share to story'}
        </button>
      </div>
    </div>
  );
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(11,46,61,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 };
