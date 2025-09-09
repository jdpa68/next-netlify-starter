// pages/index.js
import { useState } from "react";

export default function Home() {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const newMsgs = [...msgs, { role: "user", content: input.trim() }];
    setMsgs(newMsgs);
    setInput("");
    setLoading(true);

    try {
      const resp = await fetch("/.netlify/functions/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMsgs }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        const msg =
          data?.error || data?.error?.message || JSON.stringify(data);
        setMsgs((m) => [
          ...m,
          { role: "assistant", content: `Error: ${msg}` },
        ]);
      } else {
        // Accept either normalized {text} or raw OpenAI shape (fallback)
        const text =
          data?.text ||
          data?.choices?.[0]?.message?.content ||
          "No response from model";
        setMsgs((m) => [...m, { role: "assistant", content: text }]);
      }
    } catch (err) {
      setMsgs((m) => [
        ...m,
        { role: "assistant", content: `Error: ${String(err)}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica",
        padding: 20,
        maxWidth: 720,
        margin: "0 auto",
      }}
    >
      <h1 style={{ margin: "8px 0 16px" }}>Lancelot</h1>

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: 12,
          height: "60vh",
          overflowY: "auto",
          marginBottom: 12,
          background: "#f9fafb",
        }}
      >
        {msgs.map((m, i) => (
          <div
            key={i}
            style={{
              margin: "8px 0",
              textAlign: m.role === "user" ? "right" : "left",
            }}
          >
            <div
              style={{
                display: "inline-block",
                padding: "8px 12px",
                borderRadius: 12,
                background: m.role === "user" ? "#2563eb" : "#e5e7eb",
                color: m.role === "user" ? "white" : "black",
                maxWidth: "90%",
                whiteSpace: "pre-wrap",
                wordWrap: "break-word",
              }}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ fontStyle: "italic", color: "#666" }}>
            Lancelot is thinking…
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <textarea
          rows={2}
          style={{
            flex: 1,
            padding: 10,
            borderRadius: 6,
            border: "1px solid #d1d5db",
            fontSize: 14,
          }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a question or project summary… (Shift+Enter for new line)"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
        />
        <button
          onClick={sendMessage}
          disabled={loading}
          style={{
            padding: "0 16px",
            borderRadius: 6,
            border: "none",
            background: loading ? "#93c5fd" : "#2563eb",
            color: "white",
            cursor: loading ? "default" : "pointer",
            minWidth: 80,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
