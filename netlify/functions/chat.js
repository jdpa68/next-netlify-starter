// netlify/functions/chat.js  (DEBUG MODE)
export async function handler(event) {
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const userText = (body.text || body.message || "").toString();

    // ---- Minimal supabase smoke test (no search yet) ----
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY env variable");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from("knowledge_base")
      .select("id")
      .limit(1);

    if (error) throw error;

    // If we got here, env + client + table name are good.
    const reply = `Debug OK. You said: "${userText}". Supabase reachable; KB rows present: ${data?.length ?? 0}.`;
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ reply }) };

  } catch (err) {
    // Expose the real error so we know what to fix
    const message = err?.message || String(err);
    const stack = err?.stack || "";
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        reply: `DEBUG ERROR: ${message}`,
        error: { message, stack }
      })
    };
  }
}

