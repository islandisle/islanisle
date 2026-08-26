import { useState } from 'react';
import { useModalA11y } from '../useModalA11y';

// Section 3.2/11: "a searchable popup organized by atoll — never a native
// dropdown." Representative, not exhaustive — the real Maldives gazetteer
// has ~1,200 islands across 20 atolls; this covers the atolls and their
// better-known inhabited/tourist islands, enough to demonstrate the
// pick-by-atoll pattern the spec calls for everywhere an island is chosen.
export const ATOLLS = [
  { atoll: 'Kaafu (Malé)', islands: ['Malé', 'Hulhumalé', 'Maafushi', 'Gulhi', 'Guraidhoo', 'Thulusdhoo'] },
  { atoll: 'Alifu Alifu (North Ari)', islands: ['Rasdhoo', 'Thoddoo', 'Mathiveri'] },
  { atoll: 'Alifu Dhaalu (South Ari)', islands: ['Dhigurah', 'Dhangethi', 'Mahibadhoo', 'Maamigili'] },
  { atoll: 'Baa', islands: ['Eydhafushi', 'Dharavandhoo', 'Thulhaadhoo', 'Hithaadhoo'] },
  { atoll: 'Vaavu', islands: ['Felidhoo', 'Keyodhoo', 'Fulidhoo'] },
  { atoll: 'Meemu', islands: ['Muli', 'Naalaafushi', 'Maduvvari'] },
  { atoll: 'Faafu', islands: ['Nilandhoo', 'Magoodhoo'] },
  { atoll: 'Dhaalu', islands: ['Kudahuvadhoo', 'Meedhoo'] },
  { atoll: 'Laamu', islands: ['Fonadhoo', 'Gan', 'Maabaidhoo'] },
  { atoll: 'Gaafu Alifu', islands: ['Villingili', 'Kolamaafushi'] },
  { atoll: 'Gaafu Dhaalu', islands: ['Thinadhoo', 'Madaveli'] },
  { atoll: 'Addu (Seenu)', islands: ['Hithadhoo', 'Maradhoo', 'Feydhoo', 'Hulhudhoo'] },
  { atoll: 'Haa Alifu', islands: ['Dhidhdhoo', 'Hoarafushi'] },
  { atoll: 'Haa Dhaalu', islands: ['Kulhudhuffushi', 'Nolhivaranfaru'] },
  { atoll: 'Shaviyani', islands: ['Funadhoo', 'Milandhoo'] },
  { atoll: 'Noonu', islands: ['Manadhoo', 'Velidhoo'] },
  { atoll: 'Raa', islands: ['Ungoofaaru', 'Dhuvaafaru'] },
  { atoll: 'Lhaviyani', islands: ['Naifaru', 'Hinnavaru'] },
  { atoll: 'Thaa', islands: ['Veymandoo', 'Buruni'] },
  { atoll: 'Gnaviyani (Fuvahmulah)', islands: ['Fuvahmulah'] },
];

export default function IslandPicker({ value, onChange, id, placeholder = 'Select an island…' }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const modalRef = useModalA11y(() => setOpen(false));

  const q = search.trim().toLowerCase();
  const filtered = ATOLLS
    .map((a) => ({
      atoll: a.atoll,
      islands: q
        ? a.islands.filter((isl) => isl.toLowerCase().includes(q) || a.atoll.toLowerCase().includes(q))
        : a.islands,
    }))
    .filter((a) => a.islands.length > 0);

  function handlePick(island) {
    onChange(island);
    setOpen(false);
    setSearch('');
  }

  return (
    <>
      <button
        type="button"
        id={id}
        className="input-field"
        onClick={() => setOpen(true)}
        style={{ textAlign: 'left', width: '100%', color: value ? 'var(--navy)' : 'var(--text-muted)' }}
      >
        {value || placeholder}
      </button>

      {open && (
        <div
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
            aria-label="Choose an island"
            style={{ width: '100%', maxWidth: 420, maxHeight: '75vh', borderRadius: '20px 20px 0 0', padding: 16, display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              className="input-field"
              placeholder="Search island or atoll"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ marginBottom: 10 }}
            />
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {filtered.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No islands match "{search}".</p>
              )}
              {filtered.map((a) => (
                <div key={a.atoll} style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.03, color: 'var(--text-muted)', margin: '0 0 6px' }}>
                    {a.atoll}
                  </p>
                  {a.islands.map((isl) => (
                    <button
                      key={isl}
                      type="button"
                      onClick={() => handlePick(isl)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', padding: '8px 6px',
                        background: isl === value ? 'var(--lagoon-tint)' : 'transparent',
                        border: 'none', borderRadius: 6, fontSize: 14, color: 'var(--navy)', cursor: 'pointer',
                      }}
                    >
                      {isl}
                    </button>
                  ))}
                </div>
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
