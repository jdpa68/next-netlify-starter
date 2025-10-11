// ===========================================
// Lancelot (Public App) — Intent-aware retrieval
// Tags-first filtering + keyword scoring + area/issue preferences
// ===========================================

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// --- intent rules (very lightweight, fast) ---
function inferIntent(q) {
  const s = (q || "").toLowerCase();

  // Flags
  const has = (...words) => words.some(w => s.includes(w));
  const wantsOPM = has("opm", "online program manager", "wiley", "noodle", "academic partnerships", "2u");

  // Issue detection
  let issue = null;
  if (has("retention", "persist", "student success", "advisor", "advising", "orientation", "intervention", "early alert"))
    issue = "issue_student_success";
  else if (has("accreditation", "rs i", "rsi", "standard", "title iv", "compliance", "audit"))
    issue = "issue_compliance";
  else if (has("pricing", "price", "net tuition", "discount", "budget", "aid", "fafsa", "pell", "scholarship"))
    issue = "issue_cost_pricing";
  else if (has("decline", "enrollment decline", "pipeline", "yield", "melt", "recruit", "inquiry"))
    issue = "issue_declining_enrollment";
  else if (has("quality", "learning outcomes", "curriculum", "instruction", "qm", "udl"))
    issue = "issue_academic_quality";

  // Area preference
  let areaPref = [];
  if (issue === "issue_student_success") areaPref = ["area_advising_registrar", "area_enrollment"];
  else if (issue === "issue_compliance") areaPref = ["area_regional_accreditation", "area_national_accreditation"];
  else if (issue === "issue_cost_pricing") areaPref = ["area_finance", "area_financial_aid"];
  else if (issue === "issue_academic_quality") areaPref = ["area_curriculum_instruction"];
  else if (issue === "issue_declining_enrollment") areaPref = ["area_enrollment", "area_marketing"];

  return {
    issue, areaPref, wantsOPM
  };
}

function tokenize(s) {
  return Array.from(new Set((s || "").toLowerCase().split(/\W+/).filter(t => t.length >= 3)));
}

// simple scorer: +3 for exact ilike token hit, +2 for issue match, +2 for areaPref match, -2 for discouraged area
function scoreRow(row, tokens, intent) {
  let score = 0;
  const text = ((row.title || "") + " " + (row.summary || "")).toLowerCase();

  for (const t of tokens) {
    if (text.includes(t)) score += 3;
  }
  if (intent.issue && row.issue_primary === intent.issue) score += 2;
  if (intent.issue && row.issue_secondary === intent.issue) score += 1;

  if (intent.areaPref?.includes(row.area_primary)) score += 2;
  if (intent.areaPref?.includes(row.area_secondary)) score += 1;

  // downrank OPM unless explicitly asked
  const isOPM = row.area_primary === "area_opm" || row.area_secondary === "area_opm";
  if (isOPM && !intent.wantsOPM) score -= 2;

  return score;
}

