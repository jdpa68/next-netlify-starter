import Head from "next/head";
import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* ---------- Supabase client ---------- */
function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  );
}

/* ---------- Helpers ---------- */
function toArray(maybe) {
  if (!maybe) return [];
  if (Array.isArray(maybe)) return maybe;
  // handle "tag1, tag2, tag3"
  return String(maybe)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractPrefixedTags(rows, prefix) {
  const set = new Set();
  rows.forEach((r) => {
    toArray(r.tags).forEach((t) => {
      if (t.startsWith(prefix)) set.add(t);
    });
  });
  return Array.from(set).sort();
}

function labelFromTag(tag, prefix) {
  // "issue_student_outcomes" -> "Student Outcomes"
  const core = tag.replace(prefix, "");
  return core
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

/* ---------- Server-side preload ---------- */
export async function getServerSideProps() {
  const supabase = getClient();

  // 1) Fetch a larger slice just to harvest tags (cheap)
  const { data: tagScan = [] } = await supabase
    .from("knowledge_base")
    .select("id, tags")
    .limit(500);

  const areaTags = extractPrefixedTags(tagScan, "area_");
  const issueTags = extractPrefixedTags(tagScan, "issue_");

  // 2) Initial records to show
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

/* ---------- Page ---------- */
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

  async function refetch(nextArea = areaTag, nextIssue = issueTag) {
    setLoading(true);
    const supabase = getClient();

    let query = supabase
      .from("knowledge_base")
      .select("id, title, summary, tags, source_url")
      .limit(10);

    if (nextArea !== "all") query = query.ilike("tags", `%${nextArea}%`);
    if (nextIssue !== "all") query = query.ilike("tags", `%${nextIssue}%`);

    const { data, error } = await query;
    if (!error) setRecords(data || []);
    setLoading(false);
  }

  function onAreaChange(e) {
    const val = e.target.value;
    setAreaTag(val);
    refetch(val, issueTag);
  }

  function onIssueChange(e) {
    const val = e.target.value;
    setIssueTag(val);
    refetch(areaTag, val);
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 24, background: "#f8fafc" }}>
      <Head>
        <title>PeerQuest Lancelot Evidence Tray</title>
      </Head>

      <header style={{ borderBottom: "2px solid #0f172a", marginBottom: 24 }}>
        <h1 style={{ margin: 0, color: "#0f172a" }}>PeerQuest Lancelot</h1>
        <p style={{ opacity: 0.7 }}>Evidence Tray • Dynamic Filters (from real tags)</p>
      </header>

      {/* Filter Bar */}
      <div
        style={{
          background: "#ffffff",
          padding: "12px 16px",
          borderRadius: 12,
          boxShadow: "0 4px 10px rgba(0,0,0,0.05)",
          maxWidth: 900,
          margin: "0 auto 20px auto",
          display: "grid",
          gridTemplateColumns: "1fr 1fr auto",
          gap: 12,
          alignItems: "center",
        }}
      >
        <label style={{ fontSize: 14, fontWeight: 600 }}>
          Area:
          <select
            onChange={onAreaChange}
            value={areaTag}
            style={{
              marginLeft: 10,
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              background: "#f1f5f9",
              minWidth: 220,
            }}
          >
            <option value="all">All Areas</option>
            {areaTags.map((t) => (
              <option key={t} value={t}>
                {labelFromTag(t, "area_")}
              </option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 14, fontWeight: 600 }}>
          Issue:
          <select
            onChange={onIssueChange}
            value={issueTag}
            style={{
              marginLeft: 10,
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              background: "#f1f5f9",
              minWidth: 260,
            }}
          >
            <option value="all">All Issues</option>
            {issueTags.map((t) => (
              <option key={t} value={t}>
                {labelFromTag(t, "issue_")}
              </option>
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
          maxWidth: 900,
          margin: "0 auto",
        }}
      >
        <h2 style={{ marginTop: 0, borderBottom: "1px solid #e2e8f0", paddingBottom: 8 }}>
          Evidence Tray
        </h2>

        {initialError && <p style={{ color: "#b91c1c" }}>Error: {initialError}</p>}
        {records.length === 0 && !loading && <p>No records found for this combination.</p>}

        <div
          style={{
            maxHeight: "60vh",
            overflowY: "auto",
            display: "grid",
            gap: 16,
            paddingRight: 6,
          }}
        >
          {records.map((r) => (
            <div
              key={r.id}
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                padding: 16,
                background: "#ffffff",
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: 4, color: "#1e293b" }}>{r.title}</h3>
              <p style={{ marginTop: 0, marginBottom: 8, fontSize: 14, color: "#334155" }}>
                {r.summary}
              </p>
              {r.tags && (
                <div style={{ marginBottom: 8 }}>
                  {toArray(r.tags)
                    .slice(0, 4)
                    .map((t, i) => (
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
          ))}
        </div>
      </section>

      <footer
        style={{ marginTop: 40, fontSize: 13, opacity: 0.6, textAlign: "center" }}
      >
        Lancelot • Netlify Demo • © {new Date().getFullYear()}
      </footer>
    </div>
  );
}
