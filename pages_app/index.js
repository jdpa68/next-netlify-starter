// pages_app/login.js
// Lancelot Welcome / Sign-In Hub (Step 1a.1)
// - Keeps existing styling/colors
// - Shows two clear paths:
//    • Sign In (Returning User): email field (no magic link here; real sign-in happens in 1a.2)
//    • Register (New User): link to /register (magic link happens there only)

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

export default function LoginPage() {
  // Keeping simple and familiar: we still check Supabase session only to avoid duplicates,
  // but we won't send magic links here for returning users.
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        setSession(data.session);
        // NOTE: We are NOT auto-redirecting here in 1a.1.
        // We keep users on this hub screen until 1a.2 wiring is complete.
      }
    });
  }, []);

  function goRegister(e) {
    e?.preventDefault?.();
    window.location.href = "/register";
  }

  function onReturningSubmit(e) {
    e?.preventDefault?.();
    setError("");
    // In 1a.1 we only collect the email and show that this is the returning-user path.
    // The actual "no-magic-link" sign-in logic (look up user, set local session, redirect) is Step 1a.2.
    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }
    // Temporary confirmation only (no auth yet). We'll wire real sign-in in 1a.2.
    alert("Thanks! Returning-user sign-in will be enabled in the next step.\nFor now, use Register (New User) if you are new.");
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

      {/* Body – same card feel, just two clear paths */}
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
                  style={{
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(4,13,44,0.08)",
                    background: BRAND.accent,
                    color: BRAND.primary,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Sign In
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
                We’ll verify your email just once during registration.
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

            {/* Optional note */}
            {session && (
              <div style={{ marginTop: 14, fontSize: 12, opacity: 0.75 }}>
                You appear to be signed in already. (We’ll wire auto-redirect after Step 1a.2.)
              </div>
            )}
          </div>
        </section>

        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>
          Having trouble? Email support@peerquest.ai
        </div>
      </main>
    </div>
  );
}
