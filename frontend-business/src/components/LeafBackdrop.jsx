// Batch 30 (addition) — Home-only tropical leaf line-art backdrop.
//
// Original botanical line art in the Horizon Line palette: deep-toned leaf
// silhouettes (--leaf-fill) with lighter interior veining (--leaf-vein),
// clustered along the bottom and corners of the viewport so the centre —
// where the search bar, category tabs and cards live — stays clear. Both
// tokens are ~5-11% alpha and theme-aware (navy-on-aqua in light, mint-on-
// deep in dark), the same readability standard as AmbientBackground.
//
// Each leaf/frond gets its own <g class="leaf-sway"> with per-instance
// timing, amplitude and pivot (CSS custom props), so they drift out of
// unison like wind through foliage. styles/theme.css freezes them to a
// static upright pose under prefers-reduced-motion (explicit rule, same
// pattern as the Batch 30 .sa-scene freeze). Pure SVG + CSS, no raster.

const MONSTERA_BODY =
  'M60 126 Q 36 128 14 112 Q 26 108 44 100 Q 22 96 8 86 Q 24 84 44 78 ' +
  'Q 20 72 10 60 Q 26 60 46 56 Q 24 48 16 36 Q 30 38 48 38 Q 34 26 30 16 ' +
  'Q 44 16 54 22 Q 56 13 60 10 Q 64 13 66 22 Q 76 16 90 16 Q 86 26 72 38 ' +
  'Q 90 38 104 36 Q 96 48 74 56 Q 94 60 110 60 Q 100 72 76 78 Q 96 84 112 86 ' +
  'Q 98 96 76 100 Q 94 104 106 112 Q 84 128 60 126 Z';

const MONSTERA_VEINS =
  'M60 124 L60 14 M58 104 L22 106 M58 84 L18 84 M57 62 L20 58 M56 44 L26 38 ' +
  'M55 28 L38 20 M62 104 L98 106 M62 84 L104 84 M63 62 L100 58 M64 44 L94 38 ' +
  'M65 28 L82 20 M60 126 C 58 142 57 158 58 178';

const FROND_LINES =
  'M6 54 C 46 48 96 34 160 8 M6 54 C 1 60 -1 68 -1 78 ' +
  'M20 49 L9 34 M20 49 L27 64 M34 45 L21 28 M34 45 L43 61 M50 41 L37 22 M50 41 L60 57 ' +
  'M66 37 L54 16 M66 37 L78 52 M82 32 L72 10 M82 32 L95 46 M98 27 L90 5 M98 27 L112 39 ' +
  'M114 21 L108 1 M114 21 L128 31 M130 16 L127 -2 M130 16 L142 24 M146 10 L145 -6 M146 10 L154 16';

function Monstera() {
  return (
    <g>
      <path className="leaf-fill" d={MONSTERA_BODY} />
      <path className="leaf-vein" d={MONSTERA_VEINS} />
      <ellipse className="leaf-vein" cx="42" cy="72" rx="3.5" ry="8" transform="rotate(-30 42 72)" />
      <ellipse className="leaf-vein" cx="80" cy="74" rx="3.5" ry="8" transform="rotate(30 80 74)" />
      <ellipse className="leaf-vein" cx="50" cy="48" rx="3" ry="6" transform="rotate(-38 50 48)" />
    </g>
  );
}

function Frond() {
  return <path className="leaf-vein" d={FROND_LINES} />;
}

function Flower() {
  return (
    <g>
      <path className="leaf-vein" d="M35 112 C 34 88 34 62 35 40" />
      <path className="leaf-vein" d="M35 74 C 24 72 15 77 10 87 M35 66 C 30 58 30 50 34 44 M35 82 C 46 80 55 85 60 95" />
      {[0, 72, 144, 216, 288].map((a) => (
        <path
          key={a}
          className="leaf-petal"
          d="M35 36 C 29 24 29 10 35 1 C 41 10 41 24 35 36 Z"
          transform={`rotate(${a} 35 36)`}
        />
      ))}
      <circle className="leaf-vein" cx="35" cy="36" r="3.5" />
    </g>
  );
}

function SwayLeaf({ origin = '50% 100%', dur = '9s', delay = '0s', a = '-1.6deg', b = '2.2deg', skew = '0.5deg', transform, children }) {
  return (
    <g
      className="leaf-sway"
      style={{
        '--sway-origin': origin,
        '--sway-dur': dur,
        '--sway-delay': delay,
        '--sway-a': a,
        '--sway-b': b,
        '--sway-skew': skew,
      }}
    >
      <g transform={transform}>{children}</g>
    </g>
  );
}

export function LeafBackdrop() {
  return (
    <div className="leaf-backdrop" aria-hidden="true">
      <svg className="leaf-cluster leaf-cluster--bl" viewBox="0 0 320 280" shapeRendering="geometricPrecision">
        <SwayLeaf origin="26% 94%" dur="12s" delay="-2s" a="-1.3deg" b="1.9deg" transform="translate(10 96) rotate(-7) scale(1.55)">
          <Monstera />
        </SwayLeaf>
        <SwayLeaf origin="6% 96%" dur="9.5s" delay="-5s" a="-2.1deg" b="1.3deg" skew="0.8deg" transform="translate(-24 250) rotate(-28) scale(1.7)">
          <Frond />
        </SwayLeaf>
        <SwayLeaf origin="50% 100%" dur="7.5s" delay="-1s" a="-2.8deg" b="2.6deg" transform="translate(150 120) rotate(10) scale(0.95)">
          <Flower />
        </SwayLeaf>
      </svg>

      <svg className="leaf-cluster leaf-cluster--br" viewBox="0 0 340 300" shapeRendering="geometricPrecision">
        <SwayLeaf origin="30% 92%" dur="13s" delay="-3s" a="-1.1deg" b="1.7deg" transform="translate(30 74) rotate(-4) scale(1.8)">
          <Monstera />
        </SwayLeaf>
        <SwayLeaf origin="60% 96%" dur="10.5s" delay="-1.5s" a="-1.8deg" b="1.5deg" transform="translate(128 156) rotate(14) scale(1.1)">
          <Monstera />
        </SwayLeaf>
        <SwayLeaf origin="4% 98%" dur="8.5s" delay="-6s" skew="0.9deg" a="-2.4deg" b="1.6deg" transform="translate(-30 286) rotate(-32) scale(1.9)">
          <Frond />
        </SwayLeaf>
      </svg>

      <svg className="leaf-cluster leaf-cluster--tr" viewBox="0 0 260 220" shapeRendering="geometricPrecision">
        <SwayLeaf origin="10% 90%" dur="11s" delay="-2.5s" a="-1.6deg" b="1.4deg" transform="translate(0 44) rotate(-18) scale(1.5)">
          <Frond />
        </SwayLeaf>
        <SwayLeaf origin="60% 94%" dur="9s" delay="-4.5s" a="-2deg" b="2deg" transform="translate(120 32) rotate(8) scale(0.85)">
          <Monstera />
        </SwayLeaf>
      </svg>
    </div>
  );
}
