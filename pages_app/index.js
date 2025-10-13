// pages_app/index.js
// Auth-aware chat guard: requires Supabase Auth session.
// If not signed in, redirect to /login.
// If signed in but no profile in DB yet, allow chat but show a note to complete /register.

import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const SESSION_KEY = "lancelot_session";
const CTX_KEY = "lancelot_ctx";
const PREF_AREA_KEY = "lancelot_pref_area";

export default function ChatPage() {
  const [authed, setAuthed] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [citations, setCitations] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const [profile, setProfile] = useState(null);
  const inputRef = useRef(null);

  // ---- Auth guard ----
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const s = data?.session || null;
      if (!s) {
        window.location.replace("/login");
      } else {
        setAuthed(true);
        fetchProfile(s.user);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s) window.location.replace("/login");
      else { setAuthed(true); fetchProfile(s.user); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function fetchProfile(user) {
    // Try to fetch a profile row if you have a table (optional)
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("email", user.email)
        .limit(1)
        .maybeSingle();
      if (!error) setProfile(data || null);
    } catch {}
  }

  // ---- Init local session + history ----
  useEffect(() => {
    const sid = localStorage.getItem(SESSION_KEY);
    const ctxRaw = localStorage.getItem(CTX_KEY);
    setSessionId(sid || null);
    try { setHistory(ctxRaw ? JSON.parse(ctxRaw) : []); } catch { setHistory([]); }
  }, []);

  useEffect(() => {
    localStorage.setItem(CTX_KEY, JSON.stringify(history.slice(-10)));
  }, [history]);

  async function sendMessage(e) {
    e?.preventDefault?.();
    if (!authed) return;
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

  function handleReset() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(CTX_KEY);
    setSessionId(null);
    setHistory([]);
    setCitations([]);
    setEvidence([]);
  }

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

      {!authed && (
        <div style={{ padding: 8, background: "#fff3cd", border: "1px solid #ffeeba", marginBottom: 12 }}>
          Checking your sign-in status…
        </div>
      )}

      {authed && !profile && (
        <div style={{ marginBottom: 12, fontSize: 12, opacity: 0.7 }}>
          Tip: complete your <a href="/register">profile</a> so Lancelot can personalize answers.
        </div>
      )}

      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, minHeight: 240 }}>
        {history.length === 0 && <div style={{ opacity: 0.6 }}>Ask anything about enrollment, retention, or accreditation.</div>}
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
          disabled={busy || !authed}
        />
        <button disabled={busy || !input.trim() || !authed} type="submit">
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

      {evidence.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary>Debug: Raw Evidence Payload</summary>
          <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(evidence, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
