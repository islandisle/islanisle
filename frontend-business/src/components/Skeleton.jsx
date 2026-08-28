// Batch 35 — shared skeleton placeholders for list loading states (the
// dashboard's incoming bookings / orders lists). Styling + the
// reduced-motion freeze live in styles/theme.css's .skeleton rule.

export function SkeletonLine({ width = '100%', height = 12, style }) {
  return <div className="skeleton" style={{ width, height, ...style }} aria-hidden="true" />;
}

export function SkeletonCard() {
  return (
    <div className="card" style={{ padding: 12, marginBottom: 8 }} aria-hidden="true">
      <SkeletonLine width="55%" height={13} style={{ marginBottom: 8 }} />
      <SkeletonLine width="35%" height={11} style={{ marginBottom: 6 }} />
      <SkeletonLine width="70%" height={11} />
    </div>
  );
}

export function SkeletonList({ count = 3 }) {
  return (
    <div role="status" aria-label="Loading…" aria-live="polite">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
