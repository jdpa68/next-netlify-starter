// netlify/functions/knowledge-search.js
// SMART hybrid: accepts GET (?q=...) and POST ({ q, pref_area, limit })
// Extracts keywords from the user's question and OR-matches them across title/summary.

const { createClient } = require("@supabase/supabase-js");

// very light stopword list; keep short & safe
const STOP = new Set([
  "what","is","are","the","a","an","of","for","to","in","and","or","on","with","about",
  "how","do","does","did","can","could","should","please","help","explain","tell","me",
  "my","our","we","you","your","at","by","from","into","that","this","these","those"
]);

exports.handler = async (event) => {
  try {
    // ---- Parse input ----
    let q = "", prefArea = "", limit = 8;
    if (event.httpMethod === "GET") {
      const qs = event.queryStringParameters || {};
      q = (qs.q || "").toString().trim();
      prefArea = (qs.pref_area || "").toString().trim();
      limit = clampInt(qs.limit, 1, 15, 8);
    } else if (event.httpMethod === "POST") {
      const body = safeJson(event.body);
      q = (body.q || body.query || "").toString().trim();
      prefArea = (body.pref_area || body.prefArea || "").toString().trim();
      limit = clampInt(body.limit, 1, 15, 8);
    } else {
      return json(405, { ok:false, error:"Method Not Allowed" });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) return json(200, { ok:false, error:"Missing Supabase env vars." });

    const supabase = createClient(supabaseUrl, serviceKey);

    // ---- Build base query ----
    let query = supabase
      .from("v_kb_chat_ready")
      .select("title, summary, source_url, area_tags, issue_tags, is_dissertation")
      .limit(limit);

    if (prefArea) query = query.contains("area_tags", [prefArea]);

    // ---- Tokenize q into keywords and OR-match ----
    const tokens = extractKeywords(q);
    if (tokens.length) {
      // Build OR clause like: title.ilike.%token1%,summary.ilike.%token1%,title.ilike.%token2%,...
      const parts = [];
      for (const t of tokens) {
        const like = `%${escapeLike(t)}%`;
        parts.push(`title.ilike.${like}`, `summary.ilike.${like}`);
      }
      query = query.or(parts.join(","));
    }

    // Prefer dissertations if explicitly requested
    if (/dissertation|thesis|doctoral/i.test(q || "")) {
      const { data: d1, error: e1 } = await query.eq("is_dissertation", true).limit(limit);
      if (!e1 && Array.isArray(d1) && d1.length > 0) return json(200, { ok:true, results:d1 });
    }

    const { data, error } = await query.order("title", { ascending:true });
    if (error) return json(200, { ok:false, error:error.message });

    return json(200, { ok:true, results:Array.isArray(data) ? data : [] });
  } catch (err) {
    return json(200, { ok:false, error:String(err?.message || err) });
  }
};

// -------- helpers --------
function json(statusCode, payload){
  return { statusCode, headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload) };
}
function safeJson(s){ try{ return JSON.parse(s || "{}"); } catch{ return {}; } }
function clampInt(v, min, max, fallback){ const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback; }
function escapeLike(s){ return String(s).replace(/[%_]/g, m => "\\"+m); }
function extractKeywords(q){
  // letters/numbers only, split to words, drop stopwords, keep length>=3, dedupe, top 5
  const words = String(q).toLowerCase().match(/[a-z0-9]+/g) || [];
  const cleaned = [];
  const seen = new Set();
  for (const w of words) {
    if (w.length < 3) continue;
    if (STOP.has(w)) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    cleaned.push(w);
    if (cleaned.length >= 5) break;
  }
  return cleaned;
}
