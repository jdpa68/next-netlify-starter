import Head from "next/head";
import { useState, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

/* Supabase client (reads Netlify env) */
function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  );
}

/* Server-side: preload data + real tag lists */
export async function getServerSideProps() {
  const supabase = getClient();

  // Pull a larger slice to harvest real tags (no guesses)
  const { data: tagScan = [] } = await supabase
    .from("knowledge_base")
    .select("id, tags")
    .limit(500);

  const toArray = (v) =>
    Array.isArray(v)
      ? v
      : String(v || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

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

  // Initial page
  const { data: initialData = [], error } = await supabase
    .from("knowledge_base")
    .select("id, title, summary, tags, source_url")
    .limit(10);

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
  const [records, setRecords] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [areaTag, setAreaTag] = useState("all");
  const [issueTag, setIssueTag] = useState("all");
  const [q, setQ] = useState("");
  const debounceRef = useRef(null);

  const toArray = (v) =>
    Array.isArray(v)
      ? v
      : String(v || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

  async function refetch(nextArea = areaTag, nextIssue = issueTag, nextQ = q) {
    setLoading(true);
    const supabase = getClient();

    let query = supabase
      .from("knowledge_base")
      .select("id, title, summary, tags, source_url")
      .limit(20);

    if (nextArea !== "all") query = query.ilike("tags", `%${nextArea}%`);
    if (nextIssue !== "all") query = query.ilike("tags", `%${nextIssue}%`);

    const like = String(nextQ || "").replace(/%/g, "").trim();
    if (like) {
      // search title OR summary OR tags
      query = query.or(
        `title.ilike.%${like}%,summary.ilike.%${like}%,tags.ilike.%${like}%`
      );
    }

    const { data, error } = await query;
    if (!error) setRecords(data || []);
    setLoading(false);
  }

  function onAreaChange(e) {
    const value = e.target.value;
    setAreaTag(value);
    refetch(value, issueTag, q);
  }

  function onIssueChange(e) {
    const value = e.target.value;
    setIssueTag(value);
    refetch(areaTag, value, q);
  }

  function onSearchChange(e) {
    const value = e.target.value;
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      refetch(areaTag, issueTag, value);
    }, 400);
  }

  function clearSearch() {
    setQ("");
    refetch(areaTag, issueTag, "");
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 24, background: "#f8fafc" }}>
      <Head><title>PeerQuest Lancelot — Evidence Search</title></Head>

      <header style={{ borderBottom: "2px solid #0f172a", marginBottom: 24 }}>
        <h1 style={{ margin: 0, color: "#0f172a" }}>PeerQuest Lancelot</h1>
        <p style={{ opacity: 0.7 }}>Evidence Tray • Search + Filters</p>
      </header>

      {/* Search + Filters */}
      <div
        style={{
          background: "#ffffff",
          padding: "12px 16px",
          borderRadius: 12,
          boxShadow: "0 4px 10px rgba(0,0,0,0.05)",
          maxWidth: 980,
          margin: "0 auto 20px auto",
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr 1fr auto",
          gap: 12,
          alignItems: "center",
        }}
      >
        {/* Search */}
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
            {q ? (
              <button
                onClick={clearSearch}
                style={{ padding: "8px 12px", borderRadius: 8, border: 0, background: "#e2e8f0" }}
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>

        {/* Area */}
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

        {/* Issue */}
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

        {loading && <span style={{ fontSize: 13 }}>Loading…</span>}
      </div>

      {/* Evidence Tray */}
      <section
        style={{
          padding: 20,
          background: "white",
          borderRadius: 16,
          boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
          maxWidth: 980,
          margin: "0 auto",
        }}
      >
        <h2 style={{ marginTop: 0, borderBottom: "1px solid #e2e8f0", paddingBottom: 8 }}>
          Evidence Tray
        </h2>

        {initialError && (
          <p style={{ color: "#b91c1c" }}>Error: {initialError}</p>
        )}
        {records.length === 0 && !loading && (
          <p>No records matched your filters.</p>
        )}

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
                  {r.title}
                </h3>
                <p style={{ marginTop: 0, marginBottom: 8, fontSize: 14, color: "#334155" }}>
                  {r.summary}
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
      </section>
    </div>
  );
}
