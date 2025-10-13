// pages_app/index.js
// Step 11e — FIXED (Reset + redirect + minimal chat wiring)
import React, { useEffect, useRef, useState } from "react";

const SESSION_KEY = "lancelot_session";
const CTX_KEY = "lancelot_ctx";           // store recent history (user/assistant)
const PROFILE_KEY = "lancelot_profile";   // presence triggers bypass of /register redirect
const PREF_AREA_KEY = "lancelot_pref_area";

export default function ChatPage() {
  const [profilePresent, setProfilePresent] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [history, setHistory] = useState([]); // {role, content}[]
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [citations, setCitations] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const inputRef = useRef(null);

  // ---- Redirect guard: if no saved profile, send user to /register ----
  useEffect(() => {
    const hasProfile = !!localStorage.getItem(PROFILE_KEY);
    setProfilePresent(hasProfile);
    if (!hasProfile) {
      window.location.replace("/register");
    }
  }, []);

  // ---- Initialize sessionId and history from localStorage ----
  useEffect(() => {
    const sid = localStorage.getItem(SESSION_KEY);
    const ctxRaw = localStorage.getItem(CTX_KEY);
    setSessionId(sid || null);
    try {
      setHistory(ctxRaw ? JSON.parse(ctxRaw) : []);
    } catch {
      setHistory([]);
    }
  }, []);

  // ---- Persist history to localStorage whenever it changes ----
  useEffect(() => {
    localStorage.setItem(CTX_KEY, JSON.stringify(history.slice(-10)));
  }, [history]);

  async function sendMessage(e) {
    e?.preventDefault?.();
    const content = input.trim();
    if (!content || busy) return;

    const prefArea = (localStorage.getItem(PREF_AREA_KEY) || "").trim();
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
          sessionId: sessionId || undefined,
          history: nextHistory.slice(-10),
          pref_area: prefArea
        })
      });
      const json = await res.json();
      if (json && json.ok) {
        if (json.sessionId && json.sessionId !== sessionId) {
          setSessionId(json.sessionId);
          localStorage.setItem(SESSION_KEY, json.sessionId);
        }
        const reply = (json.reply || "").toString();
        setHistory(h => [...h, { role: "assistant", content: reply }]);
        setCitations(Array.isArray(json.citations) ? json.citations : []);
        setEvidence(Array.isArray(json.evidence) ? json.evidence : []);
      } else {
        const err = (json && json.error) || "Chat failed.";
        setHistory(h => [...h, { role: "assistant", content: `⚠️ ${err}` }]);
      }
    } catch (err) {
      setHistory(h => [...h, { role: "assistant", content: "⚠️ Network error." }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus?.();
    }
  }

  // ---- Reset: clears both lancelot_ctx and lancelot_session ----
  function handleReset() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(CTX_KEY);
    setSessionId(null);
    setHistory([]);
    setCitations([]);
    setEvidence([]);
  }

  // Very light UI to avoid changing the look/feel too much
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: 16 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Lancelot</h1>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={handleReset} title="Reset conversation (clears memory + session)">
            Reset
          </button>
          <a href="/account" style={{ textDecoration: "none" }}>
            <button title="Go to your Library/Account">Account</button>
          </a>
        </div>
      </header>

      {!profilePresent && (
        <div style={{ padding: 8, background: "#fff3cd", border: "1px solid #ffeeba", marginBottom: 12 }}>
          Redirecting to registration…
        </div>
      )}

      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, minHeight: 240 }}>
        {history.length === 0 && (
          <div style={{ opacity: 0.6 }}>Ask anything about enrollment, retention, or accreditation.</div>
        )}
        {history.map((m, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: "bold" }}>{m.role === "user" ? "You" : "Lancelot"}</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
          </div>
        ))}
      </section>

      <form onSubmit={sendMessage} style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your question…"
          style={{ flex: 1 }}
          disabled={busy}
        />
        <button disabled={busy || !input.trim()} type="submit">
          {busy ? "Thinking…" : "Send"}
        </button>
      </form>

      {/* Evidence Drawer (simple) */}
      {citations.length > 0 && (
        <div style={{ marginTop: 16, borderTop: "1px dashed #ccc", paddingTop: 12 }}>
          <h3 style={{ marginTop: 0 }}>Evidence</h3>
          <ol>
            {citations.map((c, idx) => (
              <li key={c.id || idx}>
                <div style={{ fontWeight: 500 }}>{c.title || "Untitled"}</div>
                {c.url && (
                  <div>
                    <a href={c.url} target="_blank" rel="noreferrer">{c.url}</a>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Advanced evidence payload for debugging (collapsed look) */}
      {evidence.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary>Debug: Raw Evidence Payload</summary>
          <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(evidence, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
