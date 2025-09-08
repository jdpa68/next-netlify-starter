import { useEffect, useState, useRef } from 'react';

export default function Home() {
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);

  // Load saved chat on mount
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('lancelot_chat') : null;
    if (saved) {
      setMsgs(JSON.parse(saved));
    } else {
      // Optional: start with a single assistant line so page never looks empty
      setMsgs([
        { role: 'assistant', content: "Welcome! I'm Lancelot. Ask me anything about feasibility, enrollment, finance, CRM/SIS (Slate, Salesforce, Banner, Colleague), financial aid, advising/transfer credit, curriculum, or accreditation." }
      ]);
    }
  }, []);

  // Save whenever messages change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('lancelot_chat', JSON.stringify(msgs));
    }
    // scroll to bottom
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
        body: JSON.stringify({ messages: [
          // convert our local msgs to OpenAI format
          ...msgs.map(x => ({ role: x.role, content: x.content })),
          { role: 'user', content: prompt }
        ]})
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
    <main style={{fontFamily:'system-ui, Segoe UI, Roboto, Arial', background:'#f8fafc', minHeight:'100vh'}}>
      <div style={{maxWidth:880, margin:'0 auto', padding:'24px'}}>
        {/* Header card */}
        <div style={{padding:'20px 24px', border:'1px solid #e5e7eb', borderRadius:12, background:'#fff', marginBottom:16}}>
          <span style={{display:'inline-block', padding:'6px 10px', borderRadius:8, background:'#eef2ff', color:'#3730a3', fontWeight:600, fontSize:12}}>
            Lancelot • MVP (Private)
          </span>
          <h1 style={{margin:'10px 0 8px', fontSize:22}}>Welcome, PeerQuest Testers</h1>
          <p style={{margin:0, color:'#475569', lineHeight:1.5}}>
            Feel free to get creative—there are no wrong questions. Your feedback will help us shape Lancelot.
          </p>
        </div>

        {/* How to test */}
        <div style={{padding:'16px 20px', border:'1px solid #e5e7eb', borderRadius:12, background:'#fcfcff', marginBottom:16}}>
          <h2 style={{margin:'0 0 8px', fontSize:16}}>How to Test</h2>
          <ul style={{margin:'0 0 0 18px', color:'#475569'}}>
            <li>Ask feasibility, enrollment, finance, CRM/SIS, FA, advising/transfer credit, curriculum, or accreditation questions.</li>
            <li>Mix topics in one question to see how Lancelot connects the dots.</li>
            <li>Nothing is stored off your device; this page only uses local storage for your session history.</li>
          </ul>
        </div>

        {/* Chat panel */}
        <div style={{display:'grid', gridTemplateColumns:'1fr', gap:12}}>
          <div ref={listRef}
               style={{background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, height:360, overflowY:'auto', padding:'12px'}}>
            {msgs.length === 0 && (
              <div style={{color:'#94a3b8'}}>Start by asking a question…</div>
            )}
            {msgs.map((m, i) => (
              <div key={i} style={{
                display:'flex',
                justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                margin:'6px 0'
              }}>
                <div style={{
                  maxWidth:'80%',
                  padding:'10px 12px',
                  borderRadius:10,
                  background: m.role === 'user' ? '#111827' : '#f3f4f6',
                  color: m.role === 'user' ? '#fff' : '#111827',
                  whiteSpace:'pre-wrap',
                  lineHeight:1.4
                }}>
                  {m.content}
                </div>
              </div>
            ))}
          </div>

          <div style={{display:'flex', gap:8}}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Type a question for Lancelot…  (Shift+Enter for new line)"
              style={{flex:1, minHeight:80, padding:12, border:'1px solid #e5e7eb', borderRadius:10, background:'#fff'}}
            />
            <button
              onClick={send}
              disabled={loading}
              style={{padding:'12px 16px', borderRadius:10, background:'#111827', color:'#fff', border:'none', minWidth:130}}>
              {loading ? 'Thinking…' : 'Ask Lancelot'}
            </button>
          </div>

          <div style={{display:'flex', alignItems:'center', gap:12}}>
            <button onClick={clearChat}
                    style={{padding:'8px 12px', borderRadius:8, background:'#e2e8f0', border:'1px solid #cbd5e1'}}>
              Clear chat
            </button>
            <span style={{color:'#64748b', fontSize:12}}>
              Internal testing only. No student PII is processed or stored.
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
