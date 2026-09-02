import { useState, useEffect } from 'react';
import { useModalA11y } from '../useModalA11y';
import { useLanguage } from '../i18n';
import { getIslands } from '../api/client';

// Section 3.2/11: "a searchable popup organized by atoll — never a native
// dropdown."
//
// Batch 40 — the list is now the real thing: GET /api/islands builds it
// from Batch 25's external_places import (every inhabited island with
// Ministry-of-Tourism data) plus any island with a real approved business.
// ATOLLS below is only the offline/first-paint fallback, used if that
// request fails or hasn't resolved yet — it should stay a complete,
// accurate list of every inhabited island in all 20 atolls (cross-checked
// against public island data), not a partial placeholder, since a failed
// API call shouldn't mean tourists can't find real islands in the picker.
export const ATOLLS = [
  { atoll: 'Kaafu', islands: ["Male'", 'Hulhumale', 'Maafushi', 'Gulhi', 'Guraidhoo', 'Thulusdhoo', 'Dhiffushi', 'Gaafaru', 'Himmafushi', 'Huraa', 'Kaashidhoo'] },
  { atoll: 'Alifu Alifu', islands: ['Rasdhoo', 'Thoddoo', 'Mathiveri', 'Ukulhas', 'Maalhos', 'Bodufolhudhoo', 'Feridhoo', 'Himandhoo'] },
  { atoll: 'Alifu Dhaalu', islands: ['Dhigurah', 'Dhangethi', 'Mahibadhoo', 'Maamigili', 'Dhiddhoo', 'Fenfushi', 'Hangnaameedhoo', 'Kunburudhoo', 'Mandhoo', 'Omadhoo'] },
  { atoll: 'Baa', islands: ['Eydhafushi', 'Dharavandhoo', 'Thulhaadhoo', 'Hithaadhoo', 'Dhonfanu', 'Fehendhoo', 'Fulhadhoo', 'Goidhoo', 'Kamadhoo', 'Kendhoo', 'Kihaadhoo', 'Kudarikilu', 'Maalhos'] },
  { atoll: 'Vaavu', islands: ['Felidhoo', 'Keyodhoo', 'Fulidhoo', 'Rakeedhoo', 'Thinadhoo'] },
  { atoll: 'Meemu', islands: ['Muli', 'Mulah', 'Maduvvari', 'Dhiggaru', 'Kolhufushi', 'Naalaafushi', 'Raimmandhoo', 'Veyvah'] },
  { atoll: 'Faafu', islands: ['Nilandhoo', 'Magoodhoo', 'Feeali', 'Bileddhoo', 'Dharanboodhoo'] },
  { atoll: 'Dhaalu', islands: ['Kudahuvadhoo', 'Bandidhoo', 'Hulhudheli', 'Maaenboodhoo', 'Meedhoo', 'Rinbudhoo'] },
  { atoll: 'Laamu', islands: ['Gan', 'Kalaidhoo', 'Dhanbidhoo', 'Fonadhoo', 'Gaadhoo', 'Hithadhoo', 'Isdhoo', 'Kunahandhoo', 'Maabaidhoo', 'Maamendhoo', 'Maavah', 'Mundoo', 'Maandhoo', 'Kadhdhoo'] },
  { atoll: 'Gaafu Alifu', islands: ['Villingili', 'Kolamaafushi', 'Dhaandhoo', 'Dhevvadhoo', 'Dhiyadhoo', 'Gemanafushi', 'Kanduhulhudhoo', 'Kondey', 'Maamendhoo', 'Nilandhoo'] },
  { atoll: 'Gaafu Dhaalu', islands: ['Gadhdhoo', 'Vaadhoo', 'Fares-Maathodaa', 'Fiyoari', 'Hoandeddhoo', 'Madaveli', 'Nadellaa', 'Rathafandhoo', 'Thinadhoo'] },
  { atoll: 'Seenu', islands: ['Hithadhoo', 'Maradhoo', 'Feydhoo', 'Meedhoo', 'Hulhudhoo'] },
  { atoll: 'Haa Alifu', islands: ['Dhidhdhoo', 'Hoarafushi', 'Kelaa', 'Baarah', 'Filladhoo', 'Ihavandhoo', 'Maarandhoo', 'Mulhadhoo', 'Muraidhoo', 'Thakandhoo', 'Thuraakunu', 'Uligamu', 'Utheemu', 'Vashafaru'] },
  { atoll: 'Haa Dhaalu', islands: ['Kulhudhuffushi', 'Hanimaadhoo', 'Finey', 'Hirimaradhoo', 'Kumundhoo', 'Kunburudhoo', 'Kurinbi', 'Makunudhoo', 'Naivaadhoo', 'Nellaidhoo', 'Neykurendhoo', 'Nolhivaram', 'Nolhivaranfaru', 'Vaikaradhoo'] },
  { atoll: 'Shaviyani', islands: ['Funadhoo', 'Milandhoo', 'Bileffahi', 'Feevah', 'Feydhoo', 'Foakaidhoo', 'Goidhoo', 'Kanditheemu', 'Komandoo', 'Lhaimagu', 'Maaungoodhoo', 'Maroshi', 'Narudhoo', 'Noomaraa'] },
  { atoll: 'Noonu', islands: ['Manadhoo', 'Velidhoo', 'Foddhoo', 'Henbandhoo', 'Holhudhoo', 'Kendhikolhudhoo', 'Kudafaree', 'Landhoo', 'Lhohi', 'Maafaru', 'Maalhendhoo', 'Magoodhoo', 'Miladhoo'] },
  { atoll: 'Raa', islands: ['Alifushi', 'Inguraidhoo', 'Angolhitheemu', 'Dhuvaafaru', 'Fainu', 'Hulhudhuffaaru', 'Innamaadhoo', 'Kinolhas', 'Maakurathu', 'Maduvvaree', 'Maamigili', 'Meedhoo', 'Rasgetheemu', 'Rasmaadhoo', 'Ungoofaaru', 'Vaadhoo'] },
  { atoll: 'Lhaviyani', islands: ['Naifaru', 'Hinnavaru', 'Kurendhoo', 'Olhuvelifushi'] },
  { atoll: 'Thaa', islands: ['Veymandoo', 'Buruni', 'Dhiyamingili', 'Gaadhiffushi', 'Guraidhoo', 'Hirilandhoo', 'Kandoodhoo', 'Kinbidhoo', 'Madifushi', 'Omadhoo', 'Thimarafushi', 'Vandhoo', 'Vilufushi'] },
  { atoll: 'Gnaviyani', islands: ['Fuvahmulah'] },
];

