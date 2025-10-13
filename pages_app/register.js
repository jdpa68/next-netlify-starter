// ===========================================
// Lancelot — Registration / Sign-in (Polished Autocomplete)
// Route: /register
// ===========================================

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Brand tokens (same palette)
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

// ----------- Component -----------
export default function RegisterPage() {
  // Form state
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [isUSAccredited, setIsUSAccredited] = useState(null); // true | false | null

  // School search state (when isUSAccredited === true)
  const [schoolQuery, setSchoolQuery] = useState("");
  const [schoolResults, setSchoolResults] = useState([]);
  const [selectedSchool, setSelectedSchool] = useState(null); // { unit_id, name, state, city }

  // Org (when isUSAccredited === false)
  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState("investor");

  // UI
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  // Dropdown UX
  const [openList, setOpenList] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);
  const searchTimer = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(e.target) && !inputRef.current?.contains(e.target)) {
        setOpenList(false);
        setHighlightIndex(-1);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search (min length: 3)
  useEffect(() => {
    if (isUSAccredited !== true) return;
    if (!schoolQuery || schoolQuery.trim().length < 3) {
      setSchoolResults([]);
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      try {
        const q = schoolQuery.trim();
        const { data, error } = await supabase
          .from("ipeds_schools")
          .select("unit_id, name, city, state")
          .ilike("name", `%${q}%`)
          .order("name", { ascending: true })
          .limit(10);
        if (error) throw error;
        setSchoolResults(data || []);
        setOpenList(true);
        setHighlightIndex(-1);
      } catch (e) {
        setSchoolResults([]);
        setOpenList(false);
      }
    }, 250);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [schoolQuery, isUSAccredited]);

  // Helpers
  const schoolLabel = (row) => {
    if (!row) return "";
    const st = row.state ? ` (${row.state})` : "";
    const city = row.city ? ` — ${row.city}` : "";
    return `${row.name}${st}${city}`;
  };

  const canSubmit = useMemo(() => {
    if (!fullName.trim() || !email.trim()) return false;
    if (isUSAccredited === true) return !!selectedSchool;
    if (isUSAccredited === false) return !!orgName.trim() && !!orgType;
    return false;
  }, [fullName, email, isUSAccredited, selectedSchool, orgName, orgType]);

  // Keyboard navigation for dropdown
  const onKeyDown = (e) => {
    if (!openList) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, schoolResults.length)); // includes "not listed" row
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      // choose highlighted item
      if (highlightIndex >= 0 && highlightIndex < schoolResults.length) {
        onSelectSchool(schoolResults[highlightIndex]);
      } else if (highlightIndex === schoolResults.length) {
        onChooseNotListed();
      }
    } else if (e.key === "Escape") {
      setOpenList(false);
      setHighlightIndex(-1);
    }
  };

  // Selection handlers
  const onSelectSchool = (row) => {
    setSelectedSchool(row);
    setSchoolQuery(schoolLabel(row));
    setOpenList(false);
    setHighlightIndex(-1);
  };
  const onChooseNotListed = () => {
    setSelectedSchool(null);
    setOpenList(false);
    setHighlightIndex(-1);
    // switch to non-school flow quickly:
    setIsUSAccredited(false);
    setOrgName("");
    setOrgType("company");
  };

  const onSubmit = async (e) => {
    e?.preventDefault?.();
    setError(""); setMsg("");
    if (!canSubmit) { setError("Please complete the required fields."); return; }

    setBusy(true);
    try {
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

      const res = await fetch("/.netlify/functions/register-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Registration failed. Please try again.");
      }

      // Save session context for chat
      const ctx = {
        firstName: firstNameFrom(fullName),
        email: payload.email,
        institutionName: payload.org_type === "school" ? payload.school_name : payload.org_name,
        unit_id: payload.unit_id || null,
        org_type: payload.org_type
      };
      saveCtx(ctx);
      saveSessionId(null); // start fresh

      if (typeof window !== "undefined") window.location.href = "/";
    } catch (err) {
      setError(err.message || "Registration error.");
    } finally {
      setBusy(false);
    }
  };

  // ----------- Render -----------
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
                    onChange={() => { setIsUSAccredited(true); setSelectedSchool(null); setOrgName(""); setSchoolQuery(""); setOpenList(false); }}
                  />
                  <span>Yes</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={isUSAccredited === false}
                    onChange={() => { setIsUSAccredited(false); setSchoolQuery(""); setSelectedSchool(null); setOpenList(false); }}
                  />
                  <span>No</span>
                </label>
              </div>
            </div>

            {/* School path */}
            {isUSAccredited === true && (
              <div className="space-y-2" ref={dropdownRef}>
                <div className="text-sm text-gray-700">Institution</div>
                <input
                  ref={inputRef}
                  type="text"
                  value={selectedSchool ? schoolLabel(selectedSchool) : schoolQuery}
                  onChange={(e) => { setSelectedSchool(null); setSchoolQuery(e.target.value); }}
                  onFocus={() => { if (schoolResults.length > 0) setOpenList(true); }}
                  onKeyDown={onKeyDown}
                  placeholder="Start typing your institution name (min 3 letters)…"
                  className="rounded-xl border px-3 py-2"
                  style={{ borderColor: "rgba(4,13,44,0.20)" }}
                />

                {/* Dropdown */}
                {openList && !selectedSchool && (
                  <div
                    className="mt-1 rounded-xl shadow-lg border bg-white"
                    style={{
                      borderColor: "rgba(4,13,44,0.20)",
                      maxHeight: "260px",
                      overflowY: "auto"
                    }}
                  >
                    {/* Loading/empty states */}
                    {schoolQuery.trim().length < 3 && (
                      <div className="px-3 py-2 text-sm text-gray-600">Type at least 3 letters…</div>
                    )}

                    {schoolQuery.trim().length >= 3 && schoolResults.length === 0 && (
                      <div className="px-3 py-2 text-sm text-gray-600">No results — try city or state.</div>
                    )}

                    {/* Results */}
                    {schoolResults.map((row, idx) => (
                      <button
                        key={row.unit_id}
                        type="button"
                        onClick={() => onSelectSchool(row)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50"
                        style={{
                          background: highlightIndex === idx ? "#F3F4F6" : "transparent"
                        }}
                        onMouseEnter={() => setHighlightIndex(idx)}
                      >
                        <span className="font-medium">{row.name}</span>
                        {row.state ? <span> ({row.state})</span> : null}
                        {row.city ? <span> — {row.city}</span> : null}
                      </button>
                    ))}

                    {/* Not listed option */}
                    {schoolQuery.trim().length >= 3 && (
                      <button
                        type="button"
                        onClick={onChooseNotListed}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 border-t text-sm"
                        style={{ borderColor: "rgba(4,13,44,0.10)", background: highlightIndex === schoolResults.length ? "#F3F4F6" : "transparent" }}
                        onMouseEnter={() => setHighlightIndex(schoolResults.length)}
                      >
                        My school isn’t listed — continue with organization instead
                      </button>
                    )}
                  </div>
                )}

                {/* After selection */}
                {selectedSchool && (
                  <div className="text-xs text-gray-600">
                    Selected: <span className="font-medium">{schoolLabel(selectedSchool)}</span>
                    <button
                      type="button"
                      onClick={() => { setSelectedSchool(null); setSchoolQuery(""); setOpenList(false); inputRef.current?.focus(); }}
                      className="ml-2 underline"
                    >
                      Change
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Non-school path */}
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
