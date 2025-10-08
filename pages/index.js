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

/* Server-side: tag lists + first page */
export async function getServerSideProps() {
  const supabase = getClient();

  const toArray = (v) =>
    Array.isArray(v)
      ? v
      : String(v || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

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

/* UI */
export default function Home({
  initialData = [],
  initialError = null,
  areaTags = [],
  issueTags = [],
}) {
  /* Evidence tray state */
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

  /* API cards state */
  const [ipedsUnitid, setIpedsUnitid] = useState("217156"); // example: Lindenwood
  const [blsSeries, setBlsSeries] = useState("CES6562140001"); // example series id
  const [cfrQuery, setCfrQuery] = useState("Title IV");
  const [apiOut, setApiOut] = useState("");

  const toArray = (v) =>
    Array.isArray(v)
      ? v
      : String(v || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

  /* Evidence fetch helpers */
  function buildQuery(supabase, countOnly = false) {
    let sel = countOnly ? "id" : "id, title, summary, tags, source_url";
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

    // count
    const { count } = await buildQuery(supabase, true);
    if (typeof count === "number") setTotal(count);

    // page
    const nextPage = reset ? 1 : page + 1;
    const from = (nextPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = buildQuery(supabase, false).range(from, to);
    const { data, error } = await query;

    if (!error) {
      setRecords(reset ? data : [...records, ...data]);
      setPage(nextPage);
      setHasMore(count ? to + 1 < count : (data || []).length === PAGE_SIZE);
    }
    setLoading(false);
  }

  function onAreaChange(e) {
    setAreaTag(e.target.value);
    setPage(1);
    fetchData({ reset: true });
  }
  function onIssueChange(e) {
    setIssueTag(e.target.value);
    setPage(1);
    fetchData({ reset: true });
  }
  function onSearchChange(e) {
    const value = e.target.value;
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchData({ reset: true });
    }, 400);
  }
  function clearAll() {
    setQ("");
    setAreaTag("all");
    setIssueTag("all");
    setPage(1);
    fetchData({ reset: true });
  }
  function highlight(text, query) {
    const t = String(text || "");
    const qx = String(query || "").trim();
    if (!qx) return t;
    try {
      const re = new RegExp(`(${qx.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
      const parts = t.split(re);
      return parts.map((p, i) =>
        re.test(p) ? (
          <mark key={i} style={{ background: "#fde68a" }}>{p}</mark>
        ) : (
          <span key={i}>{p}</span>
        )
      );
    } catch {
      return t;
    }
  }

  /* API cards: call your Netlify functions */
  async function callApi(url, body) {
    setApiOut("Loading…");
    try {
      const res = await fetch(url, {
        method: body ? "POST" : "GET",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const txt = await res.text();
      setApiOut(txt);
    } catch (e) {
      setApiOut(`Error: ${e.message}`);
    }
  }

  /* Buttons use your existing functions:
     /.netlify/functions/getIPEDS?unitid=XXXX
     /.netlify/functions/getBLS?series=XXXX
     /.netlify/functions/getCFR?query=XXXX
     (Adjust names if your function filenames differ.)
  */

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 24, background: "#f8fafc" }}>
      <Head><title>PeerQuest Lancelot — Evidence + Live Data</title></Head>

      <header style={{ borderBottom: "2px solid #0f172a", marginBottom: 24 }}>
        <h1 style={{ margin: 0, color: "#0f172a" }}>PeerQuest Lancelot</h1>
        <p style={{ opacity: 0.7 }}>Evidence Tray • Search + Live API Cards</p>
      </header>

      {/* Top grid: Search/Filters + API Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.3fr 0.7fr",
          gap: 16,
          alignItems: "start",
          maxWidth: 1200,
          margin: "0 auto",
        }}
      >
        {/* Left column: Search + Filters */}
        <div
          style={{
            background: "#ffffff",
            padding: "12px 16px",
            borderRadius: 12,
            boxShadow: "0 4px 10px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr auto", gap: 12 }}>
            <div>
              <label style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 6 }}>
                Search (title, summary, tags)
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={q}
                  onChange={onSearchChange}
                  placeholder="e.g., transfer credit, Title IV, retention"
                  style={{
                    flex: 1,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    background: "#f1f5f9",
                  }}
                />
                <button
                  onClick={clearAll}
                  style={{ padding: "8px 12px", borderRadius: 8, border: 0, background: "#e2e8f0" }}
                >
                  Clear all
                </button>
              </div>
            </div>

            <label style={{ fontSize: 14, fontWeight: 600 }}>
              Area
              <select
                onChange={onAreaChange}
                value={areaTag}
                style={{
                  marginLeft: 10,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  background: "#f1f5f9",
                  minWidth: 200,
                }}
              >
                <option value="all">All Areas</option>
                {areaTags.map((t) => (
                  <option key={t} value={t}>{t.replace("area_", "").replace(/_/g, " ")}</option>
                ))}
              </select>
            </label>

            <label style={{ fontSize: 14, fontWeight: 600 }}>
              Issue
              <select
                onChange={onIssueChange}
                value={issueTag}
                style={{
                  marginLeft: 10,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  background: "#f1f5f9",
                  minWidth: 220,
                }}
              >
                <option value="all">All Issues</option>
                {issueTags.map((t) => (
                  <option key={t} value={t}>{t.replace("issue_", "").replace(/_/g, " ")}</option>
                ))}
              </select>
            </label>

            <div style={{ fontSize: 13, opacity: 0.8 }}>
              {total === null ? "" : `${total} result${total === 1 ? "" : "s"}`}
            </div>
          </div>
        </div>

        {/* Right column: Live API cards */}
        <div
          style={{
            background: "#ffffff",
            padding: "12px 16px",
            borderRadius: 12,
            boxShadow: "0 4px 10px rgba(0,0,0,0.05)",
          }}
        >
          <h3 style={{ marginTop: 0 }}>Live Data (API)</h3>

          {/* IPEDS */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <strong>IPEDS</strong>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input
                value={ipedsUnitid}
                onChange={(e) => setIpedsUnitid(e.target.value)}
                placeholder="unitid (e.g., 217156)"
                style={{ flex: 1, padding: 8, border: "1px solid #e2e8f0", borderRadius: 8 }}
              />
              <button
                onClick={() => callApi(`/.netlify/functions/getIPEDS?unitid=${encodeURIComponent(ipedsUnitid)}`)}
                style={{ padding: "8px 12px", borderRadius: 8, border: 0, background: "#04143C", color: "#fff" }}
              >
                Fetch IPEDS
              </button>
            </div>
          </div>

          {/* BLS */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <strong>BLS</strong>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input
                value={blsSeries}
                onChange={(e) => setBlsSeries(e.target.value)}
                placeholder="series id (e.g., CES6562140001)"
                style={{ flex: 1, padding: 8, border: "1px solid #e2e8f0", borderRadius: 8 }}
              />
              <button
                onClick={() => callApi(`/.netlify/functions/getBLS?series=${encodeURIComponent(blsSeries)}`)}
                style={{ padding: "8px 12px", borderRadius: 8, border: 0, background: "#04143C", color: "#fff" }}
              >
                Fetch BLS
              </button>
            </div>
          </div>

          {/* CFR / Federal rules */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 12 }}>
            <strong>CFR / Federal Rules</strong>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input
                value={cfrQuery}
                onChange={(e) => setCfrQuery(e.target.value)}
                placeholder="keyword (e.g., Title IV)"
                style={{ flex: 1, padding: 8, border: "1px solid #e2e8f0", borderRadius: 8 }}
              />
              <button
                onClick={() => callApi(`/.netlify/functions/getCFR?query=${encodeURIComponent(cfrQuery)}`)}
                style={{ padding: "8px 12px", borderRadius: 8, border: 0, background: "#04143C", color: "#fff" }}
              >
                Fetch CFR
              </button>
            </div>
          </div>

          {/* Output */}
          <pre style={{ marginTop: 12, background: "#0b1225", color: "#d2d6f3", padding: 12, borderRadius: 10, maxHeight: 240, overflow: "auto" }}>
{apiOut || "API output will appear here…"}
          </pre>
        </div>
      </div>

      {/* Evidence Tray */}
      <section
        style={{
          padding: 20,
          background: "white",
          borderRadius: 16,
          boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
          maxWidth: 1200,
          margin: "16px auto 0",
        }}
      >
        <h2 style={{ marginTop: 0, borderBottom: "1px solid #e2e8f0", paddingBottom: 8 }}>
          Evidence Tray
        </h2>

        {initialError && <p style={{ color: "#b91c1c" }}>Error: {initialError}</p>}
        {records.length === 0 && !loading && <p>No records matched your filters.</p>}

        <div
          style={{
            maxHeight: "60vh",
            overflowY: "auto",
            display: "grid",
            gap: 16,
            paddingRight: 6,
          }}
        >
          {records.map((r) => {
            const tags = toArray(r.tags);
            return (
              <div
                key={r.id}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 12,
                  padding: 16,
                  background: "#ffffff",
                }}
              >
                <h3 style={{ marginTop: 0, marginBottom: 4, color: "#1e293b" }}>
                  {highlight(r.title, q)}
                </h3>
                <p style={{ marginTop: 0, marginBottom: 8, fontSize: 14, color: "#334155" }}>
                  {highlight(r.summary, q)}
                </p>
                {tags.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    {tags.slice(0, 6).map((t, i) => (
                      <span
                        key={`${r.id}-${i}`}
                        style={{
                          display: "inline-block",
                          background: "#e2e8f0",
                          color: "#0f172a",
                          borderRadius: 6,
                          padding: "2px 8px",
                          fontSize: 12,
                          marginRight: 6,
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                {r.source_url && (
                  <a
                    href={r.source_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 13, color: "#2563eb" }}
                  >
                    View source ↗
                  </a>
                )}
              </div>
            );
          })}
        </div>

        {/* Load more */}
        {hasMore && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
            <button
              onClick={() => fetchData({ reset: false })}
              disabled={loading}
              style={{ padding: "10px 14px", borderRadius: 10, border: 0, background: "#04143C", color: "#fff" }}
            >
              {loading ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
