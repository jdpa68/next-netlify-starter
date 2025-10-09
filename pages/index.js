// ===========================================
// Lancelot Evidence Tray — index.js (12 Areas + 5 Issues)
// ===========================================

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const PAGE_SIZE = 20;

const CANON_AREAS = [
  "area_enrollment",
  "area_marketing",
  "area_finance",
  "area_financial_aid",
  "area_leadership",
  "area_advising_registrar",
  "area_it",
  "area_curriculum_instruction",
  "area_regional_accreditation",
  "area_national_accreditation",
  "area_opm",
  "area_career_colleges"
];

const CANON_ISSUES = [
  "issue_declining_enrollment",
  "issue_student_success",
  "issue_academic_quality",
  "issue_cost_pricing",
  "issue_compliance"
];

export default function Home() {
  const [area, setArea] = useState("");
  const [issue, setIssue] = useState("");
  const [dissertationsOnly, setDissertationsOnly] = useState(false);
  const [q, setQ] = useState("");

  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const fetchResults = async () => {
      setLoading(true);
      setErr("");
      try {
        const from = (page - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        let query = supabase
          .from("knowledge_base")
          .select(
            "id,title,summary,source_url,area_primary,area_secondary,issue_primary,issue_secondary,is_dissertation,tags",
            { count: "exact" }
          );

        if (area) {
          query = query.or(`area_primary.eq.${area},area_secondary.eq.${area}`);
        }
        if (issue) {
          query = query.or(`issue_primary.eq.${issue},issue_secondary.eq.${issue}`);
        }
        if (dissertationsOnly) {
          query = query.eq("is_dissertation", true);
        }
        if (q && q.trim().length > 0) {
          const term = q.trim();
          query = query.or(`title.ilike.%${term}%,summary.ilike.%${term}%`);
        }

        query = query.order("id", { ascending: false }).range(from, to);

        const { data, error, count: total } = await query;
        if (error) throw error;

        setRows(data || []);
        setCount(total || 0);
      } catch (e) {
        setErr(e.message || "Query failed.");
        setRows([]);
        setCount(0);
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [area, issue, dissertationsOnly, q, page]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil((count || 0) / PAGE_SIZE)), [count]);
  const resetPageAnd = (fn) => (val) => { setPage(1); fn(val); };

  return (
    <div className="min-h-screen p-6 md:p-10 bg-gray-50 text-gray-900">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-bold">Lancelot Evidence Tray</h1>
          <p className="text-sm md:text-base">
            Filters use normalized columns (area_*, issue_*, is_dissertation). Search targets <strong>title</strong> and <strong>summary</strong> only.
          </p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input
            type="text"
            value={q}
            onChange={resetPageAnd(setQ)}
            placeholder="Search title or summary…"
            className="md:col-span-2 w-full rounded-xl border px-3 py-2"
          />
          <select
            value={area}
            onChange={(e) => resetPageAnd(setArea)(e.target.value)}
            className="w-full rounded-xl border px-3 py-2"
          >
            <option value="">All Areas</option>
            {CANON_AREAS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <select
            value={issue}
            onChange={(e) => resetPageAnd(setIssue)(e.target.value)}
            className="w-full rounded-xl border px-3 py-2"
          >
            <option value="">All Issues</option>
            {CANON_ISSUES.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 rounded-xl border px-3 py-2 bg-white">
            <input
              type="checkbox"
              checked={dissertationsOnly}
              onChange={(e) => resetPageAnd(setDissertationsOnly)(e.target.checked)}
            />
            <span>Dissertations only</span>
          </label>
        </section>

        <section className="flex items-center justify-between">
          <div className="text-sm">{loading ? "Loading…" : `Results: ${count}`}</div>
          {err && <div className="text-sm text-red-600 font-medium">Error: {err}</div>}
        </section>

        <section className="grid grid-cols-1 gap-4">
          {rows.map((r) => (
            <article key={r.id} className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-lg font-semibold">{r.title}</h2>
                {r.is_dissertation && <span className="text-xs px-2 py-1 rounded-full border">Dissertation</span>}
              </div>
              {r.summary && <p className="mt-2 text-sm leading-relaxed line-clamp-4">{r.summary}</p>}
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {r.area_primary && <span className="px-2 py-1 rounded-full border">{r.area_primary}</span>}
                {r.area_secondary && <span className="px-2 py-1 rounded-full border">{r.area_secondary}</span>}
                {r.issue_primary && <span className="px-2 py-1 rounded-full border">{r.issue_primary}</span>}
                {r.issue_secondary && <span className="px-2 py-1 rounded-full border">{r.issue_secondary}</span>}
              </div>
              <div className="mt-3 flex items-center gap-3 text-xs">
                {r.source_url && <a href={r.source_url} target="_blank" rel="noreferrer" className="underline">Open source</a>}
                {r.tags && <span className="text-gray-500 truncate">tags: {r.tags}</span>}
              </div>
            </article>
          ))}
          {!loading && rows.length === 0 && <div className="text-sm text-gray-500">No results. Try adjusting filters.</div>}
        </section>

        <section className="flex items-center justify-between">
          <button
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-xl border px-3 py-2 disabled:opacity-50 bg-white"
          >
            ← Prev
          </button>
          <div className="text-sm">Page {page} of {totalPages}</div>
          <button
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-xl border px-3 py-2 disabled:opacity-50 bg-white"
          >
            Next →
          </button>
        </section>
      </div>
    </div>
  );
}
