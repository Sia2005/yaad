import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import RecordMemory from '../../components/RecordMemory';
import PeopleSection from '../../components/PeopleSection';

// "attendant" is labelled "Caregiver" throughout the UI
const ROLE_LABEL = {
  familyAdmin: 'Family admin',
  contributor: 'Contributor',
  attendant: 'Caregiver',
  clinician: 'Clinician',
};
const ROLE_TAG = {
  familyAdmin: 'bg-marigold/20 text-[#9a7b2e]',
  contributor: 'bg-teal/15 text-teal',
  attendant: 'bg-sage/20 text-[#5f7062]',
  clinician: 'bg-clay/15 text-clay',
};

// permission map — mirrors the backend role gating
const CAN = {
  approvals: ['familyAdmin'],
  access: ['familyAdmin'],
  consent: ['familyAdmin'],
  insights: ['familyAdmin'],
  logDaily: ['familyAdmin', 'attendant'],
  addMemory: ['familyAdmin', 'contributor'],
  ask: ['familyAdmin', 'contributor', 'attendant'],
  mirror: ['familyAdmin', 'contributor', 'attendant'],
};

const clock = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const SpeechRecognition =
  typeof window !== 'undefined' &&
  (window.SpeechRecognition || window.webkitSpeechRecognition);

