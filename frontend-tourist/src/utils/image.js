// Client-side image downscale → data: URI, for Go Social post/shot/avatar
// uploads. There's no object storage in this environment, so media is stored
// inline as base64 in Postgres (see backend/src/services/social.js). Raw
// phone photos are 3–8 MB; downscaling here keeps rows and payloads sane.

const DEFAULT_MAX_DIM = 1280;
const DEFAULT_QUALITY = 0.82;

export function fileToDownscaledDataUrl(file, { maxDim = DEFAULT_MAX_DIM, quality = DEFAULT_QUALITY } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith('image/')) {
      reject(new Error('Please choose an image file.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That image could not be loaded.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        // Animated GIFs lose animation here — acceptable for v1.
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Deterministic pastel from a name, for initials avatars.
export function colorForName(name) {
  const str = String(name || '?');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 45%, 62%)`;
}

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
