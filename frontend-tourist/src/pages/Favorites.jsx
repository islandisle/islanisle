import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyFavorites, removeFavorite } from '../api/client';
import { ListingCard } from './Home';

function getCurrentUser() {
  const raw = localStorage.getItem('atollisle_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Batch 19 — reuses Home.jsx's ListingCard so a favorited listing looks and
// behaves identically wherever it's shown (price/rating/closed badge/star).
export default function Favorites() {
  const navigate = useNavigate();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const user = getCurrentUser();
  const isLocal = user?.type === 'local';

  function load() {
    setLoading(true);
    getMyFavorites()
      .then((data) => setListings(data.listings || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!localStorage.getItem('atollisle_token')) {
      navigate('/login');
      return;
    }
    load();
  }, []);

  function handleUnfavorite(listingId) {
    setListings((prev) => prev.filter((l) => l.id !== listingId));
    removeFavorite(listingId).catch(() => load()); // reconcile on failure
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <button className="btn-secondary" onClick={() => navigate('/')} style={{ marginBottom: 16 }}>
        ← Back
      </button>

      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', marginBottom: 16 }}>
        My favorites
      </h1>

      {loading && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading…</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && listings.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Nothing saved yet — tap the star on any listing to add it here.
        </p>
      )}

      {listings.map((listing) => (
        <ListingCard
          key={listing.id}
          listing={listing}
          isLocal={isLocal}
          isFavorited
          onToggleFavorite={() => handleUnfavorite(listing.id)}
        />
      ))}
    </div>
  );
}
