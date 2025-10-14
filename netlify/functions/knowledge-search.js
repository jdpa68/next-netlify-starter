// netlify/functions/knowledge-search.js
// HYBRID version — supports BOTH GET (?q=...) and POST (fetch) from chat.js
// Queries Supabase view v_kb_chat_ready and returns JSON { ok, results }

const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  try {
    // ---- Parse input (GET or POST) ----
    let q = "";
    let prefArea = "";
    let limit = 8;

    if (event.httpMethod === "GET") {
      q = ((event.queryStringParameters && event.queryStringParameters.q) || "").toString().trim();
      prefArea = ((event.queryStringParameters && event.queryStringParameters.pref_area) || "").toString().trim();
      limit = clampInt(event.queryStringParameters && event.queryStringParameters.limit, 1, 15, 8);
    } else if (event.httpMethod === "POST") {
      const body = safeJson(event.body);
      q = (body.q || body.query || "").toString().trim();
      prefArea = (body.pref_area || body.prefArea || "").toString().trim();
      limit = clampInt(body.limit, 1, 15, 8);
    } else {
      return json(405, { ok: false, error: "Method Not Allowed" });
    }

    // ---- Env + client ----
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return json(200, { ok: false, error: "Missing Supabase env vars." });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    // ---- Build query against view ----
    const clean = escapeLike(q);
    let query = supabase
      .from("v_kb_chat_ready")
      .select("title, summary, source_url, area_tags, issue_tags, is_dissertation")
      .limit(limit);

    if (prefArea) query = query.contains("area_tags", [prefArea]);
    if (clean && clean.length >= 2) {
      query = query.or(`title.ilike.%${clean}%,summary.ilike.%${clean}%`);
    }

    // Prefer dissertations if user asks for them
    if (/dissertation|thesis|doctoral/i.test(q || "")) {
      const { data: d1, error: e1 } = await query.eq("is_dissertation", true).limit(limit);
      if (!e1 && Array.isArray(d1) && d1.length > 0) return json(200, { ok: true, results: d1 });
    }

    const { data, error } = await query.order("title", { ascending: true });
    if (error) return json(200, { ok: false, error: error.message });

    return json(200, { ok: true, results: Array.isArray(data) ? data : [] });
  } catch (err) {
    return json(200, { ok: false, error: String(err?.message || err) });
  }
};

// ---- helpers ----
function json(statusCode, payload) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}
function safeJson(s) { try { return JSON.parse(s || "{}"); } catch { return {}; } }
function escapeLike(s) { return s.replace(/[%_]/g, (m) => "\\" + m); }
function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (Number.isFinite(n)) return Math.max(min, Math.min(max, n));
  return fallback;
}
