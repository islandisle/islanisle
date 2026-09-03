import { useState, useRef, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { joinGroup } from '../api/client';
import { useModalA11y } from '../useModalA11y';

// Script Section 2.2: "Tapping it opens a popup with: top half — a live
// camera scan view; bottom half — their own personal QR code displayed."
//
// Camera scanning uses jsQR, lazy-loaded from CDN the same way the SeaFare
// app lazy-loads jsQR — no bundler dependency, no npm install needed, and it
// keeps this component working even if the CDN script takes a moment to
// arrive. Manual code entry stays as a permanent fallback (not just a
// stopgap) for anyone whose camera doesn't work or who'd rather type it.
//
// Batch 20 fix: this popup is reused for two distinct QR values via the
// `qrValue`/`label` props — Profile.jsx's "My QR code" button passes the
// user's own id as a stable personal identity QR (always present,
// regardless of group membership — the bug this fixes is that it used to
// show the group's code here instead, and disappeared entirely for a solo
// user), while a separate "Share group QR" affordance inside the Travel
// group card passes the group's own code for invite-sharing. The top-half
// scan-in stays group-join-only (calls joinGroup on whatever's scanned) —
// that matches the spec's own "e.g. a Group QR" example for what gets
// scanned here, and is unrelated to which QR is being shown below it.

let jsQRPromise = null;
function loadJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  if (jsQRPromise) return jsQRPromise;
  jsQRPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.js';
    script.onload = () => resolve(window.jsQR);
    script.onerror = () => reject(new Error('Could not load QR scanner.'));
    document.head.appendChild(script);
  });
  return jsQRPromise;
}

export default function QRPopup({ qrValue, label = 'Your code', onClose, onJoinSuccess }) {
  const modalRef = useModalA11y(onClose);
  const [manualCode, setManualCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  const [scanState, setScanState] = useState('idle'); // idle | starting | scanning | denied | unsupported
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const hasHandledScanRef = useRef(false);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  async function handleJoinWithCode(code) {
    if (!code || !code.trim()) return;
    setJoining(true);
    setError('');
    try {
      await joinGroup(code.trim());
      onJoinSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setJoining(false);
    }
  }

  const tick = useCallback((jsQR) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(() => tick(jsQR));
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    });

    if (code && code.data && !hasHandledScanRef.current) {
      hasHandledScanRef.current = true;
      stopCamera();
      setScanState('idle');
      handleJoinWithCode(code.data);
      return;
    }
    rafRef.current = requestAnimationFrame(() => tick(jsQR));
  }, [stopCamera]);

  async function startScanning() {
    setError('');
    hasHandledScanRef.current = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      setScanState('unsupported');
      return;
    }

    setScanState('starting');
    try {
      const jsQR = await loadJsQR();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanState('scanning');
      rafRef.current = requestAnimationFrame(() => tick(jsQR));
    } catch (err) {
      stopCamera();
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setScanState('denied');
      } else {
        setScanState('unsupported');
        setError(err.message || 'Could not start the camera.');
      }
    }
  }

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  return (
    <div
      className="glass-scrim"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(11, 46, 61, 0.6)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="card"
        role="dialog"
        aria-modal="true"
        aria-label="Scan or show a QR code"
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
              background: 'var(--ink)', borderRadius: 12, height: 200,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--lagoon-light)', fontSize: 12, textAlign: 'center',
              padding: 16, position: 'relative', overflow: 'hidden',
            }}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              style={{
                width: '100%', height: '100%', objectFit: 'cover',
                display: scanState === 'scanning' ? 'block' : 'none',
              }}
            />
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {scanState === 'idle' && (
              <button className="btn-secondary" onClick={startScanning} style={{ color: 'var(--navy)' }}>
                Tap to scan with camera
              </button>
            )}
            {scanState === 'starting' && <span>Starting camera…</span>}
            {scanState === 'denied' && (
              <span>
                Camera access was denied. Enable it in your browser settings, or enter the code below.
              </span>
            )}
            {scanState === 'unsupported' && (
              <span>Camera scanning isn't available on this device — enter the code below instead.</span>
            )}
          </div>

          {scanState === 'scanning' && (
            <button
              className="btn-secondary"
              style={{ width: '100%', marginTop: 8 }}
              onClick={() => {
                stopCamera();
                setScanState('idle');
              }}
            >
              Stop scanning
            </button>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input
              className="input-field"
              placeholder="Or enter group code"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              className="btn-primary"
              onClick={() => handleJoinWithCode(manualCode)}
              disabled={joining}
            >
              {joining ? '…' : 'Join'}
            </button>
          </div>
          {error && <p className="error-text">{error}</p>}
        </div>

        <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0' }} />

        {/* Bottom half — show your own QR */}
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)', marginBottom: 12 }}>
            {label}
          </p>
          {qrValue ? (
            <QRCodeSVG value={qrValue} size={160} fgColor="#0b2e3d" />
          ) : (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              No code to show yet.
            </p>
          )}
        </div>

        <button
          className="btn-secondary"
          onClick={() => {
            stopCamera();
            onClose();
          }}
          style={{ width: '100%', marginTop: 20 }}
        >
          Close
        </button>
      </div>
    </div>
  );
}