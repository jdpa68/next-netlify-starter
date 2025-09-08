export default function Home() {
  return (
    <main style={{fontFamily:'system-ui, Segoe UI, Roboto, Arial', padding:'40px'}}>
      <div style={{maxWidth:760, margin:'0 auto', padding:'32px', border:'1px solid #e5e7eb', borderRadius:12}}>
        <span style={{display:'inline-block', padding:'6px 10px', borderRadius:8, background:'#eef2ff', color:'#3730a3', fontWeight:600}}>
          Lancelot • MVP
        </span>
        <h1 style={{margin:'12px 0 8px'}}>Welcome to the Lancelot MVP</h1>
<p>
  This early version of Lancelot has been set up exclusively for PeerQuest testers.
  Jim Dunn has asked me to remind you that you will not break the system—so feel free to get creative
  with your questions and test how Lancelot responds.
</p>
<p>
  Your feedback will help us shape Lancelot into the most valuable higher education
  strategy and enrollment tool on the market.
</p>
        <h2>How to Test</h2>
<ul>
  <li>Ask Lancelot enrollment strategy questions, financial aid, academics, campus operations, anything you like — for example, ask about feasibility studies, or program launches, or financial models.</li>
  <li>Try combining multiple topics in a single question to see how Lancelot connects the dots.</li>
  <li>Experiment with both simple and complex scenarios — there are no wrong questions.</li>
  <li>After testing, share your feedback directly with Jim Dunn and the PeerQuest team so we can improve the experience.</li>
</ul>
        <div style={{marginTop:16}}>
  <textarea
    id="prompt"
    placeholder="Type a question for Lancelot…"
    style={{width:'100%', minHeight:100, padding:12, border:'1px solid #e5e7eb', borderRadius:8}}
  />
  <button
    onClick={async (event) => {
      const prompt = document.getElementById('prompt').value || '';
      const btn = event.currentTarget;
      btn.disabled = true; btn.textContent = 'Thinking…';
      try {
        const resp = await fetch('/.netlify/functions/chat', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] })
        });
        const data = await resp.json();
        const text = data?.choices?.[0]?.message?.content || 'No response';
        document.getElementById('answer').textContent = text;
      } catch (e) {
        document.getElementById('answer').textContent = 'Error: ' + String(e);
      } finally {
        btn.disabled = false; btn.textContent = 'Ask Lancelot';
      }
    }}
    style={{marginTop:12, padding:'12px 16px', borderRadius:10, background:'#111827', color:'#fff', border:'none'}}
  >
    Ask Lancelot
  </button>
  <div id="answer" style={{marginTop:16, whiteSpace:'pre-wrap'}} />
</div>
        <p style={{color:'#6b7280', fontSize:14, marginTop:12}}>Internal testing only. No student PII is processed or stored.</p>
      </div>
    </main>
  );
}
