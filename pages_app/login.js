// pages_app/login.js
// Lancelot Welcome / Sign-In Hub (Step 1a.2)
// • Returning user: look up email in Supabase table "users" (no magic link)
// • New user: go to /register (magic link happens there only)

import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const BRAND = {
  primary: "#040D2C",
  accent: "#C2AA80",
  white: "#FFFFFF",
  text: "#0f172a",
};

// helpers
function firstNameFrom(full) {
  const s = String(full || "").trim();
  if (!s) return "";
  return s.split(/\s+/)[0];
}
function saveCtx(ctx) {
  try { localStorage.setItem("lancelot_ctx", JSON.stringify(ctx || {})); } catch {}
}
function newSessionId() {
  // light session id for chat continuity
  try { return (crypto && crypto.randomUUID && crypto.randomUUID()) || String(Date.now()); }
  catch { return String(Date.now()); }
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState(null);

  useEffect(() => {
    // If you’re already signed in via Supabase, just note it (no auto-redirect here).
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) setSession(data.session);
    });
  }, []);

  function goRegister(e) {
    e?.preventDefault?.();
    window.location.href = "/register";
  }

  // --- RETURNING USER SIGN-IN (no magic email) ---
  async function onReturningSubmit(e) {
    e?.preventDefault?.();
    setError("");
    const emailInput = email.trim().toLowerCase();
    if (!emailInput) {
      setError("Please enter your email.");
      return;
    }
    setBusy(true);
    try {
      // Look up the user in your Supabase table: "users"
      const { data, error: qErr } = await supabase
        .from("Users")
        .select("*")
        .ilike("email", emailInput) // case-insensitive
        .limit(1)
        .maybeSingle();

      if (qErr) throw qErr;

      if (!data) {
        setError("We couldn’t find that email. Please register first.");
        return;
      }

      // Build lightweight app session (no Supabase Auth token required)
      const fullName =
        data.full_name || data.name || data.display_name || "";
      const institutionName =
        data.school_name || data.org_name || data.institution || "";
      const ctx = {
        firstName: firstNameFrom(fullName) || firstNameFrom(emailInput),
        email: data.email || emailInput,
        institutionName,
        unit_id: data.unit_id || null,
        org_type: data.org_type || null
      };
      saveCtx(ctx);

      try { localStorage.setItem("lancelot_session", newSessionId()); } catch {}

      // Go to chat
      window.location.replace("/");
    } catch (err) {
      setError(err.message || "Unable to sign in right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: BRAND.primary, color: BRAND.white }}>
      {/* Header – unchanged */}
      <header style={{ borderBottom: "1px solid rgba(255,255,255,0.15)" }}>
        <div
          style={{
            maxWidth: 960,
            margin: "0 auto",
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 20 }}>Lancelot</div>
            <span style={{ fontSize: 12, opacity: 0.8 }}>
              The trusted assistant for every higher-ed professional.
            </span>
          </div>
          <span style={{ fontSize: 12, opacity: 0.8 }}>Beta</span>
        </div>
      </header>

      {/* Body – same card feel, two clear paths */}
      <main style={{ maxWidth: 620, margin: "40px auto", padding: "0 20px" }}>
        <section
          style={{
            background: BRAND.white,
            color: BRAND.text,
            border: "1px solid rgba(4,13,44,0.10)",
            borderRadius: 16,
            boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ padding: 24 }}>
            <h1 style={{ margin: 0, fontSize: 22, color: BRAND.primary }}>Welcome</h1>
            <p style={{ marginTop: 6, fontSize: 14, opacity: 0.8 }}>
              Choose an option below.
            </p>

            {/* Returning user path (no magic link) */}
            <div
              style={{
                padding: 16,
                borderRadius: 12,
                border: "1px solid rgba(4,13,44,0.10)",
                marginTop: 16,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 16, color: BRAND.primary }}>
                Sign In (Returning User)
              </h2>
              <form onSubmit={onReturningSubmit} style={{ display: "grid", gap: 12, marginTop: 12 }}>
                <label style={{ fontSize: 14, fontWeight: 500 }}>Enter your email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  style={{
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(4,13,44,0.20)",
                    outline: "none",
                  }}
                />
                <button
                  type="submit"
                  disabled={busy}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(4,13,44,0.08)",
                    background: BRAND.accent,
                    color: BRAND.primary,
                    fontWeight: 600,
                    cursor: "pointer",
                    opacity: busy ? 0.7 : 1
                  }}
                >
                  {busy ? "Signing in…" : "Sign In"}
                </button>
                {error && <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div>}
              </form>
            </div>

            {/* New user registration path (magic link only here) */}
            <div
              style={{
                padding: 16,
                borderRadius: 12,
                border: "1px solid rgba(4,13,44,0.10)",
                marginTop: 16,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 16, color: BRAND.primary }}>
                New user? Create your profile
              </h2>
              <p style={{ marginTop: 6, fontSize: 14, opacity: 0.8 }}>
                We’ll verify your email once during registration.
              </p>
              <button
                onClick={goRegister}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid rgba(4,13,44,0.08)",
                  background: BRAND.white,
                  color: BRAND.primary,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Go to Registration
              </button>
            </div>

            {session && (
              <div style={{ marginTop: 14, fontSize: 12, opacity: 0.75 }}>
                You’re already signed in on this browser.
              </div>
            )}
          </div>
        </section>

        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>
          Having trouble? Email jdunn@peerquest.org
        </div>
      </main>
    </div>
  );
}
