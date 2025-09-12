// pages/index.js
import { useEffect, useRef, useState } from "react";

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollerRef = useRef(null);

  // --- helpers ---------------------------------------------------
  const getName = () => sessionStorage.getItem("lancelot_user_name") || "";
  const saveName = (n) => sessionStorage.setItem("lancelot_user_name", n);

  // robust name extractor: accepts "its dave", "it's dave", "i'm dave", "i am dave", "dave"
  function extractPossibleName(text) {
    const t = text.trim().replace(/\s+/g, " ").toLowerCase();
    // common patterns
    const m1 = t.match(/\b(?:my name is|i am|i'm|its|it's)\s+([a-z][a-z'-]{1,30})\b/i);
    if (m1) return capitalize(m1[1]);
    // very short “just a name” messages (1–2 words)
    if (t.split(" ").length <= 2) {
      // take last token that looks like a name
      const m2 = t.match(/([a-z][a-z'-]{1,30})$/i);
      if (m2) return capitalize(m2[1]);
    }
    return "";
  }
  const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

  const addMessage = (role, text) => {
    setMessages((prev) => [...prev, { role, text }]);
  };

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
    });
  };

  useEffect(scrollToBottom, [messages]);

  // initial single greeting (UI doesn’t add more later)
  useEffect(() => {
    if (messages.length === 0) {
      const known = getName();
      if (known) {
        addMessage("assistant", `Welcome back, ${known}! What would you like to work on today?`);
      } else {
        addMessage("assistant", "Hello! I’m Lancelot. What’s your name?");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendMessage() {
    if (!input.trim() || isSending) return;

    const userText = input.trim();
    setInput("");
    addMessage("user", userText);

    // name capture gate
    let name = getName();
    if (!name) {
      const guessed = extractPossibleName(userText);
      if (guessed) {
        name = guessed;
        saveName(name);
        addMessage("assistant", `Nice to meet you, ${name}! What would you like to work on today?`);
        return; // stop here; next user message will be the actual task
      } else {
        // they didn’t give a name—ask once more, but don’t loop forever
        addMessage("assistant", "Thanks! Before we dive in, may I grab your preferred name?");
        return;
      }
    }

    // normal flow -> call server
    setIsSending(true);
    try {
      const res = await fetch("/.netlify/functions/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // send minimal history (last 10 messages) + the stored name
          name,
          messages: messages.slice(-10).concat([{ role: "user", content: userText }]),
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        addMessage("assistant", `Hmm, I hit an error (${res.status}). Details: ${txt.slice(0, 400)}`);
      } else {
        const data = await res.json();
        // accept any of the common keys the function might return
        const reply = data.reply || data.message || data.text || data.content || "OK.";
        addMessage("assistant", reply);
      }
    } catch (e) {
      addMessage("assistant", `Network hiccup: ${String(e).slice(0, 300)}`);
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

  // --- UI --------------------------------------------------------
  return (
    <div style={{ maxWidth: 820, margin: "32px auto", padding: "0 16px", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" }}>
      <h1 style={{ marginBottom: 12 }}>Lancelot</h1>

      <div ref={scrollerRef}
           style={{ height: "56vh", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, overflowY: "auto", background: "white" }}>
        {messages.map((m, i) => (
          <div key={i}
               style={{
                 display: "flex",
                 justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                 margin: "10px 0"
               }}>
            <div style={{
              padding: "10px 14px",
              borderRadius: 12,
              maxWidth: "80%",
              lineHeight: 1.4,
              background: m.role === "user" ? "#2563eb" : "#e5e7eb",
              color: m.role === "user" ? "white" : "#111827",
              whiteSpace: "pre-wrap"
            }}>
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
        <button onClick={sendMessage} disabled={isSending}
                style={{ background: "#2563eb", color: "white", padding: "0 16px", borderRadius: 8, border: 0 }}>
          {isSending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
