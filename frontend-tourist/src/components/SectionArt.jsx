// Batch 27 / 30 — themed line-art banners for the browse/category sections.
// Extends the weather line-art treatment (thin single-colour stroke on a
// solid brand background, fading from a corner via a gradient mask, subtle
// internal motion — see Home.jsx's WeatherIcon) to the five business types.
//
// Batch 30: each category is now a set of five hand-drawn-style scenes that
// crossfade continuously, each with its own gentle internal motion. Pure
// SVG + CSS animation (keyframes in styles/theme.css) — no canvas, no
// video, nothing heavy. Under prefers-reduced-motion the rotation and the
// internal motion both stop and the first scene is shown statically (see
// the .sa-scene rule in theme.css).
//
// Colours are only the Horizon Line tokens (--lagoon background, white
// stroke); the mask fade and layout match Batch 27's static version, so
// the API (type / title / subtitle / compact) is unchanged for callers.

const SECONDS_PER_SCENE = 5;

// Reusable motion — applied to a sub-<g> within a scene. transformBox /
// transformOrigin so rotate/translate act about the art's own centre.
const M = {
  bob: { animation: 'soft-bob 3.4s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: 'center' },
  bobFast: { animation: 'soft-bob 1.8s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: 'center' },
  sway: { animation: 'soft-sway 4s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: 'top center' },
  drift: { animation: 'drift-x 5s ease-in-out infinite' },
  driftSlow: { animation: 'drift-x 7s ease-in-out infinite' },
};

const stroke = { stroke: '#ffffff', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' };

// --- EXCURSIONS -----------------------------------------------------------
const EXCURSION_SCENES = [
  // surfer on a wave
  <g {...stroke} key="surf">
    <path d="M6 68 q 16 -18 32 -10 q 14 6 26 -2 q 12 -8 30 -4" style={M.drift} />
    <g style={M.bob}>
      <path d="M40 58 q 10 -3 18 -1" />
      <circle cx="46" cy="38" r="4" />
      <path d="M46 42 v9 l-6 8 M46 51 l7 7 M46 45 l-8 2 M46 45 l9 -3" />
    </g>
  </g>,
  // snorkeler underwater
  <g {...stroke} key="snorkel">
    <path d="M22 52 q 15 -5 32 0" />
    <circle cx="20" cy="50" r="4.5" />
    <path d="M16 49 h8 M23 46 q 3 -8 8 -7 v-6" />
    <path d="M34 51 q 7 7 13 3" />
    <path d="M54 52 l10 -4 M54 52 l9 6" />
    <circle cx="30" cy="40" r="1.6" style={{ animation: 'bubble-rise 2.6s ease-in infinite' }} />
    <circle cx="36" cy="37" r="1.3" style={{ animation: 'bubble-rise 2.6s ease-in infinite 1.1s' }} />
  </g>,
  // scuba diver descending
  <g {...stroke} key="dive">
    <g style={M.bob}>
      <path d="M34 34 l14 22" />
      <circle cx="32" cy="30" r="4" />
      <path d="M29 33 l7 -3 l4 7 l-7 3 z" />
      <path d="M40 42 l-9 4 M40 42 l8 -4" />
      <path d="M48 56 l11 3 M48 56 l4 11" />
    </g>
    <circle cx="30" cy="24" r="1.5" style={{ animation: 'bubble-rise 2.8s ease-in infinite' }} />
    <circle cx="34" cy="20" r="1.2" style={{ animation: 'bubble-rise 2.8s ease-in infinite 1.3s' }} />
  </g>,
  // kayaker
  <g {...stroke} key="kayak">
    <g style={M.bob}>
      <path d="M16 60 q 32 14 64 0 q -32 -10 -64 0 z" />
      <circle cx="48" cy="46" r="4" />
      <path d="M48 50 v9" />
      <path d="M30 40 l36 14" style={{ animation: 'soft-sway 2.2s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: 'center' }} />
    </g>
    <path d="M6 72 q 12 -4 24 0 M62 74 q 12 -4 24 0" style={M.driftSlow} />
  </g>,
  // jet-ski
  <g {...stroke} key="jetski">
    <g style={M.bobFast}>
      <path d="M16 58 q 22 -14 48 -6 l 6 10 q -26 8 -54 -4 z" />
      <path d="M40 46 l6 -6 h7" />
      <circle cx="47" cy="37" r="4" />
      <path d="M47 41 q 7 4 13 2" />
    </g>
    <path d="M14 60 q -9 2 -11 9 M18 65 q -9 4 -7 11" style={M.drift} />
    <path d="M6 76 q 14 -5 28 0 t 28 0" style={M.driftSlow} />
  </g>,
];

// --- GUESTHOUSES ---------------------------------------------------------
const GUESTHOUSE_SCENES = [
  // beachfront bungalow on stilts
  <g {...stroke} key="bungalow">
    <path d="M26 44 l24 -16 l24 16 M22 44 h56" />
    <path d="M34 44 v16 M66 44 v16 M34 60 h32" />
    <path d="M46 60 v-10 h8 v10" />
    <path d="M38 60 v15 M62 60 v15" />
    <path d="M8 80 q 14 -4 28 0 t 28 0 t 28 0" style={M.drift} />
  </g>,
  // hammock between palms
  <g {...stroke} key="hammock">
    <path d="M22 84 q -5 -30 4 -54 M78 84 q 7 -30 -3 -54" />
    <path d="M26 30 q -11 -6 -17 -1 M26 30 q 11 -6 19 -1 M75 30 q -11 -6 -19 -1 M75 30 q 11 -6 17 -1" />
    <path d="M27 40 q 23 30 47 -2" style={{ animation: 'soft-sway 5s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: 'center top' }} />
  </g>,
  // tropical palm frond (the Batch 27 motif) — gently swaying
  <g {...stroke} key="frond" style={M.sway}>
    <path d="M50 92 C 49 66, 49 40, 55 12" />
    <path d="M52 30 C 40 24, 32 26, 26 34 M52 30 C 62 22, 72 22, 80 28" />
    <path d="M51 46 C 41 42, 33 44, 27 52 M51 46 C 61 40, 70 40, 78 46" />
    <path d="M50 62 C 42 60, 36 62, 31 69 M50 62 C 58 58, 66 58, 73 63" />
  </g>,
  // sunset over water
  <g {...stroke} key="sunset">
    <path d="M32 60 a18 18 0 0 1 36 0" />
    <path d="M50 32 v-8 M30 44 l-6 -5 M70 44 l6 -5 M20 60 h-8 M80 60 h8" style={{ animation: 'soft-bob 4s ease-in-out infinite' }} />
    <path d="M12 60 h76" />
    <path d="M38 66 h24 M34 72 h32 M40 78 h20" style={M.drift} />
  </g>,
  // traditional Maldivian dhoni near shore
  <g {...stroke} key="dhoni">
    <g style={M.bob}>
      <path d="M18 62 q 4 8 20 8 h 30 q 14 0 18 -8 q -6 -4 -18 -4 h-30 q -12 0 -20 4 z" />
      <path d="M18 62 q -7 -14 -2 -25" />
      <path d="M52 62 v-30 q 12 6 8 24 l-8 -2" />
    </g>
    <path d="M8 78 q 14 -4 28 0 t 28 0 t 28 0" style={M.drift} />
  </g>,
];

// --- RESTAURANTS -------------------------------------------------------
const RESTAURANT_SCENES = [
  // fork + plate wave (the Batch 27 motif)
  <g {...stroke} key="fork">
    <path d="M38 14 v20 M45 14 v20 M52 14 v20 M38 34 c 0 8 14 8 14 0 M45 34 v52" />
    <path d="M14 74 q 12 -8 24 0 t 24 0 t 24 0" style={M.drift} />
  </g>,
  // tropical fruit platter
  <g {...stroke} key="fruit">
    <path d="M24 54 h52 M26 54 q 24 20 48 0" />
    <circle cx="38" cy="48" r="6" />
    <circle cx="51" cy="45" r="7" />
    <circle cx="63" cy="49" r="5" />
    <path d="M51 38 l-3 -8 M51 38 l0 -9 M51 38 l3 -8" style={M.bob} />
  </g>,
  // beachside dining table
  <g {...stroke} key="table">
    <path d="M30 56 h40 M36 56 v14 M64 56 v14" />
    <circle cx="42" cy="53" r="4" />
    <circle cx="58" cy="53" r="4" />
    <path d="M20 72 q -3 -24 2 -34 M22 38 q -9 -5 -15 -1 M22 38 q 9 -5 15 -1" style={M.sway} />
    <path d="M8 74 h84" style={M.drift} />
  </g>,
  // chef cooking
  <g {...stroke} key="chef">
    <path d="M40 26 q -2 -9 7 -9 q 4 -6 8 0 q 9 0 7 9 z M40 26 h21 v4 h-21 z" />
    <circle cx="50" cy="37" r="5" />
    <path d="M50 42 v13 M50 46 l-8 4 M50 46 l10 3" />
    <g style={{ animation: 'soft-bob 1.5s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: '60px 48px' }}>
      <path d="M60 48 h12 M72 48 l8 -1" />
      <path d="M64 45 q 3 -8 8 -4" />
    </g>
  </g>,
  // coconut drink
  <g {...stroke} key="drink">
    <circle cx="48" cy="56" r="16" />
    <path d="M40 50 q 8 6 16 0" />
    <path d="M52 44 l6 -18" />
    <path d="M58 26 q -8 -8 -16 0 z M50 26 v-4" style={M.bob} />
    <path d="M30 52 q -8 -6 -6 -14 q 8 2 6 14" style={M.sway} />
  </g>,
];

// --- SPEEDBOAT / FERRY -----------------------------------------------
const SPEEDBOAT_SCENES = [
  // hull + wake (the Batch 27 motif)
  <g {...stroke} key="boat">
    <g style={M.bob}>
      <path d="M16 50 h52 l-10 16 h-32 z" />
      <path d="M40 50 v-12 h11 l5 12" />
    </g>
    <path d="M10 74 q 12 -5 22 0 M38 78 q 12 -5 22 0 M66 74 q 10 -5 18 0" style={M.drift} />
  </g>,
  // boat carving a wide wake
  <g {...stroke} key="wake">
    <g style={M.bobFast}>
      <path d="M60 32 h20 l-5 9 h-13 z" />
      <path d="M70 32 v-6 h6 l3 6" />
    </g>
    <path d="M62 42 q -32 6 -56 28 M70 42 q -22 14 -36 36 M58 44 q -36 2 -50 20" style={M.drift} />
  </g>,
  // jetty / dock
  <g {...stroke} key="jetty">
    <path d="M20 74 l24 -20 h20 l16 20 z" />
    <path d="M24 70 v11 M44 54 v9 M64 54 v9 M76 70 v11" />
    <path d="M30 78 h16 l-3 7 h-10 z" style={M.bob} />
    <path d="M8 86 h84" style={M.drift} />
  </g>,
  // island-hopping route
  <g {...stroke} key="route">
    <path d="M14 66 q 8 -13 18 0 M68 66 q 9 -14 18 0 M23 60 v-5 M77 60 v-5" />
    <path d="M22 62 q 28 -28 56 4" strokeDasharray="1 6" style={{ animation: 'route-dash 3.5s linear infinite' }} />
    <circle cx="50" cy="50" r="2.6" style={{ animation: 'soft-bob 2.4s ease-in-out infinite' }} />
  </g>,
  // sunset departure
  <g {...stroke} key="sunboat">
    <circle cx="70" cy="40" r="10" />
    <path d="M8 52 h84" />
    <g style={M.bob}>
      <path d="M20 58 h24 l-4 9 h-16 z" />
      <path d="M30 58 v-8 h8 l3 8" />
    </g>
    <path d="M62 52 h14 M58 58 h24 M54 64 h30" style={M.drift} />
  </g>,
];

// --- SHOPS ------------------------------------------------------------
const SHOP_SCENES = [
  // tote bag (the Batch 27 motif)
  <g {...stroke} key="tote">
    <path d="M28 38 h44 l7 48 h-58 z" />
    <path d="M40 38 v-6 a10 10 0 0 1 20 0 v6" />
    <path d="M35 52 h6" />
  </g>,
  // local craft / lacquer box
  <g {...stroke} key="craft">
    <path d="M28 46 h44 v30 h-44 z M26 46 l6 -9 h36 l6 9" />
    <path d="M38 58 q 6 -8 12 0 q 6 8 12 0 M34 68 h32" style={M.driftSlow} />
  </g>,
  // market stall
  <g {...stroke} key="stall">
    <path d="M18 40 q 6 8 12 0 q 6 8 12 0 q 6 8 12 0 q 6 8 12 0 q 6 8 12 0" />
    <path d="M16 40 h68 M20 40 v-6 M80 40 v-6" />
    <path d="M22 58 h56 M28 58 v14 M72 58 v14" />
    <circle cx="36" cy="53" r="4" />
    <circle cx="50" cy="53" r="4" />
    <circle cx="64" cy="53" r="4" />
    <path d="M40 40 v7" style={M.sway} />
  </g>,
  // wrapped gift
  <g {...stroke} key="gift">
    <path d="M30 48 h40 v30 h-40 z M50 48 v30 M30 62 h40" />
    <path d="M50 48 q -10 -10 -14 0 q 6 4 14 0 M50 48 q 10 -10 14 0 q -6 4 -14 0" style={M.bob} />
  </g>,
  // local produce basket
  <g {...stroke} key="basket">
    <path d="M22 54 h56 M26 54 q 24 24 48 0" />
    <path d="M30 60 h40 M34 68 h32" />
    <circle cx="38" cy="50" r="5" />
    <circle cx="50" cy="46" r="6" />
    <circle cx="62" cy="50" r="5" />
    <path d="M50 40 q 8 -8 16 -4 q -4 8 -16 4" style={M.sway} />
  </g>,
];

const SCENES = {
  excursion: EXCURSION_SCENES,
  guesthouse: GUESTHOUSE_SCENES,
  restaurant: RESTAURANT_SCENES,
  speedboat: SPEEDBOAT_SCENES,
  shop: SHOP_SCENES,
};

const LABELS = {
  guesthouse: 'Places to stay',
  restaurant: 'Places to eat',
  excursion: 'Excursions & activities',
  speedboat: 'Boats & ferries',
  shop: 'Shops',
};

// A full-width rounded banner. `type` picks the scene set + a default
// label; `title` / `subtitle` override the text.
export function SectionArt({ type, title, subtitle, compact = false }) {
  const scenes = SCENES[type];
  if (!scenes) return null;
  const total = scenes.length * SECONDS_PER_SCENE;
  const artSize = compact ? 88 : 116;

  return (
    <div
      style={{
        position: 'relative', overflow: 'hidden',
        background: 'var(--lagoon)', color: '#fff',
        borderRadius: 'var(--radius-md, 12px)',
        padding: compact ? '14px 16px' : '20px 16px',
        marginBottom: 14,
        minHeight: compact ? 56 : 84,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', top: -6, right: -8, width: artSize, height: artSize,
          opacity: 0.4,
          WebkitMaskImage: 'linear-gradient(245deg, black 20%, transparent 70%)',
          maskImage: 'linear-gradient(245deg, black 20%, transparent 70%)',
        }}
      >
        {scenes.map((scene, i) => (
          <svg
            key={i}
            className="sa-scene"
            viewBox="0 0 100 100"
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              opacity: 0,
              animation: `scene-rotate ${total}s linear infinite`,
              animationDelay: `-${(scenes.length - i) * SECONDS_PER_SCENE}s`,
            }}
          >
            {scene}
          </svg>
        ))}
      </div>

      <p style={{ position: 'relative', margin: 0, fontSize: compact ? 14 : 16, fontWeight: 600 }}>
        {title || LABELS[type]}
      </p>
      {subtitle && (
        <p style={{ position: 'relative', margin: '2px 0 0', fontSize: 12.5, color: 'var(--lagoon-light)' }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

export { SCENES as SECTION_SCENES, LABELS as SECTION_LABELS };
