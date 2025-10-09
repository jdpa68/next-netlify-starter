// netlify/functions/sandbox-download.js
// Returns a short-lived signed download URL for a file the caller owns.
// GET with query: ?file_id=123   (preferred)  OR  ?file_key=<userId/uuid/name.ext>
// Requires Authorization: Bearer <supabase access token>

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const {
      NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      SANDBOX_BUCKET = "sandbox",
    } = process.env;

    if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return { statusCode: 500, body: "Supabase env vars missing" };
    }

    const { createClient } = await import("@supabase/supabase-js");

    // 1) Verify caller (must be signed-in)
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

    // 2) Accept file_id or file_key
    const params = new URLSearchParams(event.rawQueryString || "");
    const fileId = params.get("file_id");
    let fileKey = params.get("file_key");

    if (fileId) {
      const { data: row, error } = await admin
        .from("sandbox_files")
        .select("file_key,user_id,status,expires_at")
        .eq("id", fileId)
        .single();
      if (error || !row) return { statusCode: 404, body: "File not found" };
      if (row.user_id !== userId) return { statusCode: 403, body: "Not your file" };
      if (row.status !== "active" || new Date(row.expires_at) < new Date()) {
        return { statusCode: 410, body: "File expired or not active" };
      }
      fileKey = row.file_key;
    }

    if (!fileKey) return { statusCode: 400, body: "file_id or file_key required" };
    if (!fileKey.startsWith(`${userId}/`)) {
      return { statusCode: 403, body: "Not your file" };
    }

    // 3) Create a 60-minute signed download URL
    const { data: signed, error: signErr } = await admin
      .storage
      .from(SANDBOX_BUCKET)
      .createSignedUrl(fileKey, 60 * 60); // seconds

    if (signErr) {
      return { statusCode: 500, body: `Sign error: ${signErr.message}` };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ downloadUrl: signed.signedUrl }),
    };
  } catch (e) {
    return { statusCode: 500, body: e?.message || "Unexpected error" };
  }
};
