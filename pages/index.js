// pages/index.js
import { useEffect, useRef, useState } from "react";

export default function Home() {
  const [messages, setMessages] = useState([]); // no client greeting
  const [input,   setInput]   = useState("");
  const boxRef = useRef(null);

  // auto-scroll when messages change
  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [messages]);

  // ask the server for the very first assistant message (name prompt)
  useEffect(() => {
    (async () => {
      if (messages.length === 0) {
        const r = await fetch("/.netlify/functions/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [] }),
        });
        const data = await r.json().catch(() => ({}));
        const first =
          data.reply || data.text || data.message || data.content || "Hello! May I have your name?";
        setMessages([{ role: "assistant", content: first }]);
      }
    })();
  }, []); // run once

  async function sendMessage() {
    const userText = input.trim();
    if (!userText) return;

    const newMsgs = [...messages, { role: "user", content: userText }];
    setMessages(newMsgs);
    setInput("");

    const r = await fetch("/.netlify/functions/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: newMsgs }),
    });

    const data = await r.json().catch(() => ({}));
    const reply =
      data.reply || data.text || data.message || data.content || "No response from model";

    setMessages((m) => [...m, { role: "assistant", content: reply }]);
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
    border: "1px solid #e6e6e6", background: "#fafafa", boxShadow: "inset 0 0 0 9999px rgba(0,0,0,0.00)"
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
