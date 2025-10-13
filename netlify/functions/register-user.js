// netlify/functions/register-user.js
// Inserts/updates a user row in public.users using service role key (RLS-safe)
// Expects JSON body:
// {
//   full_name: string,
//   email: string,
//   org_type: "school" | "investor" | "company" | "nonprofit" | "international",
//   org_name?: string,            // required if org_type !== "school"
//   unit_id?: number,             // required if org_type === "school"
//   school_name?: string,         // "Name (ST) — City"
//   state?: string | null,
//   city?: string | null
// }

const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, error: "Missing Supabase env vars" })
      };
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // --- Parse & validate body ---
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: "Invalid JSON" }) };
    }

    const full_name = String(body.full_name || "").trim();
    const email     = String(body.email || "").trim();
    const org_type  = String(body.org_type || "school").trim(); // default to school
    const org_name  = body.org_name ? String(body.org_name).trim() : null;

    const unit_id     = body.unit_id != null ? Number(body.unit_id) : null;
    const school_name = body.school_name ? String(body.school_name).trim() : null;
    const state       = body.state ? String(body.state).trim() : null;
    const city        = body.city ? String(body.city).trim() : null;

    if (!full_name || !email) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: "Name and email are required." }) };
    }

    const allowedOrgs = new Set(["school", "investor", "company", "nonprofit", "international"]);
    if (!allowedOrgs.has(org_type)) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: "Invalid org_type." }) };
    }

    if (org_type === "school") {
      if (!unit_id || !school_name) {
        return { statusCode: 400, body: JSON.stringify({ ok: false, error: "unit_id and school_name are required for school users." }) };
      }
    } else {
      if (!org_name) {
        return { statusCode: 400, body: JSON.stringify({ ok: false, error: "org_name is required for non-school users." }) };
      }
    }

    // --- Upsert by email (case-insensitive unique index handles duplicates) ---
    // We'll normalize to lower(email) for conflict target.
    // Supabase upsert doesn't support expressions in `onConflict`, so we perform a two-step:
    // 1) Try to select by lower(email); 2) insert or update.

    const { data: existing, error: selErr } = await supabase
      .from("users")
      .select("id")
      .ilike("email", email)   // case-insensitive compare
      .limit(1)
      .maybeSingle();

    if (selErr) {
      console.error("users select error:", selErr);
      // continue anyway — we can still attempt insert
    }

    const row = {
      full_name,
      email,
      org_type,
      org_name: org_type === "school" ? null : org_name,
      unit_id:  org_type === "school" ? unit_id : null,
      school_name: org_type === "school" ? school_name : null,
      state: org_type === "school" ? (state || null) : null,
      city:  org_type === "school" ? (city || null)  : null,
      last_active: new Date().toISOString()
    };

    let upsertError = null;

    if (existing?.id) {
      // Update
      const { error: updErr } = await supabase
        .from("users")
        .update(row)
        .eq("id", existing.id);
      if (updErr) upsertError = updErr;
    } else {
      // Insert
      const { error: insErr } = await supabase
        .from("users")
        .insert(row);
      if (insErr) upsertError = insErr;
    }

    if (upsertError) {
      console.error("users upsert error:", upsertError);
      return { statusCode: 500, body: JSON.stringify({ ok: false, error: "Database error (users)." }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true })
    };
  } catch (err) {
    console.error("register-user error:", err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: "Server error" }) };
  }
};
