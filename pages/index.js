import { useEffect, useRef, useState } from "react";

const K = {
  name: "lance_name",
  confirmed: "lance_name_confirmed_session",
};

const greetFirstTime =
  "Hello! I’m Lancelot. What projects can I assist you with today? May I please have your name?";
const greetReturn = (n) =>
  `Welcome back! Are you still ${n}? (Reply “yes”, “no”, or share a different name.)`;

export default function Home() {
  const [msgs, setMsgs] = useState([]);
  const [val, setVal] = useState("");
  const [sending, setSending] = useState(false);
  const [name, setName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const box = useRef(null);

  // ---------- helpers ----------
  const scroll = () => requestAnimationFrame(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  });

  const saveName = (raw) => {
    const clean = tidy(raw);
    if (!clean) return;
    localStorage.setItem(K.name, clean);
    localStorage.setItem(K.confirmed, "true");
    setName(clean);
    setConfirmed(true);
  };

  const tidy = (s) =>
    s.trim().replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const extractName = (t) => {
    const m1 = t.match(/\bmy\s+name\s+is\s+([a-z][a-z'\- ]{1,30})/i);
    if (m1) return tidy(m1[1]);
    const m2 = t.match(/\b(i['\s]*m|i\s+am)\s+([a-z][a-z'\- ]{1,30})/i);
    if (m2) return tidy(m2[2]);
    if (/^[a-z][a-z'\-]{1,30}$/i.test(t.trim())) return tidy(t);
    return "";
  };

  // ---------- init ----------
  useEffect(() => {
    const saved = localStorage.getItem(K.name) || "";
    const conf = localStorage.getItem(K.confirmed) === "true";
    setName(saved);
    setConfirmed(conf);
    setMsgs([{ role: "assistant", content: saved ? greetReturn(saved) : greetFirstTime }]);
  }, []);

  useEffect(scroll, [msgs, sending]);

  // ---------- server call ----------
  const askModel = async (full) => {
    const r = await fetch("/.netlify/functions/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: full }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    return j.reply || j.message || j.text || j.content || "";
  };

  // ---------- submit ----------
  const onSubmit = async (e) => {
    e.preventDefault();
    const text = val.trim();
    if (!text || sending) return;
    setVal("");

    const next = [...msgs, { role: "user", content: text }];
    setMsgs(next);

    const lower = text.toLowerCase();
    const gotName = extractName(text);

    // Returning user confirming name
    if (name && !confirmed) {
      if (["yes", "y", "yep", "yeah", "correct", "that’s me", "thats me"].includes(lower)) {
        localStorage.setItem(K.confirmed, "true");
        setConfirmed(true);
        setMsgs((m) => [...m, { role: "assistant", content: `Great—nice to see you again, ${name}! What would you like to work on today?` }]);
        return;
      }
      if (["no", "n", "nope"].includes(lower) || gotName) {
        if (gotName) {
          saveName(gotName);
          setMsgs((m) => [...m, { role: "assistant", content: `Thanks, ${gotName}. What would you like to work on today?` }]);
        } else {
          setMsgs((m) => [...m, { role: "assistant", content: "No problem—what’s your preferred name?" }]);
        }
        return;
      }
    }

    // First-time name capture
    if (!name && gotName) {
      saveName(gotName);
      setMsgs((m) => [...m, { role: "assistant", content: `Nice to meet you, ${gotName}! How can I help today?` }]);
      return;
    }

    // If it looks like only a name
    if (!name && /^[a-z][a-z'\-]{1,30}$/i.test(text) && !gotName) {
      setMsgs((m) => [...m, { role: "assistant", content: "Thanks! Is that your preferred name? If so, please say “My name is …” — or tell me what you’d like to work on." }]);
      return;
    }

    // Ask the model
    try {
      setSending(true);
      setMsgs((m) => [...m, { role: "assistant", content: "…" }]);

      const sys = {
        role: "system",
        content:
          "You are Lancelot, a warm, consultative higher-ed partner. Be concise, friendly, and collaborative. Ask clarifying questions before proposing a plan when needed. Use the user’s name when known.",
      };
      const nameNote = name ? { role: "system", content: `User’s preferred name: ${name}.` } : null;
      const payload = [sys, ...(nameNote ? [nameNote] : []), ...next];

      const reply = await askModel(payload);

      setMsgs((m) => {
        const cp = [...m];
        if (cp[cp.length - 1]?.content === "…") cp.pop();
        cp.push({ role: "assistant", content: reply || "No response from model." });
        return cp;
      });
    } catch (err) {
      setMsgs((m) => [...m, { role: "assistant", content: "I hit a snag reaching the model. Try again in a moment." }]);
    } finally {
      setSending(false);
    }
  };

  // ---------- UI ----------
  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ fontSize: 32, marginBottom: 12 }}>Lancelot</h1>

      <div
        ref={box}
        style={{
          height: "60vh",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          padding: 12,
          overflowY: "auto",
          background: "#fff",
        }}
      >
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", margin: "10px 0" }}>
            <div
              style={{
                maxWidth: "85%",
                padding: "10px 12px",
                borderRadius: 14,
                background: m.role === "user" ? "#2563eb" : "#eef2f6",
                color: m.role === "user" ? "#fff" : "#111827",
                lineHeight: 1.4,
                boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {m.content}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <textarea
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="Type a question or project summary… (Shift+Enter for new line)"
          rows={2}
          style={{ flex: 1, resize: "vertical", padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 15 }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit(e);
            }
          }}
        />
        <button
          type="submit"
          disabled={sending}
          style={{
            background: sending ? "#9ca3af" : "#2563eb",
            color: "#fff",
            border: 0,
            borderRadius: 10,
            padding: "0 18px",
            fontSize: 15,
            cursor: sending ? "not-allowed" : "pointer",
            minWidth: 64,
          }}
        >
          {sending ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
