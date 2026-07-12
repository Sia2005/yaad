import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 360, margin: '10vh auto', fontFamily: 'system-ui' }}>
      <h1>Yaad</h1>
      <p style={{ color: '#666' }}>Memories that stay with the family.</p>
      <form onSubmit={submit}>
        <input
          style={{ width: '100%', padding: 12, marginBottom: 8, fontSize: 16 }}
          type="email" placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)} required
        />
        <input
          style={{ width: '100%', padding: 12, marginBottom: 8, fontSize: 16 }}
          type="password" placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)} required
        />
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
        <button
          style={{ width: '100%', padding: 12, fontSize: 16 }}
          disabled={busy}
        >
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </div>
  );
}