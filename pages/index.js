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

  // On first load, get the first assistant message (server will ask for name if we don't have one)
  useEffect(() => {
    (async () => {
      if (messages.length === 0) {
        const r = await fetch("/.netlify/functions/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [], userName: name || null }),
        });
        const data = await r.json().catch(() => ({}));
        const first =
          data.reply || data.text || data.message || data.content || "Hello! May I have your name?";
        setMessages([{ role: "assistant", content: first }]);
      }
    })();
  }, []); // once

  function extractName(text) {
    if (!text) return null;
    const t = text.trim();

    // “My name is Jim”, “I’m Ana”, “I am Bob”, “This is Kim”, “It’s Joe”
    const m1 = t.match(
      /(my name is|i am|i'm|im|this is|it'?s)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i
    );
    if (m1) return capitalizeName(m1[2]);

    // Single or double proper-name tokens only (e.g., "Jim", "Ana Lopez")
    const words = t.split(/\s+/);
    if (
      words.length <= 3 &&
      /^[A-Za-z]+(?:\s+[A-Za-z]+){0,2}$/.test(t) &&
      !/[?!.]/.test(t) &&
      !/help|plan|how|what|why|when|where|can|could|please/i.test(t)
    ) {
      return capitalizeName(t);
    }
    return null;
  }

  function capitalizeName(s) {
    return s
      .trim()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  async function sendMessage() {
    const userText = input.trim();
    if (!userText) return;

    // Detect and save name if user sent a name (and nothing else)
    const detected = extractName(userText);
    if (detected && !name) {
      setName(detected);
      if (typeof window !== "undefined") {
        localStorage.setItem("lancelot_name", detected);
      }
      setMessages((m) => [
        ...m,
        { role: "user", content: userText },
        {
          role: "assistant",
          content: `Nice to meet you, ${detected}! What would you like to work on today?`,
        },
      ]);
      setInput("");
      return; // don’t call server for a pure-name turn
    }

    const newMsgs = [...messages, { role: "user", content: userText }];
    setMessages(newMsgs);
    setInput("");

    const r = await fetch("/.netlify/functions/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: newMsgs,
        userName: name || detected || null,
      }),
    });

    const data = await r.json().catch(() => ({}));
    const reply =
      data.reply || data.text || data.message || data.content || "No response from model";

    setMessages((m) => [...m, { role: "assistant", content: reply }]);

    // If the user included their name inside a longer message and we caught it, save it post-reply
    if (!name && detected) {
      setName(detected);
      if (typeof window !== "undefined") {
        localStorage.setItem("lancelot_name", detected);
      }
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
