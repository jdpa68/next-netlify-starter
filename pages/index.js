// pages/index.js
import { useEffect, useState, useRef } from 'react';
export default function Home() {
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState('');
  const listRef = useRef(null);
  // Load saved name + chat or show welcome
  useEffect(() => {
    const savedName = typeof window !== 'undefined' ? localStorage.getItem('lancelot_name') : null;
    if (savedName) setUserName(savedName);
    const savedChat = typeof window !== 'undefined' ? localStorage.getItem('lancelot_chat') : null;
    if (savedChat) {
      try {
        const parsed = JSON.parse(savedChat);
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
  // Personalized first-turn greeting once we know their name
  useEffect(() => {
    if (!userName) return;
    if (!Array.isArray(msgs) || msgs.length === 0) return;
    const first = msgs[0];
    const looksLikeDefaultWelcome =
      first?.role === 'assistant' &&
      typeof first?.content === 'string' &&
      /What projects can I assist you with today\?/i.test(first.content);
    if (looksLikeDefaultWelcome) {
      setMsgs([
        {
          role: 'assistant',
          content: `Hi, ${userName} — what goal are we aiming at today? If you already have a project summary, paste it here and I’ll work from that. Otherwise, I can build a quick starter summary in about 60 seconds.`
        }
      ]);
    }
  }, [userName]); // runs when a name is set
  // Heuristic for Quick Answer mode (short question ending with "?")
  const lastUserMsg = [...msgs].reverse().find(m => m.role === 'user');
  const likelyQuickQuestion = lastUserMsg && lastUserMsg.content.trim().length <= 120 && /\?\s*$/.test(lastUserMsg.content);
  async function send() {
    const prompt = input.trim();
    if (!prompt || loading) return;
    setLoading(true);
    setMsgs(m => [...m, { role: 'user', content: prompt }]);
    setInput('');
    try {
      // Intent hint + name context
      const intentHintMsg = [{ role: 'system', content: `Intent hint: ${ (prompt.length <= 120 && /\?\s*$/.test(prompt)) ? 'QUICK_ANSWER' : 'PROJECT' }` }];
      const contextNameMsg = userName
        ? [{ role: 'system', content: `The user's preferred name is ${userName}. Address them by name naturally.` }]
        : [];
      const resp = await fetch('/.netlify/functions/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            ...intentHintMsg,
            ...contextNameMsg,
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
    const welcome = { role: 'assistant', content: "Hello! I am Lancelot. What projects can I assist you with today?" };
    setMsgs([welcome]);
    if (typeof window !== 'undefined') localStorage.setItem('lancelot_chat', JSON.stringify([welcome]));
  }
  return (
    <main style={{
      fontFamily:'system-ui, Arial',
      background:'#f8fafc',
      minHeight:'100vh',
      display:'flex',
      flexDirection:'column'
    }}>
      {/* Name capture (once) */}
      {!userName && (
        <div style={{padding:'8px 12px', background:'#fffbe6', border:'1px solid #facc15', borderRadius:8, margin:'12px 16px'}}>
          <div style={{marginBottom:8}}>What’s your preferred name?</div>
          <div style={{display:'flex', gap:8}}>
            <input
              placeholder="e.g., Jim"
              onKeyDown={(e)=>{
                if(e.key==='Enter'){
                  const v=e.currentTarget.value.trim();
                  if(v){ setUserName(v); localStorage.setItem('lancelot_name', v); }
                }
              }}
              style={{flex:1, padding:'8px 10px', border:'1px solid #e5e7eb', borderRadius:8}}
            />
            <button
              onClick={()=>{
                const el = document.activeElement;
                if (el && 'value' in el) {
                  const v = el.value.trim();
                  if (v) { setUserName(v); localStorage.setItem('lancelot_name', v); }
                }
              }}
              style={{padding:'8px 12px', borderRadius:8, background:'#111827', color:'#fff', border:'none'}}
            >
              Save
            </button>
          </div>
        </div>
      )}
      {/* Optional helper: Build a project summary (hidden for quick Qs) */}
      {userName && !likelyQuickQuestion && (
        <div style={{padding:'8px 12px', margin:'0 16px 8px', display:'flex', gap:8, alignItems:'center'}}>
          <button
            onClick={() => {
              const starter = `Please generate a concise, one-page project summary with headings and brief bullet prompts that I can fill in for this initiative. Include sections for: Goal, Success Metrics, Timeline & Milestones, Stakeholders & Roles, Assumptions & Inputs (tuition/discount, targets, seasonality), Risks & Mitigations, Dependencies (CRM/SIS/FA/Advising/Marketing), and Next 2 Steps. Keep it tight and practical.`;
              setInput(starter);
            }}
            style={{padding:'6px 10px', borderRadius:8, background:'#e2e8f0', border:'1px solid #cbd5e1', fontSize:13}}
            title="Auto-fill a starter prompt you can send"
          >
            Build a project summary
          </button>
          <span style={{color:'#64748b', fontSize:12}}>Tip: paste your project summary any time, and I’ll work from that.</span>
        </div>
      )}
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
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Type a question or paste your project summary…  (Shift+Enter = new line)"
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
