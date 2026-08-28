import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

// Batch 31 — one consistent toast/snackbar for the tourist app. Used for
// brief confirmations that carry an "Undo" for a few seconds (removing a
// favorite, marking a notification read). showToast({ message, actionLabel,
// onAction, duration }). Only one toast at a time — a new one replaces the
// current.
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const dismiss = useCallback(() => {
    clearTimeout(timerRef.current);
    setToast(null);
  }, []);

  const showToast = useCallback(({ message, actionLabel, onAction, duration = 5000 }) => {
    clearTimeout(timerRef.current);
    const id = Date.now();
    setToast({ id, message, actionLabel, onAction });
    timerRef.current = setTimeout(() => {
      setToast((t) => (t && t.id === id ? null : t));
    }, duration);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed', left: 16, right: 16, bottom: 20, zIndex: 300,
            maxWidth: 448, margin: '0 auto',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            background: 'var(--ink)', color: '#fff',
            borderRadius: 'var(--radius-md)', padding: '12px 14px',
            boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
          }}
        >
          <span style={{ fontSize: 13, lineHeight: 1.4 }}>{toast.message}</span>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
            {toast.actionLabel && (
              <button
                type="button"
                onClick={() => { toast.onAction?.(); dismiss(); }}
                style={{
                  background: 'none', border: 'none', color: 'var(--lagoon-light)',
                  fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: '4px 6px',
                }}
              >
                {toast.actionLabel}
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={dismiss}
              style={{
                background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)',
                fontSize: 16, cursor: 'pointer', lineHeight: 1, padding: '4px 6px',
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext) || { showToast: () => {} };
}
