import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api, getToken } from '../../api/client';

const IDLE_CLEAR_MS = 90 * 1000;
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function Mirror() {
  const { patientId } = useParams();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  const clearTimer = useRef(null);
  const audioRef = useRef(null);

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
      if (!res.ok) return; // silent — voice is enhancement, text already on screen
      const blob = await res.blob();
      if (audioRef.current) audioRef.current.pause();
      audioRef.current = new Audio(URL.createObjectURL(blob));
      audioRef.current.play().catch(() => {});
    } catch {
      // silent fail — never a patient-facing error
    }
  };

  const ask = async (e) => {
    e.preventDefault();
    const q = question.trim();
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

  return (
    <div style={styles.screen}>
      <div style={styles.centerZone}>
        {busy && <p style={styles.thinking}>Yaad kar rahi hoon…</p>}

        {!busy && answer && (
          <div style={{ textAlign: 'center' }}>
            <p style={answer.refused ? styles.refusal : styles.answer}>
              {answer.text}
            </p>
            <button
              style={styles.replay}
              onClick={() => speakAnswer(answer.text)}
              aria-label="Phir se suniye"
            >
              🔊 Phir se suniye
            </button>
          </div>
        )}

        {!busy && !answer && <p style={styles.prompt}>Kuch bhi poochhiye</p>}
      </div>

      <form onSubmit={ask} style={styles.askBar}>
        <input
          style={styles.input}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Yahaan likhiye…"
          autoFocus
        />
        <button style={styles.askButton} disabled={busy}>
          Poochhiye
        </button>
      </form>
    </div>
  );
}

const styles = {
  screen: {
    position: 'fixed', inset: 0,
    display: 'flex', flexDirection: 'column',
    background: '#FDF6EC',
    fontFamily: 'system-ui, sans-serif',
  },
  centerZone: {
    flex: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '5vw',
  },
  prompt: { fontSize: 'clamp(2rem, 5vw, 3.5rem)', color: '#B08954', textAlign: 'center' },
  thinking: { fontSize: 'clamp(2rem, 5vw, 3.5rem)', color: '#B08954', textAlign: 'center' },
  answer: {
    fontSize: 'clamp(2.2rem, 6vw, 4rem)', lineHeight: 1.4,
    color: '#3B2F23', textAlign: 'center', maxWidth: '18em',
  },
  refusal: {
    fontSize: 'clamp(2.2rem, 6vw, 4rem)', lineHeight: 1.4,
    color: '#6B5B45', textAlign: 'center', maxWidth: '18em',
  },
  replay: {
    marginTop: 24, fontSize: 'clamp(1.2rem, 2.5vw, 1.6rem)',
    padding: '0.6em 1.2em', border: '3px solid #D8C3A5',
    borderRadius: 16, background: '#fff', color: '#6B5B45', cursor: 'pointer',
  },
  askBar: { display: 'flex', gap: 12, padding: '4vw' },
  input: {
    flex: 1, fontSize: 'clamp(1.4rem, 3vw, 2rem)',
    padding: '0.8em 1em', border: '3px solid #D8C3A5',
    borderRadius: 16, background: '#fff',
  },
  askButton: {
    fontSize: 'clamp(1.4rem, 3vw, 2rem)', padding: '0.8em 1.4em',
    border: 'none', borderRadius: 16, background: '#B08954', color: '#fff',
  },
};