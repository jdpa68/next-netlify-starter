// pages_app/login.js
// Real Sign In with Supabase Auth (magic link).
// - User enters email; we send an OTP magic link.
// - When authenticated, we redirect to '/'.
// - Includes a Sign out button if already signed in.

import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const BRAND = { primary: "#040D2C", accent: "#C2AA80", white: "#FFFFFF", title: "Lancelot", tagline: "The trusted assistant for every higher-ed professional." };

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data?.session || null);
      if (data?.session) window.location.replace("/");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) window.location.replace("/");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function sendMagicLink(e) {
    e?.preventDefault?.();
    setError("");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: window.location.origin + "/"
        }
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      setError(err.message || "Unable to send magic link.");
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
  }

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

      <main className="max-w-md mx-auto p-6 md:p-10">
        <section className="rounded-2xl shadow-sm" style={{ backgroundColor: BRAND.white, color: "#111", border: "1px solid rgba(4,13,44,0.10)" }}>
          <div className="p-5 space-y-4">
            <h1 className="text-lg md:text-xl font-semibold" style={{ color: BRAND.primary }}>Sign in</h1>
            {!session && (
              <form onSubmit={sendMagicLink} className="space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@school.edu"
                  className="rounded-xl border px-3 py-2 w-full"
                  style={{ borderColor: "rgba(4,13,44,0.20)" }}
                  required
                />
                <button type="submit" className="rounded-xl px-4 py-2" style={{ backgroundColor: BRAND.accent, color: BRAND.primary }}>
                  Send magic link
                </button>
                {sent && <div className="text-sm text-green-700">Check your email for the sign-in link.</div>}
                {error && <div className="text-sm text-red-600">{error}</div>}
              </form>
            )}
            {session && (
              <div className="space-y-3">
                <div className="text-sm">You are signed in.</div>
                <button onClick={signOut} className="rounded-xl px-4 py-2" style={{ backgroundColor: "#eee", color: "#111" }}>
                  Sign out
                </button>
              </div>
            )}
            <div className="text-sm">
              New here? <a href="/register" className="underline">Create a profile</a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
