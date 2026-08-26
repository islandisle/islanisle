import { useNavigate } from 'react-router-dom';

// Batch 19 — the SOS button (Home.jsx) sends an alert to admins, but a
// tourist in a non-SOS emergency (needs a hospital, lost their passport,
// wants the coast guard directly) had no reference at all for who to
// actually call. National numbers are real Maldives emergency lines;
// island-specific numbers vary too much to hardcode reliably, so this
// points to the right national service plus the general island police
// desk pattern instead of pretending to have a per-island directory.
const NATIONAL_CONTACTS = [
  { label: 'Police', number: '119' },
  { label: 'Fire & Rescue', number: '118' },
  { label: 'Ambulance / Medical emergency', number: '102' },
  { label: 'Maldives National Defence Force (Coast Guard)', number: '191' },
];

export default function EmergencyContacts() {
  const navigate = useNavigate();

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <button className="btn-secondary" onClick={() => navigate(-1)} style={{ marginBottom: 16 }}>
        ← Back
      </button>

      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>
        Emergency contacts
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
        For anything urgent that isn't a life-threatening emergency, the SOS button on the
        home screen alerts Atoll Isle's team directly with your location.
      </p>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>
          National emergency numbers
        </p>
        {NATIONAL_CONTACTS.map((c) => (
          <a
            key={c.number}
            href={`tel:${c.number}`}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 0', borderBottom: '1px solid var(--border)', textDecoration: 'none',
            }}
          >
            <span style={{ fontSize: 13, color: 'var(--navy)' }}>{c.label}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--lagoon)' }}>{c.number}</span>
          </a>
        ))}
      </div>

      <div className="card" style={{ padding: 16 }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 8 }}>
          On the island you're staying at
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Every inhabited island has a local police desk and a health post or hospital —
          ask your guesthouse front desk for the nearest one when you check in, since exact
          locations and numbers vary island to island.
        </p>
      </div>
    </div>
  );
}
