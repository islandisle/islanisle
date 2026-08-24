import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getArrivalTransfers } from '../api/client';

function getCurrentUser() {
  const raw = localStorage.getItem('atollisle_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Section 3.1 Arrival Transfers screen — speedboat options from the airport
// to a chosen destination island. Home.jsx's filter pills already surface
// speedboat listings generically, but with no way to search by destination
// or see departure times at a glance; this is the dedicated screen for that.
export default function Transfers() {
  const navigate = useNavigate();
  const [destination, setDestination] = useState('');
  const [searched, setSearched] = useState('');
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const user = getCurrentUser();
  const isLocal = user?.type === 'local';

  function handleSearch(e) {
    e.preventDefault();
    const trimmed = destination.trim();
    if (!trimmed) {
      setError('Enter a destination island.');
      return;
    }
    setLoading(true);
    setError('');
    getArrivalTransfers(trimmed)
      .then((data) => {
        setTransfers(data.transfers || []);
        setSearched(trimmed);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <button className="btn-secondary" onClick={() => navigate('/')} style={{ marginBottom: 16 }}>
        ← Back
      </button>

      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>
        Arrival transfers
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
        Speedboat transfers from the airport to your island.
      </p>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          className="input-field"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="Destination island"
          style={{ flex: 1 }}
        />
        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error && <p className="error-text">{error}</p>}

      {!loading && searched && transfers.length === 0 && !error && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          No speedboat transfers to {searched} yet.
        </p>
      )}

      {transfers.map((transfer) => (
        <TransferCard key={transfer.id} transfer={transfer} isLocal={isLocal} />
      ))}
    </div>
  );
}

function TransferCard({ transfer, isLocal }) {
  const price = isLocal ? transfer.local_price : transfer.tourist_price;
  const fields = transfer.type_specific_fields || {};
  const departureTimes = Array.isArray(fields.departure_times) ? fields.departure_times : [];

  return (
    <Link
      to={`/listing/${transfer.id}`}
      className="card"
      style={{ display: 'block', marginBottom: 12, textDecoration: 'none', color: 'inherit' }}
    >
      <div style={{ padding: '12px 14px' }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', margin: '0 0 2px' }}>
          {transfer.title}
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 6px' }}>
          {transfer.business_name}
          {fields.origin && ` · From ${fields.origin}`}
        </p>
        {departureTimes.length > 0 && (
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 6px' }}>
            Departures: {departureTimes.join(', ')}
            {fields.days_running && ` · ${fields.days_running}`}
          </p>
        )}
        <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--lagoon)', margin: 0 }}>
          ${price}
          {isLocal && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}> local price</span>}
        </p>
      </div>
    </Link>
  );
}
