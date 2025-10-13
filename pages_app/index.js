// pages_app/index.js
// Chat page with sign-in check using Supabase Auth

import React, { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function ChatPage() {
  const [authed, setAuthed] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [citations, setCitations] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const inputRef = useRef(null);

  // ---- Sign-in check ----
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const s = data?.session || null;
      if (!s) {
        window.location.replace("/login");
      } else {
        setAuthed(true);
      }
      setSessionChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s) window.location.replace("/login");
      else setAuthed(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function sendMessage(e) {
    e?.preventDefault?.();
    if (!authed) return;
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
          sessionId: sessionId || undefined,
          history: nextHistory.slice(-10)
        })
      });
      const json = await res.json();
      if (json && json.ok) {
        if (json.sessionId && json.sessionId !== sessionId) setSessionId(json.sessionId);
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

  function handleReset() {
    // Smart reset: clears chat but keeps user/org info
    setHistory([]);
    setCitations([]);
    setEvidence([]);
  }

  if (!sessionChecked) {
    return <div style={{ padding: 20 }}>Checking sign-in status…</div>;
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: 16 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Lancelot</h1>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={handleReset}>Reset Chat</button>
          <a href="/account" style={{ textDecoration: "none" }}>
            <button>Account</button>
          </a>
        </div>
      </header>

      {!authed && <div>Redirecting to sign-in…</div>}

      {authed && (
        <>
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
        </>
      )}
    </div>
  );
}
