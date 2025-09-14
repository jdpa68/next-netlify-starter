// netlify/functions/index-search.js
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

exports.handler = async (event) => {
  try {
    const q = (event.queryStringParameters?.q || "").trim();
    const limParam = Number(event.queryStringParameters?.limit || 20);
    const lim = Number.isFinite(limParam) ? Math.min(Math.max(limParam, 1), 50) : 20;

    if (!q) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Missing query parameter ?q=" }),
      };
    }

    const { data, error } = await supabase.rpc("search_kb", { q, lim });

    if (error) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: error.message }),
      };
    }

    const results = (data || []).map((r) => ({
      source: r.source,
      id: r.id,
      title: r.title,
      snippet: r.snippet,
      score: r.score,
      role: r.role,
      year: r.year,
      doc_type: r.doc_type,
      tags: r.tags,
    }));

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: q, count: results.length, results }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: String(e && e.message ? e.message : e) }),
    };
  }
};
