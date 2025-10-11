// netlify/functions/snoopy-run.js
// Snoopy v0 — two health checks, writes to public.qa_reports

exports.handler = async () => {
  try {
    const {
      NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    } = process.env;

    if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return { statusCode: 500, body: "Supabase env vars missing" };
    }

    const { createClient } = await import("@supabase/supabase-js");
    const { randomUUID } = await import("node:crypto");
    const runId = randomUUID();

    const db = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ---------- Check #1: KB audit health (from v_kb_final_audit) ----------
    let pass1 = true;
    let note1 = "OK";
    let payload1 = null;

    {
      const { data, error } = await db
        .from("v_kb_final_audit")
        .select("*")
        .limit(1000);

      if (error) {
        pass1 = false;
        note1 = `Query error: ${error.message}`;
      } else {
        payload1 = data || [];
        // Simple rules: no missing summary or source allowed above a small threshold
        const missingSummary = payload1.reduce((acc, r) => acc + Number(r.missing_summary || 0), 0);
        const missingSource  = payload1.reduce((acc, r) => acc + Number(r.missing_source  || 0), 0);

        if (missingSummary > 0 || missingSource > 0) {
          pass1 = false;
          note1 = `Missing fields — summaries: ${missingSummary}, sources: ${missingSource}`;
        }
      }

      await db.from("qa_reports").insert({
        run_id: runId,
        check_name: "kb_audit_health",
        status: pass1 ? "pass" : "fail",
        details: note1,
        payload: payload1,
      });
    }

    // ---------- Check #2: Evidence Tray basic query returns rows ----------
    let pass2 = true;
    let note2 = "OK";
    let payload2 = null;

    {
      const { data, error, count } = await db
        .from("knowledge_base")
        .select("id", { count: "exact" })
        .limit(1);

      if (error) {
        pass2 = false;
        note2 = `KB query error: ${error.message}`;
      } else if (!data || data.length === 0 || (count ?? 0) === 0) {
        pass2 = false;
        note2 = "KB appears empty.";
      }

      payload2 = { count: count ?? 0 };

      await db.from("qa_reports").insert({
        run_id: runId,
        check_name: "kb_available",
        status: pass2 ? "pass" : "fail",
        details: note2,
        payload: payload2,
      });
    }

    // Final summary
    const overall =
      (pass1 ? 1 : 0) + (pass2 ? 1 : 0) === 2 ? "pass" : (pass1 || pass2 ? "warn" : "fail");

    await db.from("qa_reports").insert({
      run_id: runId,
      check_name: "summary",
      status: overall,
      details: "Snoopy v0: kb_audit_health + kb_available",
      payload: null,
    });

    return { statusCode: 200, body: `Snoopy v0 run ${runId} → ${overall}` };
  } catch (e) {
    return { statusCode: 500, body: e?.message || "Unexpected error in snoopy-run" };
  }
};
