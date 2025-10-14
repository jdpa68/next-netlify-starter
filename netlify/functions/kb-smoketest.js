// netlify/functions/kb-smoketest.js
// Diagnostic KB test with detailed error output.

const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "present" : "missing";

    if (!supabaseUrl || !serviceKey) {
      return json(200, { ok: false, stage: "env", url: !!supabaseUrl, service_role: !!serviceKey, anonKey });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    // Try simple select 1 row
    const simple = await supabase
      .from("v_knowledge_docs_with_tags")
      .select("id, title")
      .limit(1);
    const simple_ok = !!simple.data && Array.isArray(simple.data);
    const simple_err = simple.error ? serializeErr(simple.error) : null;

    // Try count (some PostgREST configs block head: true)
    const countTry = await supabase
      .from("v_knowledge_docs_with_tags")
      .select("id", { count: "exact", head: true });
    const count_ok = typeof countTry.count === "number";
    const count_err = countTry.error ? serializeErr(countTry.error) : null;

    return json(200, {
      ok: simple_ok || count_ok,
      env: { url: supabaseUrl ? "present" : "missing", service_role: "present", anonKey },
      simple: { ok: simple_ok, rows: simple_ok ? simple.data.length : 0, error: simple_err },
      count: { ok: count_ok, value: countTry.count ?? null, error: count_err }
    });
  } catch (err) {
    return json(200, { ok: false, stage: "server", error: String(err && err.message || err) });
  }
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  };
}
function serializeErr(e) {
  if (!e) return null;
  return { message: e.message || null, details: e.details || null, hint: e.hint || null, code: e.code || null };
}
