import { useState } from "react";

export default function Home() {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMessage() {
    if (!input.trim()) return;

    const newMsgs = [...msgs, { role: "user", content: input }];
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
        const msg = data?.error || "Unknown error";
        setMsgs(m => [...m, { role: "assistant", content: `Error: ${msg}` }]);
      } else {
        const text = data?.text || "No response from model";
        setMsgs(m => [...m, { role: "assistant", content: text }]);
      }
    } catch (err) {
      setMsgs(m => [...m, { role: "assistant", content: `Error: ${String(err)}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ fontFamily: "sans-serif", padding: 20, maxWidth: 600, margin: "0 auto" }}>
      <h1>Lancelot</h1>
      <div
        style={{
          border: "1px solid #ccc",
          borderRadius: 6,
          padding: 10,
          height: "60vh",
          overflowY: "auto",
          marginBottom: 10,
          background: "#f9fafb"
        }}
      >
        {msgs.map((m, i) => (
          <div
            key={i}
            style={{
              margin: "8px 0",
              textAlign: m.role === "user" ? "right" : "left"
            }}
          >
            <div
              style={{
                display: "inline-block",
                padding: "8px 12px",
                borderRadius: 12,
                background: m.role === "user" ? "#2563eb" : "#e5e7eb",
                color: m.role === "user" ? "white" : "black"
              }}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ fontStyle: "italic", color: "#666" }}>Lancelot is thinking…</div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <textarea
          rows={2}
          style={{ flex: 1, padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type a question or project summary…"
          onKeyDown={e => {
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
            background: "#2563eb",
            color: "white",
            cursor: "pointer"
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
