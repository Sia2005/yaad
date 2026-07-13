import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';

const DADI_ID = '6a5249b712a35b6292fbe3fa'; // temp hardcode; patient picker later

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [patterns, setPatterns] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/patients/${DADI_ID}/patterns`)
      .then(setPatterns)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div style={{ maxWidth: 720, margin: '5vh auto', fontFamily: 'system-ui', padding: '0 16px' }}>
      <h1>Namaste, {user.name}</h1>

      <p>
        <Link to={`/mirror/${DADI_ID}`} style={{ fontSize: 18 }}>
          Open Dadi's Mirror →
        </Link>
      </p>

      <h2 style={{ marginTop: 32 }}>This week</h2>
      {error && <p style={{ color: '#888' }}>Couldn't load activity right now.</p>}
      {patterns && (
        <>
          <p style={{ color: '#666' }}>
            {patterns.totalInteractions} question{patterns.totalInteractions === 1 ? '' : 's'} asked
            in the last {patterns.windowDays} days.
          </p>

          {patterns.alerts.length === 0 && (
            <p style={{ color: '#4a7c59' }}>No patterns to flag this week. 🌿</p>
          )}

          {patterns.alerts.map((a, i) => (
            <div
              key={i}
              style={{
                background: '#FFF8E7',
                border: '1px solid #E8D5A3',
                borderRadius: 12,
                padding: '14px 18px',
                marginBottom: 12,
              }}
            >
              <strong style={{ color: '#8A6D1D' }}>Worth noting</strong>
              <p style={{ margin: '6px 0 0', color: '#5C4A12' }}>{a.message}</p>
            </div>
          ))}
        </>
      )}

      <p style={{ marginTop: 40 }}>
        <button onClick={logout}>Log out</button>
      </p>
    </div>
  );
}