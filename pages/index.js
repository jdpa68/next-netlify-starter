// pages/index.js — Step 5c-1: add “Dissertations only” filter (Source)
import Head from "next/head";
import { useState, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

/* Supabase client */
function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  );
}

const toArray = (v) =>
  Array.isArray(v)
    ? v
    : String(v || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

/* Server-side: preload tags + first page */
export async function getServerSideProps() {
  const supabase = getClient();

  const { data: tagScan = [] } = await supabase
    .from("knowledge_base")
    .select("id, tags")
    .limit(500);

  const areaSet = new Set();
  const issueSet = new Set();
  tagScan.forEach((r) =>
    toArray(r.tags).forEach((t) => {
      if (t.startsWith("area_")) areaSet.add(t);
      if (t.startsWith("issue_")) issueSet.add(t);
    })
  );

  const areaTags = Array.from(areaSet).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
  const issueTags = Array.from(issueSet).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );

  const { data: initialData = [], error } = await supabase
    .from("knowledge_base")
    .select("id, title, summary, tags, source_url")
    .limit(20);

  return {
    props: {
      initialData,
      initialError: error ? String(error.message) : null,
      areaTags,
      issueTags,
    },
  };
}

export default function Home({
  initialData = [],
  initialError = null,
  areaTags = [],
  issueTags = [],
}) {
  const PAGE_SIZE = 20;
  const [records, setRecords] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [areaTag, setAreaTag] = useState("all");
  const [issueTag, setIssueTag] = useState("all");
  const [dissertationFilter, setDissertationFilter] = useState("all"); // NEW
  const [q, setQ] = useState("");
  const [total, setTotal] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const debounceRef = useRef(null);

  const [ipedsUnitid, setIpedsUnitid] = useState("217156");
  const [blsSeries, setBlsSeries] = useState("CES6562140001");
  const [cfrQuery, setCfrQuery] = useState("Title IV");
  const [apiOut, setApiOut] = useState("");
  const [apiSummary, setApiSummary] = useState("");

  function buildQuery(supabase, countOnly = false) {
    const sel = countOnly ? "id" : "id, title, summary, tags, source_url";
    let query = supabase.from("knowledge_base").select(sel, {
      count: "exact",
      head: countOnly,
    });
    if (areaTag !== "all") query = query.ilike("tags", `%${areaTag}%`);
    if (issueTag !== "all") query = query.ilike("tags", `%${issueTag}%`);
    if (dissertationFilter === "dissertations") {
      query = query.ilike("tags", "%doctype_dissertation%");
    }
    const like = String(q || "").replace(/%/g, "").trim();
    if (like) {
      query = query.or(
        `title.ilike.%${like}%,summary.ilike.%${like}%,tags.ilike.%${like}%`
      );
    }
    return query;
  }

  async function fetchData({ reset = true } = {}) {
    setLoading(true);
    const supabase = getClient();
    const { count } = await buildQuery(supabase, true);
    if (typeof count === "number") setTotal(count);
    const nextPage = reset ? 1 : page + 1;
    const from = (nextPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await buildQuery(supabase, false).range(from, to);
    if (!error) {
      setRecords(reset ? data : [...records, ...data]);
      setPage(nextPage);
      setHasMore(count ? to + 1 < count : (data || []).length === PAGE_SIZE);
    }
    setLoading(false);
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 24, background: "#f8fafc" }}>
      <Head><title>PeerQuest Lancelot — Evidence + Live Data</title></Head>
      <header style={{ borderBottom: "2px solid #0f172a", marginBottom: 24 }}>
        <h1 style={{ margin: 0, color: "#0f172a" }}>PeerQuest Lancelot</h1>
        <p style={{ opacity: 0.7 }}>Evidence Tray • Search + Live API Cards</p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.7fr", gap: 16, alignItems: "start", maxWidth: 1200, margin: "0 auto" }}>
        {/* Left: Filters */}
        <div style={{ background: "#fff", padding: "12px 16px", borderRadius: 12, boxShadow: "0 4px 10px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, alignItems: "center" }}>
            {/* Search */}
            <div>
              <label style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 6 }}>Search</label>
              <input
                value={q}
                onChange={(e)=>{ setQ(e.target.value); if (debounceRef.current) clearTimeout(debounceRef.current); debounceRef.current=setTimeout(()=>{ setPage(1); fetchData({reset:true}); }, 400);}}
                placeholder="e.g., transfer credit, Title IV, retention"
                style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #e2e8f0", background: "#f1f5f9" }}
              />
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Total: {total ?? "–"}</div>
            </div>

            {/* Area */}
            <label style={{ fontSize: 14, fontWeight: 600 }}>
              Area
              <select
                onChange={(e)=>{ setAreaTag(e.target.value); setPage(1); fetchData({reset:true}); }}
                value={areaTag}
                style={{ marginLeft: 10, padding: "6px 10px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#f1f5f9", minWidth: 160 }}
              >
                <option value="all">All Areas</option>
                {areaTags.map((t) => (<option key={t} value={t}>{t.replace("area_", "").replace(/_/g, " ")}</option>))}
              </select>
            </label>

            {/* Issue */}
            <label style={{ fontSize: 14, fontWeight: 600 }}>
              Issue
              <select
                onChange={(e)=>{ setIssueTag(e.target.value); setPage(1); fetchData({reset:true}); }}
                value={issueTag}
                style={{ marginLeft: 10, padding: "6px 10px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#f1f5f9", minWidth: 180 }}
              >
                <option value="all">All Issues</option>
                {issueTags.map((t) => (<option key={t} value={t}>{t.replace("issue_", "").replace(/_/g, " ")}</option>))}
              </select>
            </label>

            {/* NEW: Source filter */}
            <label style={{ fontSize: 14, fontWeight: 600 }}>
              Source
              <select
                value={dissertationFilter}
                onChange={(e)=>{ setDissertationFilter(e.target.value); setPage(1); fetchData({reset:true}); }}
                style={{ marginLeft: 10, padding: "6px 10px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#f1f5f9", minWidth: 180 }}
              >
                <option value="all">All sources</option>
                <option value="dissertations">Dissertations only</option>
              </select>
            </label>
          </div>
        </div>

        {/* Right: API cards (unchanged from polished step) */}
        <div style={{ background: "#fff", padding: "12px 16px", borderRadius: 12, boxShadow: "0 4px 10px rgba(0,0,0,0.05)" }}>
          <h3 style={{marginTop:0}}>Live Data (API)</h3>
          <div style={{marginBottom:12}}>
            <strong>IPEDS</strong>
            <button onClick={()=>{ setApiOut("Loading…"); fetch(`/.netlify/functions/fetchIPEDS?unitid=217156`).then(r=>r.text()).then(setApiOut); }} style={{marginLeft:8,padding:"6px 12px"}}>Fetch</button>
          </div>
          <div style={{marginBottom:12}}>
            <strong>BLS</strong>
            <button onClick={()=>{ setApiOut("Loading…"); fetch(`/.netlify/functions/fetchBLS?series=CES6562140001`).then(r=>r.text()).then(setApiOut); }} style={{marginLeft:8,padding:"6px 12px"}}>Fetch</button>
          </div>
          <div>
            <strong>CFR</strong>
            <button onClick={()=>{ setApiOut("Loading…"); fetch(`/.netlify/functions/fetchCFR?query=Title%20IV`).then(r=>r.text()).then(setApiOut); }} style={{marginLeft:8,padding:"6px 12px"}}>Fetch</button>
          </div>
          <pre style={{marginTop:8,background:"#0b1225",color:"#d2d6f3",padding:12,borderRadius:10,maxHeight:240,overflow:"auto"}}>{apiOut||"API output will appear here…"}</pre>
        </div>
      </div>

      {/* Evidence Tray */}
      <section style={{ padding: 20, background: "white", borderRadius: 16, boxShadow: "0 10px 30px rgba(0,0,0,0.05)", maxWidth: 1200, margin: "16px auto 0" }}>
        <h2 style={{ marginTop: 0, borderBottom: "1px solid #e2e8f0", paddingBottom: 8 }}>Evidence Tray</h2>

        {initialError && <p style={{ color: "#b91c1c" }}>Error: {initialError}</p>}
        {records.length === 0 && !loading && <p>No records matched your filters.</p>}

        <div style={{ maxHeight: "60vh", overflowY: "auto", display: "grid", gap: 16, paddingRight: 6 }}>
          {records.map((r) => {
            const tags = toArray(r.tags);
            return (
              <div key={r.id} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, background: "#ffffff" }}>
                <h3 style={{ marginTop: 0, marginBottom: 4, color: "#1e293b" }}>{r.title}</h3>
                <p style={{ marginTop: 0, marginBottom: 8, fontSize: 14, color: "#334155" }}>{r.summary}</p>
                {tags.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    {tags.slice(0, 6).map((t, i) => (
                      <span key={`${r.id}-${i}`} style={{ display: "inline-block", background: "#e2e8f0", color: "#0f172a", borderRadius: 6, padding: "2px 8px", fontSize: 12, marginRight: 6 }}>{t}</span>
                    ))}
                  </div>
                )}
                {r.source_url && (<a href={r.source_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "#2563eb" }}>View source ↗</a>)}
              </div>
            );
          })}
        </div>

        {/* Load more */}
        {hasMore && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
            <button onClick={() => fetchData({ reset: false })} disabled={loading}
                    style={{ padding: "10px 14px", borderRadius: 10, border: 0, background: "#04143C", color: "#fff" }}>
              {loading ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
