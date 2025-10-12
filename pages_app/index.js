// ===========================================
// Lancelot (Public App)
// Welcome & Context + Intent-Aware Retrieval
// + Human-speed typewriter + Speed toggle + Chat connection
// ===========================================

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Brand tokens
const BRAND = {
  primary: "#040D2C",
  accent: "#C2AA80",
  white: "#FFFFFF",
  title: "Lancelot",
  tagline: "The trusted assistant for every higher-ed professional."
};

// Area chips
const AREA_CHIPS = [
  ["Enrollment", "area_enrollment"],
  ["Marketing", "area_marketing"],
  ["Finance", "area_finance"],
  ["Financial Aid", "area_financial_aid"],
  ["Leadership", "area_leadership"],
  ["Advising/Registrar", "area_advising_registrar"],
  ["IT/Systems", "area_it"],
  ["Curriculum/Instruction", "area_curriculum_instruction"],
  ["Regional Accreditation", "area_regional_accreditation"],
  ["National Accreditation", "area_national_accreditation"],
  ["OPMs", "area_opm"],
  ["Career Colleges", "area_career_colleges"]
];

// ------------- helpers -------------
const LS_KEY = "lancelot_ctx";
function loadCtx() {
  try {
    const raw = typeof window !== "undefined" && window.localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveCtx(ctx) {
  try { if (typeof window !== "undefined") window.localStorage.setItem(LS_KEY, JSON.stringify(ctx || {})); } catch {}
}
function clearCtx() {
  try { if (typeof window !== "undefined") window.localStorage.removeItem(LS_KEY); } catch {}
}

function mdBold(line) { return line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"); }

// ------------- component -------------
export default function AppHome() {
  const [ctx, setCtx] = useState(null);
  const [showWelcome, setShowWelcome] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [prefArea, setPrefArea] = useState("");
  const [welcomeBusy, setWelcomeBusy] = useState(false);
  const [welcomeMsg, setWelcomeMsg] = useState("");

  // Ask screen states
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState("");
  const [displayedAnswer, setDisplayedAnswer] = useState("");
  const [speed, setSpeed] = useState("normal");
  const prerollRef = useRef(null);
  const timerRef = useRef(null);

  const clearTypingTimers = () => {
    if (prerollRef.current) clearTimeout(prerollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  };
  const startTyping = (text) => {
    clearTypingTimers();
    setDisplayedAnswer("");
    const words = text.split(/\s+/);
    let idx = 0;
    prerollRef.current = setTimeout(() => {
      const intervalMs = speed === "fast" ? 18 : 35;
      timerRef.current = setInterval(() => {
        if (idx >= words.length) return clearTypingTimers();
        setDisplayedAnswer((prev) => prev + (prev ? " " : "") + words[idx++]);
      }, intervalMs);
    }, 350);
  };

  useEffect(() => {
    const saved = loadCtx();
    if (saved && (saved.firstName || saved.institutionName)) {
      setCtx(saved);
      setShowWelcome(false);
    }
  }, []);

  const lookupInstitution = async (name) => {
    try {
      const url = new URL("/.netlify/functions/ipeds-lookup", window.location.origin);
      url.searchParams.set("name", name);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("lookup failed");
      const data = await res.json();
      const inst_url = (data.inst_url || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
      return { unit_id: data.unit_id || null, inst_url, name: data.name || name };
    } catch {
      return { unit_id: null, inst_url: null, name };
    }
  };

  const onContinue = async () => {
    setWelcomeBusy(true);
    setWelcomeMsg("");
    try {
      let unit_id = null, inst_url = null, resolvedName = institutionName.trim();
      if (resolvedName) {
        const res = await lookupInstitution(resolvedName);
        unit_id = res.unit_id;
        inst_url = res.inst_url;
        resolvedName = res.name || resolvedName;
      }
      const newCtx = { firstName: firstName.trim(), institutionName: resolvedName, unit_id, inst_url, pref_area: prefArea };
      saveCtx(newCtx);
      setCtx(newCtx);
      setShowWelcome(false);
    } catch (e) {
      setWelcomeMsg("Couldn’t look up the school, continuing anyway.");
      const newCtx = { firstName: firstName.trim(), institutionName, unit_id: null, inst_url: null, pref_area: prefArea };
      saveCtx(newCtx);
      setCtx(newCtx);
      setShowWelcome(false);
    } finally { setWelcomeBusy(false); }
  };
  const onSkip = () => {
    const newCtx = { firstName: firstName.trim(), institutionName: "", unit_id: null, inst_url: null, pref_area: prefArea };
    saveCtx(newCtx); setCtx(newCtx); setShowWelcome(false);
  };
  const onChangeSchool = () => { clearCtx(); setFirstName(ctx?.firstName || ""); setShowWelcome(true); };

  // ------------------- ASK -------------------
  const ask = async (e) => {
    e?.preventDefault?.();
    const term = (q || "").trim();
    if (!term) return;

    setLoading(true);
    setAnswer("");
    clearTypingTimers();
    setDisplayedAnswer("");

    try {
      const res = await fetch("/.netlify/functions/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: term, ctx })
      });
      if (!res.ok) throw new Error("Chat function failed");
      const data = await res.json();

      const full = data.reply || "No response received.";
      setAnswer(full);
      startTyping(full);
    } catch (err) {
      console.error(err);
      setAnswer("Error: could not reach chat function.");
      setDisplayedAnswer("Error: could not reach chat function.");
    } finally {
      setLoading(false);
    }
  };

  // ------------------- UI -------------------
  if (showWelcome) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: BRAND.primary, color: BRAND.white }}>
        <header className="w-full border-b border-white/15">
          <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-xl md:text-2xl font-semibold">{BRAND.title}</div>
              <span className="hidden md:inline text-xs opacity-80">{BRAND.tagline}</span>
            </div>
            <span className="text-xs opacity-80">Beta</span>
          </div>
        </header>

        <main className="max-w-3xl mx-auto p-6 md:p-10">
          <section className="rounded-2xl shadow-sm" style={{ backgroundColor: BRAND.white, color: "#111", border: "1px solid rgba(4,13,44,0.10)" }}>
            <div className="px-5 pt-5">
              <h1 className="text-lg md:text-xl font-semibold" style={{ color: BRAND.primary }}>Hi, I’m Lancelot.</h1>
              <p className="text-sm text-gray-600 mt-1">
                Your higher-ed partner. I can personalize replies if you share your name and college.
              </p>
            </div>
            <div className="px-5 mt-4 grid grid-cols-1 gap-3 pb-2">
              <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name (e.g., Alex)"
                     className="rounded-xl border px-3 py-2" style={{ borderColor: "rgba(4,13,44,0.20)" }} />
              <input type="text" value={institutionName} onChange={(e) => setInstitutionName(e.target.value)} placeholder="College or university (optional)"
                     className="rounded-xl border px-3 py-2" style={{ borderColor: "rgba(4,13,44,0.20)" }} />
              <p className="text-xs text-gray-500">Type your college; I’ll match its .edu and IPEDS ID.</p>
            </div>
            <div className="px-5 pb-3">
              <div className="text-xs text-gray-600 mb-2">Or explore topics:</div>
              <div className="flex flex-wrap gap-2">
                {AREA_CHIPS.map(([label, val]) => (
                  <button key={val} type="button" onClick={() => setPrefArea(val)}
                          className={`text-xs rounded-2xl border px-3 py-1 ${prefArea === val ? "bg-gray-100" : "bg-white"}`}
                          style={{ borderColor: "rgba(4,13,44,0.20)", color: "#111" }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-5 pb-5 flex items-center gap-3">
              <button type="button" onClick={onContinue} disabled={welcomeBusy}
                      className="rounded-xl px-4 py-2 disabled:opacity-50"
                      style={{ backgroundColor: BRAND.accent, color: BRAND.primary, border: "1px solid rgba(4,13,44,0.08)" }}>
                {welcomeBusy ? "Preparing…" : "Continue"}
              </button>
              <button type="button" onClick={onSkip} disabled={welcomeBusy}
                      className="rounded-xl px-3 py-2 bg-white disabled:opacity-50 text-sm"
                      style={{ border: "1px solid rgba(4,13,44,0.20)", color: "#111" }}>Skip</button>
              {welcomeMsg && <span className="text-xs text-red-600">{welcomeMsg}</span>}
            </div>
          </section>
          <div className="text-[11px] mt-4" style={{ color: BRAND.white, opacity: 0.75 }}>
            We store your name and school locally to personalize this session. You can change school later.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: BRAND.primary, color: BRAND.white }}>
      <header className="w-full border-b border-white/15">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-xl md:text-2xl font-semibold">{BRAND.title}</div>
            <span className="hidden md:inline text-xs opacity-80">{BRAND.tagline}</span>
          </div>
          <span className="text-xs opacity-80">Beta</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-6 md:p-10">
        <section className="rounded-2xl shadow-sm" style={{ backgroundColor: BRAND.white, color: "#111", border: "1px solid rgba(4,13,44,0.10)" }}>
          <div className="px-5 pt-5">
            <h1 className="text-lg md:text-xl font-semibold" style={{ color: BRAND.primary }}>
              {ctx?.firstName
                ? (ctx?.institutionName
                    ? `Hi ${ctx.firstName} — ${ctx.institutionName} is set.`
                    : `Hi ${ctx.firstName}.`)
                : "Your Higher-Ed Partner"}
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Ask about enrollment, retention, accreditation, finance, or marketing. I’ll answer with citations.
            </p>
            <div className="mt-1 text-xs text-gray-500">
              {ctx?.inst_url ? `Detected: ${ctx.inst_url}` : ctx?.institutionName ? "No .edu detected yet" : ""}
              {ctx?.institutionName && <button onClick={onChangeSchool} className="ml-2 underline">Change school</button>}
            </div>
          </div>
          <form onSubmit={ask} className="px-5 mt-4 flex items-center gap-3 flex-wrap pb-4">
            <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask Lancelot… e.g., ‘How can we reduce summer melt?’"
                   className="flex-1 min-w-[240px] rounded-xl border px-3 py-2"
                   style={{ borderColor: "rgba(4,13,44,0.20)" }} />
            <button type="submit" disabled={loading}
                    className="rounded-xl px-4 py-2 disabled:opacity-50"
                    style={{ backgroundColor: BRAND.accent, color: BRAND.primary, border: "1px solid rgba(4,13,44,0.08)" }}>
              {loading ? "Thinking…" : "Ask"}
            </button>
          </form>

          {(displayedAnswer || loading) && (
            <div className="px-5 pb-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base md:text-lg font-semibold" style={{ color: BRAND.primary }}>Answer</h2>
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span>Speed:</span>
                  <button onClick={() => setSpeed("normal")} className={`rounded border px-2 py-0.5 ${speed === "normal" ? "bg-gray-100" : "bg-white"}`}>Normal</button>
                  <button onClick={() => setSpeed("fast")} className={`rounded border px-2 py-0.5 ${speed === "fast" ? "bg-gray-100" : "bg-white"}`}>Fast</button>
                </div>
              </div>
              {loading && <div className="text-sm text-gray-600">Waiting for response…</div>}
              {!loading && (
                <div className="prose prose-sm max-w-none">
                  {(displayedAnswer || "").split("\n").map((line, i) =>
                    line.trim() === "" ? <div key={i} className="h-2" /> :
                    line.startsWith("• ") ? <p key={i}>{line}</p> :
                    line.includes("**") ? <p key={i} dangerouslySetInnerHTML={{ __html: mdBold(line) }} /> :
                    <p key={i}>{line}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
