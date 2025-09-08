export default function Home() {
  return (
    <main style={{fontFamily:'system-ui, Segoe UI, Roboto, Arial', padding:'40px'}}>
      <div style={{maxWidth:760, margin:'0 auto', padding:'32px', border:'1px solid #e5e7eb', borderRadius:12}}>
        <span style={{display:'inline-block', padding:'6px 10px', borderRadius:8, background:'#eef2ff', color:'#3730a3', fontWeight:600}}>
          Lancelot • MVP
        </span>
        <h1 style={{margin:'12px 0 8px'}}>Welcome, PeerQuest Testers</h1>
        <p>This is a minimal Next.js page deployed on Netlify. We’ll attach secure sign-in and the chat proxy next.</p>
        <h2>Next Steps</h2>
        <ul>
          <li>Add password protection or Firebase Auth for invite-only access.</li>
          <li>Wire a Netlify Function for OpenAI (keeps your API key server-side).</li>
          <li>Swap this page for the full app when ready.</li>
        </ul>
        <button onClick={() => alert('Coming soon: secure login + chat proxy')}
                style={{marginTop:16, padding:'12px 16px', borderRadius:10, background:'#111827', color:'#fff', border:'none'}}>
          Test Button
        </button>
        <p style={{color:'#6b7280', fontSize:14, marginTop:12}}>Internal testing only. No student PII is processed or stored.</p>
      </div>
    </main>
  );
}
