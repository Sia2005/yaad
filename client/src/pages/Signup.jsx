import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signup(name, email, password);
      navigate('/'); // land on the patient picker
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden md:flex md:w-1/2 bg-ink text-paper flex-col justify-between p-12 relative overflow-hidden">
        <div
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 -bottom-1/4 w-4/5 h-2/3"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(228,179,99,0.15), transparent 70%)',
          }}
        />
        <div className="font-display text-3xl text-marigold/85 z-10">Yaad</div>
        <p className="font-display text-[2rem] leading-[1.35] max-w-[13em] z-10">
          Start keeping the memories that matter, before they fade.
        </p>
        <div className="font-body text-xs tracking-[0.15em] uppercase text-sage/60 z-10">
          Care, not cure
        </div>
      </div>

      <div className="w-full md:w-1/2 flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm">
          <h1 className="font-display text-3xl mb-1">Create your account</h1>
          <p className="font-body text-sage mb-8">
            You can invite the rest of the family once you're in.
          </p>

          <label className="block font-body text-xs uppercase tracking-widest text-sage mb-1">
            Your name
          </label>
          <input
            className="w-full mb-5 px-4 py-3 rounded-lg border border-sage/40 bg-white font-body text-ink outline-none focus:border-teal"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <label className="block font-body text-xs uppercase tracking-widest text-sage mb-1">
            Email
          </label>
          <input
            className="w-full mb-5 px-4 py-3 rounded-lg border border-sage/40 bg-white font-body text-ink outline-none focus:border-teal"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label className="block font-body text-xs uppercase tracking-widest text-sage mb-1">
            Password
          </label>
          <input
            className="w-full mb-2 px-4 py-3 rounded-lg border border-sage/40 bg-white font-body text-ink outline-none focus:border-teal"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />

          {error && <p className="text-clay font-body text-sm mb-2">{error}</p>}

          <button
            disabled={busy}
            className="w-full mt-4 py-3 rounded-lg bg-ink text-paper font-body font-medium hover:bg-teal transition disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create account'}
          </button>

          <p className="font-body text-sm text-sage mt-5">
            Already have an account?{' '}
            <Link to="/login" className="text-teal font-medium">
              Log in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
