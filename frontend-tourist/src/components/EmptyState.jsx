import { Link } from 'react-router-dom';

// Batch 31 — one consistent "nothing here yet" block. Every empty state in
// the tourist app points at a concrete next action rather than just saying
// it's empty. `children` slot is for anything richer than a single button
// (e.g. Home's "try another island" chips).
export default function EmptyState({ title, message, actionLabel, actionTo, onAction, children }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--text-muted)' }}>
      {title && (
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)', margin: '0 0 4px' }}>{title}</p>
      )}
      {message && (
        <p style={{ fontSize: 13, margin: '0 auto 14px', lineHeight: 1.5, maxWidth: 300 }}>{message}</p>
      )}
      {children}
      {actionLabel && actionTo && (
        <Link
          to={actionTo}
          className="btn-primary"
          style={{ display: 'inline-block', textDecoration: 'none', padding: '9px 18px', fontSize: 14 }}
        >
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          className="btn-primary"
          style={{ padding: '9px 18px', fontSize: 14 }}
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
