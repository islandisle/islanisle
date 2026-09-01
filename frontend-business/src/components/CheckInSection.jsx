import { useState, useEffect } from 'react';
import { getArrivals, checkInBooking, getBookingDocuments } from '../api/client';
import CheckInScanner from './CheckInScanner';

// Extracted from Dashboard.jsx so the staff login flow (StaffDashboard.jsx)
// can show the exact same check-in board an owner sees on their Dashboard's
// "Bookings" tab, without duplicating it — front-desk staff's whole job is
// this one screen, so it's the entire staff-facing app, not a cut-down
// version of it.
export default function CheckInSection({ businessId }) {
  const [arrivals, setArrivals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanError, setScanError] = useState('');
  const [openBookingId, setOpenBookingId] = useState(null);
  const [openViaQr, setOpenViaQr] = useState(false);

  function loadArrivals() {
    setLoading(true);
    getArrivals(businessId)
      .then((data) => setArrivals(data.arrivals || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadArrivals();
  }, [businessId]);

  function handleScan(code, resumeScanning) {
    const match = arrivals.find((a) => a.id === code && a.check_in_status !== 'checked_in');
    if (!match) {
      setScanError("That code doesn't match a pending arrival today.");
      resumeScanning();
      return;
    }
    setScanError('');
    setScannerOpen(false);
    setOpenViaQr(true);
    setOpenBookingId(match.id);
  }

  const pending = arrivals.filter((a) => a.check_in_status !== 'checked_in');
  const checkedIn = arrivals.filter((a) => a.check_in_status === 'checked_in');

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', margin: 0 }}>
          Today's arrivals
        </p>
        <button
          className="btn-secondary"
          style={{ padding: '4px 10px', fontSize: 12 }}
          onClick={() => { setScanError(''); setScannerOpen((open) => !open); }}
        >
          {scannerOpen ? 'Close scanner' : 'Scan to check in'}
        </button>
      </div>

      {scannerOpen && (
        <>
          <CheckInScanner onScan={handleScan} />
          {scanError && <p className="error-text">{scanError}</p>}
        </>
      )}

      {error && <p className="error-text">{error}</p>}
      {loading && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>}
      {!loading && arrivals.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          No arrivals scheduled for today.
        </p>
      )}

      {pending.map((a) => (
        <ArrivalRow
          key={a.id}
          arrival={a}
          open={openBookingId === a.id}
          viaQr={openBookingId === a.id && openViaQr}
          onOpen={() => { setOpenViaQr(false); setOpenBookingId(a.id); }}
          onClose={() => setOpenBookingId(null)}
          onCheckedIn={() => { setOpenBookingId(null); loadArrivals(); }}
        />
      ))}

      {checkedIn.length > 0 && (
        <>
          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', margin: '16px 0 8px' }}>
            Already checked in
          </p>
          {checkedIn.map((a) => (
            <ArrivalRow key={a.id} arrival={a} open={false} viaQr={false} onOpen={() => {}} onClose={() => {}} onCheckedIn={() => {}} />
          ))}
        </>
      )}
    </div>
  );
}

const CHECK_IN_STATUS_LABEL = {
  pending: 'Not checked in',
  partially_checked_in: 'Partially checked in',
  checked_in: 'Checked in',
};

function ArrivalRow({ arrival, open, viaQr, onOpen, onClose, onCheckedIn }) {
  const isCheckedIn = arrival.check_in_status === 'checked_in';

  return (
    <div className="card" style={{ padding: 12, marginBottom: 8 }}>
      <p style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 2px' }}>
        {arrival.customer_name} — {arrival.title}
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
        {CHECK_IN_STATUS_LABEL[arrival.check_in_status] || arrival.check_in_status}
        {arrival.room_number && ` · Room ${arrival.room_number}`}
        {arrival.group_members && ` · Party of ${arrival.group_members.length}`}
      </p>

      {!isCheckedIn && !open && (
        <button className="btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={onOpen}>
          Check in
        </button>
      )}

      {isCheckedIn && <ViewDocumentsButton bookingId={arrival.id} />}

      {open && <CheckInForm arrival={arrival} viaQr={viaQr} onDone={onCheckedIn} onCancel={onClose} />}
    </div>
  );
}

