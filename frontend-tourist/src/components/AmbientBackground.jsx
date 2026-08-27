// Batch 30 Part B — a full-page ambient line-art pattern behind all content,
// matched to the currently selected category. Same line-art language as the
// SectionArt banners and the weather icons, but rendered as a barely-there
// repeating pattern (see --ambient-line in styles/theme.css — ~6% opacity,
// theme-aware) that drifts very slowly, far below the banner's pace, so it
// never competes with the search bar, filter pills, cards or any text.
//
// One fixed, pointer-events:none layer at z-index -1: an oversized inline
// <svg> whose <pattern> tiles a small motif, GPU-composited by a single
// transform animation (no per-frame repaint, no canvas, no image). Under
// prefers-reduced-motion the global rule freezes the drift; because the
// motion is exactly one tile it lands identically to the start, so the
// fallback is just the same static pattern.

const TILE = 140;

const line = { className: 'ambient-line' };

// Ocean waves — the "All" default and a base layer several motifs reuse.
const WAVES = (
  <>
    <path {...line} d="M-12 34 q 18 -12 36 0 t 36 0 t 36 0 t 36 0 t 20 0" />
    <path {...line} d="M-12 78 q 18 -12 36 0 t 36 0 t 36 0 t 36 0 t 20 0" />
    <path {...line} d="M-12 122 q 18 -12 36 0 t 36 0 t 36 0 t 36 0 t 20 0" />
  </>
);

const AMBIENT_MOTIFS = {
  all: WAVES,

  // waves + a surfboard / fin hint
  excursion: (
    <>
      <path {...line} d="M-12 40 q 18 -11 36 0 t 36 0 t 36 0 t 36 0 t 20 0" />
      <path {...line} d="M-12 104 q 18 -11 36 0 t 36 0 t 36 0 t 36 0 t 20 0" />
      <path {...line} d="M96 20 q 10 -3 18 -1" />
      <path {...line} d="M34 74 l7 12 l-9 1 z" />
    </>
  ),

  // a small palm frond + a couple of drifting wave lines
  guesthouse: (
    <>
      <g {...line}>
        <path d="M40 74 C 39 56, 39 40, 44 22" />
        <path d="M42 34 C 33 30, 27 31, 22 37 M42 34 C 51 28, 58 28, 64 33" />
        <path d="M41 48 C 33 45, 27 46, 22 52 M41 48 C 49 43, 56 43, 62 48" />
      </g>
      <path {...line} d="M-12 108 q 18 -11 36 0 t 36 0 t 36 0 t 36 0 t 20 0" />
      <path {...line} d="M74 96 q 12 -8 24 0 t 24 0" />
    </>
  ),

  // fork + a leaf + a couple of "fruit" dots
  restaurant: (
    <>
      <path {...line} d="M28 20 v16 M34 20 v16 M40 20 v16 M28 36 c 0 6 12 6 12 0 M34 36 v40" />
      <path {...line} d="M92 40 q 8 -10 18 -8 q -2 10 -18 8" />
      <circle {...line} cx="100" cy="96" r="6" />
      <circle {...line} cx="112" cy="90" r="5" />
      <path {...line} d="M-12 120 q 18 -10 36 0 t 36 0 t 36 0 t 36 0" />
    </>
  ),

  // boat wake — nested chevrons + a wave
  speedboat: (
    <>
      <path {...line} d="M18 34 l16 12 l-16 12 M36 34 l16 12 l-16 12 M54 34 l16 12 l-16 12" />
      <path {...line} d="M-12 96 q 18 -11 36 0 t 36 0 t 36 0 t 36 0 t 20 0" />
      <path {...line} d="M90 100 q 12 -6 22 0 t 22 0" />
    </>
  ),

  // market motif — scalloped awning + a basket curve + a tag
  shop: (
    <>
      <path {...line} d="M14 30 q 6 8 12 0 q 6 8 12 0 q 6 8 12 0 q 6 8 12 0" />
      <path {...line} d="M12 30 h50" />
      <path {...line} d="M88 78 h34 M90 78 q 15 16 30 0" />
      <path {...line} d="M40 96 h12 v12 h-12 z" />
      <path {...line} d="M-12 124 q 18 -10 36 0 t 36 0 t 36 0 t 36 0" />
    </>
  ),
};

export function AmbientBackground({ type }) {
  const key = AMBIENT_MOTIFS[type] ? type : 'all';
  const patternId = `ambient-${key}`;

  return (
    <div className="ambient-bg" aria-hidden="true">
      <svg className="ambient-bg-svg" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id={patternId} x="0" y="0" width={TILE} height={TILE} patternUnits="userSpaceOnUse">
            {AMBIENT_MOTIFS[key]}
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
    </div>
  );
}
