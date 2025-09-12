import { useEffect, useRef, useState } from "react";

/**
 * LANCELOT — friendly UI with name-memory + confirmation
 * - Remembers name in localStorage
 * - On return: “Welcome back! Are you still <name>?” (Yes/No or provide a new name)
 * - If user only gives a name, we follow-up with “How can I help today?”
 * - Autoscroll + typing indicator
 */

const STORAGE_KEYS = {
  name: "lance_name",
  nameConfirmed: "lance_name_confirmed_session", // per-tab/session confirm
};

const initialAssistantMessage = (name) =>
  name
    ? `Welcome back! Are you still ${name}? (You can reply “yes”, “no”, or share a different name.)`
    : "Hello! I’m Lancelot. What’s your name?";

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const chatRef = useRef(null);
  const [knownName, setKnownName] = useState("");
  const [confirmedThisSession, setConfirmedThisSession] = useState(false);

  // --- Helpers --------------------------------------------------------------

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      if (chatRef.current) {
        chatRef.current.scrollTop = chatRef.current.scrollHeight;
      }
    });
  };

  const saveName = (name) => {
    const clean = name.trim();
    if (!clean) return;
    localStorage.setItem(STORAGE_KEYS.name, clean);
    localStorage.setItem(STORAGE_KEYS.nameConfirmed, "true");
    setKnownName(clean);
    setConfirmedThisSession(true);
  };

  const markConfirmed = () => {
    localStorage.setItem(STORAGE_KEYS.nameConfirmed, "true");
    setConfirmedThisSession(true);
  };

  // Very simple name extraction: “my name is X”, “I’m X”, “I am X”
  const tryExtractName = (text) => {
    const t = text.trim();
    // Look for “my name is X”
    let m = t.match(/\bmy\s+name\s+is\s+([a-z][a-z'\- ]{1,30})\b/i);
    if (m) return tidyName(m[1]);
    // “i’m X” / “i am X”
    m = t.match(/\b(i['\s]*m|i\s+am)\s+([a-z][a-z'\- ]{1,30})\b/i);
    if (m) return tidyName(m[2]);
    // Single-word name if message is short (e.g., “Jim”)
    if (/^[a-z][a-z'\-]{1,30}$/i.test(t)) return tidyName(t);
    return "";
  };

  const tidyName = (raw) =>
    raw
      .trim()
      .replace(/\s+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

  // --- Init: load name and greet -------------------------------------------

  useEffect(() => {
    const savedName = localStorage.getItem(STORAGE_KEYS.name) || "";
    const confirmed = localStorage.getItem(STORAGE_KEYS.nameConfirmed) === "true";

    setKnownName(savedName);
    setConfirmedThisSession(confirmed);

    // Initial assistant message
    setMessages([
      {
        role: "assistant",
        content: initialAssistantMessage(savedName),
      },
    ]);
  }, []);

  // Autoscroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending]);

  // --- Send to server -------------------------------------------------------

  const callModel = async (fullMessages) => {
    const res = await fetch("/.netlify/functions/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: fullMessages }),
    });
    if (!res.ok) {
      throw new Error(`Server error: ${res.status}`);
    }
    const data = await res.json();
    // Support multiple possible keys (defensive)
    return data.reply || data.message || data.text || data.content || "";
  };

  // --- Main submit handler --------------------------------------------------

  const onSubmit = async (e) => {
    e.preventDefault();
    const userText = input.trim();
    if (!userText || isSending) return;

    setInput("");

    // 1) Add user message
    const nextMessages = [...messages, { role: "user", content: userText }];
    setMessages(nextMessages);

    // 2) Name / confirmation logic (client-side “bonding” layer)
    const lower = userText.toLowerCase();
    const extracted = tryExtractName(userText);

    // a) Handle direct confirmation to “Are you still <name>?”
    if (!confirmedThisSession && knownName) {
      if (["yes", "yep", "yeah", "y", "correct", "that’s me", "thats me"].some((w) => lower === w)) {
        markConfirmed();
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: `Great—nice to see you again, ${knownName}! What would you like to work on today?`,
          },
        ]);
        return;
      }
      if (["no", "nope", "n"].some((w) => lower === w) || extracted) {
        const newName = extracted || ""; // might be provided after “no”
        if (newName) {
          saveName(newName);
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content: `Thanks, ${newName}. What would you like to work on today?`,
            },
          ]);
        } else {
          setMessages((m) => [
            ...m,
            { role: "assistant", content: "No problem—what’s your preferred name?" },
          ]);
        }
        return;
      }
    }

    // b) If the user gave us a name (first time)
    if (!knownName && extracted) {
      saveName(extracted);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `Nice to meet you, ${tidyName(extracted)}! How can I help today?`,
        },
      ]);
      return;
    }

    // c) If they ONLY gave a name (one word), ask for their goal
    if (!knownName && /^[a-z][a-z'\-]{1,30}$/i.test(userText) && !extracted) {
      // Looks like a name, but not confident—ask explicitly
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            "Thanks! Is that your preferred name? If so, please say “My name is …” — or tell me what you’d like to work on.",
        },
      ]);
      return;
    }

    // 3) If we reach here, proceed to the model
    try {
      setIsSending(true);

      // Add a small “typing” bubble while we wait
      setMessages((m) => [...m, { role: "assistant", content: "…" }]);

      // Compose model messages (add a lightweight system message for tone)
      const system = {
        role: "system",
        content:
          "You are Lancelot, a warm, consultative higher-ed partner. Be concise, friendly, and collaborative. Ask a clarifying question before proposing a plan when the goal is unclear. Use the user’s name when known.",
      };

      const nameNote = knownName
        ? { role: "system", content: `User’s preferred name (if you need it): ${knownName}.` }
        : null;

      const payload = [system, ...(nameNote ? [nameNote] : []), ...nextMessages];

      const reply = await callModel(payload);

      // Replace the “typing” bubble with the real reply
      setMessages((m) => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        if (last && last.role === "assistant" && last.content === "…") {
          copy.pop();
        }
        copy.push({ role: "assistant", content: reply || "No response from model." });
        return copy;
      });
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            "Hmm, I hit a snag reaching the model. Please try again in a moment or rephrase your message.",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  // --- Render ---------------------------------------------------------------

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ fontSize: 32, marginBottom: 12 }}>Lancelot</h1>

      <div
        ref={chatRef}
        style={{
          height: "60vh",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          padding: 12,
          overflowY: "auto",
          background: "#fff",
        }}
      >
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: m.role === "user" ? "flex-end" : "flex-start",
              margin: "10px 0",
            }}
          >
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
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a question or project summary… (Shift+Enter for new line)"
          rows={2}
          style={{
            flex: 1,
            resize: "vertical",
            padding: 10,
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            fontSize: 15,
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit(e);
            }
          }}
        />
        <button
          type="submit"
          disabled={isSending}
          style={{
            background: isSending ? "#9ca3af" : "#2563eb",
            color: "#fff",
            border: 0,
            borderRadius: 10,
            padding: "0 18px",
            fontSize: 15,
            cursor: isSending ? "not-allowed" : "pointer",
            minWidth: 64,
          }}
        >
          {isSending ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
