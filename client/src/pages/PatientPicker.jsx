import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

const ROLE_LABEL = {
  familyAdmin: 'Family admin',
  contributor: 'Contributor',
  attendant: 'Caregiver',
  clinician: 'Clinician',
};

const ROLE_LINE = {
  familyAdmin: 'You look after her memory bank',
  contributor: 'You add her life stories',
  attendant: 'You log her day',
  clinician: 'You watch the patterns',
};

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

export default function PatientPicker() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [patients, setPatients] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    api('/patients')
      .then((d) => setPatients(d.patients))
      .catch((e) => setError(e.message));
  };
  useEffect(load, []);

  const addPatient = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await api('/patients', { method: 'POST', body: { name: newName.trim() } });
      setNewName('');
      setAdding(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const accept = async (patientId) => {
    try {
      await api(`/patients/${patientId}/members/accept`, { method: 'POST' });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const active = patients?.filter((p) => !p.pending) || [];
  const invites = patients?.filter((p) => p.pending) || [];

  return (
    <div className="min-h-screen flex flex-col">
      {/* top bar */}
      <header className="border-b border-teal/10">
        <div className="max-w-4xl mx-auto px-6 py-5 flex justify-between items-center">
          <div className="flex items-baseline gap-2.5">
            <span className="font-display text-xl font-semibold">Yaad</span>
            <span className="font-body text-[0.6rem] tracking-[0.16em] uppercase text-sage font-semibold">
              Memory keeper
            </span>
          </div>
          <div className="font-body text-sm text-sage">
            {user.name}
            <button onClick={logout} className="ml-3 underline">
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-6 py-14">
          <p className="font-body text-sm text-marigold font-semibold tracking-wide uppercase mb-2">
            {greeting()}, {user.name?.split(' ')[0]}
          </p>
          <h1 className="font-display text-4xl mb-2">Your people</h1>
          <p className="font-body text-sage mb-10 max-w-md">
            {active.length === 0 && invites.length === 0
              ? "Let's begin with the person whose memories you'd like to keep."
              : 'Choose whose memories you are keeping today.'}
          </p>

          {error && (
            <p className="text-clay font-body mb-6 bg-clay/5 border border-clay/20 rounded-lg px-4 py-2.5 text-sm">
              {error}
            </p>
          )}

          {/* pending invites first — they need action */}
          {invites.length > 0 && (
            <section className="mb-10">
              <div className="flex items-center gap-3 mb-4">
                <h2 className="font-display text-lg font-semibold">
                  Waiting for you
                </h2>
                <span className="bg-marigold text-ink text-xs font-semibold rounded-full px-2 py-0.5">
                  {invites.length}
                </span>
                <span className="flex-1 h-px bg-teal/15" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {invites.map((p) => (
                  <div
                    key={p.id}
                    className="bg-white border border-marigold/40 rounded-2xl p-6"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <span className="w-11 h-11 rounded-full bg-marigold/20 text-[#9a7b2e] flex items-center justify-center font-display text-lg font-semibold">
                        {p.name.charAt(0)}
                      </span>
                      <div>
                        <div className="font-display text-xl leading-none">
                          {p.name}
                        </div>
                        <div className="text-[0.68rem] tracking-wide uppercase text-marigold font-semibold mt-1">
                          Invited as {ROLE_LABEL[p.role]}
                        </div>
                      </div>
                    </div>
                    <p className="font-body text-sm text-sage mb-4">
                      A family admin has asked you to help keep {p.name}'s
                      memories.
                    </p>
                    <button
                      onClick={() => accept(p.id)}
                      className="w-full py-2.5 rounded-lg bg-ink text-paper font-body text-sm font-medium"
                    >
                      Accept invitation
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* the people */}
          {patients === null ? (
            <p className="font-display italic text-sage">Loading…</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {active.map((p) => (
                <div
                  key={p.id}
                  className="group bg-white border border-teal/15 rounded-2xl p-6 hover:border-teal/40 hover:shadow-[0_8px_24px_-12px_rgba(28,43,45,0.18)] transition"
                >
                  <button
                    onClick={() => navigate(`/patient/${p.id}`)}
                    className="w-full text-left"
                  >
                    <div className="flex items-start gap-4">
                      <span className="w-14 h-14 rounded-full bg-ink text-marigold flex items-center justify-center font-display text-2xl font-semibold shrink-0">
                        {p.name.charAt(0)}
                      </span>
                      <div className="flex-1">
                        <div className="font-display text-2xl leading-tight">
                          {p.name}
                        </div>
                        <div className="mt-1.5 inline-flex items-center gap-1.5 font-body text-[0.68rem] tracking-wide uppercase text-teal font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-marigold" />
                          {ROLE_LABEL[p.role]}
                        </div>
                        <p className="font-body text-sm text-sage mt-2">
                          {ROLE_LINE[p.role]}
                        </p>
                      </div>
                      <span className="text-sage text-lg group-hover:translate-x-0.5 group-hover:text-teal transition">
                        →
                      </span>
                    </div>
                  </button>

                  {p.role !== 'clinician' && (
                    <div className="mt-5 pt-4 border-t border-teal/10 flex items-center justify-between">
                      <button
                        onClick={() => navigate(`/patient/${p.id}`)}
                        className="font-body text-sm text-teal font-medium"
                      >
                        Open dashboard
                      </button>
                      <Link
                        to={`/mirror/${p.id}`}
                        className="font-body text-sm text-sage hover:text-ink flex items-center gap-1.5"
                      >
                        <span className="text-marigold">◉</span> Her Mirror
                      </Link>
                    </div>
                  )}
                </div>
              ))}

              {/* add someone */}
              {adding ? (
                <form
                  onSubmit={addPatient}
                  className="bg-white border border-teal/30 rounded-2xl p-6 flex flex-col justify-center gap-3"
                >
                  <label className="font-body text-sm text-sage">
                    Who are you keeping memories for?
                  </label>
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Their name — e.g. Dadi, Nanaji, Kamala"
                    className="px-3 py-2.5 rounded-lg border border-sage/40 font-body outline-none focus:border-teal"
                  />
                  <div className="flex gap-2">
                    <button
                      disabled={busy}
                      className="flex-1 py-2.5 rounded-lg bg-ink text-paper font-body text-sm font-medium disabled:opacity-50"
                    >
                      {busy ? 'Adding…' : 'Add them'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdding(false)}
                      className="py-2.5 px-4 rounded-lg font-body text-sm text-sage"
                    >
                      Cancel
                    </button>
                  </div>
                  <p className="font-body text-xs text-sage">
                    You'll become their family admin, and can invite others
                    after.
                  </p>
                </form>
              ) : (
                <button
                  onClick={() => setAdding(true)}
                  className="border-[1.5px] border-dashed border-teal/30 rounded-2xl p-6 min-h-[9rem] flex flex-col items-center justify-center gap-1.5 text-sage hover:border-teal hover:text-teal hover:bg-teal/[0.03] transition"
                >
                  <span className="font-display text-3xl leading-none">+</span>
                  <span className="font-body text-sm font-medium">
                    Add someone
                  </span>
                  <span className="font-body text-xs text-sage/70">
                    Start a new memory bank
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-teal/10">
        <div className="max-w-4xl mx-auto px-6 py-5">
          <p className="font-body text-xs text-sage">
            Yaad is a care-support tool, not a medical device.
          </p>
        </div>
      </footer>
    </div>
  );
}