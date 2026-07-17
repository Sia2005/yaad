import { useEffect, useState, useRef } from 'react';
import { api, getToken } from '../api/client';
import PersonPhoto from './PersonPhoto';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function PeopleSection({ patientId, patientName, role }) {
  const canAdd = ['familyAdmin', 'contributor'].includes(role);
  const canReview = role === 'familyAdmin';

  const [people, setPeople] = useState([]);
  const [pending, setPending] = useState([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // add form
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [story, setStory] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const load = () => {
    api(`/patients/${patientId}/people`)
      .then((d) => setPeople(d.people))
      .catch((e) => setErr(e.message));

    if (canReview) {
      api(`/patients/${patientId}/people?status=pending`)
        .then((d) => setPending(d.people))
        .catch(() => {});
    }
  };
  useEffect(load, [patientId, role]);

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) {
      setErr('That photo is over 8MB — try a smaller one.');
      return;
    }
    setErr('');
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const reset = () => {
    setName('');
    setRelationship('');
    setStory('');
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const submit = async () => {
    if (!file) return setErr('A photo is needed — the face is the whole point.');
    if (!name.trim() || !relationship.trim()) {
      return setErr('Name and relationship are both needed.');
    }
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const form = new FormData();
      form.append('photo', file, file.name);
      form.append('name', name.trim());
      form.append('relationship', relationship.trim());
      form.append('story', story.trim());

      const res = await fetch(`${BASE}/patients/${patientId}/people`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: form,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `upload failed (${res.status})`);
      }
      reset();
      setMsg('Added. A family admin will review it before it reaches her.');
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const review = async (personId, decision) => {
    try {
      await api(`/patients/${patientId}/people/${personId}/review`, {
        method: 'POST',
        body: { decision },
      });
      load();
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div>
      {err && (
        <p className="mb-4 font-body text-sm text-clay bg-clay/5 rounded-lg px-4 py-2">{err}</p>
      )}
      {msg && (
        <p className="mb-4 font-body text-sm text-teal bg-teal/10 rounded-lg px-4 py-2">{msg}</p>
      )}

      {/* the faces she'll see */}
      <div className="bg-white border border-teal/15 rounded-xl p-6 mb-4">
        <p className="font-body text-sm text-sage mb-4">
          {people.length === 0
            ? `No one yet. When ${patientName} sees a face she can't place, these cards tell her who it is.`
            : `${patientName} sees these faces on her Mirror.`}
        </p>
        {people.length > 0 && (
          <div className="flex flex-wrap gap-5">
            {people.map((p) => (
              <div key={p.id} className="w-28 text-center">
                <PersonPhoto
                  patientId={patientId}
                  personId={p.id}
                  name={p.name}
                  className="w-24 h-24 rounded-full mx-auto"
                />
                <div className="font-display text-base mt-2 leading-tight">{p.name}</div>
                <div className="text-xs text-sage">{p.relationship}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* review queue — admin only */}
      {canReview && pending.length > 0 && (
        <div className="bg-gradient-to-b from-[#fffdf7] to-white border border-marigold/40 rounded-xl p-6 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[0.66rem] font-semibold tracking-wide uppercase text-[#9a7b2e]">
              Waiting for your review
            </span>
            <span className="bg-marigold text-ink text-xs font-semibold rounded-full px-2">
              {pending.length}
            </span>
          </div>
          {pending.map((p) => (
            <div key={p.id} className="flex gap-4 py-3 border-b border-marigold/15 last:border-none">
              <PersonPhoto
                patientId={patientId}
                personId={p.id}
                name={p.name}
                className="w-16 h-16 rounded-full shrink-0"
              />
              <div className="flex-1">
                <div className="font-display text-lg leading-tight">
                  {p.name} <span className="text-sage text-sm">· {p.relationship}</span>
                </div>
                {p.story && <div className="text-sm text-ink/80 mt-1 italic">"{p.story}"</div>}
                <div className="text-xs text-sage mt-1">Added by {p.addedBy}</div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => review(p.id, 'approved')}
                    className="bg-teal text-white rounded-lg px-4 py-1.5 text-sm font-medium"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => review(p.id, 'rejected')}
                    className="border border-clay/40 text-clay rounded-lg px-4 py-1.5 text-sm font-medium"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
          <p className="text-xs text-sage mt-3">
            You can't approve a card you added yourself — telling her who someone is takes two people.
          </p>
        </div>
      )}

      {/* add someone */}
      {canAdd && (
        <div className="bg-white border border-teal/15 rounded-xl p-6">
          <p className="font-body text-sm text-sage mb-4 max-w-lg">
            Add someone {patientName} loves. Write the relationship the way she should
            hear it — "aapka pota", not "grandson".
          </p>

          <div className="flex gap-5">
            <label className="shrink-0 cursor-pointer">
              {preview ? (
                <img src={preview} alt="" className="w-24 h-24 rounded-full object-cover" />
              ) : (
                <div className="w-24 h-24 rounded-full border-[1.5px] border-dashed border-teal/35 flex flex-col items-center justify-center text-sage hover:border-teal hover:text-teal transition">
                  <span className="text-2xl leading-none">+</span>
                  <span className="text-[0.65rem] mt-1">photo</span>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={pickFile}
                className="hidden"
              />
            </label>

            <div className="flex-1 space-y-2.5">
              <div className="flex gap-2.5">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Their name — e.g. Arjun"
                  className="flex-1 border border-teal/15 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal"
                />
                <input
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  placeholder="aapka pota"
                  className="flex-1 border border-teal/15 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal"
                />
              </div>
              <input
                value={story}
                onChange={(e) => setStory(e.target.value)}
                placeholder="One warm line she should hear — e.g. Arjun 1999 mein paida hua tha, aapne hi naam rakha tha."
                className="w-full border border-teal/15 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal"
              />
              <button
                onClick={submit}
                disabled={busy}
                className="bg-teal text-white rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-40"
              >
                {busy ? 'Adding…' : 'Add for review'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}