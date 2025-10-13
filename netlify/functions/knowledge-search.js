// netlify/functions/knowledge-search.js
// Step 11e — FIXED
// Searches the Knowledge Base view for top matches by area + keywords
// Expects: POST JSON { q?: string, pref_area?: string, limit?: number, table?: string }
// Returns: { ok: boolean, results?: Array, error?: string }

const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    // ---- Env & client (service role needed for secured views) ----
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return json200({ ok: false, error: "Missing Supabase env vars." });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    // ---- Input ----
    const body = safeJson(event.body);
    const q        = (body.q || body.query || "").toString().trim();
    const prefArea = (body.pref_area || body.prefArea || "").toString().trim();
    const limit    = Math.max(1, Math.min(50, Number(body.limit) || 5));

    // Allow override for table/view name via env or body, else default to canonical view.
    const table = (body.table || process.env.KB_TABLE || "v_knowledge_docs_with_tags").toString();

    // ---- Base select: keep a tight field set used by chat.js ----
    let query = supabase
      .from(table)
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

    // ---- Filters ----
    // Area scoping (matches primary OR secondary area)
    if (prefArea) {
      // `.or()` uses comma-separated disjuncts
      query = query.or(`area_primary.eq.${escapeOr(prefArea)},area_secondary.eq.${escapeOr(prefArea)}`);
    }

    // Keyword search across title & summary (min length guard to avoid table scans)
    if (q && q.length >= 2) {
      query = query.or(`title.ilike.%${escapeLike(q)}%,summary.ilike.%${escapeLike(q)}%`);
    }

    // Useful ordering: recent first if available, else id desc
    // We attempt a safe order by updated_at; if it fails, fall back to id.
    let { data, error } = await query.order("updated_at", { ascending: false }).thenPass();
    if (error && /column .*updated_at/i.test(error.message)) {
      ({ data, error } = await query.order("id", { ascending: false }));
    }
    if (error) {
      return json200({ ok: false, error: `Query failed: ${error.message}` });
    }

    const results = Array.isArray(data) ? data : [];
    return json200({ ok: true, results });
  } catch (err) {
    console.error("knowledge-search error:", err);
    return json200({ ok: false, error: "Server error" });
  }
};

/**
 * Helpers
 */

// Netlify runtime of @supabase/supabase-js doesn’t have .thenPass; add a tiny shim
// so we can try one order and gracefully fallback if column missing.
if (!Promise.prototype.thenPass) {
  Promise.prototype.thenPass = function () {
    return this.then((res) => res).catch((e) => ({ data: null, error: e }));
  };
}

function json200(payload) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  };
}

function safeJson(body) {
  try { return JSON.parse(body || "{}"); }
  catch { return {}; }
}

// Escape for ilike pattern wildcards
function escapeLike(s) {
  return s.replace(/[%_]/g, (m) => "\\" + m);
}

// Escape values used inside `.or()` disjuncts (simple guard)
function escapeOr(s) {
  return s.replace(/[,]/g, " ");
}
