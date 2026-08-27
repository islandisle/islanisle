// Batch 27 — themed line-art banners for the browse/category sections,
// extending the weather line-art treatment (thin single-colour stroke on a
// solid brand background, fading from a corner toward the middle — see
// Home.jsx's WeatherIcon) to the five business types. Same style, same
// technique (a linear-gradient mask fades the motif), so the app reads as
// one system rather than five unrelated graphics. Colours come only from
// the Horizon Line tokens (--lagoon / --sand / --coral / --navy).

const MOTIFS = {
  // Palm frond — guesthouses / stays
  guesthouse: (
    <g stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" fill="none">
      <path d="M50 92 C 49 66, 49 40, 55 12" />
      <path d="M52 30 C 40 24, 32 26, 26 34" />
      <path d="M52 30 C 62 22, 72 22, 80 28" />
      <path d="M51 46 C 41 42, 33 44, 27 52" />
      <path d="M51 46 C 61 40, 70 40, 78 46" />
      <path d="M50 62 C 42 60, 36 62, 31 69" />
      <path d="M50 62 C 58 58, 66 58, 73 63" />
    </g>
  ),
  // Fork + a plate wave — restaurants / cafés
  restaurant: (
    <g stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" fill="none">
      <path d="M38 14 v20 M45 14 v20 M52 14 v20" />
      <path d="M38 34 c 0 8 14 8 14 0" />
      <path d="M45 34 v52" />
      <path d="M14 74 q 12 -8 24 0 t 24 0 t 24 0" />
    </g>
  ),
  // Snorkel mask + tube — excursions / activities
  excursion: (
    <g stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" fill="none">
      <rect x="26" y="30" width="46" height="28" rx="11" />
      <path d="M26 40 H12" />
      <path d="M72 36 c 12 0 14 9 14 18 v20" />
      <path d="M40 44 h18" />
    </g>
  ),
  // Speedboat hull + wake — speedboat / ferry
  speedboat: (
    <g stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M16 50 h52 l-10 16 h-32 z" />
      <path d="M40 50 v-12 h11 l5 12" />
      <path d="M10 74 q 12 -5 22 0 M38 78 q 12 -5 22 0 M66 74 q 10 -5 18 0" />
    </g>
  ),
  // Tote bag + handles — shops
  shop: (
    <g stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M28 38 h44 l7 48 h-58 z" />
      <path d="M40 38 v-6 a10 10 0 0 1 20 0 v6" />
      <path d="M35 52 h6" />
    </g>
  ),
};

const LABELS = {
  guesthouse: 'Places to stay',
  restaurant: 'Places to eat',
  excursion: 'Excursions & activities',
  speedboat: 'Boats & ferries',
  shop: 'Shops',
};

// A full-width rounded banner. `type` picks the motif + a default label;
// `title` / `subtitle` override the text.
export function SectionArt({ type, title, subtitle, compact = false }) {
  const motif = MOTIFS[type];
  if (!motif) return null;
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
      <svg
        viewBox="0 0 100 100"
        aria-hidden="true"
        style={{
          position: 'absolute', top: -6, right: -8, width: compact ? 84 : 112, height: compact ? 84 : 112,
          opacity: 0.4,
          WebkitMaskImage: 'linear-gradient(245deg, black 20%, transparent 70%)',
          maskImage: 'linear-gradient(245deg, black 20%, transparent 70%)',
        }}
      >
        {motif}
      </svg>
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

export { MOTIFS as SECTION_MOTIFS, LABELS as SECTION_LABELS };
