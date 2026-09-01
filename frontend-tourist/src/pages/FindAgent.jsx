import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchAgents, getAssignedAgent, assignAgent, unassignAgent } from '../api/client';
import IslandPicker from '../components/IslandPicker';
import ChatPanel from '../components/ChatPanel';

// Section 12 — tourist-facing agent discovery. Search by name / specialty /
// island, chat with an agent (the generic messages backend, otherRole
// 'agent'), and assign one as yours. Once assigned, prices for businesses
// that agent is approved-connected to come back marked up from the backend
// already — this page doesn't do anything special to show that; the point
// is it's invisible.

const SPECIALTY_LABELS = {
  guesthouse: 'Guesthouse',
  tour_guide: 'Tour guide',
  excursion: 'Excursion',
  shopping: 'Shopping',
};

const SPECIALTY_FILTERS = [
  { value: '', label: 'Any specialty' },
  { value: 'guesthouse', label: 'Guesthouse' },
  { value: 'tour_guide', label: 'Tour guide' },
  { value: 'excursion', label: 'Excursion' },
  { value: 'shopping', label: 'Shopping' },
];

export default function FindAgent() {
  const navigate = useNavigate();

  const [assigned, setAssigned] = useState(null);
  const [q, setQ] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [island, setIsland] = useState('');
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [chatAgent, setChatAgent] = useState(null);

  useEffect(() => {
    if (!localStorage.getItem('atollisle_token')) {
      navigate('/login');
      return;
    }
    loadAssigned();
  }, []);

  function loadAssigned() {
    getAssignedAgent()
      .then((d) => setAssigned(d.agent))
      .catch(() => {});
  }

  async function handleSearch(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const d = await searchAgents({ q: q.trim(), specialty, island });
      setResults(d.agents || []);
      setSearched(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAssign(agentId) {
    setError('');
    try {
      await assignAgent(agentId);
      loadAssigned();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleUnassign() {
    setError('');
    try {
      await unassignAgent();
      setAssigned(null);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <button className="btn-secondary" onClick={() => navigate('/')} style={{ marginBottom: 16 }}>
        ← Back
      </button>

      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>
        Find an agent
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
        A travel agent can arrange your stays, tours, and transfers. Search below, chat to check the fit, then assign one as yours.
      </p>

      {assigned && (
        <div className="card" style={{ padding: 14, marginBottom: 16, background: 'var(--lagoon-tint)', border: 'none' }}>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 2px' }}>Your agent</p>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)', margin: 0 }}>{assigned.name}</p>
          {assigned.specialty && (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0' }}>
              {SPECIALTY_LABELS[assigned.specialty] || assigned.specialty}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => setChatAgent(assigned)}>
              Chat
            </button>
            <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: 13, color: 'var(--coral)' }} onClick={handleUnassign}>
              Unassign
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSearch} style={{ marginBottom: 16 }}>
        <input
          className="input-field"
          placeholder="Search by name"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ marginBottom: 8 }}
        />
        <select
          className="input-field"
          value={specialty}
          onChange={(e) => setSpecialty(e.target.value)}
          style={{ marginBottom: 8 }}
        >
          {SPECIALTY_FILTERS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div style={{ marginBottom: 8 }}>
          <IslandPicker value={island} onChange={(isl) => setIsland(isl)} id="find-agent-island" placeholder="Any island" />
        </div>
        {island && (
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '4px 10px', fontSize: 12, marginBottom: 8 }}
            onClick={() => setIsland('')}
          >
            Clear island
          </button>
        )}
        <button className="btn-primary" type="submit" style={{ width: '100%' }} disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error && <p className="error-text">{error}</p>}

      {searched && !loading && results.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No agents match that search.</p>
      )}

      {results.map((a) => {
        const isMine = assigned && assigned.id === a.id;
        return (
          <div key={a.id} className="card" style={{ padding: 14, marginBottom: 10 }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)', margin: '0 0 2px' }}>{a.name}</p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 2px' }}>
              {a.specialty ? (SPECIALTY_LABELS[a.specialty] || a.specialty) : 'No specialty set'}
            </p>
            {Array.isArray(a.service_islands) && a.service_islands.length > 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px' }}>
                Serves: {a.service_islands.join(', ')}
              </p>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => setChatAgent(a)}>
                Chat
              </button>
              {isMine ? (
                <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: 13 }} disabled>
                  Your agent
                </button>
              ) : (
                <button className="btn-primary" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => handleAssign(a.id)}>
                  Assign as my agent
                </button>
              )}
            </div>
          </div>
        );
      })}

      {chatAgent && (
        <ChatPanel
          otherRole="agent"
          otherId={chatAgent.id}
          otherName={chatAgent.name}
          onClose={() => setChatAgent(null)}
        />
      )}
    </div>
  );
}
