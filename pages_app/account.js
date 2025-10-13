// ===========================================
// Lancelot — Account / Library
// Route: /account
// Tabs: Account | Library
// ===========================================

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Brand tokens
const BRAND = {
  primary: "#040D2C",
  accent: "#C2AA80",
  white: "#FFFFFF",
  title: "Lancelot",
  tagline: "The trusted assistant for every higher-ed professional."
};

// Session helpers
const LS_CTX = "lancelot_ctx";
function loadCtx() {
  try {
    const raw = typeof window !== "undefined" && window.localStorage.getItem(LS_CTX);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export default function AccountPage() {
  const [tab, setTab] = useState("account"); // "account" | "library"
  const [ctx, setCtx] = useState(null);

  // Account form
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [orgType, setOrgType] = useState("school");
  const [schoolName, setSchoolName] = useState("");
  const [unitId, setUnitId] = useState(null);
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [orgName, setOrgName] = useState("");
  const [prefArea, setPrefArea] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  // Library
  const [files, setFiles] = useState([]);
  const [libBusy, setLibBusy] = useState(false);

  useEffect(() => {
    const saved = loadCtx();
    setCtx(saved || {});
    if (saved?.email) {
      // Prime the email field
      setEmail(saved.email);
    }
  }, []);

  // Load user profile
  useEffect(() => {
    (async () => {
      if (!email) return;
      try {
        const { data, error } = await supabase
          .from("users")
          .select("*")
          .ilike("email", email)
          .single();
        if (error) throw error;
        if (data) {
          setFullName(data.full_name || "");
          setOrgType(data.org_type || "school");
          setSchoolName(data.school_name || "");
          setUnitId(data.unit_id || null);
          setState(data.state || "");
          setCity(data.city || "");
          setOrgName(data.org_name || "");
          setPrefArea(data.pref_area || "");
        }
      } catch (e) {
        // no-op; user may not be registered yet
      }
    })();
  }, [email]);

  // Load library (sandbox files)
  const loadFiles = async () => {
    setLibBusy(true);
    try {
      // If you later add user_id to sandbox_files, filter here.
      const { data, error } = await supabase
        .from("sandbox_files")
        .select("id, file_key, original_name, mime, size_bytes, created_at, expires_at, status")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      setFiles(data || []);
    } catch (e) {
      // fallback
      setFiles([]);
    } finally {
      setLibBusy(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  const canSave = useMemo(() => {
    if (!email.trim()) return false;
    if (orgType === "school") {
      return !!schoolName && !!unitId;
    } else {
      return !!orgName.trim();
    }
  }, [email, orgType, schoolName, unitId, orgName]);

  const onSave = async (e) => {
    e?.preventDefault?.();
    setError(""); setMsg("");
    if (!canSave) { setError("Please complete the required fields."); return; }
    setBusy(true);
    try {
      const payload = {
        full_name: fullName.trim() || null,
        email: email.trim(),
        org_type,
        org_name: orgType === "school" ? null : orgName.trim(),
        unit_id: orgType === "school" ? (unitId || null) : null,
        school_name: orgType === "school" ? (schoolName || null) : null,
        state: orgType === "school" ? (state || null) : null,
        city: orgType === "school" ? (city || null) : null,
        pref_area: prefArea || null
      };
      const res = await fetch("/.netlify/functions/update-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Update failed. Please try again.");
      }
      setMsg("Profile updated.");
    } catch (err) {
      setError(err.message || "Update error.");
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(""), 2000);
    }
  };

  // Library actions
  const countdownText = (expiresAt) => {
    if (!expiresAt) return "";
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return "deleting soon…";
    const h = Math.floor(ms / (1000 * 60 * 60));
    const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `Deletes in ${h}h ${m}m`;
  };

  const doDownload = async (fileKey) => {
    try {
      const url = new URL("/.netlify/functions/sandbox-download", window.location.origin);
      url.searchParams.set("file_key", fileKey);
      const res = await fetch(url.toString());
      const data = await res.json();
      if (!res.ok) throw new Error(data || "Download link failed");
      window.open(data.downloadUrl, "_blank");
    } catch (e) {
      // no-op
    }
  };

  const doDelete = async (row) => {
    setLibBusy(true);
    try {
      const { error: sErr } = await supabase.storage.from("sandbox").remove([row.file_key]);
      if (sErr) throw sErr;
      const { error: dErr } = await supabase
        .from("sandbox_files")
        .update({ status: "deleted" })
        .eq("id", row.id);
      if (dErr) throw dErr;
      await loadFiles();
    } catch (e) {
      // no-op
    } finally {
      setLibBusy(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: BRAND.primary, color: BRAND.white }}>
      {/* Header */}
      <header className="w-full border-b border-white/15">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-xl md:text-2xl font-semibold">{BRAND.title}</div>
            <span className="hidden md:inline text-xs opacity-80">{BRAND.tagline}</span>
          </div>
          <a href="/" className="text-xs underline opacity-80">Back to chat</a>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-4xl mx-auto p-6 md:p-10">
        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            className={`px-3 py-2 rounded-xl border ${tab === "account" ? "bg-white text-black" : "bg-transparent text-white border-white/30"}`}
            onClick={() => setTab("account")}
          >
            Account
          </button>
          <button
            className={`px-3 py-2 rounded-xl border ${tab === "library" ? "bg-white text-black" : "bg-transparent text-white border-white/30"}`}
            onClick={() => setTab("library")}
          >
            Library
          </button>
        </div>

        {/* Panels */}
        <section className="rounded-2xl shadow-sm bg-white text-black border" style={{ borderColor: "rgba(4,13,44,0.10)" }}>
          {tab === "account" && (
            <form onSubmit={onSave} className="p-5 space-y-4">
              <h2 className="text-lg font-semibold" style={{ color: BRAND.primary }}>Profile</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-sm text-gray-700">Full name</div>
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded-xl border px-3 py-2" />
                </div>
                <div>
                  <div className="text-sm text-gray-700">Email</div>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border px-3 py-2" />
                </div>
              </div>

              <div className="pt-2">
                <div className="text-sm font-medium">Organization context</div>
                <div className="flex items-center gap-3 mt-1">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" checked={orgType === "school"} onChange={() => setOrgType("school")} />
                    <span>US-accredited school</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" checked={orgType !== "school"} onChange={() => setOrgType("company")} />
                    <span>Other organization</span>
                  </label>
                </div>
              </div>

              {orgType === "school" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-sm text-gray-700">School name</div>
                    <input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} className="w-full rounded-xl border px-3 py-2" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-700">IPEDS unit ID</div>
                    <input value={unitId || ""} onChange={(e) => setUnitId(e.target.value)} className="w-full rounded-xl border px-3 py-2" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-700">State</div>
                    <input value={state} onChange={(e) => setState(e.target.value)} className="w-full rounded-xl border px-3 py-2" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-700">City</div>
                    <input value={city} onChange={(e) => setCity(e.target.value)} className="w-full rounded-xl border px-3 py-2" />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-sm text-gray-700">Organization name</div>
                    <input value={orgName} onChange={(e) => setOrgName(e.target.value)} className="w-full rounded-xl border px-3 py-2" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-700">Organization type</div>
                    <select value={orgType} onChange={(e) => setOrgType(e.target.value)} className="w-full rounded-xl border px-3 py-2">
                      <option value="investor">Investor</option>
                      <option value="company">Company</option>
                      <option value="nonprofit">Nonprofit</option>
                      <option value="international">International</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="pt-2">
                <div className="text-sm text-gray-700">Preferred Area (optional)</div>
                <select value={prefArea} onChange={(e) => setPrefArea(e.target.value)} className="w-full md:w-1/2 rounded-xl border px-3 py-2">
                  <option value="">— none —</option>
                  <option value="area_enrollment">Enrollment</option>
                  <option value="area_marketing">Marketing</option>
                  <option value="area_finance">Finance</option>
                  <option value="area_financial_aid">Financial Aid</option>
                  <option value="area_leadership">Leadership</option>
                  <option value="area_advising_registrar">Advising/Registrar</option>
                  <option value="area_it">IT/Systems</option>
                  <option value="area_curriculum_instruction">Curriculum/Instruction</option>
                  <option value="area_regional_accreditation">Regional Accreditation</option>
                  <option value="area_national_accreditation">National Accreditation</option>
                  <option value="area_opm">OPMs</option>
                  <option value="area_career_colleges">Career Colleges</option>
                </select>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={busy || !canSave}
                  className="rounded-xl px-4 py-2 disabled:opacity-50"
                  style={{ backgroundColor: BRAND.accent, color: BRAND.primary, border: "1px solid rgba(4,13,44,0.08)" }}
                >
                  {busy ? "Saving…" : "Save changes"}
                </button>
                {error && <div className="text-sm text-red-600 font-medium">{error}</div>}
                {msg && <div className="text-sm text-green-700">{msg}</div>}
              </div>
            </form>
          )}

          {tab === "library" && (
            <div className="p-5 space-y-3">
              <h2 className="text-lg font-semibold" style={{ color: BRAND.primary }}>My Library</h2>
              <button
                onClick={loadFiles}
                disabled={libBusy}
                className="rounded-xl border px-3 py-2 bg-white disabled:opacity-50"
                title="Refresh list"
              >
                Refresh
              </button>

              {/* Files */}
              <div className="mt-2 grid grid-cols-1 gap-3">
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
                        {f.status !== "active" && <span className="ml-2 text-red-600">({f.status})</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => doDownload(f.file_key)}
                        disabled={f.status !== "active"}
                        className="rounded-xl border px-3 py-1 bg-white text-sm disabled:opacity-50"
                      >
                        Download
                      </button>
                      <button
                        onClick={() => doDelete(f)}
                        disabled={libBusy}
                        className="rounded-xl border px-3 py-1 bg-white text-sm disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
