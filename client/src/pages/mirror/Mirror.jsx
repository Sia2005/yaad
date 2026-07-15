import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api, getToken } from '../../api/client';

const IDLE_CLEAR_MS = 90 * 1000;
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

export default function Mirror() {
  const { patientId } = useParams();
  const [patientName, setPatientName] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const clearTimer = useRef(null);
  const audioRef = useRef(null);
  const recognitionRef = useRef(null);

  // fetch the real patient so the Mirror never hardcodes a name
  useEffect(() => {
    api(`/patients/${patientId}`)
      .then((d) => setPatientName(d.patient?.name || ''))
      .catch(() => setPatientName(''));
  }, [patientId]);

  useEffect(() => {
    if (!answer) return;
    clearTimer.current = setTimeout(() => setAnswer(null), IDLE_CLEAR_MS);
    return () => clearTimeout(clearTimer.current);
  }, [answer]);

  const speakAnswer = async (text) => {
    try {
      const res = await fetch(`${BASE}/patients/${patientId}/speak`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      if (audioRef.current) audioRef.current.pause();
      audioRef.current = new Audio(URL.createObjectURL(blob));
      audioRef.current.play().catch(() => {});
    } catch {
      /* voice is an enhancement; never surface an error to the patient */
    }
  };

  const ask = async (rawQuestion) => {
    const q = (rawQuestion ?? question).trim();
    if (!q || busy) return;
    setBusy(true);
    setAnswer(null);
    try {
      const r = await api(`/patients/${patientId}/ask`, {
        method: 'POST',
        body: { question: q },
      });
      setAnswer({ text: r.answer, refused: r.refused });
      speakAnswer(r.answer);
    } catch {
      setAnswer({ text: 'Ek minute rukiye, phir se poochhiye.', refused: true });
    } finally {
      setBusy(false);
      setQuestion('');
    }
  };

  const toggleListening = () => {
    if (!SpeechRecognition) {
      alert('Is browser mein awaaz se poochhna abhi available nahi hai.');
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'hi-IN';
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => setListening(true);
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join('');
      setQuestion(transcript);
      if (event.results[event.results.length - 1].isFinal) {
        ask(transcript);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const onSubmit = (e) => {
    e.preventDefault();
    ask();
  };

  return (
    <div className="relative min-h-screen flex flex-col bg-ink text-paper overflow-hidden">
      <div
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 -bottom-1/3 w-4/5 h-3/5"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(228,179,99,0.18), transparent 70%)',
        }}
      />

      <div className="absolute top-8 left-10 z-10">
        <div className="font-display text-2xl text-marigold/80 leading-none">
          Yaad
        </div>
        {patientName && (
          <div className="font-body text-[0.7rem] tracking-[0.15em] uppercase text-marigold/50 mt-1">
            {patientName}
          </div>
        )}
      </div>

      <div className="flex-1 flex items-center justify-center px-[8vw] py-[6vw] z-[1]">
        {busy && (
          <p className="font-display italic text-sage text-center text-[clamp(1.6rem,3.5vw,2.6rem)]">
            Yaad kar rahi hoon…
          </p>
        )}

        {!busy && answer && (
          <div className="text-center">
            <p
              className={`font-display font-normal leading-[1.45] max-w-[20em] tracking-[-0.01em] text-[clamp(2rem,4.5vw,3.6rem)] ${
                answer.refused ? 'text-sage' : 'text-paper'
              }`}
            >
              {answer.text}
            </p>
            <button
              onClick={() => speakAnswer(answer.text)}
              className="mt-8 font-body text-[clamp(1rem,2vw,1.3rem)] px-6 py-3 rounded-full border border-marigold/40 text-marigold/90 hover:bg-marigold/10 transition"
            >
              🔊 Phir se suniye
            </button>
          </div>
        )}

        {!busy && !answer && (
          <p className="font-display italic text-sage text-center text-[clamp(1.6rem,3.5vw,2.6rem)]">
            Kuch bhi poochhiye
          </p>
        )}
      </div>

      <form
        onSubmit={onSubmit}
        className="flex items-center gap-4 px-[4vw] pt-[2.5vw] pb-[4vw] z-[1]"
      >
        <button
          type="button"
          onClick={toggleListening}
          aria-label="Awaaz se poochhiye"
          className={`shrink-0 w-16 h-16 rounded-full flex items-center justify-center text-2xl border transition ${
            listening
              ? 'bg-marigold text-ink border-marigold animate-[pulse_1.4s_ease-in-out_infinite]'
              : 'bg-marigold/15 text-marigold border-marigold'
          }`}
        >
          🎙
        </button>

        <input
          className="flex-1 rounded-full px-7 py-4 text-[clamp(1.1rem,2vw,1.5rem)] bg-paper/[0.06] border-[1.5px] border-marigold/30 text-paper placeholder:text-paper/40 outline-none focus:border-marigold/60"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={listening ? 'Sun rahi hoon…' : 'Yahaan poochhiye, ya mic dabaiye…'}
        />

        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded-full bg-marigold text-ink font-body font-medium px-8 py-4 text-[clamp(1.1rem,2vw,1.4rem)] disabled:opacity-50"
        >
          Poochhiye
        </button>
      </form>
    </div>
  );
}