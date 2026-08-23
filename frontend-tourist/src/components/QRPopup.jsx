import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { joinGroup } from '../api/client';

// Script Section 2.2: "Tapping it opens a popup with: top half — a live
// camera scan view; bottom half — their own personal QR code displayed."
//
// TODO (not built in this pass, needs device testing this sandbox can't do):
//   Live camera scanning via a library like html5-qrcode or react-qr-reader.
//   That needs real camera permission handling and a physical device/browser
//   to test against, so it's left as a clearly-marked stub below rather than
//   faked. Manual code entry is a REAL, working fallback in the meantime —
//   POST /api/groups/join already accepts a typed group_code, so joining a
//   group isn't blocked by the missing camera feature.

export default function QRPopup({ qrValue, onClose, onJoinSuccess }) {
  const [manualCode, setManualCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  async function handleManualJoin() {
    if (!manualCode.trim()) return;
    setJoining(true);
    setError('');
    try {
      await joinGroup(manualCode.trim());
      onJoinSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setJoining(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(11, 46, 61, 0.6)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: '100%', maxWidth: 420, borderRadius: '20px 20px 0 0', padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top half — scan someone else's QR */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)', marginBottom: 8 }}>
            Scan a code
          </p>
          <div
            style={{
              background: 'var(--navy)', borderRadius: 12, height: 160,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--lagoon-light)', fontSize: 12, textAlign: 'center', padding: 16,
            }}
          >
            Camera scanning not wired up yet — enter a code below instead.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input
              className="input-field"
              placeholder="Enter group code"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="btn-primary" onClick={handleManualJoin} disabled={joining}>
              {joining ? '…' : 'Join'}
            </button>
          </div>
          {error && <p className="error-text">{error}</p>}
        </div>

        <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0' }} />

        {/* Bottom half — show your own QR */}
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)', marginBottom: 12 }}>
            Your code
          </p>
          {qrValue ? (
            <QRCodeSVG value={qrValue} size={160} fgColor="#0b2e3d" />
          ) : (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              No group yet — start one from your Profile.
            </p>
          )}
        </div>

        <button className="btn-secondary" onClick={onClose} style={{ width: '100%', marginTop: 20 }}>
          Close
        </button>
      </div>
    </div>
  );
}
