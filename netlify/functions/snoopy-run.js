// netlify/functions/snoopy-run.js
// Snoopy v1 — smarter KB audit (ignores concept records, uses thresholds)

exports.handler = async () => {
  try {
    const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
    if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return { statusCode: 500, body: "Supabase env vars missing" };
    }

    const { createClient } = await import("@supabase/supabase-js");
    const { randomUUID } = await import("node:crypto");
    const runId = randomUUID();

    const db = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ---------- Check #1: KB audit health (smarter) ----------
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
        const missingSummary = payload1.reduce(
          (acc, r) => acc + Number(r.missing_summary || 0),
          0
        );
        const missingSource = payload1.reduce(
          (acc, r) => acc + Number(r.missing_source || 0),
          0
        );

        // --- Adjust logic: ignore conceptual/internal items
        const { data: kbRows } = await db
          .from("knowledge_base")
          .select("id,title,tags,source_url,summary")
          .limit(1000);

        const conceptMissing = (kbRows || []).filter(
          (r) =>
            (!r.source_url || r.source_url.trim() === "") &&
            (r.tags || "").match(/topic_|area_|concept/i)
        ).length;

        const trueMissing = Math.max(missingSource - conceptMissing, 0);

        if (trueMissing > 200) {
          pass1 = false;
          note1 = `Too many missing sources (${trueMissing})`;
        } else if (trueMissing > 50) {
          pass1 = true;
          note1 = `Partial coverage — ${trueMissing} missing sources (concepts ignored)`;
        } else {
          note1 = `OK — ${trueMissing} real docs missing sources`;
        }

        if (missingSummary > 0) {
          pass1 = false;
          note1 += `; ${missingSummary} missing summaries`;
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

    // ---------- Check #2: Evidence Tray availability ----------
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

    // ---------- Summary ----------
    const overall =
      (pass1 ? 1 : 0) + (pass2 ? 1 : 0) === 2
        ? "pass"
        : pass1 || pass2
        ? "warn"
        : "fail";

    await db.from("qa_reports").insert({
      run_id: runId,
      check_name: "summary",
      status: overall,
      details: "Snoopy v1: refined audit thresholds + concept skip",
      payload: null,
    });

    return { statusCode: 200, body: `Snoopy v1 run ${runId} → ${overall}` };
  } catch (e) {
    return { statusCode: 500, body: e?.message || "Unexpected error in snoopy-run" };
  }
};
