import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getMyGroup, removeGroupMember } from '../api/client';
import QRPopup from '../components/QRPopup';

export default function Profile() {
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showQR, setShowQR] = useState(false);
  const [error, setError] = useState('');

  const user = JSON.parse(localStorage.getItem('atollisle_user') || 'null');

  useEffect(() => {
    if (!localStorage.getItem('atollisle_token')) {
      navigate('/login');
      return;
    }
    loadGroup();
  }, []);

  function loadGroup() {
    setLoading(true);
    getMyGroup()
      .then((data) => setGroup(data.group))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  function handleLogout() {
    localStorage.removeItem('atollisle_token');
    localStorage.removeItem('atollisle_user');
    navigate('/login');
  }

  async function handleRemoveMember(memberId) {
    if (!group) return;
    try {
      await removeGroupMember(group.id, memberId);
      loadGroup();
    } catch (err) {
      setError(err.message);
    }
  }

  const isGroupAdmin = group?.my_role === 'admin';

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <button className="btn-secondary" onClick={() => navigate('/')} style={{ marginBottom: 16 }}>
        ← Back
      </button>

      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>
        {user?.name || 'Profile'}
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>
        {user?.type === 'local' ? 'Local account' : 'Tourist account'}
      </p>

      <Link
        to="/bookings"
        className="btn-secondary"
        style={{ display: 'block', textAlign: 'center', width: '100%', marginBottom: 12, textDecoration: 'none' }}
      >
        My bookings &amp; orders
      </Link>

      <button
        className="btn-primary"
        style={{ width: '100%', marginBottom: 24 }}
        onClick={() => setShowQR(true)}
      >
        My QR code
      </button>

      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 12 }}>
          Travel group
        </p>

        {loading && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading…</p>}
        {error && <p className="error-text">{error}</p>}

        {!loading && !group && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            You're not in a group yet. Use "My QR code" above to start one or join with a code.
          </p>
        )}

        {group && (
          <div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
              {group.members.length} of {group.max_members} members
            </p>
            {group.members.map((m) => (
              <div
                key={m.id}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 0', borderBottom: '1px solid var(--border)',
                }}
              >
                <div>
                  <span style={{ fontSize: 13, color: 'var(--navy)' }}>{m.name}</span>
                  {m.role === 'admin' && (
                    <span style={{ fontSize: 11, color: 'var(--lagoon)', marginLeft: 6 }}>Admin</span>
                  )}
                  {!m.is_signed_up && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>Not signed up</span>
                  )}
                </div>
                {isGroupAdmin && m.role !== 'admin' && (
                  <button
                    className="btn-secondary"
                    style={{ padding: '4px 10px', fontSize: 12 }}
                    onClick={() => handleRemoveMember(m.id)}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <button className="btn-secondary" style={{ width: '100%' }} onClick={handleLogout}>
        Log out
      </button>

      {showQR && (
        <QRPopup
          qrValue={group?.group_code}
          onClose={() => setShowQR(false)}
          onJoinSuccess={loadGroup}
        />
      )}
    </div>
  );
}