// document_access_grants (Batch 19) — checkin.js grants this the moment a
// guest is checked in, and revokes it if the booking is later cancelled;
// this is the only place that reads it back. Photo URLs are the same
// local-dev-storage:// placeholders used everywhere else in this
// environment (no real object storage wired up) — the onError fallback
// mirrors frontend-tourist's ListingDetail.jsx PhotoGallery pattern.
function ViewDocumentsButton({ bookingId }) {
  const [open, setOpen] = useState(false);
  const [documents, setDocuments] = useState(null);
  const [error, setError] = useState('');

  function handleOpen() {
    setOpen(true);
    if (documents) return;
    getBookingDocuments(bookingId)
      .then((data) => setDocuments(data.documents))
      .catch((err) => setError(err.message));
  }

  return (
    <>
      <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={handleOpen}>
        View ID
      </button>
      {open && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          {error && <p className="error-text">{error}</p>}
          {!documents && !error && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</p>}
          {documents && documents.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No document on file for this guest.</p>
          )}
          {documents && documents.map((doc) => (
            <div key={doc.user_id} style={{ marginBottom: 8 }}>
              <p style={{ fontSize: 12, color: 'var(--navy)', margin: '0 0 4px' }}>
                {doc.name} — {doc.uploaded_document_type === 'passport' ? 'Passport' : 'ID card'}
              </p>
              <div
                style={{
                  width: 160, height: 100, borderRadius: 6, background: 'var(--surface-alt, #eee)',
                  border: '1px solid var(--border)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', overflow: 'hidden',
                }}
              >
                <img
                  src={doc.document_image_url}
                  alt="Document on file"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'block';
                  }}
                />
                <span style={{ display: 'none', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: 8 }}>
                  Document image unavailable
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function CheckInForm({ arrival, viaQr, onDone, onCancel }) {
  const [mode, setMode] = useState(viaQr ? 'qr' : 'manual'); // 'manual' | 'qr'
  const [roomNumber, setRoomNumber] = useState(arrival.room_number || '');
  const hasGroup = Array.isArray(arrival.group_members) && arrival.group_members.length > 0;
  const [wholeGroup, setWholeGroup] = useState(true);
  const [selectedMembers, setSelectedMembers] = useState(
    () => new Set((arrival.group_members || []).map((m) => m.member_id))
  );
  // Reaching this form via the outer "Scan to check in" flow already
  // matched a scanned code against this exact booking (see CheckInSection's
  // handleScan) — no need to make the guest scan a second time.
  const [scanned, setScanned] = useState(viaQr);
  const [scanError, setScanError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function toggleMember(memberId, checked) {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (checked) next.add(memberId); else next.delete(memberId);
      return next;
    });
  }

  function handleScan(code, resumeScanning) {
    if (code !== arrival.id) {
      setScanError("That code doesn't match this guest's booking.");
      resumeScanning();
      return;
    }
    setScanError('');
    setScanned(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!roomNumber.trim()) {
      setError('Room number is required.');
      return;
    }
    if (mode === 'qr' && !scanned) {
      setError("Scan the guest's QR code first, or switch to manual.");
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await checkInBooking(arrival.id, {
        method: mode,
        room_number: roomNumber.trim(),
        whole_group: hasGroup ? wholeGroup : false,
        member_ids: hasGroup && !wholeGroup ? Array.from(selectedMembers) : undefined,
      });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <ModePill label="Manual" active={mode === 'manual'} onClick={() => setMode('manual')} />
        <ModePill label="Scan QR" active={mode === 'qr'} onClick={() => { setMode('qr'); setScanError(''); }} />
      </div>

      {mode === 'qr' && !scanned && (
        <>
          <CheckInScanner onScan={handleScan} />
          {scanError && <p className="error-text">{scanError}</p>}
        </>
      )}
      {mode === 'qr' && scanned && (
        <p style={{ fontSize: 12, color: 'var(--lagoon)', marginBottom: 8 }}>QR code matched — ready to check in.</p>
      )}

      <label htmlFor="checkin-room-number" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
        Room number
      </label>
      <input
        id="checkin-room-number"
        className="input-field"
        value={roomNumber}
        onChange={(e) => setRoomNumber(e.target.value)}
        style={{ marginBottom: 10 }}
      />

      {hasGroup && (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 6 }}>
            <input type="checkbox" checked={wholeGroup} onChange={(e) => setWholeGroup(e.target.checked)} />
            Check in whole group ({arrival.group_members.length} people)
          </label>
          {!wholeGroup && (
            <div style={{ marginBottom: 10 }}>
              {arrival.group_members.map((m) => (
                <label key={m.member_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 4 }}>
                  <input
                    type="checkbox"
                    checked={selectedMembers.has(m.member_id)}
                    onChange={(e) => toggleMember(m.member_id, e.target.checked)}
                  />
                  {m.name}
                </label>
              ))}
            </div>
          )}
        </>
      )}

      {error && <p className="error-text">{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={submitting}>
          {submitting ? 'Checking in…' : 'Confirm check-in'}
        </button>
      </div>
    </form>
  );
}

function ModePill({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 12px',
        borderRadius: 20,
        fontSize: 12,
        border: active ? 'none' : '1px solid var(--border)',
        background: active ? 'var(--lagoon)' : 'var(--surface)',
        color: active ? '#fff' : 'var(--text-secondary)',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
