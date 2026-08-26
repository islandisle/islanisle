import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchListings } from '../api/client';
import { useLanguage } from '../i18n';

// Batch 19: global search — the existing island picker + type pills only
// ever look at the one island currently selected, so a tourist who knows
// what they want by name ("that dive shop on Maafushi") had no way to jump
// straight to it. Debounced, searches across every island at once.
export default function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);
  const navigate = useNavigate();
  const { t } = useLanguage();

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchListings(query.trim())
        .then((data) => setResults(data.results))
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  function handlePick(listingId) {
    setOpen(false);
    setQuery('');
    setResults(null);
    navigate(`/listing/${listingId}`);
  }

  return (
    <div style={{ position: 'relative', marginBottom: 14 }}>
      <input
        className="input-field"
        placeholder={t('home.search_placeholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-label={t('home.search_placeholder')}
      />
      {open && query.trim() && (
        <div
          className="card"
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
            maxHeight: 320, overflowY: 'auto', zIndex: 50, padding: 6,
          }}
        >
          {results === null && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: 8 }}>{t('common.loading')}</p>
          )}
          {results && results.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: 8 }}>
              {t('home.search_no_results', { query })}
            </p>
          )}
          {results && results.map((r) => (
            <button
              key={r.id}
              type="button"
              onMouseDown={() => handlePick(r.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '8px 6px',
                background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 13, color: 'var(--navy)', fontWeight: 500 }}>{r.title}</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>
                {r.business_name} · {r.location_island}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
