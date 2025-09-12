import { useEffect, useRef, useState } from "react";

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [name, setName] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("lancelot_name") || "";
  });
  const boxRef = useRef(null);

  // Auto-scroll chat
  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [messages]);

  // First load → ask (or acknowledge) name once
  useEffect(() => {
    (async () => {
      if (messages.length !== 0) return;

      const cachedName =
        name || (typeof window !== "undefined" && localStorage.getItem("lancelot_name")) || null;

      const r = await fetch("/.netlify/functions/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [], userName: cachedName }),
      });
      const data = await r.json().catch(() => ({}));
      let first =
        data.reply || data.text || data.message || data.content || "Hello! May I have your name?";

      // Safety: if server asked for name but we already have it, nudge forward
      if (cachedName && /may i please have your name\??/i.test(first)) {
        first = `Thanks, ${cachedName}. What would you like to work on today?`;
      }

      setMessages([{ role: "assistant", content: first }]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once

  function capitalizeName(s) {
    return s
      .trim()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  function extractName(text) {
    if (!text) return null;
    const t = text.trim();

    const m1 = t.match(
      /(my name is|i am|i'm|im|this is|it'?s)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i
    );
    if (m1) return capitalizeName(m1[2]);

    const looksLikeOnlyName =
      /^[A-Za-z]+(?:\s+[A-Za-z]+){0,2}$/.test(t) &&
      !/[?!.]/.test(t) &&
      !/help|plan|how|what|why|when|where|can|could|please/i.test(t);

    if (looksLikeOnlyName) return capitalizeName(t);
    return null;
  }

  async function sendMessage() {
    const userText = input.trim();
    if (!userText) return;

    // Always read the freshest name right before sending
    const cachedName =
      name || (typeof window !== "undefined" && localStorage.getItem("lancelot_name")) || "";

    // If user only sent a name and we don't already have one, save and reply locally
    const detected = extractName(userText);
    if (detected && !cachedName) {
      const cased = detected;
      setName(cased);
      if (typeof window !== "undefined") localStorage.setItem("lancelot_name", cased);

      setMessages((m) => [
        ...m,
        { role: "user", content: userText },
        { role: "assistant", content: `Nice to meet you, ${cased}! What would you like to work on today?` },
      ]);
      setInput("");
      return; // No server call needed for pure-name turn
    }

    const newMsgs = [...messages, { role: "user", content: userText }];
    setMessages(newMsgs);
    setInput("");

    const r = await fetch("/.netlify/functions/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: newMsgs,
        userName: cachedName || detected || null,
      }),
    });

    const data = await r.json().catch(() => ({}));
    let reply =
      data.reply || data.text || data.message || data.content || "No response from model";

    // Safety: if server asks name but we already have one, convert to a progress reply
    if ((cachedName || detected) && /may i please have your name\??/i.test(reply)) {
      const used = cachedName || detected;
      reply = `Thanks, ${used}. What would you like to work on today?`;
    }

    setMessages((m) => [...m, { role: "assistant", content: reply }]);

    // If they tucked a name inside a longer message, persist it post-reply
    if (!cachedName && detected) {
      setName(detected);
      if (typeof window !== "undefined") localStorage.setItem("lancelot_name", detected);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Lancelot</h1>

      <div ref={boxRef} style={styles.chatBox}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{ ...styles.bubble, ...(m.role === "user" ? styles.user : styles.assistant) }}
          >
            {m.content}
          </div>
        ))}
      </div>

      <div style={styles.row}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a question or project summary… (Shift+Enter for new line)"
          style={styles.input}
        />
        <button onClick={sendMessage} style={styles.button}>Send</button>
      </div>
    </div>
  );
}

const styles = {
  page: { maxWidth: 840, margin: "40px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif" },
  title: { margin: "0 0 16px 0" },
  chatBox: {
    height: 520, overflowY: "auto", padding: 16, borderRadius: 12,
    border: "1px solid #e6e6e6", background: "#fafafa"
  },
  bubble: {
    display: "inline-block", padding: "10px 12px", borderRadius: 16,
    margin: "8px 0", maxWidth: "80%", lineHeight: 1.4, whiteSpace: "pre-wrap"
  },
  user: { alignSelf: "flex-end", background: "#2d6cdf", color: "white", float: "right", clear: "both" },
  assistant: { background: "#e9ecef", color: "#222", float: "left", clear: "both" },
  row: { display: "flex", gap: 8, marginTop: 12 },
  input: { flex: 1, minHeight: 48, padding: 10, borderRadius: 10, border: "1px solid #ddd" },
  button: { padding: "0 16px", borderRadius: 10, border: "none", background: "#1677ff", color: "white", cursor: "pointer" }
};
