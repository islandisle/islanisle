import { useState, useEffect } from 'react';
import { useModalA11y } from '../useModalA11y';
import { getIslands } from '../api/client';

// Section 3.2/11: "a searchable popup organized by atoll — never a native
// dropdown."
//
// Batch 40 — the list now comes from GET /api/islands, built server-side
// from Batch 25's external_places import plus any island with a real
// approved business. ATOLLS below is only the offline/first-paint fallback
// (a representative subset; raw atoll keys matching the API shape). Kept in
// its own copy per app — no shared-constants package between the frontends.
export const ATOLLS = [
  { atoll: 'Kaafu', islands: ["Male'", 'Hulhumale', 'Maafushi', 'Gulhi', 'Guraidhoo', 'Thulusdhoo'] },
  { atoll: 'Alifu Alifu', islands: ['Rasdhoo', 'Thoddoo', 'Mathiveri', 'Ukulhas'] },
  { atoll: 'Alifu Dhaalu', islands: ['Dhigurah', 'Dhangethi', 'Mahibadhoo', 'Maamigili'] },
  { atoll: 'Baa', islands: ['Eydhafushi', 'Dharavandhoo', 'Thulhaadhoo', 'Hithaadhoo'] },
  { atoll: 'Vaavu', islands: ['Felidhoo', 'Keyodhoo', 'Fulidhoo'] },
  { atoll: 'Meemu', islands: ['Muli', 'Mulah', 'Maduvvari'] },
  { atoll: 'Faafu', islands: ['Nilandhoo', 'Magoodhoo', 'Feeali'] },
  { atoll: 'Dhaalu', islands: ['Kudahuvadhoo', 'Bandidhoo'] },
  { atoll: 'Laamu', islands: ['Gan', 'Kalaidhoo'] },
  { atoll: 'Gaafu Alifu', islands: ['Villingili', 'Kolamaafushi'] },
  { atoll: 'Gaafu Dhaalu', islands: ['Gadhdhoo', 'Vaadhoo'] },
  { atoll: 'Seenu', islands: ['Hithadhoo', 'Maradhoo', 'Feydhoo', 'Meedhoo'] },
  { atoll: 'Haa Alifu', islands: ['Dhidhdhoo', 'Hoarafushi', 'Kelaa'] },
  { atoll: 'Haa Dhaalu', islands: ['Kulhudhuffushi', 'Hanimaadhoo'] },
  { atoll: 'Shaviyani', islands: ['Funadhoo', 'Milandhoo'] },
  { atoll: 'Noonu', islands: ['Manadhoo', 'Velidhoo'] },
  { atoll: 'Raa', islands: ['Alifushi', 'Inguraidhoo'] },
  { atoll: 'Lhaviyani', islands: ['Naifaru'] },
  { atoll: 'Thaa', islands: ['Veymandoo', 'Buruni'] },
  { atoll: 'Gnaviyani', islands: ['Fuvahmulah'] },
];

const ATOLL_LABELS = {
  Kaafu: 'Kaafu (Malé)',
  Seenu: 'Addu (Seenu)',
  Gnaviyani: 'Gnaviyani (Fuvahmulah)',
  'Alifu Alifu': 'Alifu Alifu (North Ari)',
  'Alifu Dhaalu': 'Alifu Dhaalu (South Ari)',
};
const atollLabel = (a) => ATOLL_LABELS[a] || a;

let islandsPromise = null;
function loadAtolls() {
  if (!islandsPromise) {
    islandsPromise = getIslands()
      .then((d) => (Array.isArray(d.atolls) && d.atolls.length ? d.atolls : ATOLLS))
      .catch(() => ATOLLS);
  }
  return islandsPromise;
}

export default function IslandPicker({ value, onChange, id, placeholder = 'Select an island…' }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [atolls, setAtolls] = useState(ATOLLS);
  const modalRef = useModalA11y(() => setOpen(false));

  useEffect(() => {
    let alive = true;
    loadAtolls().then((a) => { if (alive) setAtolls(a); });
    return () => { alive = false; };
  }, []);

  const q = search.trim().toLowerCase();
  const filtered = atolls
    .map((a) => {
      const atollMatch = atollLabel(a.atoll).toLowerCase().includes(q) || a.atoll.toLowerCase().includes(q);
      return {
        atoll: a.atoll,
        islands: q
          ? a.islands.filter((isl) => isl.toLowerCase().includes(q) || atollMatch)
          : a.islands,
      };
    })
    .filter((a) => a.islands.length > 0);

  // Emit the atoll alongside the island name — 14 island names exist in
  // more than one atoll (e.g. Maalhos in both Alifu Alifu and Baa), so the
  // bare name isn't enough to disambiguate a business's real location.
  // `value` stays the plain island-name string (all the closed button
  // shows); this only changes what onChange emits.
  function handlePick(island, atoll) {
    onChange(island, atoll);
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
                    {atollLabel(a.atoll)}
                  </p>
                  {a.islands.map((isl) => (
                    <button
                      key={isl}
                      type="button"
                      onClick={() => handlePick(isl, a.atoll)}
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
