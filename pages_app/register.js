// ===========================================
// Lancelot — Registration / Sign-in
// Route: /register
// • Full name, email
// • US-accredited? (Yes/No)
//   – Yes: school searchable dropdown (ipeds_schools)
//   – No: organization + org type
// • On submit → POST /.netlify/functions/register-user
// • Save session context → redirect to "/"
// ===========================================

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Brand tokens (same palette you’re using)
const BRAND = {
  primary: "#040D2C",
  accent: "#C2AA80",
  white: "#FFFFFF",
  title: "Lancelot",
  tagline: "The trusted assistant for every higher-ed professional."
};

// Local storage keys (same as main app)
const LS_CTX = "lancelot_ctx";
const LS_SESSION = "lancelot_session";

// Helpers for session
function saveCtx(ctx) {
  try { if (typeof window !== "undefined") window.localStorage.setItem(LS_CTX, JSON.stringify(ctx || {})); } catch {}
}
function saveSessionId(id) {
  try {
    if (typeof window !== "undefined") {
      if (id) window.localStorage.setItem(LS_SESSION, id);
      else window.localStorage.removeItem(LS_SESSION);
    }
  } catch {}
}
function firstNameFrom(full) {
  const s = String(full || "").trim();
  if (!s) return "";
  return s.split(/\s+/)[0];
}

