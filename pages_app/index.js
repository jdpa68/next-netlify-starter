// ===========================================
// Lancelot (Public App) — Branded UI + Intent-Aware Retrieval
// + Human-speed typewriter answer + Speed toggle
// ===========================================

import { useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Brand tokens
const BRAND = {
  primary: "#040D2C",     // Deep Cove
  accent:  "#C2AA80",     // Indian Khaki
  white:   "#FFFFFF",
  title:   "Lancelot",
  tagline: "The trusted assistant for every higher-ed professional."
};

// ---------- helpers ----------
function trim(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function topCount(list) { const m=new Map(); for(const v of list||[]){ if(!v) continue; m.set(v,(m.get(v)||0)+1);} let best=null,bn=0; for(const [k,n] of m){ if(n>bn){best=k;bn=n;} } return best; }
function tokenize(s){return Array.from(new Set((s||"").toLowerCase().split(/\W+/).filter(t=>t.length>=3)));}

// very small **bold** renderer
function mdBold(line){ return line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"); }

// --- intent rules ---
function inferIntent(q){
  const s=(q||"").toLowerCase(), has=(...w)=>w.some(x=>s.includes(x));
  const wantsOPM = has("opm","online program manager","wiley","noodle","academic partnerships","2u");

  let issue=null;
  if (has("retention","persist","student success","advisor","advising","orientation","intervention","early alert")) issue="issue_student_success";
  else if (has("accreditation","rsi","standard","title iv","compliance","audit")) issue="issue_compliance";
  else if (has("pricing","price","net tuition","discount","budget","aid","fafsa","pell","scholarship")) issue="issue_cost_pricing";
  else if (has("decline","enrollment decline","pipeline","yield","melt","recruit","inquiry")) issue="issue_declining_enrollment";
  else if (has("quality","learning outcomes","curriculum","instruction","qm","udl")) issue="issue_academic_quality";

  let areaPref=[];
  if (issue==="issue_student_success") areaPref=["area_advising_registrar","area_enrollment"];
  else if (issue==="issue_compliance") areaPref=["area_regional_accreditation","area_national_accreditation"];
  else if (issue==="issue_cost_pricing") areaPref=["area_finance","area_financial_aid"];
  else if (issue==="issue_academic_quality") areaPref=["area_curriculum_instruction"];
  else if (issue==="issue_declining_enrollment") areaPref=["area_enrollment","area_marketing"];
  return { issue, areaPref, wantsOPM };
}

function scoreRow(row,tokens,intent){
  let score=0, text=((row.title||"")+" "+(row.summary||"")).toLowerCase();
  for(const t of tokens){ if(text.includes(t)) score+=3; }
  if (intent.issue && row.issue_primary===intent.issue) score+=2;
  if (intent.issue && row.issue_secondary===intent.issue) score+=1;
  if (intent.areaPref?.includes(row.area_primary)) score+=2;
  if (intent.areaPref?.includes(row.area_secondary)) score+=1;
  const isOPM = row.area_primary==="area_opm" || row.area_secondary==="area_opm";
  if (isOPM && !intent.wantsOPM) score-=2;
  return score;
}

export default function AppHome(){
  const [q,setQ]=useState("");
  const [loading,setLoading]=useState(false);
  const [answer,setAnswer]=useState("");        // full answer (kept for future)
  const [sources,setSources]=useState([]);
  const [error,setError]=useState("");
  const [showCites,setShowCites]=useState(false);

  // Typewriter state
  const [displayedAnswer, setDisplayedAnswer] = useState("");
  const [speed, setSpeed] = useState("normal"); // "normal" | "fast"
  const prerollRef = useRef(null);
  const timerRef = useRef(null);

  const clearTypingTimers = () => {
    if (prerollRef.current) { clearTimeout(prerollRef.current); prerollRef.current = null; }
    if (timerRef.current)   { clearInterval(timerRef.current);  timerRef.current = null; }
  };

  const startTyping = (fullText) => {
    clearTypingTimers();
    setDisplayedAnswer("");
    const words = fullText.split(/\s+/);
    let idx = 0;

    // pre-roll pause so "Thinking…" registers
    prerollRef.current = setTimeout(() => {
      const intervalMs = speed === "fast" ? 18 : 35; // ~human reading speed
      timerRef.current = setInterval(() => {
        if (idx >= words.length) {
          clearTypingTimers();
          return;
        }
        setDisplayedAnswer(prev => prev + (prev ? " " : "") + words[idx++]);
      }, intervalMs);
    }, 350);
  };

  const ask = async(e)=>{
    e?.preventDefault?.();
    const term=(q||"").trim(); if(!term) return;
    setLoading(true); setError(""); setAnswer(""); setSources([]); setShowCites(false);
    clearTypingTimers(); setDisplayedAnswer("");

    try{
      const intent=inferIntent(term), tokens=tokenize(term);

      // Pass 1: intent-first
      let query = supabase
        .from("knowledge_base")
        .select("id,title,summary,source_url,area_primary,area_secondary,issue_primary,issue_secondary,is_dissertation")
        .order("id",{ascending:false}).limit(50);

      if (intent.issue) query=query.eq("issue_primary", intent.issue);
      if (intent.areaPref?.length>0) query=query.in("area_primary", intent.areaPref);

      let {data, error:e1}=await query; if(e1) throw e1;

      // Pass 2: relax + tokens
      if (!data || data.length===0){
        let relaxed = supabase
          .from("knowledge_base")
          .select("id,title,summary,source_url,area_primary,area_secondary,issue_primary,issue_secondary,is_dissertation")
          .order("id",{ascending:false}).limit(50);
        if (intent.issue) relaxed=relaxed.or(`issue_primary.eq.${intent.issue},issue_secondary.eq.${intent.issue}`);
        const tokens = tokenize(term);
        if (tokens.length){
          const orClause = tokens.map(t=>`title.ilike.%${t}%,summary.ilike.%${t}%`).join(",");
          relaxed = relaxed.or(orClause);
        }
        const {data:d2,error:e2}=await relaxed; if(e2) throw e2;
        data=d2||[];
      }

      // Score/sort
      const tokens2 = tokenize(term);
      const ranked=(data||[]).map(r=>({r,s:scoreRow(r,tokens2,intent)})).sort((a,b)=>b.s-a.s).map(x=>x.r);

      // Fallback: recent
      let results=ranked, note="";
      if (!results || results.length===0){
        const {data:d3,error:e3}=await supabase
          .from("knowledge_base")
          .select("id,title,summary,source_url,area_primary,issue_primary,is_dissertation")
          .order("id",{ascending:false}).limit(6);
        if(e3) throw e3;
        results=d3||[]; note="I didn’t find a strong match, so here are recent, relevant sources from your Knowledge Base.";
      }

      const aPrimary=topCount(results.map(d=>d.area_primary));
      const iPrimary=topCount(results.map(d=>d.issue_primary));

      const opening=[
        note || "Here’s a concise answer grounded in your Knowledge Base.",
        aPrimary?`Most relevant area: **${aPrimary}**.`:"",
        iPrimary?`Key issue in play: **${iPrimary}**.`:""
      ].filter(Boolean).join(" ");

      const bullets=results.slice(0,5).map(d=>`• **${d.title}** — ${trim(d.summary,220)}`);
      const closing="Open the citations to review the top sources I used.";

      const full = [opening,"",...bullets, bullets.length?"":"", closing].join("\n");
      setAnswer(full);
      setSources(results.map(d=>({
        title:d.title, url:d.source_url||"",
        flags:[ d.is_dissertation?"dissertation":null, d.area_primary||null, d.issue_primary||null ].filter(Boolean)
      })));
      setShowCites(true);

      // start typewriter
      startTyping(full);

    }catch(e2){ setError(e2.message||"Something went wrong."); }
    finally{ setLoading(false); }
  };

  return (
    <div className="min-h-screen" style={{backgroundColor: BRAND.primary, color: BRAND.white}}>
      {/* Header */}
      <header className="w-full border-b border-white/15">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-xl md:text-2xl font-semibold tracking-wide">{BRAND.title}</div>
            <span className="hidden md:inline text-xs opacity-80">{BRAND.tagline}</span>
          </div>
          <span className="text-xs opacity-80">Beta</span>
        </div>
      </header>

      {/* Main Card */}
      <main className="max-w-3xl mx-auto p-6 md:p-10">
        <section className="rounded-2xl shadow-sm" style={{backgroundColor: BRAND.white, color:"#111", border: "1px solid rgba(4,13,44,0.10)"}}>
          {/* Intro */}
          <div className="px-5 pt-5">
            <h1 className="text-lg md:text-xl font-semibold" style={{color: BRAND.primary}}>
              Your Higher-Ed Partner
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Ask about enrollment, retention, accreditation, finance, or marketing. I’ll answer with citations.
            </p>
          </div>

          {/* Ask form */}
          <form onSubmit={ask} className="px-5 mt-4 flex items-center gap-3 flex-wrap pb-4">
            <input
              type="text"
              value={q}
              onChange={(e)=>setQ(e.target.value)}
              placeholder="Ask Lancelot… e.g., ‘How can we reduce summer melt?’"
              className="flex-1 min-w-[240px] rounded-xl border px-3 py-2"
              style={{borderColor:"rgba(4,13,44,0.20)"}}
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl px-4 py-2 disabled:opacity-50"
              style={{backgroundColor: BRAND.accent, color: BRAND.primary, border: "1px solid rgba(4,13,44,0.08)"}}
            >
              {loading ? "Thinking…" : "Ask"}
            </button>
          </form>

          {error && (
            <div aria-live="polite" className="px-5 pb-4 text-sm" style={{color:"#b91c1c"}}>
              Error: {error}
            </div>
          )}

          {/* Answer + speed toggle + citations */}
          {(displayedAnswer || loading) && (
            <div className="px-5 pb-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base md:text-lg font-semibold" style={{color: BRAND.primary}}>Answer</h2>

                {/* Speed toggle */}
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span>Speed:</span>
                  <button
                    type="button"
                    onClick={() => setSpeed("normal")}
                    className={`rounded border px-2 py-0.5 ${speed==="normal" ? "bg-gray-100" : "bg-white"}`}
                    aria-pressed={speed==="normal"}
                  >
                    Normal
                  </button>
                  <button
                    type="button"
                    onClick={() => setSpeed("fast")}
                    className={`rounded border px-2 py-0.5 ${speed==="fast" ? "bg-gray-100" : "bg-white"}`}
                    aria-pressed={speed==="fast"}
                  >
                    Fast
                  </button>
                </div>
              </div>

              {loading && <div className="text-sm text-gray-600">Searching the KB…</div>}

              {!loading && (
                <div className="prose prose-sm max-w-none">
                  {(displayedAnswer || "").split("\n").map((line,i)=>
                    line.trim()==="" ? <div key={i} className="h-2"/> :
                    line.startsWith("• ") ? <p key={i}>{line}</p> :
                    line.includes("**")
                      ? <p key={i} dangerouslySetInnerHTML={{__html: mdBold(line)}}/>
                      : <p key={i}>{line}</p>
                  )}
                </div>
              )}

              {showCites && sources.length>0 && (
                <div className="mt-2 border-t pt-3 space-y-2" style={{borderColor:"rgba(4,13,44,0.10)"}}>
                  <h3 className="text-sm font-semibold" style={{color: BRAND.primary}}>Citations</h3>
                  <ul className="space-y-1">
                    {sources.map((s,i)=>(
                      <li key={i} className="text-sm">
                        <a className="underline" href={s.url||"#"} target="_blank" rel="noreferrer" style={{color: BRAND.primary}}>
                          {s.title}
                        </a>
                        {s.flags?.length>0 && (
                          <span className="ml-2 text-xs text-gray-600">
                            ({s.flags.join(" · ")})
                          </span>
                        )}
                        {!s.url && <span className="ml-2 text-xs text-gray-500">(no external link)</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Footer note */}
        <div className="text-[11px] mt-4" style={{color: BRAND.white, opacity: 0.75}}>
          Beta — not legal/financial advice. Sources may include internal summaries and public documents.
        </div>
      </main>
    </div>
  );
}
