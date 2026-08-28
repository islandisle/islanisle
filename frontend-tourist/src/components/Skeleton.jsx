// Batch 35 — shared skeleton placeholders for list loading states (Home
// listing list, MyActivity). Styling + the reduced-motion freeze live in
// styles/theme.css's .skeleton rule.

export function SkeletonLine({ width = '100%', height = 12, style }) {
  return <div className="skeleton" style={{ width, height, ...style }} aria-hidden="true" />;
}

// One card-shaped placeholder roughly matching a ListingCard / booking row.
export function SkeletonCard() {
  return (
    <div className="card" style={{ padding: 12, marginBottom: 8 }} aria-hidden="true">
      <SkeletonLine width="60%" height={14} style={{ marginBottom: 8 }} />
      <SkeletonLine width="40%" height={11} style={{ marginBottom: 6 }} />
      <SkeletonLine width="80%" height={11} />
    </div>
  );
}

export function SkeletonList({ count = 4 }) {
  return (
    <div role="status" aria-label="Loading…" aria-live="polite">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
