import { useState, useEffect } from 'react';
import { getCurrentGuests } from '../api/client';

// Batch 21 — shared guest-selection UI for B2B requests (B2B.jsx) and
// guesthouse-arranged transfers (GroupTransfers.jsx), replacing what were
// two independent raw comma-separated user-ID text fields. Mirrors the
// same "pick real people, don't type ids" idea as the checkbox-list
// pattern already used for check-in's whole-group/individual selection
// (Dashboard.jsx's CheckInForm) and frontend-tourist's own
// GroupMemberPicker at checkout — sourced here from this guesthouse's own
// current guests instead of a travel group.
//
// Only a guesthouse has a real "who am I hosting" list to pick from
// (GET /api/checkin/business/:businessId/current-guests) — any other
// business type, or a guest not in that list, falls back to adding by
// name, matching the spec's own "lookup a signed-up guest, or enter a
// name directly" pattern (Sections 4.6/4.7).
//
// `selectedGuests` / `onChange` carry a list of
// { user_id?, plain_name?, name } objects — `name` is display-only and
// stripped by callers before sending to the backend, which only wants
// user_id/plain_name.
//
// `allowManualAdd` defaults true (guesthouse-arranged transfers genuinely
// support a no-account guest, per group_booking_guests.plain_name) but is
// set false by B2B.jsx, whose b2b_request_guests.user_id is NOT NULL —
// B2B only ever deals with registered guests, per the spec's own "select
// which guests (users) are being booked" (Section 4.7).
//
// `manualIdEntry` (only meaningful when allowManualAdd is false) adds a
// secondary "add by user ID" fallback — the checkbox list above only ever
// has anyone in it for a guesthouse (the current-guests endpoint is
// guesthouse-only); a non-guesthouse business using B2B would otherwise
// have no way to add a guest at all once the raw text field was removed.
export default function GuestPicker({
  businessId, businessType, selectedGuests, onChange, allowManualAdd = true, manualIdEntry = false,
}) {
  const [currentGuests, setCurrentGuests] = useState([]);
  const [manualName, setManualName] = useState('');
  const [manualUserId, setManualUserId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (businessType !== 'guesthouse' || !businessId) return;
    getCurrentGuests(businessId)
      .then((d) => setCurrentGuests(d.guests || []))
      .catch((err) => setError(err.message));
  }, [businessId, businessType]);

  function isSelected(userId) {
    return selectedGuests.some((g) => g.user_id === userId);
  }

  function toggleGuest(guest, checked) {
    if (checked) {
      onChange([...selectedGuests, { user_id: guest.user_id, name: guest.name }]);
    } else {
      onChange(selectedGuests.filter((g) => g.user_id !== guest.user_id));
    }
  }

  function addManualGuest() {
    const name = manualName.trim();
    if (!name) return;
    onChange([...selectedGuests, { plain_name: name, name }]);
    setManualName('');
  }

  function addManualUserId() {
    const id = manualUserId.trim();
    if (!id || selectedGuests.some((g) => g.user_id === id)) return;
    onChange([...selectedGuests, { user_id: id, name: `Guest ${id.slice(0, 8)}` }]);
    setManualUserId('');
  }

  function removeSelected(index) {
    onChange(selectedGuests.filter((_, i) => i !== index));
  }

  // Anyone not represented by a checked box above — a plain-name guest, or
  // a guest added by typed user ID who isn't in the fetched current-guests
  // list — gets a removable chip instead, so they're still visible/undoable.
  const currentGuestIds = new Set(currentGuests.map((g) => g.user_id));
  const manuallyAdded = selectedGuests
    .map((g, i) => ({ ...g, index: i }))
    .filter((g) => g.plain_name || (g.user_id && !currentGuestIds.has(g.user_id)));

  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
        Guests
      </p>

      {error && <p className="error-text">{error}</p>}

      {currentGuests.length > 0 && (
        <div role="group" aria-label="Current guests" style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
          {currentGuests.map((g) => (
            <label key={g.user_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={isSelected(g.user_id)}
                onChange={(e) => toggleGuest(g, e.target.checked)}
              />
              {g.name}
            </label>
          ))}
        </div>
      )}

      {allowManualAdd && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            className="input-field"
            placeholder={currentGuests.length > 0 ? 'Add someone else by name (no account)' : 'Guest name (no account)'}
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="button" className="btn-secondary" onClick={addManualGuest} disabled={!manualName.trim()}>
            Add
          </button>
        </div>
      )}

      {manualIdEntry && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            className="input-field"
            placeholder="Or add by user ID"
            value={manualUserId}
            onChange={(e) => setManualUserId(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="button" className="btn-secondary" onClick={addManualUserId} disabled={!manualUserId.trim()}>
            Add
          </button>
        </div>
      )}

      {currentGuests.length === 0 && !allowManualAdd && !manualIdEntry && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
          No current guests found to select from.
        </p>
      )}

      {manuallyAdded.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {manuallyAdded.map((g) => (
            <span
              key={g.index}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12,
                background: 'var(--lagoon-tint)', color: 'var(--navy)', padding: '3px 8px', borderRadius: 999,
              }}
            >
              {g.name}{g.plain_name ? ' (no account)' : ''}
              <button
                type="button"
                onClick={() => removeSelected(g.index)}
                aria-label={`Remove ${g.name}`}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1 }}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {selectedGuests.length > 0
          ? `${selectedGuests.length} guest${selectedGuests.length === 1 ? '' : 's'} selected.`
          : 'No guests selected yet.'}
      </p>
    </div>
  );
}
