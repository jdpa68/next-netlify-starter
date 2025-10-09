// netlify/functions/sandbox-cleanup.js
// Hourly cleanup: deletes expired files from Supabase Storage and
// marks their rows as 'deleted' in public.sandbox_files.
// Requires env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SANDBOX_BUCKET

exports.handler = async () => {
  try {
    const {
      NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      SANDBOX_BUCKET = "sandbox",
    } = process.env;

    if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return { statusCode: 500, body: "Supabase env vars missing" };
    }

    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1) Find expired + active rows (batch)
    const { data: rows, error: selErr } = await admin
      .from("sandbox_files")
      .select("id, file_key, status, expires_at")
      .eq("status", "active")
      .lt("expires_at", new Date().toISOString())
      .limit(500); // batch size

    if (selErr) throw selErr;
    if (!rows || rows.length === 0) {
      return { statusCode: 200, body: "No expired files to delete." };
    }

    // 2) Delete from storage (ignore not-found errors)
    const fileKeys = rows.map((r) => r.file_key).filter(Boolean);
    if (fileKeys.length > 0) {
      const { error: delErr } = await admin.storage.from(SANDBOX_BUCKET).remove(fileKeys);
      // If someone manually deleted some files, remove() can still return 200 with no error;
      // any error here is non-fatal; we still mark rows deleted below.
      if (delErr && delErr.message) {
        // proceed but report
        console.warn("Storage delete warning:", delErr.message);
      }
    }

    // 3) Mark rows deleted
    const ids = rows.map((r) => r.id);
    const { error: updErr } = await admin
      .from("sandbox_files")
      .update({ status: "deleted" })
      .in("id", ids);
    if (updErr) throw updErr;

    // Optional: sweep orphans (files without rows) — skipped for safety

    return {
      statusCode: 200,
      body: `Cleaned ${ids.length} expired files.`,
    };
  } catch (e) {
    return { statusCode: 500, body: e?.message || "Unexpected error in cleanup" };
  }
};