export default function Dashboard() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [noteText, setNoteText] = useState('');
  const [listening, setListening] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('contributor');
  const [askQ, setAskQ] = useState('');
  const [askA, setAskA] = useState(null);
  const [asking, setAsking] = useState(false);
  const [active, setActive] = useState('overview');
  const recognitionRef = useRef(null);

  // section refs so the sidebar actually navigates
  const secs = {
    overview: useRef(null),
    ask: useRef(null),
    today: useRef(null),
    insights: useRef(null),
    addMemory: useRef(null),
    approvals: useRef(null),
    access: useRef(null),
    consent: useRef(null),
    people: useRef(null),
  };

  const go = (key) => {
    setActive(key);
    secs[key]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const load = () => {
    api(`/patients/${patientId}/dashboard`)
      .then(setData)
      .catch((e) => setError(e.message));
  };
  useEffect(load, [patientId]);

  const role = data?.yourRole;
  const can = (k) => role && CAN[k]?.includes(role);

  const addNote = async () => {
    const t = noteText.trim();
    if (!t) return;
    try {
      await api(`/patients/${patientId}/daily`, { method: 'POST', body: { text: t } });
      setNoteText('');
      load();
    } catch (e) {
      setMsg(e.message);
    }
  };

  const toggleMic = () => {
    if (!SpeechRecognition) {
      setMsg('Voice input needs Chrome or Edge.');
      return;
    }
    if (listening) return recognitionRef.current?.stop();
    const rec = new SpeechRecognition();
    rec.lang = 'hi-IN';
    rec.interimResults = true;
    rec.continuous = false;
    rec.onstart = () => setListening(true);
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.onresult = (e) =>
      setNoteText(Array.from(e.results).map((r) => r[0].transcript).join(''));
    recognitionRef.current = rec;
    rec.start();
  };

  const doAsk = async (e) => {
    e?.preventDefault();
    const q = askQ.trim();
    if (!q || asking) return;
    setAsking(true);
    setAskA(null);
    try {
      const r = await api(`/patients/${patientId}/ask`, {
        method: 'POST',
        body: { question: q, perspective: 'family' },
      });
      setAskA(r);
    } catch (e) {
      setAskA({ answer: e.message, refused: true });
    } finally {
      setAsking(false);
    }
  };

  const review = async (memoryId, decision) => {
    try {
      await api(`/patients/${patientId}/memories/${memoryId}/review`, {
        method: 'POST',
        body: { decision },
      });
      load();
    } catch (e) {
      setMsg(e.message);
    }
  };

  const invite = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await api(`/patients/${patientId}/members`, {
        method: 'POST',
        body: { email: inviteEmail.trim(), role: inviteRole },
      });
      setInviteEmail('');
      setMsg('Invite sent.');
      load();
    } catch (e) {
      setMsg(e.message);
    }
  };

  const setConsent = async (body) => {
    try {
      await api(`/patients/${patientId}/consent`, { method: 'POST', body });
      load();
    } catch (e) {
      setMsg(e.message);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center">
          <p className="font-display text-2xl mb-2">Can't open this dashboard</p>
          <p className="font-body text-sage mb-4">{error}</p>
          <Link to="/" className="text-teal font-body underline">Back to your people</Link>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="font-display italic text-sage">Opening…</p>
      </div>
    );
  }

  const p = data.patient;

  const NavItem = ({ id, label, count }) => (
    <button
      onClick={() => go(id)}
      className={`w-full text-left px-2.5 py-2 rounded-lg text-sm font-medium flex items-center transition ${
        active === id
          ? 'bg-marigold/12 text-paper'
          : 'text-paper/65 hover:text-paper hover:bg-paper/5'
      }`}
    >
      {label}
      {count > 0 && (
        <span className="ml-auto bg-marigold text-ink text-[0.66rem] font-semibold rounded-full px-2">
          {count}
        </span>
      )}
    </button>
  );

  return (
    <div className="flex min-h-screen">
      {/* SIDEBAR */}
      <aside className="w-60 bg-ink text-paper p-5 flex flex-col shrink-0 sticky top-0 h-screen">
        <div className="font-display text-2xl font-semibold text-marigold px-1 leading-none">Yaad</div>
        <div className="text-[0.58rem] tracking-[0.16em] uppercase text-sage/70 px-1 mt-0.5 mb-6">
          Memory keeper
        </div>

        {/* the patient is the SUBJECT, not a role-holder */}
        <div className="bg-paper/5 border border-marigold/20 rounded-xl p-3 flex items-center gap-3 mb-1">
          <span className="w-10 h-10 rounded-full bg-marigold text-ink flex items-center justify-center font-display font-semibold text-lg shrink-0">
            {p.name.charAt(0)}
          </span>
          <div>
            <div className="font-display text-base leading-none">{p.name}</div>
            <div className="text-[0.55rem] tracking-wide uppercase text-sage mt-1">
              The one we remember for
            </div>
          </div>
        </div>
        <div className="px-1 text-[0.72rem] text-paper/55 mb-3">
          You're the <b className="text-marigold font-semibold">{ROLE_LABEL[role]}</b>
        </div>
        <button onClick={() => navigate('/')} className="text-left px-1 text-xs text-sage underline mb-5">
          ← switch person
        </button>

        <nav className="flex flex-col gap-0.5">
          <NavItem id="overview" label="Overview" />
          {can('ask') && <NavItem id="ask" label={`Ask about ${p.name.split(' ')[0]}`} />}
          <NavItem id="today" label="Today's log" count={data.dailyNotes.length} />
          {can('addMemory') && <NavItem id="addMemory" label="Add a life memory" />}
          <NavItem id="people" label="People" />
          {can('insights') && (
            <NavItem id="insights" label="Doctor insights" count={data.insights.length} />
          )}
          {can('approvals') && (
            <NavItem id="approvals" label="Approvals" count={data.pending.length} />
          )}
          {can('access') && <NavItem id="access" label="Family & access" />}
          {can('consent') && <NavItem id="consent" label="Consent & safety" />}
        </nav>

        <div className="mt-auto pt-6 border-t border-paper/10">
          <div className="text-sm">{user.name}</div>
          <button onClick={logout} className="text-xs text-sage underline mt-0.5">Log out</button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 p-8 md:p-10">
        <div className="max-w-4xl mx-auto" ref={secs.overview}>
          <div className="flex justify-between items-end mb-1">
            <h1 className="font-display text-3xl font-semibold">{p.name}'s overview</h1>
            {can('mirror') && (
              <Link to={`/mirror/${patientId}`} className="bg-ink text-paper rounded-lg px-4 py-2 font-body font-medium text-sm flex items-center gap-2 shrink-0">
                Open the Mirror <span className="text-marigold">→</span>
              </Link>
            )}
          </div>
          <p className="font-body text-sage mb-8">
            {role === 'familyAdmin' && `Everything about ${p.name}'s day and her memory bank, in one place.`}
            {role === 'contributor' && `You add ${p.name}'s life stories. A family admin reviews them.`}
            {role === 'attendant' && `Log ${p.name}'s day here. Her Mirror uses your updates to answer her.`}
            {role === 'clinician' && 'A clinical view of activity. Memory content stays private to the family.'}
          </p>

          {msg && <p className="mb-6 font-body text-sm text-teal bg-teal/10 rounded-lg px-4 py-2">{msg}</p>}

          {/* STATS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
            <div className="bg-white border border-teal/15 rounded-xl p-4">
              <div className="font-display text-3xl font-semibold leading-none">{data.approvedCount}</div>
              <div className="text-xs text-sage mt-1.5">Life memories</div>
            </div>
            {can('approvals') && (
              <button onClick={() => go('approvals')} className="text-left bg-white border border-teal/15 rounded-xl p-4 hover:border-marigold/50 transition">
                <div className="font-display text-3xl font-semibold leading-none text-marigold">{data.pending.length}</div>
                <div className="text-xs text-sage mt-1.5">Waiting for review</div>
              </button>
            )}
            <button onClick={() => go('today')} className="text-left bg-white border border-teal/15 rounded-xl p-4 hover:border-teal/40 transition">
              <div className="font-display text-3xl font-semibold leading-none">{data.dailyNotes.length}</div>
              <div className="text-xs text-sage mt-1.5">Updates today</div>
            </button>
            {can('access') && (
              <button onClick={() => go('access')} className="text-left bg-white border border-teal/15 rounded-xl p-4 hover:border-teal/40 transition">
                <div className="font-display text-3xl font-semibold leading-none">{data.members.length}</div>
                <div className="text-xs text-sage mt-1.5">Family members</div>
              </button>
            )}
          </div>

          {/* ASK ABOUT HER — family-facing, third person */}
          {can('ask') && (
            <section ref={secs.ask} className="mb-10 scroll-mt-8">
              <div className="flex items-center gap-3 mb-3">
                <h2 className="font-display text-xl font-semibold">Ask about {p.name}</h2>
                <span className="flex-1 h-px bg-teal/15" />
              </div>
              <div className="bg-ink rounded-2xl p-6">
                <p className="font-body text-sm text-sage mb-4">
                  Ask anything her memories or today's log can answer — "kya aaj {p.name} ne lunch kiya?", "dawai li?"
                </p>
                <form onSubmit={doAsk} className="flex gap-2">
                  <input
                    value={askQ}
                    onChange={(e) => setAskQ(e.target.value)}
                    placeholder={`Kya aaj ${p.name} ne khana khaya?`}
                    className="flex-1 bg-paper/[0.07] border border-marigold/25 rounded-lg px-4 py-2.5 text-sm text-paper placeholder:text-paper/35 outline-none focus:border-marigold/60"
                  />
                  <button
                    disabled={asking}
                    className="bg-marigold text-ink rounded-lg px-5 py-2.5 text-sm font-medium disabled:opacity-50 shrink-0"
                  >
                    {asking ? 'Dekh rahe hain…' : 'Ask'}
                  </button>
                </form>

                {askA && (
                  <div className="mt-5 pt-5 border-t border-paper/10">
                    <p className={`font-display text-lg leading-relaxed ${askA.refused ? 'text-sage italic' : 'text-paper'}`}>
                      {askA.answer}
                    </p>
                    {askA.sources?.length > 0 && (
                      <p className="font-body text-[0.7rem] text-sage mt-3">
                        Based on {askA.sources.length} recorded {askA.sources.length === 1 ? 'memory' : 'memories'} · never invented
                      </p>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8 items-start">
            {/* TODAY TIMELINE */}
            <section ref={secs.today} className="scroll-mt-8">
              <div className="flex items-center gap-3 mb-3">
                <h2 className="font-display text-xl font-semibold">Today with {p.name}</h2>
                <span className="text-[0.62rem] tracking-wide uppercase text-teal flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal" /> Live
                </span>
                <span className="flex-1 h-px bg-teal/15" />
              </div>

              {can('logDaily') && (
                <div className="bg-white border border-teal/15 rounded-xl p-2 pl-4 flex items-center gap-2 mb-4">
                  <input
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addNote()}
                    placeholder={listening ? 'Sun rahe hain…' : `What's happening with ${p.name}?`}
                    className="flex-1 outline-none font-body text-sm bg-transparent"
                  />
                  <button
                    onClick={toggleMic}
                    className={`w-9 h-9 rounded-full flex items-center justify-center border shrink-0 ${
                      listening ? 'bg-marigold text-ink border-marigold animate-pulse' : 'border-marigold text-[#b8892f] bg-marigold/10'
                    }`}
                    aria-label="Speak the update"
                  >🎙</button>
                  <button onClick={addNote} className="bg-ink text-paper rounded-lg px-4 py-2 text-sm font-medium shrink-0">
                    Add
                  </button>
                </div>
              )}

              <div className="bg-white border border-teal/15 rounded-xl px-5">
                {data.dailyNotes.length === 0 ? (
                  <p className="font-display italic text-sage py-8 text-center">
                    No updates logged yet today.
                  </p>
                ) : (
                  data.dailyNotes.map((n) => (
                    <div key={n.id} className="flex gap-4 py-4 border-b border-teal/10 last:border-none">
                      <div className="text-xs text-sage w-16 shrink-0 pt-0.5 tabular-nums">{clock(n.createdAt)}</div>
                      <div>
                        <div className="text-sm leading-relaxed">{n.text}</div>
                        <div className="text-xs text-sage mt-0.5">{n.author}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <p className="text-xs text-sage mt-2.5">
                Updates fade after about 48 hours — so "did I eat?" always gets today's answer.
              </p>
            </section>

            {/* DOCTOR INSIGHTS (admin only) */}
            {can('insights') && (
              <section ref={secs.insights} className="scroll-mt-8">
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="font-display text-xl font-semibold">Doctor insights</h2>
                  {data.insights.length > 0 && (
                    <span className="bg-marigold text-ink text-xs font-semibold rounded-full px-2 py-0.5">{data.insights.length}</span>
                  )}
                  <span className="flex-1 h-px bg-teal/15" />
                </div>
                {data.insights.length === 0 ? (
                  <p className="font-display italic text-sage">Nothing to flag this week.</p>
                ) : (
                  data.insights.map((a, i) => (
                    <div key={i} className="bg-gradient-to-b from-[#fffdf7] to-white border border-marigold/40 rounded-xl p-4 mb-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="w-6 h-6 rounded-md bg-marigold text-ink flex items-center justify-center text-xs">!</span>
                        <span className="text-[0.66rem] font-semibold tracking-wide uppercase text-[#9a7b2e]">
                          {a.type === 'repeated_question' ? 'Repeated question' : 'Evening restlessness'}
                        </span>
                      </div>
                      <div className="font-display text-[0.98rem] leading-relaxed">{a.message}</div>
                    </div>
                  ))
                )}
                <p className="text-xs text-sage mt-1">
                  Patterns to mention at her next visit — never a diagnosis.
                </p>
              </section>
            )}
          </div>

          {/* ADD A LIFE MEMORY — contributor + admin */}
          {can('addMemory') && (
            <section ref={secs.addMemory} className="mt-10 scroll-mt-8">
              <div className="flex items-center gap-3 mb-4">
                <h2 className="font-display text-xl font-semibold">Add a life memory for {p.name}</h2>
                <span className="flex-1 h-px bg-teal/15" />
              </div>
              <RecordMemory patientId={patientId} patientName={p.name} onDone={load} />
            </section>
          )}

          {/* APPROVAL QUEUE (admin) */}
          {can('approvals') && (
            <section ref={secs.approvals} className="mt-10 scroll-mt-8">
              <div className="flex items-center gap-3 mb-4">
                <h2 className="font-display text-xl font-semibold">Waiting for approval</h2>
                {data.pending.length > 0 && (
                  <span className="bg-marigold text-ink text-xs font-semibold rounded-full px-2 py-0.5">{data.pending.length}</span>
                )}
                <span className="flex-1 h-px bg-teal/15" />
              </div>
              {data.pending.length === 0 ? (
                <p className="font-display italic text-sage">Nothing waiting. Everything's been reviewed.</p>
              ) : (
                data.pending.map((m) => (
                  <div key={m.id} className="bg-white border border-teal/15 rounded-xl p-5 mb-3.5 flex gap-4">
                    <span className="w-11 h-11 rounded-xl bg-teal/10 text-teal flex items-center justify-center text-lg shrink-0">🎙</span>
                    <div className="flex-1">
                      <div className="font-display text-lg">{m.title || 'Untitled memory'}</div>
                      <div className="text-sm text-sage mt-0.5">Life memory · uploaded by {m.uploadedBy}</div>
                      {m.excerpt && <div className="text-sm italic bg-paper rounded-lg px-3 py-2 mt-2.5 leading-relaxed">"{m.excerpt}…"</div>}
                      <div className="flex gap-2 mt-3.5">
                        <button onClick={() => review(m.id, 'approved')} className="bg-teal text-white rounded-lg px-4 py-2 text-sm font-medium">Approve</button>
                        <button onClick={() => review(m.id, 'rejected')} className="border border-clay/40 text-clay rounded-lg px-4 py-2 text-sm font-medium">Reject</button>
                      </div>
                    </div>
                  </div>
                ))
              )}
              <p className="text-xs text-sage mt-1">
                You can't approve a memory you uploaded yourself — two people must agree before anything reaches {p.name}.
              </p>
            </section>
          )}

          {/* PEOPLE — the faces she sees */}
          <section ref={secs.people} className="mt-10 scroll-mt-8">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="font-display text-xl font-semibold">
                The people {p.name} loves
              </h2>
              <span className="flex-1 h-px bg-teal/15" />
            </div>
            <PeopleSection patientId={patientId} patientName={p.name} role={role} />
          </section>

          {/* FAMILY & ACCESS (admin) */}
          {can('access') && (
            <section ref={secs.access} className="mt-10 scroll-mt-8">
              <div className="flex items-center gap-3 mb-4">
                <h2 className="font-display text-xl font-semibold">Family &amp; access</h2>
                <span className="flex-1 h-px bg-teal/15" />
              </div>
              <div className="bg-white border border-teal/15 rounded-xl p-6">
                {data.members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3.5 py-3.5 border-b border-teal/10 last:border-none">
                    <span className="w-9 h-9 rounded-full bg-ink text-marigold flex items-center justify-center font-display font-semibold text-sm shrink-0">
                      {m.name?.charAt(0) || '?'}
                    </span>
                    <div>
                      <div className="font-medium">{m.name}</div>
                      <div className="text-sm text-sage">{m.email}</div>
                    </div>
                    <span className={`ml-auto text-[0.7rem] font-semibold tracking-wide uppercase px-2.5 py-1 rounded-full ${
                      m.status === 'invited' ? 'bg-sage/15 text-sage' : ROLE_TAG[m.role]
                    }`}>
                      {m.status === 'invited' ? 'Invited' : ROLE_LABEL[m.role]}
                    </span>
                  </div>
                ))}
                <form onSubmit={invite} className="flex gap-2 mt-4">
                  <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="Email to invite" type="email" required
                    className="flex-1 border border-teal/15 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal" />
                  <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="border border-teal/15 rounded-lg px-2 py-2 text-sm bg-white outline-none">
                    <option value="contributor">Contributor</option>
                    <option value="attendant">Caregiver</option>
                    <option value="clinician">Clinician</option>
                    <option value="familyAdmin">Family admin</option>
                  </select>
                  <button className="bg-ink text-paper rounded-lg px-4 text-sm font-medium">Send</button>
                </form>
                <p className="text-xs text-sage mt-2">They'll need a Yaad account with this email first.</p>
              </div>
            </section>
          )}

          {/* CONSENT (admin) */}
          {can('consent') && data.consent && (
            <section ref={secs.consent} className="mt-10 scroll-mt-8">
              <div className="flex items-center gap-3 mb-4">
                <h2 className="font-display text-xl font-semibold">Consent &amp; safety</h2>
                <span className="flex-1 h-px bg-teal/15" />
              </div>
              <div className="bg-white border border-teal/15 rounded-xl p-6">
                <div className="flex items-center justify-between py-3.5 border-b border-teal/10">
                  <div>
                    <div className="font-medium">Memory bank status</div>
                    <div className="text-sm text-sage mt-0.5 max-w-md">
                      Freezing pauses the Mirror for {p.name} while keeping everything safe. Use during a dispute or on medical advice.
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => setConsent({ state: 'active' })}
                      className={`px-4 py-1.5 rounded-full text-sm font-medium border ${data.consent.state === 'active' ? 'bg-teal text-white border-teal' : 'bg-white text-sage border-teal/15'}`}>
                      Active
                    </button>
                    <button onClick={() => setConsent({ state: 'frozen' })}
                      className={`px-4 py-1.5 rounded-full text-sm font-medium border ${data.consent.state === 'frozen' ? 'bg-clay text-white border-clay' : 'bg-white text-sage border-teal/15'}`}>
                      Freeze
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between py-3.5">
                  <div>
                    <div className="font-medium">Speak in {p.name}'s own voice</div>
                    <div className="text-sm text-sage mt-0.5 max-w-md">Only if recorded with consent while it could be given. Off by default.</div>
                  </div>
                  <button onClick={() => setConsent({ voiceCloningPermitted: !data.consent.voiceCloningPermitted })}
                    className={`w-12 h-7 rounded-full relative shrink-0 transition-colors ${data.consent.voiceCloningPermitted ? 'bg-teal' : 'bg-sage'}`}>
                    <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${data.consent.voiceCloningPermitted ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}