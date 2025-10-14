// netlify/functions/knowledge-search.js
// Searches the KB view and returns concise results for chat.js
// Expects POST JSON: { q?: string, pref_area?: string, limit?: number }

const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    // ---- Supabase (service role key required to read secured views) ----
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return json(200, { ok: false, error: "Missing Supabase env vars." });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    // ---- Input ----
    const body = safeJson(event.body);
    const q = (body.q || body.query || "").toString().trim();
    const prefArea = (body.pref_area || body.prefArea || "").toString().trim();
    const limit = Math.max(1, Math.min(10, Number(body.limit) || 5));

    // ---- Query the canonical KB view ----
    let query = supabase
      .from("v_knowledge_docs_with_tags")
      .select(
        [
          "id",
          "title",
          "summary",
          "source_url",
          "area_primary",
          "area_secondary",
          "issue_primary",
          "issue_secondary",
          "tags"
        ].join(",")
      )
      .limit(limit);

    // Area scope (match either primary or secondary)
    if (prefArea) {
      query = query.or(
        `area_primary.eq.${escapeOr(prefArea)},area_secondary.eq.${escapeOr(prefArea)}`
      );
    }

    // Keyword search across title + summary
    if (q && q.length >= 2) {
      query = query.or(
        `title.ilike.%${escapeLike(q)}%,summary.ilike.%${escapeLike(q)}%`
      );
    }

    // Order by recency if available; otherwise fallback to id desc
    let { data, error } = await query.order("updated_at", { ascending: false });
    if (error && /column.*updated_at/i.test(error.message)) {
      ({ data, error } = await query.order("id", { ascending: false }));
    }
    if (error) {
      return json(200, { ok: false, error: `Query failed: ${error.message}` });
    }

    return json(200, { ok: true, results: Array.isArray(data) ? data : [] });
  } catch (err) {
    console.error("knowledge-search error:", err);
    return json(200, { ok: false, error: "Server error" });
  }
};

// ---------- helpers ----------
function json(statusCode, payload) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}
function safeJson(s) {
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}
function escapeLike(s) {
  return s.replace(/[%_]/g, (m) => "\\" + m);
}
function escapeOr(s) {
  return s.replace(/[,]/g, " ");
}
