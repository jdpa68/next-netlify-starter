import { useEffect, useState, useRef } from 'react';

export default function Home() {
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);

  // Load saved chat
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('lancelot_chat') : null;
    if (saved) setMsgs(JSON.parse(saved));
  }, []);

  // Save chat + auto-scroll
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
    } catch (e) {
      setMsgs(m => [...m, { role: 'assistant', content: 'Error: ' + String(e) }]);
    } finally {
      setLoading(false);
    }
  }

  function clearChat() {
    setMsgs([]);
    if (typeof window !== 'undefined') localStorage.removeItem('lancelot_chat');
  }

  return (
    <main style={{
      fontFamily:'system-ui, Arial',
      background:'#f8fafc',
      minHeight:'100vh',
      display:'flex',
      flexDirection:'column'
    }}>
      {/* Chat messages area */}
      <div ref={listRef}
           style={{flex:1, overflowY:'auto', padding:'16px', marginBottom:90}}>
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

      {/* Fixed input at bottom */}
      <div style={{
        position:'fixed',
        bottom:0,
        left:0,
        right:0,
        padding:'8px',
        background:'#fff',
        borderTop:'1px solid #e5e7eb',
        display:'flex',
        gap:8
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Type a question…"
          style={{flex:1, minHeight:48, maxHeight:120, padding:8, borderRadius:8, border:'1px solid #e5e7eb'}}
        />
        <button
          onClick={send}
          disabled={loading}
          style={{padding:'0 16px', borderRadius:8, background:'#111827', color:'#fff', border:'none'}}
        >
          {loading ? '…' : 'Send'}
        </button>
        <button
          onClick={clearChat}
          style={{padding:'0 12px', borderRadius:8, background:'#e2e8f0', border:'1px solid #cbd5e1'}}
        >
          ✕
        </button>
      </div>
    </main>
  );
}
