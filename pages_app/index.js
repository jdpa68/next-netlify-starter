// ===========================================
// Lancelot — Chat Interface (Main Page) — Double Input + Auto‑Focus
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
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [speed, setSpeed] = useState("normal");
  const [citations, setCitations] = useState([]);
  const topInputRef = useRef(null);
  const bottomInputRef = useRef(null);

  // Load local context
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" && localStorage.getItem(LS_CTX);
      if (raw) setCtx(JSON.parse(raw));
    } catch {
      setCtx(null);
    }
    // initial focus
    setTimeout(() => topInputRef.current?.focus?.(), 0);
  }, []);

  // refocus after each reply
  useEffect(() => {
    if (!busy && (answer || citations.length >= 0)) {
      setTimeout(() => bottomInputRef.current?.focus?.(), 0);
    }
  }, [busy, answer, citations.length]);

  const handleAsk = async (e) => {
    e?.preventDefault?.();
    const q = question.trim();
    if (!q) return;
    setBusy(true);
    setCitations([]);
    try {
      const res = await fetch("/.netlify/functions/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, ctx, speed })
      });
      const data = await res.json();
      const replyText = (data && (data.reply || data.text)) || "Error: no response from chat function.";
      setAnswer(replyText);
      setCitations(Array.isArray(data?.citations) ? data.citations : []);
    } catch {
      setAnswer("Error: could not reach chat function.");
      setCitations([]);
    } finally {
      setBusy(false);
      // keep the question so user can tweak; comment next line to clear instead
      // setQuestion("");
    }
  };

  const handleReset = () => {
    setQuestion("");
    setAnswer("");
    setCitations([]);
    setTimeout(() => topInputRef.current?.focus?.(), 0);
  };

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
        <div className="w-full max-w-2xl bg-white text-black rounded-2xl shadow-lg p-6">
          <h1 className="text-lg font-semibold mb-2 text-center" style={{ color: BRAND.primary }}>
            {ctx?.firstName ? `Hi ${ctx.firstName}.` : "Hi there."}
          </h1>
          <p className="text-sm text-gray-600 mb-4 text-center">
            Ask about enrollment, retention, accreditation, finance, or marketing. I’ll answer with citations.
          </p>

          {/* Top input form */}
          <form onSubmit={handleAsk} className="flex gap-2 mb-4">
            <input
              ref={topInputRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask Lancelot… e.g., ‘How can we improve our online program enrollment?’"
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

          {/* Answer */}
          <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm leading-relaxed text-gray-800 min-h-[150px]">
            {answer || "Your answer will appear here."}
          </div>

          {/* Evidence */}
          {citations.length > 0 && (
            <div className="mt-3 text-xs text-gray-700">
              <div className="font-medium mb-1" style={{ color: BRAND.primary }}>Evidence</div>
              <ol className="list-decimal pl-4 space-y-1">
                {citations.map((c, idx) => (
                  <li key={idx}>
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

          {/* Bottom input form (keeps the conversation flowing) */}
          <form onSubmit={handleAsk} className="flex gap-2 mt-4">
            <input
              ref={bottomInputRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask another question…"
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

      <footer className="text-center text-xs py-4 opacity-70">
        Beta — not legal/financial advice. Sources may include internal summaries and public documents.
      </footer>
    </div>
  );
}
