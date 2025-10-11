// ===========================================
// Lancelot (Public App) — Assistant UI (smarter search + fallback)
// ===========================================

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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
      // --- pass 1: phrase search over title + summary ---
      let { data, error: kbErr } = await supabase
        .from("knowledge_base")
        .select("id,title,summary,source_url,area_primary,issue_primary,is_dissertation")
        .or(`title.ilike.%${term}%,summary.ilike.%${term}%`)
        .order("id", { ascending: false })
        .limit(8);
      if (kbErr) throw kbErr;

      // --- pass 2: token search (split on spaces, ≥ 3 chars), OR across tokens ---
      if (!data || data.length === 0) {
        const tokens = Array.from(new Set(term.toLowerCase().split(/\s+/).filter(t => t.length >= 3)));
        if (tokens.length > 0) {
          const orClause = tokens.map(t => `title.ilike.%${t}%,summary.ilike.%${t}%`).join(",");
          const { data: d2, error: e2 } = await supabase
            .from("knowledge_base")
            .select("id,title,summary,source_url,area_primary,issue_primary,is_dissertation")
            .or(orClause)
            .order("id", { ascending: false })
            .limit(8);
          if (e2) throw e2;
          data = d2 || [];
        }
      }

      // --- pass 3: fallback if still empty — show recent helpful docs ---
      let note = "";
      if (!data || data.length === 0) {
        const { data: d3, error: e3 } = await supabase
          .from("knowledge_base")
          .select("id,title,summary,source_url,area_primary,issue_primary,is_dissertation")
          .order("id", { ascending: false })
          .limit(6);
        if (e3) throw e3;
        data = d3 || [];
        note = "I didn’t find an exact match, so here are recent, relevant sources from your Knowledge Base.";
      }

      // Build answer
      const aPrimary = topCount(data.map(d => d.area_primary));
      const iPrimary = topCount(data.map(d => d.issue_primary));

      const opening = [
        note || "Here’s a concise answer grounded in your Knowledge Base.",
        aPrimary ? `Most relevant area: **${aPrimary}**.` : "",
        iPrimary ? `Key issue in play: **${iPrimary}**.` : ""
      ].filter(Boolean).join(" ");

      const bullets = data.slice(0, 4).map(d => `• **${d.title}** — ${trim(d.summary, 220)}`);
      const closing = "Open the citations to review the top sources I used.";

      setAnswer([opening, "", ...bullets, bullets.length ? "" : "", closing].join("\n"));

      setSources(
        data.map(d => ({
          title: d.title,
          url: d.source_url || "",
          flags: [
            d.is_dissertation ? "dissertation" : null,
            d.area_primary || null,
            d.issue_primary || null
          ].filter(Boolean)
        }))
      );
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
                      <a className="underline" href={s.url || "#"} target="_blank" rel="noreferrer">
                        {s.title}
                      </a>
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
  for (const v of list || []) {
    if (!v) continue;
    map.set(v, (map.get(v) || 0) + 1);
  }
  let best = null, bestN = 0;
  for (const [k, n] of map) {
    if (n > bestN) { best = k; bestN = n; }
  }
  return best;
}

function mdBold(line) {
  return line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}
