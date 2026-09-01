import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { getArrivalTransfers, getIslandTransfers } from '../api/client';
import IslandPicker from '../components/IslandPicker';
import { formatPrice } from '../utils/currency';

function getCurrentUser() {
  const raw = localStorage.getItem('atollisle_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Section 3.1/3.2 Transfers screens, merged into one place with a mode
// switch: "From the airport" (destination only — every arrival starts at
// Malé/Velana) and "Island to island" (origin + destination — for a
// tourist already on the ground who wants to hop somewhere else).
// Arriving from Home with a `from` query param pre-fills the island-to-
// island origin with wherever the tourist is currently browsing, since
// they shouldn't have to re-type where they already are.
export default function Transfers() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefillOrigin = searchParams.get('from') || '';

  const [mode, setMode] = useState(prefillOrigin ? 'island' : 'airport');
  const [origin, setOrigin] = useState(prefillOrigin);
  const [destination, setDestination] = useState('');
  const [searched, setSearched] = useState(null);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const user = getCurrentUser();
  const isLocal = user?.type === 'local';

  function handleSearch(e) {
    e.preventDefault();
    const trimmedDestination = destination.trim();
    if (!trimmedDestination) {
      setError('Enter a destination island.');
      return;
    }
    if (mode === 'island') {
      const trimmedOrigin = origin.trim();
      if (!trimmedOrigin) {
        setError('Enter the island you\u2019re travelling from.');
        return;
      }
      setLoading(true);
      setError('');
      getIslandTransfers(trimmedOrigin, trimmedDestination)
        .then((data) => {
          setTransfers(data.transfers || []);
          setSearched({ origin: trimmedOrigin, destination: trimmedDestination });
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    } else {
      setLoading(true);
      setError('');
      getArrivalTransfers(trimmedDestination)
        .then((data) => {
          setTransfers(data.transfers || []);
          setSearched({ origin: null, destination: trimmedDestination });
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }
  }

  // Switching modes clears stale results from the other mode rather than
  // leaving, say, airport-arrival results on screen while "Island to
  // island" is selected.
  useEffect(() => {
    setTransfers([]);
    setSearched(null);
    setError('');
  }, [mode]);

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <button className="btn-secondary" onClick={() => navigate('/')} style={{ marginBottom: 16 }}>
        ← Back
      </button>

      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>
        Transfers
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
        Verified, well-reviewed speedboat operators shown first — price is only the tie-breaker.
      </p>

      <div
        role="tablist"
        style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 4 }}
      >
        <button
          role="tab"
          aria-selected={mode === 'airport'}
          type="button"
          onClick={() => setMode('airport')}
          style={{
            flex: 1, padding: '8px 10px', borderRadius: 'var(--radius-pill)', border: 'none',
            background: mode === 'airport' ? 'var(--lagoon)' : 'var(--surface)',
            color: mode === 'airport' ? '#fff' : 'var(--text-secondary)',
            fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}
        >
          ✈️ From the airport
        </button>
        <button
          role="tab"
          aria-selected={mode === 'island'}
          type="button"
          onClick={() => setMode('island')}
          style={{
            flex: 1, padding: '8px 10px', borderRadius: 'var(--radius-pill)', border: 'none',
            background: mode === 'island' ? 'var(--lagoon)' : 'var(--surface)',
            color: mode === 'island' ? '#fff' : 'var(--text-secondary)',
            fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}
        >
          🏝️ Island to island
        </button>
      </div>

      <form onSubmit={handleSearch}>
        {mode === 'island' && (
          <div style={{ marginBottom: 10 }}>
            <label htmlFor="transfers-origin" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
              Travelling from
            </label>
            <IslandPicker value={origin} onChange={setOrigin} id="transfers-origin" placeholder="Your current island" />
          </div>
        )}

        <label htmlFor="transfers-destination" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
          {mode === 'island' ? 'Going to' : 'Your destination island'}
        </label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <IslandPicker
              value={destination}
              onChange={setDestination}
              id="transfers-destination"
              placeholder="Destination island"
            />
          </div>
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
      </form>

      {error && <p className="error-text">{error}</p>}

      {!loading && searched && transfers.length === 0 && !error && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          No speedboat transfers to {searched.destination} yet{searched.origin ? ` from ${searched.origin}` : ''}.
        </p>
      )}

      {transfers.map((transfer, index) => (
        <TransferCard key={transfer.id} transfer={transfer} isLocal={isLocal} isTopPick={index === 0} />
      ))}
    </div>
  );
}

function TransferCard({ transfer, isLocal, isTopPick }) {
  const price = isLocal ? transfer.local_price : transfer.tourist_price;
  const fields = transfer.type_specific_fields || {};
  const departureTimes = Array.isArray(fields.departure_times) ? fields.departure_times : [];

  return (
    <Link
      to={`/listing/${transfer.id}`}
      className="card"
      style={{ display: 'block', marginBottom: 12, textDecoration: 'none', color: 'inherit', position: 'relative' }}
    >
      <div style={{ padding: '12px 14px' }}>
        {isTopPick && (
          <span
            style={{
              display: 'inline-block', fontSize: 10, fontWeight: 700, color: '#fff',
              background: 'var(--lagoon)', padding: '2px 8px', borderRadius: 'var(--radius-pill)',
              marginBottom: 6,
            }}
          >
            Top pick — most reliable
          </span>
        )}
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', margin: '0 0 2px' }}>
          {transfer.title}
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 6px' }}>
          {transfer.business_name}
          {transfer.verified_badge && <span style={{ color: 'var(--lagoon)' }}> · Verified</span>}
          {fields.origin && ` · From ${fields.origin}`}
          {transfer.review_count > 0 && (
            <span> · {Number(transfer.average_rating).toFixed(1)} ★ ({transfer.review_count})</span>
          )}
        </p>
        {departureTimes.length > 0 && (
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 6px' }}>
            Departures: {departureTimes.join(', ')}
            {fields.days_running && ` · ${fields.days_running}`}
          </p>
        )}
        <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--lagoon)', margin: 0 }}>
          {formatPrice(price, isLocal)}
          {isLocal && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}> local price</span>}
        </p>
      </div>
    </Link>
  );
}
