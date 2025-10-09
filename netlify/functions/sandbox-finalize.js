// netlify/functions/sandbox-finalize.js
// Records file metadata after a successful upload and sets the 24h expiry.
// Body: { fileKey, original_name, mime, size }

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const {
      NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      SANDBOX_TTL_HOURS = "24",
    } = process.env;

    if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return { statusCode: 500, body: "Supabase env vars missing" };
    }

    const { createClient } = await import("@supabase/supabase-js");

    // Verify caller (must be signed-in)
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return { statusCode: 401, body: "Missing Authorization bearer token" };
    }
    const accessToken = authHeader.split(" ")[1];

    const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: userData, error: userErr } = await admin.auth.getUser(accessToken);
    if (userErr || !userData?.user?.id) {
      return { statusCode: 401, body: "Invalid or expired token" };
    }
    const userId = userData.user.id;

    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      return { statusCode: 400, body: "Invalid JSON" };
    }
    const fileKey = (payload.fileKey || "").trim();
    const original_name = (payload.original_name || "").trim();
    const mime = (payload.mime || "application/octet-stream").trim();
    const size = Number(payload.size || 0);

    if (!fileKey || !original_name) {
      return { statusCode: 400, body: "fileKey and original_name are required" };
    }

    // Safety: ensure the fileKey is under this user's folder
    if (!fileKey.startsWith(`${userId}/`)) {
      return { statusCode: 403, body: "Not your fileKey" };
    }

    // Compute expiry
    const ttlHours = Number(SANDBOX_TTL_HOURS);
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();

    // Upsert metadata into sandbox_files
    const { error: upErr } = await admin
      .from("sandbox_files")
      .insert({
        user_id: userId,
        file_key: fileKey,
        original_name,
        mime,
        size_bytes: size,
        expires_at: expiresAt,
        status: "active",
      });

    if (upErr) {
      return { statusCode: 500, body: `Failed to write metadata: ${upErr.message}` };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, expires_at: expiresAt }),
    };
  } catch (e) {
    return { statusCode: 500, body: e?.message || "Unexpected error" };
  }
};
