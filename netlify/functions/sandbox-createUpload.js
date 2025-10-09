// netlify/functions/sandbox-createUpload.js
// Creates a short-lived signed upload URL for the caller's sandbox folder.
// Expects an Authorization: Bearer <supabase access token> header from the client,
// and a JSON body: { filename: string, mime?: string, size?: number }

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const {
      NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      SANDBOX_BUCKET = "sandbox",
      SANDBOX_TTL_HOURS = "24",
    } = process.env;

    if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return { statusCode: 500, body: "Supabase env vars missing" };
    }

    // Lazy import to avoid ESM/CJS mismatch in Netlify functions
    const { createClient } = await import("@supabase/supabase-js");

    // 1) Authenticate the caller using their Supabase access token
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

    // 2) Parse input
    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      return { statusCode: 400, body: "Invalid JSON" };
    }
    const filename = (payload.filename || "").trim();
    const mime = payload.mime || "application/octet-stream";
    const size = Number(payload.size || 0);

    if (!filename) {
      return { statusCode: 400, body: "filename is required" };
    }

    // 3) Build a unique key under the caller’s folder: sandbox/{user_id}/{uuid}/{original_name}
    const uuid = cryptoRandom();
    const fileKey = `${userId}/${uuid}/${sanitize(filename)}`;

    // 4) Create a signed upload URL in the sandbox bucket
    const { data: signed, error: signErr } = await admin
      .storage
      .from(SANDBOX_BUCKET)
      .createSignedUploadUrl(fileKey);
    if (signErr) {
      return { statusCode: 500, body: `Failed to create signed upload URL: ${signErr.message}` };
    }

    // Include some helpful data back to the client
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uploadUrl: signed.signedUrl,
        fileKey,
        bucket: SANDBOX_BUCKET,
        ttlHours: Number(SANDBOX_TTL_HOURS),
        mime,
        size,
      }),
    };
  } catch (e) {
    return { statusCode: 500, body: e?.message || "Unexpected error" };
  }
};

// ---- helpers ----
function sanitize(name) {
  // remove path separators and control chars
  return String(name).replace(/[\\\/\u0000-\u001F]/g, "_");
}

function cryptoRandom() {
  // simple UUID-ish token for folder separation
  const bytes = require("crypto").randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
