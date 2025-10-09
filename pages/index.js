// ===========================================
// Lancelot Evidence Tray + Sandbox Panel + Auth (Email/Password)
// Drop-in replacement for pages/index.js
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
  const [area, setArea] = useState("");
  const [issue, setIssue] = useState("");
  const [dissertationsOnly, setDissertationsOnly] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const AREAS = [
    "area_enrollment",
    "area_marketing",
    "area_finance",
    "area_financial_aid",
    "area_leadership",
    "area_advising_registrar",
    "area_it",
    "area_curriculum_instruction",
    "area_regional_accreditation",
    "area_national_accreditation",
    "area_opm",
    "area_career_colleges",
  ];
  const ISSUES = [
    "issue_declining_enrollment",
    "issue_student_success",
    "issue_academic_quality",
    "issue_cost_pricing",
    "issue_compliance",
  ];

  // -------- Sandbox/Auth state --------
  const [session, setSession] = useState(null);
  const [sbErr, setSbErr] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Simple auth form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMsg, setAuthMsg] = useState("");

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

        if (area) query = query.or(`area_primary.eq.${area},area_secondary.eq.${area}`);
        if (issue) query = query.or(`issue_primary.eq.${issue},issue_secondary.eq.${issue}`);
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
  }, [area, issue, dissertationsOnly, q, page]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((count || 0) / PAGE_SIZE)),
    [count]
  );

  const resetPageAnd = (fn) => (val) => {
    setPage(1);
    fn(val);
  };

  // ===== Sandbox helpers =====
  const loadSession = async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data?.session || null);
  };

  const loadMyFiles = async () => {
    setBusy(true);
    setSbErr("");
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

  // Load session + files on mount and when auth changes
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
    setAuthBusy(true);
    setAuthMsg("");
    setSbErr("");
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
    setAuthBusy(true);
    setAuthMsg("");
    try {
      await supabase.auth.signOut();
      setEmail("");
      setPassword("");
      setFiles([]);
      setSession(null);
    } catch (e) {
      setAuthMsg(e.message || "Sign-out failed.");
    } finally {
      setAuthBusy(false);
    }
  };

  // ===== Upload flow =====
  const doUpload = async (file) => {
    if (!session) {
      setSbErr("Please sign in to upload.");
      return;
    }
    setUploading(true);
    setSbErr("");
    try {
      // 1) Request signed upload URL
      const res1 = await fetch("/.netlify/functions/sandbox-createUpload", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          filename: file.name,
          mime: file.type || "application/octet-stream",
          size: file.size || 0,
        }),
      });
      const data1 = await res1.json();
      if (!res1.ok) throw new Error(data1 || "Failed to create upload URL");
      const { uploadUrl, fileKey } = data1;

      // 2) PUT file to signed URL
      const resPut = await fetch(uploadUrl, { method: "PUT", body: file });
      if (!resPut.ok) {
        const text = await resPut.text();
        throw new Error(`Upload failed: ${text || resPut.status}`);
      }

      // 3) Finalize metadata
      const res2 = await fetch("/.netlify/functions/sandbox-finalize", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          fileKey,
          original_name: file.name,
          mime: file.type || "application/octet-stream",
          size: file.size || 0,
        }),
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
    const file = e.target?.files?.[0];
    if (!file) return;
    const MAX = 50 * 1024 * 1024; // 50MB
    if (file.size > MAX) {
      setSbErr("File exceeds 50MB limit.");
      e.target.value = "";
      return;
    }
    await doUpload(file);
  };

  const doDownload = async (fileKey) => {
    if (!session) return;
    setBusy(true);
    setSbErr("");
    try {
      const url = new URL("/.netlify/functions/sandbox-download", window.location.origin);
      url.searchParams.set("file_key", fileKey);
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
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
    setBusy(true);
    setSbErr("");
    try {
      // Remove from storage
      const { error: sErr } = await supabase.storage.from("sandbox").remove([row.file_key]);
      if (sErr) throw sErr;
      // Mark row deleted
      const { error: dErr } = await supabase
        .from("sandbox_files")
        .update({ status: "deleted" })
        .eq("id", row.id);
      if (dErr) throw dErr;
      await loadMyFiles();
    } catch (e) {
      setSbErr(e.message || "Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  // ===== UI =====
  return (
    <div className="min-h-screen p-6 md:p-10 bg-gray-50 text-gray-900">
      <div className="max-w-6xl mx-auto space-y-8">
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
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  className="rounded-xl border px-3 py-2"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="rounded-xl border px-3 py-2"
                />
                <button
                  onClick={onSignIn}
                  disabled={authBusy}
                  className="rounded-xl border px-3 py-2 bg-white disabled:opacity-50"
                >
                  {authBusy ? "Signing in…" : "Sign in"}
                </button>
                {authMsg && <span className="text-sm text-gray-600">{authMsg}</span>}
              </>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-700">Signed in</span>
                <button
                  onClick={onSignOut}
                  disabled={authBusy}
                  className="rounded-xl border px-3 py-2 bg-white disabled:opacity-50"
                >
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
              onChange={onPickFile}
              className="rounded-xl border px-3 py-2"
              disabled={!session || uploading}
            />
            <button
              onClick={loadMyFiles}
              disabled={busy}
              className="rounded-xl border px-3 py-2 bg-white disabled:opacity-50"
              title="Refresh list"
            >
              Refresh
            </button>
            {uploading && <span className="text-sm">Uploading…</span>}
          </div>

          {/* Errors */}
          {sbErr && (
            <div className="mt-2 text-sm text-red-600 font-medium">Error: {sbErr}</div>
          )}
          {authMsg && session && (
            <div className="mt-1 text-sm text-green-700">{authMsg}</div>
          )}

          {/* My Files list */}
          <div className="mt-4 grid grid-cols-1 gap-3">
            {files.length === 0 && (
              <div className="text-sm text-gray-500">No uploads yet.</div>
            )}

            {files.map((f) => (
              <div key={f.id} className="flex items-center justify-between rounded-xl border p-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{f.original_name}</div>
                  <div className="text-xs text-gray-500">
                    {(f.size_bytes ?? 0).toLocaleString()} bytes · {f.mime || "file"} ·{" "}
                    <span className="text-gray-600">{countdownText(f.expires_at)}</span>
                    {f.status !== "active" && (
                      <span className="ml-2 text-red-600">({f.status})</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => doDownload(f.file_key)}
                    disabled={busy || f.status !== "active"}
                    className="rounded-xl border px-3 py-1 bg-white text-sm disabled:opacity-50"
                  >
                    Download
                  </button>
                  <button
                    onClick={() => doDelete(f)}
                    disabled={busy}
                    className="rounded-xl border px-3 py-1 bg-white text-sm disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Evidence Tray (unchanged) */}
        <header className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-bold">Lancelot Evidence Tray</h1>
          <p className="text-sm md:text-base">
            Filters use normalized columns (<code>area_*</code>, <code>issue_*</code>, <code>is_dissertation</code>). Search targets <strong>title</strong> and <strong>summary</strong> only.
          </p>
        </header>

        {/* Controls */}
        <section className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <input
            type="text"
            value={q}
            onChange={(e) => resetPageAnd(setQ)(e.target.value)}
            placeholder="Search title or summary…"
            className="md:col-span-2 w-full rounded-xl border px-3 py-2"
          />

          <select
            value={area}
            onChange={(e) => resetPageAnd(setArea)(e.target.value)}
            className="w-full rounded-xl border px-3 py-2"
          >
            <option value="">All Areas</option>
            {AREAS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          <select
            value={issue}
            onChange={(e) => resetPageAnd(setIssue)(e.target.value)}
            className="w-full rounded-xl border px-3 py-2"
          >
            <option value="">All Issues</option>
            {ISSUES.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>

          <label className="flex items-center gap-2 rounded-xl border px-3 py-2 bg-white">
            <input
              type="checkbox"
              checked={dissertationsOnly}
              onChange={(e) => resetPageAnd(setDissertationsOnly)(e.target.checked)}
            />
            <span>Dissertations only</span>
          </label>

          <button
            onClick={() => {
              setArea(""); setIssue("");
              setDissertationsOnly(false); setQ(""); setPage(1);
              if (typeof window !== "undefined") window.scrollTo(0, 0);
            }}
            className="rounded-xl border px-3 py-2 bg-white"
            title="Clear filters"
          >
            Refresh
          </button>
        </section>

        {/* Status */}
        <section className="flex items-center justify-between">
          <div className="text-sm">{loading ? "Loading…" : `Results: ${count}`}</div>
          {err && <div className="text-sm text-red-600 font-medium">Error: {err}</div>}
        </section>

        {/* Results */}
        <section className="grid grid-cols-1 gap-4">
          {rows.map((r) => (
            <article
              key={r.id}
              className="rounded-2xl border bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-lg font-semibold">{r.title}</h2>
                {r.is_dissertation && (
                  <span className="text-xs px-2 py-1 rounded-full border">Dissertation</span>
                )}
              </div>
              {r.summary && (
                <p className="mt-2 text-sm leading-relaxed line-clamp-4">{r.summary}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {r.area_primary && (
                  <span className="px-2 py-1 rounded-full border">{r.area_primary}</span>
                )}
                {r.area_secondary && (
                  <span className="px-2 py-1 rounded-full border">{r.area_secondary}</span>
                )}
                {r.issue_primary && (
                  <span className="px-2 py-1 rounded-full border">{r.issue_primary}</span>
                )}
                {r.issue_secondary && (
                  <span className="px-2 py-1 rounded-full border">{r.issue_secondary}</span>
                )}
              </div>
              <div className="mt-3 flex items-center gap-3 text-xs">
                {r.source_url && (
                  <a
                    href={r.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    Open source
                  </a>
                )}
                {r.tags && (
                  <span className="text-gray-500 truncate">tags: {r.tags}</span>
                )}
              </div>
            </article>
          ))}

          {!loading && rows.length === 0 && (
            <div className="text-sm text-gray-500">
              No results. Try adjusting filters.
            </div>
          )}
        </section>

        {/* Pagination */}
        <section className="flex items-center justify-between">
          <button
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-xl border px-3 py-2 disabled:opacity-50 bg-white"
          >
            ← Prev
          </button>
          <div className="text-sm">Page {page} of {totalPages}</div>
          <button
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-xl border px-3 py-2 disabled:opacity-50 bg-white"
          >
            Next →
          </button>
        </section>
      </div>
    </div>
  );
}
