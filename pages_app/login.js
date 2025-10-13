// pages_app/login.js
// Polished Lancelot Sign-In Page using Supabase Auth
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
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        setSession(data.session);
        window.location.replace("/");
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      if (s) {
        setSession(s);
        window.location.replace("/");
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function sendLink(e) {
    e?.preventDefault?.();
    setError("");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: "https://pqlancelot.netlify.app/" },
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      setError(err.message || "Unable to send link.");
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    window.location.reload();
  }

  return (
    <div style={{ minHeight: "100vh", background: BRAND.primary, color: BRAND.white }}>
      {/* Header */}
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

      {/* Body */}
      <main style={{ maxWidth: 520, margin: "40px auto", padding: "0 20px" }}>
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
            <h1 style={{ margin: 0, fontSize: 22, color: BRAND.primary }}>Sign in</h1>
            <p style={{ marginTop: 6, fontSize: 14, opacity: 0.8 }}>
              Enter your email and we’ll send a secure sign-in link. No password required.
            </p>

            {!session && !sent && (
              <form onSubmit={sendLink} style={{ display: "grid", gap: 12, marginTop: 18 }}>
                <label style={{ fontSize: 14, fontWeight: 500 }}>Enter your email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@school.edu"
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
                  Send sign-in link
                </button>
                {error && <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div>}
              </form>
            )}

            {sent && (
              <div style={{ marginTop: 18, fontSize: 14 }}>
                <div style={{ color: "#065f46" }}>✅ Check your email for the magic link.</div>
                <div>This page will redirect automatically after you click it.</div>
              </div>
            )}

            {session && (
              <div style={{ marginTop: 18 }}>
                <div>You are already signed in.</div>
                <button
                  onClick={signOut}
                  style={{
                    marginTop: 10,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    background: "#f2f2f2",
                    cursor: "pointer",
                  }}
                >
                  Sign out
                </button>
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
