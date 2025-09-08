import { useEffect, useState, useRef } from 'react';

// --- Voice helpers ---
const SR =
  typeof window !== 'undefined'
    ? (window.SpeechRecognition || window.webkitSpeechRecognition)
    : null;

function speak(text) {
  if (typeof window === 'undefined' || !text) return;
  try {
    const msg = new SpeechSynthesisUtterance(text);
    msg.rate = 1;
    msg.pitch = 1;
    msg.volume = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(msg);
  } catch {}
}

export default function Home() {
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(true);     // read answers aloud
  const [listening, setListening] = useState(false);  // mic recording state
  const listRef = useRef(null);
  const recRef = useRef(null);

  // Load saved chat or show welcome on first load
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('lancelot_chat') : null;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length) {
          setMsgs(parsed);
          return;
        }
      } catch {}
    }
    setMsgs([{ role: 'assistant', content: "Hello! I am Lancelot. What projects can I assist you with today?" }]);
  }, []);

  // Persist chat + auto-scroll
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('lancelot_chat', JSON.stringify(msgs));
    }
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [msgs]);

  async function send() {
    const prompt = input.trim();
    if (!prompt || loading) return;
    setLoading(true);
    setMsgs(m => [...m, { role: 'user', content: prompt }]);
    setInput('');
    try {
      const resp = await fetch('/.netlify/functions/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            ...msgs.map(x => ({ role: x.role, content: x.content })),
            { role: 'user', content: prompt }
          ]
        })
      });
      const data = await resp.json();
      const text = data?.choices?.[0]?.message?.content || 'No response';
      setMsgs(m => [...m, { role: 'assistant', content: text }]);
      if (speaking && text) speak(text);
    } catch (e) {
      const err = 'Error: ' + String(e);
      setMsgs(m => [...m, { role: 'assistant', content: err }]);
      if (speaking) speak(err);
    } finally {
      setLoading(false);
    }
  }

  function clearChat() {
    const welcome = { role: 'assistant', content: "Hello! I am Lancelot. What projects can I assist you with today?" };
    setMsgs([welcome]);
    if (typeof window !== 'undefined') localStorage.setItem('lancelot_chat', JSON.stringify([welcome]));
  }

  // Start/stop microphone (Web Speech API)
  function startListening() {
    if (!SR) {
      alert('Speech recognition is not supported in this browser. Try Chrome/Edge.');
      return;
    }
    if (!recRef.current) {
      recRef.current = new SR();
      recRef.current.lang = 'en-US';
      recRef.current.interimResults = false;
      recRef.current.maxAlternatives = 1;
      recRef.current.onresult = (e) => {
        const transcript = e.results?.[0]?.[0]?.transcript || '';
        setInput(prev => (prev ? (prev + ' ' + transcript) : transcript));
      };
      recRef.current.onend = () => setListening(false);
      recRef.current.onerror = () => setListening(false);
    }
    try {
      recRef.current.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  function stopListening() {
    try { recRef.current && recRef.current.stop(); } catch {}
    setListening(false);
  }

  return (
    <main style={{
      fontFamily:'system-ui, Arial',
      background:'#f8fafc',
      minHeight:'100vh',
      display:'flex',
      flexDirection:'column'
    }}>
      {/* Messages area */}
      <div ref={listRef}
           style={{flex:1, overflowY:'auto', padding:'16px', marginBottom:96}}>
        {msgs.map((m, i) => (
          <div key={i} style={{
            display:'flex',
            justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
            margin:'6px 0'
          }}>
            <div style={{
              maxWidth:'80%',
              padding:'10px 12px',
              borderRadius:12,
              background: m.role === 'user' ? '#111827' : '#e2e8f0',
              color: m.role === 'user' ? '#fff' : '#111827',
              whiteSpace:'pre-wrap',
              lineHeight:1.4,
              fontSize:15
            }}>
              {m.content}
            </div>
          </div>
        ))}
      </div>

      {/* Fixed input bar */}
      <div style={{
        position:'fixed',
        bottom:0,
        left:0,
        right:0,
        padding:'8px',
        background:'#ffffff',
        borderTop:'1px solid #e5e7eb',
        display:'flex',
        gap:8,
        alignItems:'stretch'
      }}>
        <button
          onClick={listening ? stopListening : startListening}
          style={{
            padding:'0 12px',
            borderRadius:8,
            background: listening ? '#ef4444' : '#e2e8f0',
            border:'1px solid #cbd5e1',
            minWidth:44
          }}
          title={listening ? 'Stop mic' : 'Speak your question'}
        >
          🎙️
        </button>

        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Type or dictate a question…  (Shift+Enter for new line)"
          style={{flex:1, minHeight:48, maxHeight:120, padding:8, borderRadius:8, border:'1px solid #e5e7eb'}}
        />

        <button
          onClick={send}
          disabled={loading}
          style={{padding:'0 16px', borderRadius:8, background:'#111827', color:'#fff', border:'none', minWidth:84}}
          title="Send"
        >
          {loading ? '…' : 'Send'}
        </button>

        <button
          onClick={() => setSpeaking(s => !s)}
          style={{padding:'0 12px', borderRadius:8, background: speaking ? '#e2e8f0' : '#fff', border:'1px solid #cbd5e1'}}
          title={speaking ? 'Voice on' : 'Voice off'}
        >
          {speaking ? '🔊' : '🔇'}
        </button>

        <button
          onClick={clearChat}
          style={{padding:'0 12px', borderRadius:8, background:'#e2e8f0', border:'1px solid #cbd5e1'}}
          title="Clear chat"
        >
          ✕
        </button>
      </div>
    </main>
  );
}