// A few well-known atolls carry a friendlier parenthetical in the UI; every
// other atoll shows its raw name from the dataset.
const ATOLL_LABELS = {
  Kaafu: 'Kaafu (Malé)',
  Seenu: 'Addu (Seenu)',
  Gnaviyani: 'Gnaviyani (Fuvahmulah)',
  'Alifu Alifu': 'Alifu Alifu (North Ari)',
  'Alifu Dhaalu': 'Alifu Dhaalu (South Ari)',
};

const atollLabel = (a) => ATOLL_LABELS[a] || a;

// Memoised across every IslandPicker mount in the session; falls back to
// the bundled ATOLLS if the request fails or returns nothing.
let islandsPromise = null;
function loadAtolls() {
  if (!islandsPromise) {
    islandsPromise = getIslands()
      .then((d) => (Array.isArray(d.atolls) && d.atolls.length ? d.atolls : ATOLLS))
      .catch(() => ATOLLS);
  }
  return islandsPromise;
}

// `hideTrigger` — render no bar button at all; the caller drives the popup
// purely via `autoOpen` (and conditional mounting) and gets notified via
// `onClose` when it's dismissed. Used for the first-run "pick your island"
// prompt on Home and the "Change island" action on My Trips, where the
// trigger lives elsewhere (a GPS check, a menu-style row) rather than being
// a form field. Every other caller renders the default bar + bottom sheet.
export default function IslandPicker({ value, onChange, id, placeholder, autoOpen = false, onNotInMaldives, hideTrigger = false, onClose }) {
  const { t } = useLanguage();
  const resolvedPlaceholder = placeholder ?? t('home.island_picker_placeholder');
  const [open, setOpen] = useState(Boolean(autoOpen));
  const [search, setSearch] = useState('');
  const [atolls, setAtolls] = useState(ATOLLS);

  function close() {
    setOpen(false);
    setSearch('');
    onClose?.();
  }
  const modalRef = useModalA11y(close);

  useEffect(() => {
    let alive = true;
    loadAtolls().then((a) => { if (alive) setAtolls(a); });
    return () => { alive = false; };
  }, []);

  // autoOpen can flip to true asynchronously (Home's first-visit GPS check
  // resolves after this component has already mounted), so react to it
  // rather than only reading it as the initial state.
  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  const q = search.trim().toLowerCase();
  const filtered = atolls
    .map((a) => {
      const label = atollLabel(a.atoll).toLowerCase();
      const atollMatch = label.includes(q) || a.atoll.toLowerCase().includes(q);
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
  // bare name isn't enough for downstream lookups to disambiguate. `value`
  // stays the plain island-name string (that's all the closed button shows);
  // this only changes what onChange emits.
  function handlePick(island, atoll) {
    onChange(island, atoll);
    setOpen(false);
    setSearch('');
  }

  // The search field + atoll/island list, shared by both presentations
  // (full-screen bottom sheet and anchored dropdown).
  const listBody = (
    <>
      <input
        autoFocus
        className="input-field"
        placeholder={t('home.island_search_placeholder')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 10 }}
      />

      {/* Fix #1 — the explicit "not here yet" escape hatch. Given only
          when the caller wants it (Home), it switches to the
          nationwide, all-islands view. */}
      {onNotInMaldives && (
        <button
          type="button"
          onClick={() => { onNotInMaldives(); setOpen(false); setSearch(''); }}
          style={{
            display: 'block', width: '100%', textAlign: 'left',
            padding: '10px 12px', marginBottom: 10,
            background: 'var(--lagoon-tint)', border: '1px solid var(--border)',
            borderRadius: 8, fontSize: 13, color: 'var(--navy)', cursor: 'pointer',
          }}
        >
          ✈️ I'm not in the Maldives yet — show me everything
        </button>
      )}

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
    </>
  );

  return (
    <>
      {!hideTrigger && (
        <button
          type="button"
          id={id}
          className="input-field"
          onClick={() => setOpen(true)}
          style={{ textAlign: 'left', width: '100%', color: value ? 'var(--navy)' : 'var(--text-muted)' }}
        >
          {value || resolvedPlaceholder}
        </button>
      )}

      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(11, 46, 61, 0.6)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100,
          }}
          onClick={close}
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
            {listBody}
            <button className="btn-secondary" style={{ marginTop: 10 }} onClick={close}>
              {t('common.close')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
