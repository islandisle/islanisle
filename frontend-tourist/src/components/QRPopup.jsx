import { useState, useRef, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { joinGroup } from '../api/client';

// Script Section 2.2: "Tapping it opens a popup with: top half — a live
// camera scan view; bottom half — their own personal QR code displayed."
//
// Camera scanning uses jsQR, lazy-loaded from CDN the same way the SeaFare
// app lazy-loads jsQR — no bundler dependency, no npm install needed, and it
// keeps this component working even if the CDN script takes a moment to
// arrive. Manual code entry stays as a permanent fallback (not just a
// stopgap) for anyone whose camera doesn't work or who'd rather type it.

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

export default function QRPopup({ qrValue, onClose, onJoinSuccess }) {
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
    return () =>