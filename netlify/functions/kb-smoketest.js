// netlify/functions/kb-smoketest.js
const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return json(200, { ok: false, error: "Missing Supabase env vars (URL or SERVICE_ROLE_KEY)." });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const { count, error: countErr } = await supabase
      .from("v_knowledge_docs_with_tags")
      .select("id", { count: "exact", head: true });
    if (countErr) return json(200, { ok: false, error: `Count failed: ${countErr.message}` });

    const { data: sample, error: sampleErr } = await supabase
      .from("v_knowledge_docs_with_tags")
      .select("id, title")
      .limit(3);
    if (sampleErr) return json(200, { ok: false, error: `Sample failed: ${sampleErr.message}`, count });

    return json(200, { ok: true, count: count ?? null, sample: sample || [] });
  } catch (err) {
    return json(200, { ok: false, error: "Server error" });
  }
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  };
}
