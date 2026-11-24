import { useEffect, useRef, useState } from 'react';
import { sendChatMessage } from '../services/api.js';

const SUGGESTIONS = [
  'Liste les étudiants',
];

export default function ChatInterface() {
  const [messages, setMessages] = useState([
    {
      role: 'ai',
      text: "Bonjour ! Je suis l'assistant de l'école. Demandez-moi d'inscrire un étudiant, de lister les inscrits ou de retirer quelqu'un d'un cours.",
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(text) {
    const message = text.trim();
    if (!message || busy) return;
    setMessages((m) => [...m, { role: 'user', text: message }]);
    setInput('');
    setBusy(true);
    try {
      const res = await sendChatMessage({ message });
      setMessages((m) => [...m, { role: 'ai', text: res.reply, intent: res.intent }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'ai', text: `Erreur : ${e.message}`, error: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="chat">
      <h1>Assistant IA</h1>

      <div className="panel chat-box">
        <div className="chat-messages">
          {messages.map((m, i) => (
            <div key={i} className={`bubble ${m.role} ${m.error ? 'err' : ''}`}>
              {m.text}
              {m.intent && m.intent !== 'demo' && <small className="intent">intention : {m.intent}</small>}
            </div>
          ))}
          {busy && <div className="bubble ai muted">L'IA réfléchit…</div>}
          <div ref={endRef} />
        </div>

        <div className="suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="chip" onClick={() => send(s)} disabled={busy}>{s}</button>
          ))}
        </div>

        <form
          className="chat-input"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            placeholder="Écrivez un message…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button className="btn" disabled={busy || !input.trim()}>Envoyer</button>
        </form>
      </div>
    </section>
  );
}
