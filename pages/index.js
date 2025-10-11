// ===========================================
// Lancelot Console — Evidence Tray + Sandbox + Auth + Audit + Admin Exports + QA Report
// Step 7 complete + Step 8a/b: Snoopy v0 wired + QA Report panel
// ===========================================

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const PAGE_SIZE = 20;

export default function Home() {
  // -------- Evidence Tray state --------
  const [q, setQ] = useState("");
  const [areaP, setAreaP] = useState("");
  const [areaS, setAreaS] = useState("");
  const [issueP, setIssueP] = useState("");
  const [issueS, setIssueS] = useState("");
  const [dissertationsOnly, setDissertationsOnly] = useState(false);

  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const AREAS = [
    "area_enrollment","area_marketing","area_finance","area_financial_aid","area_leadership",
    "area_advising_registrar","area_it","area_curriculum_instruction","area_regional_accreditation",
    "area_national_accreditation","area_opm","area_career_colleges",
  ];
  const ISSUES = [
    "issue_declining_enrollment","issue_student_success","issue_academic_quality","issue_cost_pricing","issue_compliance",
  ];

  // -------- Sandbox/Auth state --------
  const [session, setSession] = useState(null);
  const [sbErr, setSbErr] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMsg, setAuthMsg] = useState("");

  // -------- Audit panel --------
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditRows, setAuditRows] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditErr, setAuditErr] = useState("");

  // -------- Admin utilities --------
  const [adminMsg, setAdminMsg] = useState("");
  const [adminBusy, setAdminBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  // -------- QA Report panel (NEW) --------
  const [qaOpen, setQaOpen] = useState(false);
  const [qaLoading, setQaLoading] = useState(false);
  const [qaErr, setQaErr] = useState("");
  const [qaRun, setQaRun] = useState(null);        // { run_id, created_at }
  const [qaChecks, setQaChecks] = useState([]);    // rows for that run_id

  // ===== Evidence Tray effects =====
  useEffect(() => {
    const fetchResults = async () => {
      setLoading(true);
      setErr("");
      try {
        const from = (page - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        let query = supabase
          .from("knowledge_base")
          .select(
            "id,title,summary,source_url,area_primary,area_secondary,issue_primary,issue_secondary,is_dissertation,tags",
            { count: "exact" }
          );

        if (areaP) query = query.eq("area_primary", areaP);
        if (areaS) query = query.eq("area_secondary", areaS);
        if (issueP) query = query.eq("issue_primary", issueP);
        if (issueS) query = query.eq("issue_secondary", issueS);
        if (dissertationsOnly) query = query.eq("is_dissertation", true);

        if (q && q.trim().length > 0) {
          const term = q.trim();
          query = query.or(`title.ilike.%${term}%,summary.ilike.%${term}%`);
        }

        query = query.order("id", { ascending: false }).range(from, to);
        const { data, error, count: total } = await query;
        if (error) throw error;

        setRows(data || []);
        setCount(total || 0);
      } catch (e) {
        setErr(e.message || "Query failed.");
        setRows([]);
        setCount(0);
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [q, areaP, areaS, issueP, issueS, dissertationsOnly, page]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((count || 0) / PAGE_SIZE)),
    [count]
  );

  const resetPageAnd = (fn) => (val) => { setPage(1); fn(val); };

  const activeFilters = useMemo(() => {
    let n = 0;
    if (areaP) n++; if (areaS) n++;
    if (issueP) n++; if (issueS) n++;
    if (dissertationsOnly) n++;
    if (q && q.trim()) n++;
    return n;
  }, [areaP, areaS, issueP, issueS, dissertationsOnly, q]);

  // ===== Sandbox helpers =====
  const loadSession = async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data?.session || null);
  };

  const loadMyFiles = async () => {
    setBusy(true); setSbErr("");
    try {
      const { data, error } = await supabase
        .from("sandbox_files")
        .select("id,file_key,original_name,mime,size_bytes,created_at,expires_at,status")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      setFiles(data || []);
    } catch (e) {
      setSbErr(e.message || "Failed to load files.");
      setFiles([]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    loadSession().then(loadMyFiles);
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      loadMyFiles();
    });
    return () => sub.subscription?.unsubscribe();
  }, []);

  const countdownText = (expiresAt) => {
    if (!expiresAt) return "";
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return "deleting soon…";
    const h = Math.floor(ms / (1000 * 60 * 60));
    const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `Deletes in ${h}h ${m}m`;
  };

  // ===== Auth actions =====
  const onSignIn = async () => {
    setAuthBusy(true); setAuthMsg(""); setSbErr("");
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setAuthMsg("Signed in.");
      await loadSession();
      await loadMyFiles();
    } catch (e) {
      setAuthMsg(e.message || "Sign-in failed.");
    } finally {
      setAuthBusy(false);
    }
  };

  const onSignOut = async () => {
    setAuthBusy(true); setAuthMsg("");
    try {
      await supabase.auth.signOut();
      setEmail(""); setPassword(""); setFiles([]); setSession(null);
    } catch (e) {
      setAuthMsg(e.message || "Sign-out failed.");
    } finally {
      setAuthBusy(false);
    }
  };

  // ===== Upload flow =====
  const doUpload = async (file) => {
    if (!session) { setSbErr("Please sign in to upload."); return; }
    setUploading(true); setSbErr("");
    try {
      const res1 = await fetch("/.netlify/functions/sandbox-createUpload", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ filename: file.name, mime: file.type || "application/octet-stream", size: file.size || 0 }),
      });
      const data1 = await res1.json();
      if (!res1.ok) throw new Error(data1 || "Failed to create upload URL");
      const { uploadUrl, fileKey } = data1;

      const resPut = await fetch(uploadUrl, { method: "PUT", body: file });
      if (!resPut.ok) { const t = await resPut.text(); throw new Error(`Upload failed: ${t || resPut.status}`); }

      const res2 = await fetch("/.netlify/functions/sandbox-finalize", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ fileKey, original_name: file.name, mime: file.type || "application/octet-stream", size: file.size || 0 }),
      });
      const data2 = await res2.json();
      if (!res2.ok) throw new Error(data2 || "Finalize failed");
      await loadMyFiles();
    } catch (e) {
      setSbErr(e.message || "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onPickFile = async (e) => {
    const file = e.target?.files?.[0]; if (!file) return;
    const MAX = 50 * 1024 * 1024;
    if (file.size > MAX) { setSbErr("File exceeds 50MB limit."); e.target.value = ""; return; }
    await doUpload(file);
  };

  const doDownload = async (fileKey) => {
    if (!session) return;
    setBusy(true); setSbErr("");
    try {
      const url = new URL("/.netlify/functions/sandbox-download", window.location.origin);
      url.searchParams.set("file_key", fileKey);
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${session.access_token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data || "Download link failed");
      window.open(data.downloadUrl, "_blank");
    } catch (e) {
      setSbErr(e.message || "Download failed.");
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async (row) => {
    setBusy(true); setSbErr("");
    try {
      const { error: sErr } = await supabase.storage.from("sandbox").remove([row.file_key]);
      if (sErr) throw sErr;
      const { error: dErr } = await supabase.from("sandbox_files").update({ status: "deleted" }).eq("id", row.id);
      if (dErr) throw dErr;
      await loadMyFiles();
    } catch (e) {
      setSbErr(e.message || "Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  // ===== Audit helpers =====
  const toggleAudit = async () => {
    const open = !auditOpen;
    setAuditOpen(open);
    if (open && auditRows.length === 0) {
      await loadAudit();
    }
  };

  const loadAudit = async () => {
    setAuditLoading(true);
    setAuditErr("");
    try {
      const { data, error } = await supabase
        .from("v_kb_final_audit")
        .select("*")
        .order("area_primary", { ascending: true })
        .order("issue_primary", { ascending: true })
        .limit(1000);
      if (error) throw error;
      setAuditRows(data || []);
    } catch (e) {
      setAuditErr(e.message || "Failed to load audit view.");
      setAuditRows([]);
    } finally {
      setAuditLoading(false);
    }
  };

  // ===== CSV helpers =====
  const toCSV = (rows, headers) => {
    const esc = (v) =>
      `"${String(v ?? "").replace(/"/g, '""').replace(/\r?\n|\r/g, " ")}"`;
    const head = headers.map(esc).join(",");
    const body = rows.map((r) => headers.map((h) => esc(r[h])).join(",")).join("\n");
    return `${head}\n${body}`;
  };

  const downloadCSV = (csvText, filename) => {
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const exportAuditCSV = async () => {
    setExportBusy(true);
    try {
      if (auditRows.length === 0) await loadAudit();
      const rowsToExport = auditRows.length ? auditRows : [];
      const headers = [
        "area_primary","issue_primary","total_docs",
        "missing_area_secondary","missing_issue_secondary",
        "missing_summary","missing_source","dissertations"
      ];
      const csv = toCSV(rowsToExport, headers);
      downloadCSV(csv, "kb_audit.csv");
    } finally {
      setExportBusy(false);
    }
  };

  const exportTrayCSV = async () => {
    setExportBusy(true);
    try {
      let query = supabase
        .from("knowledge_base")
        .select(
          "id,title,source_url,area_primary,area_secondary,issue_primary,issue_secondary,is_dissertation,summary",
          { count: "exact" }
        )
        .order("id", { ascending: false })
        .limit(1000);

      if (areaP) query = query.eq("area_primary", areaP);
      if (areaS) query = query.eq("area_secondary", areaS);
      if (issueP) query = query.eq("issue_primary", issueP);
      if (issueS) query = query.eq("issue_secondary", issueS);
      if (dissertationsOnly) query = query.eq("is_dissertation", true);
      if (q && q.trim().length > 0) {
        const term = q.trim();
        query = query.or(`title.ilike.%${term}%,summary.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      const headers = [
        "id","title","source_url",
        "area_primary","area_secondary",
        "issue_primary","issue_secondary",
        "is_dissertation","summary"
      ];
      const csv = toCSV(data || [], headers);
      downloadCSV(csv, "evidence_tray_export.csv");
    } finally {
      setExportBusy(false);
    }
  };

  // ===== Admin utility: Run cleanup now =====
  const runCleanupNow = async () => {
    setAdminBusy(true); setAdminMsg("");
    try {
      const res = await fetch("/.netlify/functions/sandbox-cleanup");
      const text = await res.text();
      setAdminMsg(text || "Cleanup triggered.");
    } catch (e) {
      setAdminMsg(e.message || "Failed to run cleanup.");
    } finally {
      setAdminBusy(false);
    }
  };

  // ===== QA helpers (NEW) =====
  const statusPill = (s) => {
    const cls =
      s === "pass" ? "bg-green-100 text-green-800 border-green-200" :
      s === "warn" ? "bg-yellow-100 text-yellow-800 border-yellow-200" :
      "bg-red-100 text-red-800 border-red-200";
    return <span className={`px-2 py-0.5 rounded-full border text-xs ${cls}`}>{s}</span>;
  };

  const toggleQa = async () => {
    const open = !qaOpen;
    setQaOpen(open);
    if (open && !qaRun) await loadQa();
  };

  const loadQa = async () => {
    setQaLoading(true); setQaErr(""); setQaChecks([]); setQaRun(null);
    try {
      // Get latest run_id
      const { data: latest, error: e1 } = await supabase
        .from("qa_reports")
        .select("run_id, created_at")
        .order("created_at", { ascending: false })
        .limit(1);
      if (e1) throw e1;
      if (!latest || latest.length === 0) {
        setQaErr("No QA runs found yet.");
        return;
      }
      const run = latest[0];
      setQaRun(run);

      // Get checks for that run_id (exclude the raw payload in the select to keep payloads small)
      const { data: checks, error: e2 } = await supabase
        .from("qa_reports")
        .select("check_name,status,details,created_at")
        .eq("run_id", run.run_id)
        .order("created_at", { ascending: true });
      if (e2) throw e2;

      setQaChecks(checks || []);
    } catch (e) {
      setQaErr(e.message || "Failed to load QA report.");
    } finally {
      setQaLoading(false);
    }
  };

  // ===== UI =====
  return (
    <div className="min-h-screen p-6 md:p-10 bg-gray-50 text-gray-900">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Top bar: Audit + Admin + QA (NEW) */}
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl md:text-3xl font-bold">Lancelot Console</h1>
          <div className="flex items-center gap-2">
            <button onClick={toggleQa} className="rounded-xl border px-3 py-2 min-h-[40px] bg-white">
              {qaOpen ? "Close QA Report" : "Open QA Report"}
            </button>
            <button onClick={toggleAudit} className="rounded-xl border px-3 py-2 min-h-[40px] bg-white">
              {auditOpen ? "Close KB Audit" : "Open KB Audit"}
            </button>
            <button onClick={exportAuditCSV} disabled={exportBusy} className="rounded-xl border px-3 py-2 min-h-[40px] bg-white disabled:opacity-50">
              {exportBusy ? "Exporting…" : "Export Audit CSV"}
            </button>
            <button onClick={exportTrayCSV} disabled={exportBusy} className="rounded-xl border px-3 py-2 min-h-[40px] bg-white disabled:opacity-50">
              {exportBusy ? "Exporting…" : "Export Tray CSV"}
            </button>
            <button onClick={runCleanupNow} disabled={adminBusy} className="rounded-xl border px-3 py-2 min-h-[40px] bg-white disabled:opacity-50">
              {adminBusy ? "Running…" : "Run cleanup now"}
            </button>
          </div>
        </div>
        {adminMsg && <div aria-live="polite" className="text-xs text-gray-600">Admin: {adminMsg}</div>}

        {/* QA Report panel (NEW) */}
        {qaOpen && (
          <section className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">QA Report (latest run)</h2>
              <button onClick={loadQa} className="rounded-xl border px-3 py-1 min-h-[40px] bg-white text-sm">Refresh</button>
            </div>

            {qaLoading && <div className="mt-2 text-sm">Loading…</div>}
            {qaErr && <div aria-live="polite" className="mt-2 text-sm text-red-600">Error: {qaErr}</div>}

            {!qaLoading && qaRun && (
              <div className="mt-2 text-xs text-gray-600">
                <span className="font-medium">Run ID:</span> {qaRun.run_id} · <span className="font-medium">At:</span> {new Date(qaRun.created_at).toLocaleString()}
              </div>
            )}

            {!qaLoading && qaChecks.length > 0 && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                {qaChecks.map((c, i) => (
                  <div key={i} className="rounded-xl border p-3 bg-white">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">{c.check_name}</div>
                      {statusPill(c.status)}
                    </div>
                    {c.details && (
                      <div className="mt-1 text-xs text-gray-700">{c.details}</div>
                    )}
                    <div className="mt-1 text-[11px] text-gray-500">
                      {new Date(c.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!qaLoading && !qaErr && qaChecks.length === 0 && (
              <div className="mt-2 text-sm text-gray-500">No QA records yet.</div>
            )}
          </section>
        )}

        {/* Audit panel */}
        {auditOpen && (
          <section className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">KB Audit (Primary Area × Primary Issue)</h2>
              <button onClick={loadAudit} className="rounded-xl border px-3 py-1 min-h-[40px] bg-white text-sm">Refresh</button>
            </div>
            {auditLoading && <div className="mt-2 text-sm">Loading…</div>}
            {auditErr && <div aria-live="polite" className="mt-2 text-sm text-red-600">Error: {auditErr}</div>}
            {!auditLoading && auditRows.length === 0 && !auditErr && (
              <div className="mt-2 text-sm text-gray-500">No rows in audit view.</div>
            )}
            {auditRows.length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2 pr-3">Area (Primary)</th>
                      <th className="py-2 pr-3">Issue (Primary)</th>
                      <th className="py-2 pr-3">Total</th>
                      <th className="py-2 pr-3">Missing Area (Secondary)</th>
                      <th className="py-2 pr-3">Missing Issue (Secondary)</th>
                      <th className="py-2 pr-3">Missing Summary</th>
                      <th className="py-2 pr-3">Missing Source</th>
                      <th className="py-2 pr-3">Dissertations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditRows.map((r, idx) => (
                      <tr key={idx} className="border-b last:border-0">
                        <td className="py-2 pr-3">{r.area_primary || "—"}</td>
                        <td className="py-2 pr-3">{r.issue_primary || "—"}</td>
                        <td className="py-2 pr-3">{r.total_docs}</td>
                        <td className="py-2 pr-3">{r.missing_area_secondary}</td>
                        <td className="py-2 pr-3">{r.missing_issue_secondary}</td>
                        <td className="py-2 pr-3">{r.missing_summary}</td>
                        <td className="py-2 pr-3">{r.missing_source}</td>
                        <td className="py-2 pr-3">{r.dissertations}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Sandbox Panel with Auth */}
        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-xl font-semibold">Sandbox (24-hour temporary storage)</h2>
            <span className="text-xs text-gray-500">
              Files auto-delete after 24h. Allowed: PDF, DOCX, XLSX, CSV, TXT, ZIP, PNG/JPG (≤50MB).
            </span>
          </div>

          {/* Auth row */}
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            {!session ? (
              <>
                <input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="Email" className="rounded-xl border px-3 py-2" />
                <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="Password" className="rounded-xl border px-3 py-2" />
                <button onClick={onSignIn} disabled={authBusy} className="rounded-xl border px-3 py-2 min-h-[40px] bg-white disabled:opacity-50">
                  {authBusy ? "Signing in…" : "Sign in"}
                </button>
                {authMsg && <span className="text-sm text-gray-600">{authMsg}</span>}
              </>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-700">Signed in</span>
                <button onClick={onSignOut} disabled={authBusy} className="rounded-xl border px-3 py-2 min-h-[40px] bg-white disabled:opacity-50">
                  {authBusy ? "Signing out…" : "Sign out"}
                </button>
              </div>
            )}
          </div>

          {/* Upload controls */}
          <div className="mt-3 flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,.png,.jpg,.jpeg"
              onChange={onPickFile}
              className="rounded-xl border px-3 py-2"
              disabled={!session || uploading}
            />
            <button onClick={loadMyFiles} disabled={busy} className="rounded-xl border px-3 py-2 min-h-[40px] bg-white disabled:opacity-50" title="Refresh list">
              Refresh
            </button>
            {uploading && <span className="text-sm">Uploading…</span>}
          </div>

          {sbErr && <div aria-live="polite" className="mt-2 text-sm text-red-600 font-medium">Error: {sbErr}</div>}
          {authMsg && session && <div aria-live="polite" className="mt-1 text-sm text-green-700">{authMsg}</div>}

          {/* My Files list */}
          <div className="mt-4 grid grid-cols-1 gap-3">
            {files.length === 0 && (<div className="text-sm text-gray-500">No uploads yet.</div>)}
            {files.map((f) => (
              <div key={f.id} className="flex items-center justify-between rounded-xl border p-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{f.original_name}</div>
                  <div className="text-xs text-gray-500">
                    {(f.size_bytes ?? 0).toLocaleString()} bytes · {f.mime || "file"} · <span className="text-gray-600">{countdownText(f.expires_at)}</span>
                    {f.status !== "active" && <span className="ml-2 text-red-600">({f.status})</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={()=>doDownload(f.file_key)} disabled={busy || f.status !== "active"} className="rounded-xl border px-3 py-1 min-h-[40px] bg-white text-sm disabled:opacity-50">Download</button>
                  <button onClick={()=>doDelete(f)} disabled={busy} className="rounded-xl border px-3 py-1 min-h-[40px] bg-white text-sm disabled:opacity-50">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Evidence Tray */}
        <header className="space-y-2">
          <h2 className="text-2xl md:text-3xl font-bold">Lancelot Evidence Tray</h2>
          <p className="text-sm md:text-base">
            Filters use normalized columns (<code>area_*</code>, <code>issue_*</code>, <code>is_dissertation</code>). Search targets <strong>title</strong> and <strong>summary</strong> only.
          </p>
        </header>

        {/* Controls — Primary & Secondary split */}
        <section className="space-y-3">
          {/* Primary row */}
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
            <input type="text" value={q} onChange={(e)=>resetPageAnd(setQ)(e.target.value)} placeholder="Search title or summary…" className="md:col-span-2 w-full rounded-xl border px-3 py-2" />
            <select value={areaP} onChange={(e)=>resetPageAnd(setAreaP)(e.target.value)} className="w-full rounded-xl border px-3 py-2">
              <option value="">Area (Primary)</option>
              {AREAS.map((a)=> (<option key={a} value={a}>{a}</option>))}
            </select>
            <select value={issueP} onChange={(e)=>resetPageAnd(setIssueP)(e.target.value)} className="w-full rounded-xl border px-3 py-2">
              <option value="">Issue (Primary)</option>
              {ISSUES.map((i)=> (<option key={i} value={i}>{i}</option>))}
            </select>
            <div className="md:col-span-2 flex items-center">
              <span className="ml-auto text-xs px-2 py-1 rounded-full border bg-white">
                Active filters: {activeFilters}
              </span>
            </div>
          </div>

          {/* Secondary row */}
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
            <div className="md:col-span-2 text-sm text-gray-600">Secondary Filters</div>
            <select value={areaS} onChange={(e)=>resetPageAnd(setAreaS)(e.target.value)} className="w-full rounded-xl border px-3 py-2">
              <option value="">Area (Secondary)</option>
              {AREAS.map((a)=> (<option key={a} value={a}>{a}</option>))}
            </select>
            <select value={issueS} onChange={(e)=>resetPageAnd(setIssueS)(e.target.value)} className="w-full rounded-xl border px-3 py-2">
              <option value="">Issue (Secondary)</option>
              {ISSUES.map((i)=> (<option key={i} value={i}>{i}</option>))}
            </select>
            <label className="flex items-center gap-2 rounded-xl border px-3 py-2 bg-white">
              <input type="checkbox" checked={dissertationsOnly} onChange={(e)=>resetPageAnd(setDissertationsOnly)(e.target.checked)} />
              <span>Dissertations only</span>
            </label>
            <button
              onClick={() => { setAreaP(""); setAreaS(""); setIssueP(""); setIssueS(""); setDissertationsOnly(false); setQ(""); setPage(1); if (typeof window !== "undefined") window.scrollTo(0, 0); }}
              className="rounded-xl border px-3 py-2 min-h-[40px] bg-white"
              title="Clear filters"
            >
              Refresh
            </button>
          </div>
        </section>

        {/* Status */}
        <section className="flex items-center justify-between">
          <div className="text-sm">{loading ? "Loading…" : `Results: ${count}`}</div>
          {err && <div className="text-sm text-red-600 font-medium">Error: {err}</div>}
        </section>

        {/* Results */}
        <section className="grid grid-cols-1 gap-4">
          {rows.map((r) => (
            <article key={r.id} className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-lg font-semibold">{r.title}</h3>
                {r.is_dissertation && <span className="text-xs px-2 py-1 rounded-full border">Dissertation</span>}
              </div>
              {r.summary && (<p className="mt-2 text-sm leading-relaxed line-clamp-4">{r.summary}</p>)}
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {r.area_primary && <span className="px-2 py-1 rounded-full border">{r.area_primary}</span>}
                {r.area_secondary && <span className="px-2 py-1 rounded-full border">{r.area_secondary}</span>}
                {r.issue_primary && <span className="px-2 py-1 rounded-full border">{r.issue_primary}</span>}
                {r.issue_secondary && <span className="px-2 py-1 rounded-full border">{r.issue_secondary}</span>}
              </div>
              <div className="mt-3 flex items-center gap-3 text-xs">
                {r.source_url && (<a href={r.source_url} target="_blank" rel="noreferrer" className="underline">Open source</a>)}
                {r.tags && (<span className="text-gray-500 truncate">tags: {r.tags}</span>)}
              </div>
            </article>
          ))}

          {!loading && rows.length === 0 && (<div className="text-sm text-gray-500">No results. Try adjusting filters.</div>)}
        </section>

        {/* Pagination */}
        <section className="flex items-center justify-between">
          <button disabled={page <= 1 || loading} onClick={()=>setPage((p)=>Math.max(1,p-1))} className="rounded-xl border px-3 py-2 min-h-[40px] disabled:opacity-50 bg-white">← Prev</button>
          <div className="text-sm">Page {page} of {totalPages}</div>
          <button disabled={page >= totalPages || loading} onClick={()=>setPage((p)=>Math.min(totalPages,p+1))} className="rounded-xl border px-3 py-2 min-h-[40px] disabled:opacity-50 bg-white">Next →</button>
        </section>

      </div>
    </div>
  );
}
