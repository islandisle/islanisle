import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../api/client';

// Read side of Section 6.5's notification system — the write side
// (services/notifications.js notify()) has been firing into the
// notifications table from bookings/orders/payments/sos this whole time,
// with nowhere for a user to actually see any of it until now.
export default function Notifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    getNotifications()
      .then((data) => {
        setNotifications(data.notifications || []);
        setUnreadCount(data.unread_count || 0);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!localStorage.getItem('atollisle_token')) {
      navigate('/login');
      return;
    }
    load();
  }, []);

  async function handleTap(notification) {
    if (notification.read) return;
    try {
      await markNotificationRead(notification.id);
      setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <button className="btn-secondary" onClick={() => navigate('/')} style={{ marginBottom: 16 }}>
        ← Back
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', margin: 0 }}>
          Notifications
        </h1>
        {unreadCount > 0 && (
          <button
            className="btn-secondary"
            style={{ padding: '4px 10px', fontSize: 12 }}
            onClick={handleMarkAllRead}
          >
            Mark all as read
          </button>
        )}
      </div>

      {loading && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading…</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && notifications.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No notifications yet.</p>
      )}

      {notifications.map((n) => (
        <button
          key={n.id}
          onClick={() => handleTap(n)}
          className="card"
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            padding: 12,
            marginBottom: 8,
            border: 'none',
            cursor: n.read ? 'default' : 'pointer',
            background: n.read ? 'var(--surface)' : 'var(--sand)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            {!n.read && (
              <span
                style={{
                  marginTop: 5,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--coral)',
                  flexShrink: 0,
                }}
              />
            )}
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', margin: '0 0 2px' }}>
                {n.title}
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 4px' }}>
                {n.body}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                {new Date(n.created_at).toLocaleString()}
              </p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
