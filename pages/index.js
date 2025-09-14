// pages/index.js
import { useState, useEffect, useRef } from "react";

/** Tiny safe Markdown renderer (bold, italic, lists, code). */
function renderMarkdown(md) {
  const escape = (s) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let html = escape(md);
  html = html.replace(/```([\s\S]*?)```/g, (_, code) =>
    `<pre style="white-space:pre-wrap;margin:8px 0;padding:10px;border-radius:8px;border:1px solid #eee;background:#f6f8fa;"><code>${escape(code)}</code></pre>`
  );
  html = html.replace(/`([^`\n]+)`/g, (_, code) =>
    `<code style="background:#f6f8fa;padding:2px 4px;border-radius:4px;border:1px solid #eee;">${escape(code)}</code>`
  );
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[\s(])_([^_]+)_/g, "$1<em>$2</em>");
  html = html.replace(/(^|\n)(\d+)\.\s+(.*?)(?=\n\d+\. |\n- |\n\* |\n$)/gs, (m) => {
    const items = m.trim().split(/\n(?=\d+\. )/g).map(l=>l.replace(/^\d+\.\s+/,"")).map(li=>`<li>${li}</li>`).join("");
    return `\n<ol style="margin:8px 0 8px 20px;">${items}</ol>`;
  });
  html = html.replace(/(^|\n)[-*]\s+(.*?)(?=\n- |\n\* |\n\d+\. |\n$)/gs, (m) => {
    const items = m.trim().split(/\n(?=[-*]\s+)/g).map(l=>l.replace(/^[*-]\s+/,"")).map(li=>`<li>${li}</li>`).join("");
    return `\n<ul style="margin:8px 0 8px 20px;">${items}</ul>`;
  });
  html = html.replace(/\n/g, "<br/>");
  return html;
}

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState(() => {
    if (typeof window === "undefined")
      return [{ role: "assistant", content: "Hello! I am Lancelot—may I have your preferred name, and how may I help you today?" }];
    const saved = localStorage.getItem("lancelot_chat");
    return saved
      ? JSON.parse(saved)
      : [{ role: "assistant", content: "Hello! I am Lancelot—may I have your preferred name, and how may I help you today?" }];
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem("lancelot_chat", JSON.stringify(messages.slice(-25))); } catch {}
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function onSend(e) {
    e.preventDefault();
    setError("");
    const text = input.trim();
    if (!text || loading) return;

    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setLoading(true);

    const start = Date.now();
    try {
      const res = await fetch("/.netlify/functions/chat-ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: text })
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: (json.answer || "(no answer)") + `\n\n_(answered in ${elapsed}s)_` }
      ]);
    } catch (err) {
      setError(String(err.message || err));
      setMessages((m) => [...m, { role: "assistant", content: "Sorry—something went wrong. Try again." }]);
    } finally { setLoading(false); }
  }

  function clearChat() {
    setMessages([{ role: "assistant", content: "Hello! I am Lancelot—may I have your preferred name, and how may I help you today?" }]);
    setError(""); setInput("");
  }

  function copyText(t){ try{ navigator.clipboard.writeText(t); alert("Copied to clipboard"); }catch{} }

  function getLastAssistant(){ for (let i=messages.length-1;i>=0;i--) if(messages[i].role==="assistant") return messages[i].content; return ""; }

  function emailLastAnswer(){
    const c=getLastAssistant()||"(no answer yet)";
    const subject="Lancelot answer";
    const body=c.replace(/\n/g,"%0D%0A");
    try{navigator.clipboard.writeText(c);}catch{}
    window.location.href=`mailto:?subject=${encodeURIComponent(subject)}&body=${body}`;
  }

  function downloadTxt(){
    const lines=messages.map(m=>`${m.role.toUpperCase()}: ${m.content}`);
    const blob=new Blob([lines.join("\n\n")],{type:"text/plain;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    const ts=new Date().toISOString().slice(0,19).replace(/[:T]/g,"-");
    a.href=url; a.download=`lancelot-chat-${ts}.txt`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  async function downloadWord(){
    try{
      const res=await fetch("/.netlify/functions/download-chat-rtf",{
        method:"POST", headers:{"content-type":"application/json"},
        body:JSON.stringify({messages})
      });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob=await res.blob();
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      const ts=new Date().toISOString().slice(0,19).replace(/[:T]/g,"-");
      a.href=url; a.download=`lancelot-chat-${ts}.rtf`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }catch(e){ alert("Download failed: "+(e?.message||e)); }
  }

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <div style={styles.headerRow}>
          <h1 style={{ margin: 0 }}>Lancelot</h1>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={emailLastAnswer} style={styles.secondaryBtn}>Email last answer</button>
            <button onClick={downloadWord} style={styles.secondaryBtn}>Download chat (Word)</button>
            <button onClick={downloadTxt} style={styles.secondaryBtn}>Download chat (.txt)</button>
            <button onClick={clearChat} style={styles.secondaryBtn}>Clear chat</button>
          </div>
        </div>

        <div style={styles.messages} id="chat-output">
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={m.role === "user" ? styles.user : styles.assistant}>
                <div style={styles.bubbleHeader}>
                  <div style={styles.role}>{m.role === "user" ? "You" : "Lancelot"}</div>
                  <button onClick={() => copyText(m.content)} style={styles.copyBtn} title="Copy">Copy</button>
                </div>
                <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {error ? <div style={styles.error}>Error: {error}</div> : null}

        <form onSubmit={onSend} style={styles.form}>
          <textarea
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(e); } }}
            placeholder="Type your question…"
            rows={3}
            style={styles.textarea}
          />
          <button type="submit" style={styles.button} disabled={loading}>{loading ? "Thinking…" : "Send"}</button>
        </form>

        <div style={styles.hint}>Tip: try **Create an accreditation task list for a small private college.**</div>
      </div>
    </main>
  );
}

const styles = {
  main:{minHeight:"100vh",background:"#0b1020",display:"flex",alignItems:"center",justifyContent:"center",padding:20},
  card:{width:"100%",maxWidth:780,background:"white",borderRadius:12,padding:20,boxShadow:"0 10px 30px rgba(0,0,0,0.2)"},
  headerRow:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,gap:8},
  messages:{border:"1px solid #e6e6e6",borderRadius:8,padding:12,height:460,overflowY:"auto",background:"#fafafa",marginBottom:12},
  user:{background:"#dff0ff",borderRadius:8,padding:10,margin:"8px",maxWidth:"70%",alignSelf:"flex-end"},
  assistant:{background:"#f2f7ff",borderRadius:8,padding:10,margin:"8px",maxWidth:"70%",alignSelf:"flex-start"},
  bubbleHeader:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6},
  role:{fontSize:12,fontWeight:600,color:"#666"},
  form:{display:"flex",gap:8,alignItems:"stretch"},
  textarea:{flex:1,padding:10,borderRadius:8,border:"1px solid #ddd",resize:"vertical"},
  button:{padding:"10px 16px",borderRadius:8,border:"none",background:"#3a5bfd",color:"#fff",cursor:"pointer"},
  secondaryBtn:{padding:"8px 12px",borderRadius:8,border:"1px solid #cbd5e1",background:"#f8fafc",color:"#111827",cursor:"pointer"},
  hint:{marginTop:8,fontSize:12,color:"#666"},
  error:{color:"#b00020",marginBottom:8},
  copyBtn:{fontSize:12,border:"1px solid #e5e7eb",background:"#fff",borderRadius:6,padding:"4px 8px",cursor:"pointer"}
};
