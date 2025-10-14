// netlify/functions/knowledge-search.js
// v_kb_chat_ready search with dissertation awareness
const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return json(200, { ok: false, error: "Missing Supabase env vars." });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = safeJson(event.body);
    const q        = (body.q || body.query || "").toString().trim();
    const prefArea = (body.pref_area || body.prefArea || "").toString().trim();
    const limit    = Math.max(1, Math.min(15, Number(body.limit) || 5));

    let query = supabase
      .from("v_kb_chat_ready")
      .select("title, summary, source_url, area_tags, issue_tags, is_dissertation")
      .limit(limit);

    if (prefArea) {
      query = query.contains("area_tags", [prefArea]); // array contains
    }

    if (q && q.length >= 2) {
      const clean = escapeLike(q);
      query = query.or(`title.ilike.%${clean}%,summary.ilike.%${clean}%`);
    }

    // Prefer dissertations if user asks
    const wantsDissertations = /dissertation|thesis|doctoral/i.test(q || "");
    if (wantsDissertations) {
      const { data: d1, error: e1 } = await query.eq("is_dissertation", true).limit(limit);
      if (!e1 && Array.isArray(d1) && d1.length > 0) {
        return json(200, { ok: true, results: d1 });
      }
    }

    let { data, error } = await query.order("title", { ascending: true });
    if (error) return json(200, { ok: false, error: error.message });

    return json(200, { ok: true, results: Array.isArray(data) ? data : [] });
  } catch (err) {
    return json(200, { ok: false, error: "Server error" });
  }
};

function json(statusCode, payload) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) };
}
function safeJson(s) { try { return JSON.parse(s || "{}"); } catch { return {}; } }
function escapeLike(s) { return s.replace(/[%_]/g, (m) => "\\" + m); }