export default function RegisterPage() {
  // Form state
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [isUSAccredited, setIsUSAccredited] = useState(null); // true | false | null

  // School search (if yes)
  const [schoolQuery, setSchoolQuery] = useState("");
  const [schoolResults, setSchoolResults] = useState([]);
  const [selectedSchool, setSelectedSchool] = useState(null); // { unit_id, name, state, city }

  // Org (if no)
  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState("investor");

  // UI
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  // Debounced search
  const searchTimer = useRef(null);
  useEffect(() => {
    if (isUSAccredited !== true) return; // only when Yes
    if (!schoolQuery || schoolQuery.trim().length < 2) {
      setSchoolResults([]);
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      try {
        // Simple ilike search; limit 10
        const { data, error } = await supabase
          .from("ipeds_schools")
          .select("unit_id, name, city, state")
          .ilike("name", `%${schoolQuery.trim()}%`)
          .order("name", { ascending: true })
          .limit(10);
        if (error) throw error;
        setSchoolResults(data || []);
      } catch (e) {
        setSchoolResults([]);
      }
    }, 250);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [schoolQuery, isUSAccredited]);

  // Display helpers
  const schoolLabel = (row) => {
    if (!row) return "Select your institution…";
    const st = row.state ? ` (${row.state})` : "";
    const city = row.city ? ` — ${row.city}` : "";
    return `${row.name}${st}${city}`;
  };

  const canSubmit = useMemo(() => {
    if (!fullName.trim() || !email.trim()) return false;
    if (isUSAccredited === true) {
      return !!selectedSchool;
    }
    if (isUSAccredited === false) {
      return !!orgName.trim() && !!orgType;
    }
    return false;
  }, [fullName, email, isUSAccredited, selectedSchool, orgName, orgType]);

  const onSubmit = async (e) => {
    e?.preventDefault?.();
    setError(""); setMsg("");
    if (!canSubmit) { setError("Please complete the required fields."); return; }

    setBusy(true);
    try {
      // Prepare payload for server function
      let payload = {
        full_name: fullName.trim(),
        email: email.trim(),
        org_type: isUSAccredited ? "school" : orgType,
        org_name: isUSAccredited ? null : orgName.trim(),
        unit_id: isUSAccredited ? selectedSchool?.unit_id : null,
        school_name: isUSAccredited ? schoolLabel(selectedSchool) : null,
        state: isUSAccredited ? (selectedSchool?.state || null) : null,
        city: isUSAccredited ? (selectedSchool?.city || null) : null
      };

      // Post to secure function (service role)
      const res = await fetch("/.netlify/functions/register-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Registration failed. Please try again.");
      }

      // Save session context for the chat UI
      const ctx = {
        firstName: firstNameFrom(fullName),
        email: payload.email,
        institutionName: payload.org_type === "school" ? payload.school_name : payload.org_name,
        unit_id: payload.unit_id || null,
        org_type: payload.org_type
      };
      saveCtx(ctx);
      // reset sessionId to start a fresh conversation
      saveSessionId(null);

      // Redirect to the chat
      if (typeof window !== "undefined") window.location.href = "/";
    } catch (err) {
      setError(err.message || "Registration error.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: BRAND.primary, color: BRAND.white }}>
      <header className="w-full border-b border-white/15">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-xl md:text-2xl font-semibold">{BRAND.title}</div>
            <span className="hidden md:inline text-xs opacity-80">{BRAND.tagline}</span>
          </div>
          <span className="text-xs opacity-80">Beta</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-6 md:p-10">
        <section className="rounded-2xl shadow-sm" style={{ backgroundColor: BRAND.white, color: "#111", border: "1px solid rgba(4,13,44,0.10)" }}>
          <form onSubmit={onSubmit} className="p-5 space-y-4">
            <h1 className="text-lg md:text-xl font-semibold" style={{ color: BRAND.primary }}>Create your profile</h1>

            <div className="grid grid-cols-1 gap-3">
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Full name"
                className="rounded-xl border px-3 py-2"
                style={{ borderColor: "rgba(4,13,44,0.20)" }}
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="rounded-xl border px-3 py-2"
                style={{ borderColor: "rgba(4,13,44,0.20)" }}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Are you using this platform for a US-based, accredited institution?</div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={isUSAccredited === true}
                    onChange={() => { setIsUSAccredited(true); setSelectedSchool(null); setOrgName(""); }}
                  />
                  <span>Yes</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={isUSAccredited === false}
                    onChange={() => { setIsUSAccredited(false); setSchoolQuery(""); setSelectedSchool(null); }}
                  />
                  <span>No</span>
                </label>
              </div>
            </div>

            {isUSAccredited === true && (
              <div className="space-y-2">
                <div className="text-sm text-gray-700">Institution</div>
                <input
                  type="text"
                  value={selectedSchool ? schoolLabel(selectedSchool) : schoolQuery}
                  onChange={(e) => { setSelectedSchool(null); setSchoolQuery(e.target.value); }}
                  placeholder="Start typing your institution name…"
                  className="rounded-xl border px-3 py-2"
                  style={{ borderColor: "rgba(4,13,44,0.20)" }}
                />
                {/* Results */}
                {(!selectedSchool && schoolResults.length > 0) && (
                  <div className="rounded-xl border bg-white" style={{ borderColor: "rgba(4,13,44,0.20)" }}>
                    {schoolResults.map((row) => (
                      <button
                        key={row.unit_id}
                        type="button"
                        onClick={() => { setSelectedSchool(row); setSchoolResults([]); }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50"
                      >
                        {schoolLabel(row)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {isUSAccredited === false && (
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1">
                  <div className="text-sm text-gray-700">Organization / Company</div>
                  <input
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Enter your organization"
                    className="rounded-xl border px-3 py-2"
                    style={{ borderColor: "rgba(4,13,44,0.20)" }}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-gray-700">Organization type</div>
                  <select
                    value={orgType}
                    onChange={(e) => setOrgType(e.target.value)}
                    className="rounded-xl border px-3 py-2"
                    style={{ borderColor: "rgba(4,13,44,0.20)" }}
                  >
                    <option value="investor">Investor</option>
                    <option value="company">Company</option>
                    <option value="nonprofit">Nonprofit</option>
                    <option value="international">International</option>
                  </select>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={busy || !canSubmit}
                className="rounded-xl px-4 py-2 disabled:opacity-50"
                style={{ backgroundColor: BRAND.accent, color: BRAND.primary, border: "1px solid rgba(4,13,44,0.08)" }}
              >
                {busy ? "Submitting…" : "Create profile"}
              </button>
              <a href="/" className="text-sm underline">Continue without registering</a>
            </div>

            {error && <div className="text-sm text-red-600 font-medium pt-1">{error}</div>}
            {msg && <div className="text-sm text-green-700 pt-1">{msg}</div>}
          </form>
        </section>

        <div className="text-[11px] mt-4" style={{ color: BRAND.white, opacity: 0.75 }}>
          We use your information to personalize your experience. You can update details in the Account page.
        </div>
      </main>
    </div>
  );
}
