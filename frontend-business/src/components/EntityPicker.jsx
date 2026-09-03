import { useState, useEffect, useRef } from 'react';
import { useModalA11y } from '../useModalA11y';

// Batch 26 — a searchable-by-name picker, same interaction pattern as
// IslandPicker (a button that opens a bottom-sheet with a search field and
// a results list — never a raw text field or a native dropdown). Used
// everywhere a business, listing, or guest used to be selected by typing a
// raw id/UUID (B2B requests, standing discounts, guesthouse-arranged
// transfers, guest lookup).
//
// `fetchResults(query)` returns a promise of [{ id, label, sublabel? }] and
// is called, debounced, as the user types. Below `minChars` it isn't
// called at all and `emptyHint` shows instead. `value` is the selected
// { id, label } object (or null).
export default function EntityPicker({
  value,
  onChange,
  fetchResults,
  placeholder = 'Search…',
  dialogLabel = 'Search and select',
  id,
  minChars = 1,
  emptyHint = 'Start typing to search.',
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const modalRef = useModalA11y(() => setOpen(false));
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    const q = search.trim();
    if (q.length < minChars) {
      setResults([]);
      setLoading(false);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    const myReqId = ++reqIdRef.current;
    const timer = setTimeout(() => {
      Promise.resolve(fetchResults(q))
        .then((rows) => {
          if (myReqId !== reqIdRef.current) return; // a newer keystroke superseded this one
          setResults(Array.isArray(rows) ? rows : []);
        })
        .catch((err) => {
          if (myReqId === reqIdRef.current) setError(err.message || 'Search failed.');
        })
        .finally(() => {
          if (myReqId === reqIdRef.current) setLoading(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [search, open, minChars, fetchResults]);

  function handlePick(row) {
    onChange(row);
    setOpen(false);
    setSearch('');
    setResults([]);
  }

  const q = search.trim();

  return (
    <>
      <button
        type="button"
        id={id}
        className="input-field"
        disabled={disabled}
        onClick={() => setOpen(true)}
        style={{ textAlign: 'left', width: '100%', color: value ? 'var(--navy)' : 'var(--text-muted)' }}
      >
        {value ? value.label : placeholder}
      </button>

      {open && (
        <div
          className="glass-scrim"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(11, 46, 61, 0.6)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100,
          }}
          onClick={() => setOpen(false)}
        >
          <div
            ref={modalRef}
            className="card"
            role="dialog"
            aria-modal="true"
            aria-label={dialogLabel}
            style={{
              width: '100%', maxWidth: 420, maxHeight: '75vh', borderRadius: '20px 20px 0 0',
              padding: 16, display: 'flex', flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              className="input-field"
              placeholder={placeholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
              style={{ marginBottom: 10 }}
            />
            <div style={{ overflowY: 'auto', flex: 1 }} aria-live="polite">
              {error && <p className="error-text">{error}</p>}
              {!error && q.length < minChars && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{emptyHint}</p>
              )}
              {!error && q.length >= minChars && loading && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Searching…</p>
              )}
              {!error && !loading && q.length >= minChars && results.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No matches for &ldquo;{q}&rdquo;.</p>
              )}
              {results.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => handlePick(row)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '9px 6px',
                    background: value?.id === row.id ? 'var(--lagoon-tint)' : 'transparent',
                    border: 'none', borderRadius: 6, cursor: 'pointer',
                  }}
                >
                  <span style={{ display: 'block', fontSize: 14, color: 'var(--navy)' }}>{row.label}</span>
                  {row.sublabel && (
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>{row.sublabel}</span>
                  )}
                </button>
              ))}
            </div>
            <button className="btn-secondary" style={{ marginTop: 10 }} onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
