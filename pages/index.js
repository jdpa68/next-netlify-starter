// pages/index.js
import { useEffect, useRef, useState } from "react";

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollerRef = useRef(null);

  const getName = () => sessionStorage.getItem("lancelot_user_name") || "";
  const saveName = (n) => sessionStorage.setItem("lancelot_user_name", n);

  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  // Returns { name, remainder } if the user typed a name + anything else
  function parseNameAndRemainder(text) {
    let t = text.trim().replace(/\s+/g, " ");
    // “my name is dave …”, “it’s dave …”, “i’m dave …”
    const m = t.match(/\b(?:my name is|i am|i'm|its|it's)\s+([A-Za-z][A-Za-z'--]{1,30})\b/i);
    if (m) {
      const name = cap(m[1]);
      const remainder = t.replace(m[0], "").trim();
      return { name, remainder };
    }
    // Single token that looks like a name
    if (!t.includes(" ") && /^[A-Za-z][A-Za-z'--]{1,30}$/.test(t)) {
      return { name: cap(t), remainder: "" };
    }
    return { name: "", remainder: t };
  }

  const add = (role, text) => setMessages((prev) => [...prev, { role, text }]);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      scrollerRef.current?.scrollTo({
        top: scrollerRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  };
  useEffect(scrollToBottom, [messages]);

  // Initial greeting
  useEffect(() => {
    if (messages.length === 0) {
      const known = getName();
      if (known) {
        add("assistant", `Welcome back, ${known}! What would you like to work on today?`);
      } else {
        add("assistant", "Hello! How may I assist you today? May I please have your name?");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendMessage() {
    if (!input.trim() || isSending) return;

    const raw = input.trim();
    setInput("");
    add("user", raw);

    let name = getName();
    const { name: parsed, remainder } = parseNameAndRemainder(raw);

    // If we don’t know the name yet but the user gave it
    if (!name && parsed) {
      name = parsed;
      saveName(name);
      if (!remainder) {
        add("assistant", `Nice to meet you, ${name}! What would you like to work on today?`);
        return;
      }
      // If there IS a remainder (a real question), we continue and send that content below
    }

    // If still no name, ask once and pause
    if (!name) {
      add("assistant", "Thanks! Before we dive in, may I grab your preferred name?");
      return;
    }

    // Choose the content we send to the model:
    const userContent = remainder || raw;

    setIsSending(true);
    try {
      const res = await fetch("/.netlify/functions/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          // Provide a short recent history
          messages: messages.slice(-10).map((m) => ({ role: m.role, content: m.text })).concat([{ role: "user", content: userContent }]),
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        add("assistant", `Hmm, I hit an error (${res.status}). Details: ${txt.slice(0, 400)}`);
      } else {
        const data = await res.json();
        const reply = data.reply || data.message || data.text || data.content || "OK.";
        add("assistant", reply);
      }
    } catch (e) {
      add("assistant", `Network hiccup: ${String(e).slice(0, 300)}`);
    } finally {
      setIsSending(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div style={{ maxWidth: 820, margin: "32px auto", padding: "0 16px", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" }}>
      <h1 style={{ marginBottom: 12 }}>Lancelot</h1>

      <div
        ref={scrollerRef}
        style={{ height: "56vh", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, overflowY: "auto", background: "white" }}
      >
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", margin: "10px 0" }}>
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                maxWidth: "80%",
                lineHeight: 1.4,
                background: m.role === "user" ? "#2563eb" : "#e5e7eb",
                color: m.role === "user" ? "white" : "#111827",
                whiteSpace: "pre-wrap",
              }}
            >
              {m.text}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a question or project summary… (Shift+Enter for new line)"
          style={{ flex: 1, height: 44, padding: 10, borderRadius: 8, border: "1px solid #d1d5db", resize: "vertical" }}
        />
        <button onClick={sendMessage} disabled={isSending} style={{ background: "#2563eb", color: "white", padding: "0 16px", borderRadius: 8, border: 0 }}>
          {isSending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