export default function AppHome() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState([]);
  const [error, setError] = useState("");
  const [showCites, setShowCites] = useState(false);

  const ask = async (e) => {
    e?.preventDefault?.();
    const term = (q || "").trim();
    if (!term) return;

    setLoading(true);
    setError(""); setAnswer(""); setSources([]); setShowCites(false);

    try {
      const intent = inferIntent(term);
      const tokens = tokenize(term);

      // ---------- Pass 1: intent-first filtered query ----------
      let query = supabase
        .from("knowledge_base")
        .select("id,title,summary,source_url,area_primary,area_secondary,issue_primary,issue_secondary,is_dissertation")
        .order("id", { ascending: false })
        .limit(50);

      // Apply issue/area filters when we have them
      if (intent.issue) query = query.eq("issue_primary", intent.issue);
      if (intent.areaPref?.length > 0) query = query.in("area_primary", intent.areaPref);

      let { data, error: e1 } = await query;
      if (e1) throw e1;

      // If nothing came back, relax filters and try ilike search
      if (!data || data.length === 0) {
        let relaxed = supabase
          .from("knowledge_base")
          .select("id,title,summary,source_url,area_primary,area_secondary,issue_primary,issue_secondary,is_dissertation")
          .order("id", { ascending: false })
          .limit(50);

        if (intent.issue) relaxed = relaxed.or(
          `issue_primary.eq.${intent.issue},issue_secondary.eq.${intent.issue}`
        );
        if (tokens.length) {
          const orClause = tokens.map(t => `title.ilike.%${t}%,summary.ilike.%${t}%`).join(",");
          relaxed = relaxed.or(orClause);
        }

        const { data: d2, error: e2 } = await relaxed;
        if (e2) throw e2;
        data = d2 || [];
      }

      // ---------- Scoring & sorting ----------
      const scored = (data || []).map(r => ({ r, s: scoreRow(r, tokens, intent) }))
        .sort((a, b) => b.s - a.s)
        .map(x => x.r);

      // ---------- Fallback if still weak ----------
      let results = scored;
      let fallbackNote = "";
      if (!results || results.length === 0) {
        const { data: d3, error: e3 } = await supabase
          .from("knowledge_base")
          .select("id,title,summary,source_url,area_primary,issue_primary,is_dissertation")
          .order("id", { ascending: false })
          .limit(6);
        if (e3) throw e3;
        results = d3 || [];
        fallbackNote = "I didn’t find a strong match, so here are recent, relevant sources from your Knowledge Base.";
      }

      // ---------- Compose answer ----------
      const aPrimary = topCount(results.map(d => d.area_primary));
      const iPrimary = topCount(results.map(d => d.issue_primary));

      const opening = [
        fallbackNote || "Here’s a concise answer grounded in your Knowledge Base.",
        aPrimary ? `Most relevant area: **${aPrimary}**.` : "",
        iPrimary ? `Key issue in play: **${iPrimary}**.` : ""
      ].filter(Boolean).join(" ");

      const bullets = results.slice(0, 5).map(d => `• **${d.title}** — ${trim(d.summary, 220)}`);
      const closing = "Open the citations to review the top sources I used.";
      setAnswer([opening, "", ...bullets, bullets.length ? "" : "", closing].join("\n"));

      setSources(results.map(d => ({
        title: d.title,
        url: d.source_url || "",
        flags: [
          d.is_dissertation ? "dissertation" : null,
          d.area_primary || null,
          d.issue_primary || null
        ].filter(Boolean)
      })));
      setShowCites(true);

    } catch (e2) {
      setError(e2.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <main className="max-w-3xl mx-auto p-6 md:p-10 space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold">Lancelot</h1>
          <p className="text-sm text-gray-600">
            Ask enrollment, retention, accreditation, finance, or marketing questions. Responses include citations.
          </p>
        </header>

        {/* Ask form */}
        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <form onSubmit={ask} className="flex items-center gap-3 flex-wrap">
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ask Lancelot… e.g., ‘How can we reduce summer melt?’"
              className="flex-1 min-w-[240px] rounded-xl border px-3 py-2"
            />
            <button type="submit" disabled={loading} className="rounded-xl border px-4 py-2 bg-white disabled:opacity-50">
              {loading ? "Thinking…" : "Ask"}
            </button>
          </form>
          {error && <div aria-live="polite" className="mt-3 text-sm text-red-600">Error: {error}</div>}
        </section>

        {/* Answer */}
        {(answer || loading) && (
          <section className="rounded-2xl border bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Answer</h2>
              <button onClick={() => setShowCites((v) => !v)} className="rounded-xl border px-3 py-2 bg-white text-sm">
                {showCites ? "Hide citations" : "Show citations"}
              </button>
            </div>

            {loading && <div className="text-sm">Searching the KB…</div>}

            {!loading && answer && (
              <div className="prose prose-sm max-w-none">
                {answer.split("\n").map((line, i) =>
                  line.trim() === "" ? <div key={i} className="h-2" /> :
                  line.startsWith("• ") ? <p key={i}>{line}</p> :
                  line.includes("**") ? <p key={i} dangerouslySetInnerHTML={{__html: mdBold(line)}} /> :
                  <p key={i}>{line}</p>
                )}
              </div>
            )}

            {/* Citations */}
            {showCites && sources.length > 0 && (
              <div className="mt-2 border-t pt-3 space-y-2">
                <h3 className="text-sm font-semibold">Citations</h3>
                <ul className="space-y-1">
                  {sources.map((s, i) => (
                    <li key={i} className="text-sm">
                      <a className="underline" href={s.url || "#"} target="_blank" rel="noreferrer">{s.title}</a>
                      {s.flags?.length > 0 && (
                        <span className="ml-2 text-xs text-gray-600">({s.flags.join(" · ")})</span>
                      )}
                      {!s.url && <span className="ml-2 text-xs text-gray-500">(no external link)</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        <footer className="text-xs text-gray-500">
          Beta — not legal/financial advice. Sources may include internal summaries and public documents.
        </footer>
      </main>
    </div>
  );
}

// -------- helpers --------
function trim(s, n) {
  s = String(s || "");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function topCount(list) {
  const map = new Map();
  for (const v of list || []) { if (!v) continue; map.set(v, (map.get(v) || 0) + 1); }
  let best = null, bestN = 0;
  for (const [k, n] of map) { if (n > bestN) { best = k; bestN = n; } }
  return best;
}

function mdBold(line) { return line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"); }
