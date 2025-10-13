// netlify/functions/knowledge-search.js
// Searches the Knowledge Base for top matches (by area + keywords).
// Returns: { ok: true, results: [{ id, title, summary, source_url, area_primary, area_secondary, issue_primary, issue_secondary }] }

const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    // --- env & client ---
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return json200({ ok: false, error: "Missing Supabase env vars." });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    // --- parse request ---
    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return json200({ ok: false, error: "Invalid JSON" });
    }

    const q = (body.q || "").toString().trim();
    const prefArea = (body.pref_area || "").toString().trim(); // e.g., area_enrollment
    const limit = Math.min(Number(body.limit || 5), 10); // clamp to 10
    const table = (body.table || "knowledge_base").toString(); // default to knowledge_base

    // --- build query ---
    // We’ll select common fields that your chat & UI can cite.
    let query = supabase
      .from(table)
      .select("id, title, summary, source_url, area_primary, area_secondary, issue_primary, issue_secondary")
      .order("id", { ascending: false })
      .limit(limit);

    // If preferred area is given, restrict to that area (matches either primary or secondary).
    if (prefArea) {
      query = query.or(`area_primary.eq.${prefArea},area_secondary.eq.${prefArea}`);
    }

    // If a keyword is given, search across title + summary.
    // (Min length check to avoid wide-open scans.)
    if (q && q.length >= 2) {
      query = query.or(`title.ilike.%${q}%,summary.ilike.%${q}%`);
    }

    // --- run query ---
    const { data, error } = await query;
    if (error) {
      // If the custom table/view name is wrong, or fields differ, return a clean hint.
      return json200({ ok: false, error: `Query failed: ${error.message}` });
    }

    // --- respond ---
    // Normalize to an array (empty array is fine)
    const results = Array.isArray(data) ? data : [];
    return json200({ ok: true, results });
  } catch (err) {
    console.error("knowledge-search error:", err);
    return json200({ ok: false, error: "Server error" });
  }
};

// small utility to always return JSON with 200 (keeps UI simple)
function json200(payload) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  };
}
