// netlify/functions/update-user.js
// Updates a row in public.users using service role (RLS-safe).
// Expects JSON body with fields that match the users table.

const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return { statusCode: 500, body: JSON.stringify({ ok: false, error: "Missing Supabase env vars" }) };
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: "Invalid JSON" }) };
    }

    const email = String(payload.email || "").trim();
    if (!email) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: "Email is required." }) };
    }

    // Prepare update row (only allow known columns)
    const row = {
      full_name: payload.full_name ?? null,
      email,
      org_type: payload.org_type ?? null,
      org_name: payload.org_name ?? null,
      unit_id: payload.unit_id ?? null,
      school_name: payload.school_name ?? null,
      state: payload.state ?? null,
      city: payload.city ?? null,
      pref_area: payload.pref_area ?? null,
      last_active: new Date().toISOString()
    };

    // Upsert by email
    const { data: existing, error: selErr } = await supabase
      .from("users")
      .select("id")
      .ilike("email", email)
      .single();

    if (selErr && selErr.code !== "PGRST116") { // not found code
      console.error("users select error:", selErr);
    }

    let upsertError = null;
    if (existing?.id) {
      const { error: updErr } = await supabase
        .from("users")
        .update(row)
        .eq("id", existing.id);
      if (updErr) upsertError = updErr;
    } else {
      const { error: insErr } = await supabase
        .from("users")
        .insert(row);
      if (insErr) upsertError = insErr;
    }

    if (upsertError) {
      console.error("users upsert error:", upsertError);
      return { statusCode: 500, body: JSON.stringify({ ok: false, error: "Database error." }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("update-user error:", err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: "Server error" }) };
  }
};
