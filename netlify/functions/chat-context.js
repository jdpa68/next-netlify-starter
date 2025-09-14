// netlify/functions/chat-context.js
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

function clean(text, max = 450) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

exports.handler = async (event) => {
  try {
    const q = (event.queryStringParameters?.q || "").trim();
    const limParam = Number(event.queryStringParameters?.limit || 6);
    const lim = Number.isFinite(limParam) ? Math.min(Math.max(limParam, 1), 12) : 6;

    if (!q) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Missing query parameter ?q=" }),
      };
    }

    // 1) Pull ranked results from our SQL RPC
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
      role: r.role,
      year: r.year,
      doc_type: r.doc_type,
      snippet: clean(r.snippet, 450),
      score: r.score,
    }));

    // 2) Build a single context block for chat models
    const lines = [];
    lines.push(`Query: ${q}`);
    lines.push(`Top ${results.length} sources:`);
    lines.push("");
    results.forEach((r, i) => {
      const tag = r.role ? ` | role: ${r.role}` : (r.doc_type ? ` | doc: ${r.doc_type}` : "");
      lines.push(`[${i + 1}] (${r.source}${tag}) ${r.title}`);
      lines.push(`    ${r.snippet}`);
      lines.push("");
    });

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: q,
        count: results.length,
        results,
        context_block: lines.join("\n"),
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: String(e && e.message ? e.message : e) }),
    };
  }
};
