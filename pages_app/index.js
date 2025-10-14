// ===========================================
// Lancelot — Chat Interface (Threaded UI)
// ===========================================
// • Alternating bubbles: "You" and "Lancelot"
// • Input at bottom only (sticky in card)
// • Shows citations under each assistant reply (if returned)
// • Keeps your brand colors and layout
// ===========================================

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const BRAND = {
  primary: "#040D2C",
  accent: "#C2AA80",
  white: "#FFFFFF",
  title: "Lancelot",
  tagline: "The trusted assistant for every higher-ed professional."
};

const LS_CTX = "lancelot_ctx";

export default function ChatPage() {
  const [ctx, setCtx] = useState(null);
  const [busy, setBusy] = useState(false);
  const [speed, setSpeed] = useState("normal");
  const [input, setInput] = useState("");
  const [thread, setThread] = useState([]); // [{ role: "user"|"assistant", content, citations? }]
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Load local context and autofocus
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" && localStorage.getItem(LS_CTX);
      if (raw) setCtx(JSON.parse(raw));
    } catch { setCtx(null); }
    setTimeout(() => inputRef.current?.focus?.(), 0);
  }, []);

  // Keep view scrolled to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [thread, busy]);

  async function handleAsk(e) {
    e?.preventDefault?.();
    const q = input.trim();
    if (!q || busy) return;

    // append user bubble
    setThread((t) => [...t, { role: "user", content: q }]);
    setBusy(true);

    try {
      const res = await fetch("/.netlify/functions/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, ctx, speed })
      });
      const data = await res.json();
      const replyText = (data && (data.reply || data.text)) || "Sorry—no reply received.";
      const citations = Array.isArray(data?.citations) ? data.citations : [];

      // append assistant bubble
      setThread((t) => [...t, { role: "assistant", content: replyText, citations }]);
    } catch {
      setThread((t) => [...t, { role: "assistant", content: "⚠️ Network error. Please try again." }]);
    } finally {
      setBusy(false);
      setInput("");
      setTimeout(() => inputRef.current?.focus?.(), 0);
    }
  }

  function handleReset() {
    setThread([]);
    setInput("");
    setTimeout(() => inputRef.current?.focus?.(), 0);
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: BRAND.primary, color: BRAND.white }}>
      {/* Header */}
      <header className="w-full border-b border-white/15">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-xl md:text-2xl font-semibold">{BRAND.title}</div>
            <div className="text-xs opacity-80">{BRAND.tagline}</div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="opacity-70">Beta</span>
            <a href="/account" className="underline opacity-90 hover:opacity-100 transition">Account</a>
            <a href="/logout" className="underline opacity-90 hover:opacity-100 transition">Sign Out</a>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-grow flex items-center justify-center px-6">
        <div className="w-full max-w-2xl bg-white text-black rounded-2xl shadow-lg p-0 overflow-hidden">
          {/* Card header */}
          <div className="px-6 pt-6">
            <h1 className="text-lg font-semibold mb-2 text-center" style={{ color: BRAND.primary }}>
              {ctx?.firstName ? `Hi ${ctx.firstName}.` : "Hi there."}
            </h1>
            <p className="text-sm text-gray-600 mb-4 text-center">
              Ask about enrollment, retention, accreditation, finance, or marketing. I’ll answer with citations.
            </p>
            {/* Speed + Reset */}
            <div className="flex items-center justify-between text-xs text-gray-700 mb-3">
              <div className="flex gap-2 items-center">
                <span className="font-medium">Speed:</span>
                <button
                  onClick={() => setSpeed("normal")}
                  className={`px-2 py-1 rounded-lg ${speed === "normal" ? "bg-gray-200 font-medium" : "bg-transparent"}`}
                >
                  Normal
                </button>
                <button
                  onClick={() => setSpeed("fast")}
                  className={`px-2 py-1 rounded-lg ${speed === "fast" ? "bg-gray-200 font-medium" : "bg-transparent"}`}
                >
                  Fast
                </button>
              </div>
              <button onClick={handleReset} className="text-xs underline hover:opacity-80 transition" style={{ color: BRAND.primary }}>
                Reset Chat
              </button>
            </div>
          </div>

          {/* Thread */}
          <div className="px-6 pb-4 max-h-[55vh] overflow-y-auto">
            {thread.length === 0 && (
              <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm leading-relaxed text-gray-800">
                Your conversation will appear here.
              </div>
            )}

            {thread.map((m, idx) => (
              <div key={idx} className={`mt-3 flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-[#E6EDF3] text-gray-900 border border-gray-200"
                      : "bg-gray-50 text-gray-800 border border-gray-200"
                  }`}
                >
                  <div className="text-[11px] uppercase tracking-wide mb-1 opacity-70">
                    {m.role === "user" ? "You" : "Lancelot"}
                  </div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>

                  {/* Citations per assistant reply */}
                  {m.role === "assistant" && Array.isArray(m.citations) && m.citations.length > 0 && (
                    <div className="mt-2 text-[11px] text-gray-700">
                      <div className="font-medium mb-1" style={{ color: BRAND.primary }}>Evidence</div>
                      <ol className="list-decimal pl-4 space-y-1">
                        {m.citations.map((c, i) => (
                          <li key={i}>
                            <span className="font-medium">{c.title || "Untitled"}</span>
                            {c.source_url ? (
                              <>
                                {" "}
                                <a href={c.source_url} target="_blank" rel="noreferrer" className="underline hover:opacity-80">
                                  {c.source_url}
                                </a>
                              </>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Sticky input row in card footer */}
          <form onSubmit={handleAsk} className="px-6 pb-6 pt-2 border-t border-gray-200 flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message…"
              className="flex-grow rounded-xl border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl px-4 py-2 text-sm font-medium"
              style={{ backgroundColor: BRAND.accent, color: BRAND.primary, opacity: busy ? 0.6 : 1 }}
            >
              {busy ? "Thinking…" : "Ask"}
            </button>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-xs py-4 opacity-70">
        Beta — not legal/financial advice. Sources may include internal summaries and public documents.
      </footer>
    </div>
  );
}
