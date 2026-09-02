import { useState } from 'react';
import { useModalA11y } from '../useModalA11y';

// Section 7.4's "guided first-run tour... shown right after signup." Home
// is the app's actual default landing route (not Signup — a deliberate,
// kept difference from the script; see README/audit notes), so this shows
// on a visitor's first visit to Home instead, gated the same one-time way:
// a localStorage flag, not tied to the signup flow itself. Deliberately a
// simple step-through modal rather than element-anchored spotlight
// coachmarks — covers the spec's named highlights (island browsing, dual
// pricing, Pay at Visit, personal QR) without a bigger positioning system.
const SEEN_KEY = 'atollisle_tour_seen';

const STEPS = [
  {
    title: 'Pick an island',
    body: "Browse everything happening on one island at a time — guesthouses, restaurants, excursions, and transfers. Switch islands anytime from “Change island” on your My Trips screen.",
  },
  {
    title: 'Two prices, always',
    body: "Every listing shows a tourist price and a local price side by side. You'll only ever see the one that matches your account.",
  },
  {
    title: 'Pay at Visit',
    body: "Many listings let you reserve now and settle up with the business in person — no card needed upfront.",
  },
  {
    title: 'Your personal QR',
    body: "Find your QR code from your Profile — guesthouses and speedboats scan it to check you in or board you in one tap.",
  },
];

function hasSeenTour() {
  try {
    return localStorage.getItem(SEEN_KEY) === 'true';
  } catch {
    return true; // localStorage unavailable — don't block the app on it, just skip the tour
  }
}

export default function FirstRunTour() {
  const [dismissed, setDismissed] = useState(hasSeenTour);
  const [step, setStep] = useState(0);
  const modalRef = useModalA11y(handleClose);

  function handleClose() {
    try {
      localStorage.setItem(SEEN_KEY, 'true');
    } catch {
      // ignore — worst case the tour reappears next visit
    }
    setDismissed(true);
  }

  function handleNext() {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      handleClose();
    }
  }

  if (dismissed) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(11, 46, 61, 0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16,
      }}
      onClick={handleClose}
    >
      <div
        ref={modalRef}
        className="card"
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to Atoll Isle"
        style={{ width: '100%', maxWidth: 360, padding: 22, textAlign: 'center' }}
        onClick={(e) => e.stopPropagation()}
      >
        <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.04, color: 'var(--lagoon)', margin: '0 0 10px' }}>
          Welcome to Atoll Isle
        </p>
        <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--navy)', margin: '0 0 8px' }}>
          {current.title}
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.5 }}>
          {current.body}
        </p>

        <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginBottom: 18 }} aria-hidden="true">
          {STEPS.map((_, i) => (
            <span
              key={i}
              style={{
                width: 6, height: 6, borderRadius: '50%',
                background: i === step ? 'var(--lagoon)' : 'var(--border)',
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={handleClose}>
            Skip
          </button>
          <button className="btn-primary" style={{ flex: 1 }} onClick={handleNext}>
            {isLast ? 'Got it' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
