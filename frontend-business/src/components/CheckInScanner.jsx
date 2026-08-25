import { useState, useRef, useEffect, useCallback } from 'react';

// Reuses frontend-tourist's QRPopup.jsx pattern: lazy-load jsQR from CDN (no
// bundler dependency) rather than npm-installing it, and keep a live camera
// scan loop over a hidden canvas. The guest's "personal QR" scanned here is
// their booking id — QRCodeSVG value={booking.id} on the tourist side.
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

// onScan(code) is called once per successful scan — the caller decides
// whether the code is valid (matches the expected booking) and can call
// reset() to let this box scan again after a rejected code.
export default function CheckInScanner({ onScan }) {
  const [scanState, setScanState] = useState('idle'); // idle | starting | scanning | denied | unsupported
  const [error, setError] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const pausedRef = useRef(false);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const tick = useCallback((jsQR) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (pausedRef.current || !video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
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

    if (code && code.data) {
      pausedRef.current = true;
      onScan(code.data, () => {
        pausedRef.current = false;
      });
    }
    rafRef.current = requestAnimationFrame(() => tick(jsQR));
  }, [onScan]);

  async function startScanning() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setScanState('unsupported');
      return;
    }
    setScanState('starting');
    try {
      const jsQR = await loadJsQR();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
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

  useEffect(() => () => stopCamera(), [stopCamera]);

  return (
    <div
      style={{
        background: 'var(--ink)', borderRadius: 12, height: 180,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--lagoon-light)', fontSize: 12, textAlign: 'center',
        padding: 16, position: 'relative', overflow: 'hidden', marginBottom: 8,
      }}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: scanState === 'scanning' ? 'block' : 'none' }}
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {scanState === 'idle' && (
        <button className="btn-secondary" onClick={startScanning} style={{ color: 'var(--navy)' }}>
          Tap to scan guest's QR code
        </button>
      )}
      {scanState === 'starting' && <span>Starting camera…</span>}
      {scanState === 'denied' && (
        <span>Camera access was denied. Enable it in your browser settings, or use manual check-in.</span>
      )}
      {scanState === 'unsupported' && (
        <span>{error || "Camera scanning isn't available on this device — use manual check-in instead."}</span>
      )}
    </div>
  );
}
