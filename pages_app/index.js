// pages_app/index.js
// Chat page with "Sign Out" in the header and "Reset Chat" beside Speed.
//
// • Sign Out appears next to Account and links to /logout (clears session, returns to /login)
// • Reset Chat clears only the conversation history (keeps your profile/org info)

import React, { useRef, useState } from "react";

export default function ChatPage() {
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [citations, setCitations] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const [speed, setSpeed] = useState("Normal");
  const inputRef = useRef(null);

  async function sendMessage(e) {
    e?.preventDefault?.();
    const content = input.trim();
    if (!content || busy) return;

    const nextHistory = [...history, { role: "user", content }];
    setHistory(nextHistory);
    setInput("");
    setBusy(true);
    setCitations([]);
    setEvidence([]);

    try {
      const res = await fetch("/.netlify/functions/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          history: nextHistory.slice(-10),
          // (optional) include speed hint if your function uses it
          speed: speed.toLowerCase()
        })
      });
      const json = await res.json();
      if (json && json.ok) {
        const reply = (json.reply || "").toString();
        setHistory((h) => [...h, { role: "assistant", content: reply }]);
        setCitations(Array.isArray(json.citations) ? json.citations : []);
        setEvidence(Array.isArray(json.evidence) ? json.evidence : []);
      } else {
        const err = (json && json.error) || "Chat failed.";
        setHistory((h) => [...h, { role: "assistant", content: `⚠️ ${err}` }]);
      }
    } catch {
      setHistory((h) => [...h, { role: "assistant", content: "⚠️ Network error." }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus?.();
    }
  }

  // Clear chat only (keep profile/org info)
  function handleResetChat() {
    try {
      // If you store conversation memory anywhere locally, clear it here:
      // localStorage.removeItem("lancelot_ctx");  // only if ctx is strictly conversation
    } catch {}
    setHistory([]);
    setCitations([]);
    setEvidence([]);
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: 16 }}>
      {/* HEADER (keeps your original style; adds Sign Out next to Account) */}
      <header style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Lancelot</h1>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <a href="/account" style={{ textDecoration: "none" }}>
            <button>Account</button>
          </a>
          <a href="/logout" style={{ textDecoration: "none" }}>
            <button>Sign Out</button>
          </a>
        </div>
      </header>

      {/* CHAT WINDOW */}
      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, minHeight: 240 }}>
        {history.length === 0 && (
          <div style={{ opacity: 0.6 }}>
            Ask about enrollment, retention, accreditation, finance, or marketing. I’ll answer with citations.
          </div>
        )}
        {history.map((m, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: "bold" }}>{m.role === "user" ? "You" : "Lancelot"}</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
          </div>
        ))}
      </section>

      {/* CONTROLS ROW: Speed + Reset Chat (same row) */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 500 }}>Speed:</span>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <input
              type="radio"
              name="speed"
              checked={speed === "Normal"}
              onChange={() => setSpeed("Normal")}
            />
            Normal
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <input
              type="radio"
              name="speed"
              checked={speed === "Fast"}
              onChange={() => setSpeed("Fast")}
            />
            Fast
          </label>
        </div>

        <div style={{ marginLeft: "auto" }}>
          <button type="button" onClick={handleResetChat}>
            Reset Chat
          </button>
        </div>
      </div>

      {/* INPUT + ASK BUTTON */}
      <form onSubmit={sendMessage} style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your question…"
          style={{ flex: 1 }}
          disabled={busy}
        />
        <button disabled={busy || !input.trim()} type="submit">
          {busy ? "Thinking…" : "Ask"}
        </button>
      </form>

      {/* EVIDENCE */}
      {citations.length > 0 && (
        <div style={{ marginTop: 16, borderTop: "1px dashed #ccc", paddingTop: 12 }}>
          <h3 style={{ marginTop: 0 }}>Evidence</h3>
          <ol>
            {citations.map((c, idx) => (
              <li key={c.id || idx}>
                <div style={{ fontWeight: 500 }}>{c.title || "Untitled"}</div>
                {c.url && (
                  <div>
                    <a href={c.url} target="_blank" rel="noreferrer">
                      {c.url}
                    </a>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* DEBUG (optional; keep collapsed) */}
      {evidence.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary>Debug: Raw Evidence Payload</summary>
          <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(evidence, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
