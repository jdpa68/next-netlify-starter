// pages/index.js — Step 5 (polished): Evidence + Search + Live API cards
import Head from "next/head";
import { useState, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

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

  function highlight(text, query) {
    const t = String(text || ""); const qx = String(query || "").trim();
    if (!qx) return t;
    try {
      const re = new RegExp(`(${qx.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")})`, "ig");
      const parts = t.split(re);
      return parts.map((p, i) => (re.test(p) ? <mark key={i} style={{ background: "#fde68a" }}>{p}</mark> : <span key={i}>{p}</span>));
    } catch { return t; }
  }

  async function callApi(kind, url) {
    setApiOut("Loading…");
    setApiSummary("");
    try {
      const res = await fetch(url);
      const txt = await res.text();
      let data = null;
      try { data = JSON.parse(txt); } catch {}
      setApiOut(data ? JSON.stringify(data, null, 2) : txt);

      if (kind === "BLS" && data) {
        const s = data?.Results?.series?.[0]; const d = s?.data?.[0];
        if (d) setApiSummary(`BLS ${s.seriesID}: ${d.periodName} ${d.year} = ${d.value}`);
      }
      if (kind === "IPEDS" && data) {
        const r = data?.results?.[0] || {};
        setApiSummary(`${r["school.name"] || "School"} — ${r["school.city"] || ""}${r["school.state"] ? ", " + r["school.state"] : ""} • Enrollment: ${r["latest.student.enrollment.all"] ?? "n/a"} • Admit: ${r["latest.admissions.admission_rate.overall"] ?? "n/a"} • Cost (AY): ${r["latest.cost.attendance.academic_year"] ?? "n/a"}`);
      }
      if (kind === "CFR" && data) {
        setApiSummary(`CFR results: ${data.results?.length || 0}`);
      }
    } catch (e) {
      setApiOut(JSON.stringify({ error: e.message || "fetch failed" }));
      setApiSummary("Request failed. Check keys and redeploy.");
    }
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 24, background: "#f8fafc" }}>
      <Head><title>PeerQuest Lancelot — Evidence + Live Data</title></Head>
      <header style={{ borderBottom: "2px solid #0f172a", marginBottom: 24 }}>
        <h1 style={{ margin: 0, color: "#0f172a" }}>PeerQuest Lancelot</h1>
        <p style={{ opacity: 0.7 }}>Evidence Tray • Search + Live API Cards</p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.7fr", gap: 16, alignItems: "start", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ background: "#fff", padding: "12px 16px", borderRadius: 12, boxShadow: "0 4px 10px rgba(0,0,0,0.05)" }}>
          <input value={q} onChange={(e)=>{setQ(e.target.value);fetchData({reset:true})}} placeholder="Search titles or summaries…" style={{width:"100%",padding:8,borderRadius:8,border:"1px solid #e2e8f0"}}/>
          <p style={{fontSize:13,opacity:0.7}}>Total: {total ?? "–"}</p>
        </div>

        <div style={{ background: "#fff", padding: "12px 16px", borderRadius: 12, boxShadow: "0 4px 10px rgba(0,0,0,0.05)" }}>
          <h3 style={{marginTop:0}}>Live Data (API)</h3>
          <div style={{marginBottom:12}}>
            <strong>IPEDS</strong>
            <button onClick={()=>callApi("IPEDS",`/.netlify/functions/fetchIPEDS?unitid=${encodeURIComponent(ipedsUnitid)}`)} style={{marginLeft:8,padding:"6px 12px"}}>Fetch</button>
          </div>
          <div style={{marginBottom:12}}>
            <strong>BLS</strong>
            <button onClick={()=>callApi("BLS",`/.netlify/functions/fetchBLS?series=${encodeURIComponent(blsSeries)}`)} style={{marginLeft:8,padding:"6px 12px"}}>Fetch</button>
          </div>
          <div>
            <strong>CFR</strong>
            <button onClick={()=>callApi("CFR",`/.netlify/functions/fetchCFR?query=${encodeURIComponent(cfrQuery)}`)} style={{marginLeft:8,padding:"6px 12px"}}>Fetch</button>
          </div>
          <div style={{marginTop:8,fontSize:14,background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:8}}><strong>Summary:</strong> {apiSummary||"—"}</div>
          <pre style={{marginTop:8,background:"#0b1225",color:"#d2d6f3",padding:12,borderRadius:10,maxHeight:240,overflow:"auto"}}>{apiOut||"API output will appear here…"}</pre>
        </div>
      </div>
    </div>
  );
}
