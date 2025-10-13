// ===========================================
// Lancelot — Chat Interface (Main Page)
// With: Recent questions panel (current session)
// ===========================================

import { useEffect, useMemo, useRef, useState } from "react";
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
const LS_SESSION = "lancelot_session";

// small helper
function saveSessionId(id) {
  try {
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem(LS_SESSION, id);
      else localStorage.removeItem(LS_SESSION);
    }
  } catch {}
}

export default function ChatPage() {
  // session & context
  const [ctx, setCtx] = useState(null);
  const [sessionId, setSessionId] = useState(null);

  // chat
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);

  // typewriter
  const [displayed, setDisplayed] = useState("");
  const [speed, setSpeed] = useState("normal");
  const prerollRef = useRef(null);
  const timerRef = useRef(null);

  // recent questions (this session only)
  const [recent, setRecent] = useState([]);

  // load context & session
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" && localStorage.getItem(LS_CTX);
      if (raw) setCtx(JSON.parse(raw));
    } catch {}
    try {
      const sid = typeof window !== "undefined" && localStorage.getItem(LS_SESSION);
      if (sid) setSessionId(sid);
    } catch {}
  }, []);

  // load recent messages for this session
  useEffect(() => {
    (async () => {
      if (!sessionId) { setRecent([]); return; }
      try {
        const { data, error } = await supabase
          .from("chat_messages")
          .select("content, created_at")
          .eq("session_id", sessionId)
          .eq("role", "user")
          .order("created_at", { ascending: false })
          .limit(5);
        if (error) throw error;
        setRecent((data || []).map(r => ({ text: r.content, ts: r.created_at })));
      } catch { setRecent([]); }
    })();
  }, [sessionId]);

  // typewriter helpers
  const clearTyping = () => {
    if (prerollRef.current) clearTimeout(prerollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  };
  const startTyping = (full) => {
    clearTyping();
    setDisplayed("");
    const words = String(full || "").split(/\s+/);
    let idx = 0;
    prerollRef.current = setTimeout(() => {
      const ms = speed === "fast" ? 18 : 35;
      timerRef.current = setInterval(() => {
        if (idx >= words.length) { clearTyping(); return; }
        setDisplayed(prev => prev + (prev ? " " : "") + words[idx++]);
      }, ms);
    }, 350);
  };

  // submit
  const onAsk = async (e) => {
    e?.preventDefault?.();
    const q = (question || "").trim();
    if (!q) return;

    setBusy(true);
    setDisplayed("");
    try {
      const res = await fetch("/.netlify/functions/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: q,
          ctx,
          sessionId
        })
      });
      const data = await res.json().catch(() => ({}));
      const reply = data?.reply || "I couldn’t generate a response just now.";
      if (data?.sessionId && data.sessionId !== sessionId) {
        setSessionId(data.sessionId);
        saveSessionId(data.sessionId);
      }

      // push into recent (optimistic, for current session)
      setRecent(prev => [{ text: q, ts: new Date().toISOString() }, ...prev].slice(0, 5));

      // typewriter
      startTyping(reply);
    } catch {
      setDisplayed("Error: could not reach chat function.");
    } finally {
      setBusy(false);
    }
  };

  // tiny utils
  const short = (s) => (s.length > 80 ? s.slice(0, 77) + "…" : s);
  const hasRecent = useMemo(() => Array.isArray(recent) && recent.length > 0, [recent]);

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
            <a href="/account" className="underline opacity-90 hover:opacity-100 transition" title="View or update your account">
              Account
            </a>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-grow px-6">
        <div className="max-w-2xl mx-auto py-6">
          <div className="bg-white text-black rounded-2xl shadow-lg p-6">
            <h1 className="text-lg font-semibold mb-2 text-center" style={{ color: BRAND.primary }}>
              {ctx?.firstName ? `Hi ${ctx.firstName}.` : "Hi there."}
            </h1>
            <p className="text-sm text-gray-600 mb-4 text-center">
              Ask about enrollment, retention, accreditation, finance, or marketing. I’ll answer with citations.
            </p>

            {/* Ask */}
            <form onSubmit={onAsk} className="flex gap-2 mb-3">
              <input
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

            {/* Speed */}
            <div className="flex gap-2 text-xs text-gray-700 mb-4">
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

            {/* Answer */}
            <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm leading-relaxed text-gray-800 min-h-[150px]">
              {displayed || "Your answer will appear here."}
            </div>

            {/* Recent panel */}
            {hasRecent && (
              <div className="mt-4">
                <div className="text-xs font-semibold text-gray-600 mb-1">Recent in this conversation</div>
                <div className="rounded-xl border border-gray-200 bg-white">
                  {recent.map((r, idx) => (
                    <button
                      type="button"
                      key={idx}
                      onClick={() => setQuestion(r.text)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      {short(r.text)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-xs py-4 opacity-70">
        Beta — not legal/financial advice. Sources may include internal summaries and public documents.
      </footer>
    </div>
  );
}
