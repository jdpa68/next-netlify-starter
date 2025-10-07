import Head from "next/head";
import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

// --- Create Supabase client safely each time ---
function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  );
}

// --- Server-side preload (fetch first 10 records) ---
export async function getServerSideProps() {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("knowledge_base")
    .select("id, title, summary, tags, source_url")
    .limit(10);

  return {
    props: {
      initialData: data || [],
      initialError: error ? String(error.message) : null,
    },
  };
}

// --- Main component ---
export default function Home({ initialData = [], initialError = null }) {
  const [records, setRecords] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");

  // Handle filter dropdown change
  async function handleFilterChange(e) {
    const value = e.target.value;
    setFilter(value);
    setLoading(true);

    const supabase = getClient();

    let query = supabase
      .from("knowledge_base")
      .select("id, title, summary, tags, source_url")
      .limit(10);

    if (value !== "all") {
      query = query.ilike("tags", `%area_${value}%`);
    }

    const { data, error } = await query;
    if (!error) setRecords(data || []);
    setLoading(false);
  }

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: 24,
        background: "#f8fafc",
      }}
    >
      <Head>
        <title>PeerQuest Lancelot Evidence Tray</title>
      </Head>

      <header style={{ borderBottom: "2px solid #0f172a", marginBottom: 24 }}>
        <h1 style={{ margin: 0, color: "#0f172a" }}>PeerQuest Lancelot</h1>
        <p style={{ opacity: 0.7 }}>Evidence Tray Prototype with Filters</p>
      </header>

      <main>
        {/* Filter Bar */}
        <div
          style={{
            background: "#ffffff",
            padding: "12px 16px",
            borderRadius: 12,
            boxShadow: "0 4px 10px rgba(0,0,0,0.05)",
            maxWidth: 900,
            margin: "0 auto 20px auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <label style={{ fontSize: 14, fontWeight: 600 }}>
            Filter by Area:
            <select
              onChange={handleFilterChange}
              value={filter}
              style={{
                marginLeft: 10,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                background: "#f1f5f9",
              }}
            >
              <option value="all">All</option>
              <option value="enrollment">Enrollment</option>
              <option value="finance">Finance</option>
              <option value="financial_aid">Financial Aid</option>
              <option value="marketing">Marketing</option>
              <option value="accreditation">Accreditation</option>
              <option value="curriculum">Curriculum</option>
              <option value="it">IT & Systems</option>
              <option value="leadership">Leadership</option>
            </select>
          </label>
          {loading && <span style={{ fontSize: 13 }}>Loading...</span>}
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
          <h2
            style={{
              marginTop: 0,
              borderBottom: "1px solid #e2e8f0",
              paddingBottom: 8,
            }}
          >
            Evidence Tray
          </h2>

          {initialError && <p style={{ color: "#b91c1c" }}>Error: {initialError}</p>}
          {records.length === 0 && !loading && (
            <p>No records found for this filter.</p>
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
                <h3
                  style={{
                    marginTop: 0,
                    marginBottom: 4,
                    color: "#1e293b",
                  }}
                >
                  {r.title}
                </h3>
                <p
                  style={{
                    marginTop: 0,
                    marginBottom: 8,
                    fontSize: 14,
                    color: "#334155",
                  }}
                >
                  {r.summary}
                </p>
                {r.tags && (
                  <div style={{ marginBottom: 8 }}>
                    {r.tags.split(",").slice(0, 3).map((t, i) => (
                      <span
                        key={i}
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
                        {t.trim()}
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
      </main>

      <footer
        style={{
          marginTop: 40,
          fontSize: 13,
          opacity: 0.6,
          textAlign: "center",
        }}
      >
        Lancelot • Netlify Demo • © {new Date().getFullYear()}
      </footer>
    </div>
  );
}
