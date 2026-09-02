import { useState, useEffect } from 'react';
import { useNavigate, Link, createSearchParams } from 'react-router-dom';
import {
  searchFriends, sendFriendRequest, getIncomingFriendRequests,
  acceptFriendRequest, declineFriendRequest, getFriends, unfriend,
} from '../api/client';
import Avatar from '../components/social/Avatar';

// Go Social — friends (stage 3). Search + send requests, respond to
// incoming requests, see + remove current friends.
export default function SocialFriends() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [incoming, setIncoming] = useState([]);
  const [friends, setFriends] = useState([]);
  const [error, setError] = useState('');

  function refresh() {
    getIncomingFriendRequests().then((d) => setIncoming(d.requests)).catch(() => {});
    getFriends().then((d) => setFriends(d.friends)).catch(() => {});
  }

  useEffect(() => {
    if (!localStorage.getItem('atollisle_token')) { navigate('/login'); return; }
    refresh();
  }, []);

  async function runSearch(e) {
    e.preventDefault();
    if (q.trim().length < 2) { setResults([]); return; }
    setError('');
    try {
      const d = await searchFriends(q.trim());
      setResults(d.results);
    } catch (err) {
      setError(err.message);
    }
  }

  async function add(userId) {
    try {
      await sendFriendRequest(userId);
      setResults((prev) => prev.map((r) => (r.user_id === userId
        ? { ...r, relationship: r.relationship === 'request_received' ? 'friends' : 'request_sent' }
        : r)));
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function respond(id, accept) {
    try {
      await (accept ? acceptFriendRequest(id) : declineFriendRequest(id));
      setIncoming((prev) => prev.filter((r) => r.id !== id));
      if (accept) getFriends().then((d) => setFriends(d.friends)).catch(() => {});
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(userId) {
    if (!window.confirm('Remove this friend?')) return;
    try {
      await unfriend(userId);
      setFriends((prev) => prev.filter((f) => f.user_id !== userId));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <button className="btn-secondary" onClick={() => navigate('/social')} style={{ marginBottom: 16 }}>← Back</button>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', marginBottom: 16 }}>Friends</h1>

      {error && <p className="error-text">{error}</p>}

      <form onSubmit={runSearch} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input className="input-field" placeholder="Search people by name" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
        <button className="btn-primary" type="submit">Search</button>
      </form>

      {results !== null && (
        <div style={{ marginBottom: 24 }}>
          {results.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No one matches “{q}”.</p>}
          {results.map((r) => (
            <PersonRow key={r.user_id} person={r}>
              {r.relationship === 'none' && <button className="btn-primary" style={btnSm} onClick={() => add(r.user_id)}>Add friend</button>}
              {r.relationship === 'request_sent' && <span style={tag}>Requested</span>}
              {r.relationship === 'request_received' && <button className="btn-primary" style={btnSm} onClick={() => add(r.user_id)}>Accept</button>}
              {r.relationship === 'friends' && <span style={{ ...tag, color: 'var(--lagoon)' }}>Friends</span>}
            </PersonRow>
          ))}
        </div>
      )}

      {incoming.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={h2}>Requests ({incoming.length})</h2>
          {incoming.map((r) => (
            <PersonRow key={r.id} person={{ user_id: r.from_user_id, name: r.name, avatar_url: r.avatar_url }}>
              <button className="btn-primary" style={btnSm} onClick={() => respond(r.id, true)}>Accept</button>
              <button className="btn-secondary" style={btnSm} onClick={() => respond(r.id, false)}>Decline</button>
            </PersonRow>
          ))}
        </section>
      )}

      <section>
        <h2 style={h2}>Your friends ({friends.length})</h2>
        {friends.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No friends yet — search above to connect.</p>}
        {friends.map((f) => (
          <PersonRow key={f.user_id} person={f}>
            <button
              className="btn-primary"
              style={btnSm}
              onClick={() => navigate({
                pathname: '/messages',
                search: `?${createSearchParams({ tab: 'social', dm: f.user_id, name: f.name })}`,
              })}
            >
              Message
            </button>
            <button className="btn-secondary" style={btnSm} onClick={() => remove(f.user_id)}>Remove</button>
          </PersonRow>
        ))}
      </section>
    </div>
  );
}

function PersonRow({ person, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <Link to={`/social/u/${person.user_id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flex: 1 }}>
        <Avatar name={person.name} src={person.avatar_url} size={38} />
        <span style={{ fontSize: 14, color: 'var(--navy)', fontWeight: 500 }}>{person.name}</span>
      </Link>
      <div style={{ display: 'flex', gap: 6 }}>{children}</div>
    </div>
  );
}

const h2 = { fontSize: 14, fontWeight: 600, color: 'var(--navy)', margin: '0 0 8px' };
const btnSm = { padding: '5px 10px', fontSize: 12 };
const tag = { fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' };
