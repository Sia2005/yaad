import { useState, useRef } from 'react';
import { getToken } from '../api/client';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const MAX_MB = 25;

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function RecordMemory({ patientId, patientName, onDone }) {
  const [title, setTitle] = useState('');
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const fileInputRef = useRef(null);

  const reset = () => {
    setBlob(null);
    setFile(null);
    setSeconds(0);
    setTitle('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const startRec = async () => {
    setErr('');
    setMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        setBlob(new Blob(chunksRef.current, { type: 'audio/webm' }));
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(timerRef.current);
      };

      mr.start();
      mediaRef.current = mr;
      setFile(null);
      setBlob(null);
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setErr('Mic permission is needed to record. Allow it and try again.');
    }
  };

  const stopRec = () => {
    mediaRef.current?.stop();
    setRecording(false);
  };

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) {
      setErr(`That file is over ${MAX_MB}MB. Try a shorter recording.`);
      return;
    }
    setErr('');
    setBlob(null);
    setFile(f);
  };

  const submit = async () => {
    const payload = file || blob;
    if (!payload) {
      setErr('Record something or choose an audio file first.');
      return;
    }
    if (!title.trim()) {
      setErr('Give it a short title so the family knows what it is.');
      return;
    }

    setBusy(true);
    setErr('');
    setMsg('');

    try {
      const form = new FormData();
      form.append('audio', payload, file ? file.name : 'recording.webm');
      form.append('title', title.trim());

      const res = await fetch(`${BASE}/patients/${patientId}/memories`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: form, // no Content-Type — the browser sets the multipart boundary
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `upload failed (${res.status})`);
      }

      reset();
      setMsg(
        'Sent. It is being transcribed now, then a family admin will review it.'
      );
      onDone?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const ready = !!(file || blob);

  return (
    <div className="bg-white border border-teal/15 rounded-xl p-6">
      <p className="font-body text-sm text-sage mb-5 max-w-lg">
        Tell {patientName}'s story in your own voice — her wedding, her first
        job, the village, a person she loves. Speak to her as "aap". A family
        admin reviews it before it ever reaches her.
      </p>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What is this memory about? (e.g. Dadi ki shaadi)"
        className="w-full border border-teal/15 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-teal mb-4"
      />

      <div className="flex flex-wrap items-center gap-3">
        {!recording ? (
          <button
            onClick={startRec}
            disabled={busy}
            className="flex items-center gap-2 bg-clay text-white rounded-lg px-5 py-2.5 text-sm font-medium disabled:opacity-50"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-white" />
            Record
          </button>
        ) : (
          <button
            onClick={stopRec}
            className="flex items-center gap-2 bg-ink text-paper rounded-lg px-5 py-2.5 text-sm font-medium"
          >
            <span className="w-2.5 h-2.5 bg-clay animate-pulse" />
            Stop · {fmt(seconds)}
          </button>
        )}

        <span className="text-xs text-sage">or</span>

        <label className="cursor-pointer border border-teal/25 text-teal rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-teal/5">
          Choose an audio file
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={pickFile}
            className="hidden"
          />
        </label>

        {ready && (
          <span className="text-xs text-teal font-medium">
            {file ? file.name : `Recorded ${fmt(seconds)}`}
            <button
              onClick={reset}
              className="ml-2 text-sage underline font-normal"
            >
              clear
            </button>
          </span>
        )}
      </div>

      {ready && (
        <audio
          controls
          src={URL.createObjectURL(file || blob)}
          className="mt-4 w-full max-w-sm h-9"
        />
      )}

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={busy || !ready}
          className="bg-teal text-white rounded-lg px-6 py-2.5 text-sm font-medium disabled:opacity-40"
        >
          {busy ? 'Sending…' : 'Send for review'}
        </button>
        {err && <span className="text-sm text-clay">{err}</span>}
        {msg && <span className="text-sm text-teal">{msg}</span>}
      </div>

      <p className="text-xs text-sage mt-4">
        Recording works in Chrome and Edge. Files up to {MAX_MB}MB.
      </p>
    </div>
  );
}