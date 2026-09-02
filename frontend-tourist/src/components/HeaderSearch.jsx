import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchListings } from '../api/client';
import { useLanguage } from '../i18n';
import AnchoredPopover from './AnchoredPopover';

// Batch 19's cross-island listing/business search — a tourist who knows what
// they want by name ("that dive shop on Maafushi") jumping straight to it.
// Was a dedicated always-visible field in the Home body; now a header icon
// (next to the notification bell) that opens the same debounced search in a
// small popover. Same GET /api/listings/search, same 300ms debounce.
export default function HeaderSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const debounceRef = useRef(null);
  const btnRef = useRef(null);
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
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('common.search')}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          borderRadius: '50%',
          border: 'none',
          background: 'rgba(255,255,255,0.15)',
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>

      {open && (
        <AnchoredPopover
          anchorRef={btnRef}
          onClose={() => setOpen(false)}
          ariaLabel={t('common.search')}
          width={300}
          align="right"
        >
          <input
            autoFocus
            className="input-field"
            placeholder={t('home.search_placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('home.search_placeholder')}
          />
          {query.trim() && (
            <div style={{ marginTop: 8 }}>
              {results === null && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: 8, margin: 0 }}>
                  {t('common.loading')}
                </p>
              )}
              {results && results.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: 8, margin: 0 }}>
                  {t('home.search_no_results', { query })}
                </p>
              )}
              {results && results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handlePick(r.id)}
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
        </AnchoredPopover>
      )}
    </>
  );
}
