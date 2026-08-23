import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getIslandListings } from '../api/client';

const DEFAULT_ISLAND = 'Maafushi';

export default function Home() {
  const [island, setIsland] = useState(DEFAULT_ISLAND);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getIslandListings(island)
      .then((data) => {
        if (!cancelled) setListings(data.listings);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [island]);

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <Header island={island} />

      <div style={{ padding: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>
          What's on {island}
        </p>

        {loading && <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Loading…</p>}
        {error && <p className="error-text">{error}</p>}
        {!loading && !error && listings.length === 0 && <EmptyState island={island} />}

        {listings.map((listing) => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </div>
    </div>
  );
}

function Header({ island }) {
  return (
    <div style={{ background: 'var(--lagoon)', padding: '20px 16px 24px', position: 'relative', overflow: 'hidden' }}>
      {/* Sunny-state line-art behind the logo, per Section 6.2 / 11 —
          swap this SVG based on real weather data once the Section 6.2
          weather feed is wired up (Phase 2). */}
      <svg
        viewBox="0 0 100 100"
        style={{
          position: 'absolute', top: -18, left: -18, width: 100, height: 100,
          opacity: 0.4, animation: 'rays-rotate 40s linear infinite',
          WebkitMaskImage: 'linear-gradient(115deg, black 25%, transparent 65%)',
          maskImage: 'linear-gradient(115deg, black 25%, transparent 65%)',
        }}
        aria-hidden="true"
      >
        <g stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round">
          <circle cx="50" cy="50" r="14" fill="none" />
          <line x1="50" y1="24" x2="50" y2="14" />
          <line x1="24" y1="50" x2="14" y2="50" />
          <line x1="32" y1="32" x2="24" y2="24" />
          <line x1="68" y1="32" x2="76" y2="24" />
        </g>
      </svg>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
        <div>
          <p style={{ color: '#fff', fontWeight: 500, fontSize: 16, margin: '0 0 2px' }}>Atoll Isle</p>
          <p style={{ color: 'var(--lagoon-light)', fontSize: 13, margin: 0 }}>Staying on {island}</p>
        </div>
        <Link to="/profile" style={{ color: '#fff', fontSize: 13, textDecoration: 'none', background: 'rgba(255,255,255,0.15)', padding: '6px 10px', borderRadius: 20 }}>
          Profile
        </Link>
      </div>
    </div>
  );
}

function ListingCard({ listing }) {
  return (
    <Link to={`/listing/${listing.id}`} className="card" style={{ display: 'block', marginBottom: 12, textDecoration: 'none', color: 'inherit' }}>
      <div style={{ padding: '12px 14px' }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', margin: '0 0 2px' }}>
          {listing.title}
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 6px' }}>
          {listing.business_name}
          {listing.verified_badge && <span style={{ color: 'var(--lagoon)' }}> · Verified</span>}
        </p>
        <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--lagoon)', margin: 0 }}>
          ${listing.tourist_price}
        </p>
      </div>
    </Link>
  );
}

function EmptyState({ island }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
      <p style={{ fontSize: 14 }}>No listings on {island} yet — check back soon.</p>
    </div>
  );
}
