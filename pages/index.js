import { useEffect, useRef, useState } from "react";

export default function Home() {
  // ---------- safe browser checks ----------
  const isBrowser = typeof window !== "undefined";

  // ---------- storage helpers (guarded) ----------
  const LS_KEYS = { name: "lance_name", confirmed: "lance_name_confirmed_session" };
  const getLS = (k) => (isBrowser ? window.localStorage.getItem(k) : null);
  const setLS = (k, v) => { if (isBrowser) try { window.localStorage.setItem(k, v); } catch (_) {} };
  const delLS = (k) => { if (isBrowser) try { window.localStorage.removeItem(k); } catch (_) {} };

  // ---------- ui state ----------
  const [msgs, setMsgs] = useState([]);
  const [val, setVal] = useState("");
  const [sending, setSending] = useState(false);
  const [name, setName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const boxRef = useRef(null);

  // ---------- utils ----------
  const tidy = (s) =>
    s.trim().replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const extractName = (t) => {
    if (!t) return "";
    const m1 = t.match(/\bmy\s+name\s+is\s+([a-z][a-z'\- ]{1,30})/i);
    if (m1) return tidy(m1[1]);
    const m2 = t.match(/\b(i['\s]*m|i\s+am)\s+([a-z][a-z'\- ]{1,30})/i);
    if (m2) return tidy(m2[2]);
    if (/^[a-z][a-z'\-]{1,30}$/i.test(t.trim())) return tidy(t);
    return "";
  };

  const scrollDown = () => {
    if (!isBrowser) return;
    window.requestAnimationFrame?.(() => {
      if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
    });
  };

  // ---------- first load ----------
  useEffect(() => {
    const savedName = getLS(LS_KEYS.name) || "";
    const savedConfirmed = getLS(LS_KEYS.confirmed) === "true";
    setName(savedName);
    setConfirmed(savedConfirmed);
    setMsgs([
      {
        role: "assistant",
        content: savedName
          ? `Welcome back! Are you still ${savedName}? (Reply “yes”, “no”, or share a different name.)`
          : "Hello! I’m Lancelot. What projects can I assist you with today? May I please have your name?",
      },
    ]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once

  useEffect(scrollDown, [msgs, sending]);

  // ---------- server call ----------
  async function askModel(fullMessages) {
    const res = await fetch("/.netlify/functions/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: fullMessages }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.reply || data.message || data.text || data.content || "";
  }

  // ---------- submit ----------
  const onSubmit = async (e) => {
    e.preventDefault();
    const text = val.trim();
    if (!text || sending) return;
    setVal("");

    const nextMsgs = [...msgs, { role: "user", content: text }];
    setMsgs(nextMsgs);

    // name confirmation flow
    const lower = text.toLowerCase();
    const foundName = extractName(text);

    if (name && !confirmed) {
      if (["yes", "y", "yep", "yeah", "correct", "that’s me", "thats me"].includes(lower)) {
        setLS(LS_KEYS.confirmed, "true");
        setConfirmed(true);
        setMsgs((m) => [...m, { role: "assistant", content: `Great—nice to see you again, ${name}! What would you like to work on today?` }]);
        return;
      }
      if (["no", "n", "nope"].includes(lower) || foundName) {
        if (foundName) {
          setLS(LS_KEYS.name, foundName);
          setLS(LS_KEYS.confirmed, "true");
          setName(foundName);
          setConfirmed(true);
          setMsgs((m) => [...m, { role: "assistant", content: `Thanks, ${foundName}. What would you like to work on today?` }]);
        } else {
          setMsgs((m) => [...m, { role: "assistant", content: "No problem—what’s your preferred name?" }]);
        }
        return;
      }
    }

    // first-time name capture
    if (!name && foundName) {
      setLS(LS_KEYS.name, foundName);
      setLS(LS_KEYS.confirmed, "true");
      setName(foundName);
      setConfirmed(true);
      setMsgs((m) => [...m, { role: "assistant", content: `Nice to meet you, ${foundName}! How can I help today?` }]);
      return;
    }

    // user typed just a single token that looks like a name
    if (!name && /^[a-z][a-z'\-]{1,30}$/i.test(text) && !foundName) {
      setMsgs((m) => [...m, { role: "assistant", content: "Thanks! Is that your preferred name? If so, please say “My name is …” — or tell me what you’d like to work on." }]);
      return;
    }

    // ask model
    try {
      setSending(true);
      setMsgs((m) => [...m, { role: "assistant", content: "…" }]);

      const sys = {
        role: "system",
        content:
          "You are Lancelot, a warm, consultative higher-ed partner. Be concise, friendly, and collaborative. Ask clarifying questions before proposing a plan when needed. Use the user’s name when known.",
      };
      const nameNote = name ? { role: "system", content: `User’s preferred name: ${name}.` } : null;
      const payload = [sys, ...(nameNote ? [nameNote] : []), ...nextMsgs];

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
        ref={boxRef}
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
