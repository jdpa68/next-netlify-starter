// pages_app/login.js
// Simple email-based sign-in for Lancelot using Supabase Auth.
// No external client files required.

import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState(null);

  // On page load, check if already signed in
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        setSession(data.session);
        window.location.replace("/"); // already signed in → chat
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setSession(session);
        window.location.replace("/"); // redirect after magic link
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
        options: { emailRedirectTo: "https://pqlancelot.netlify.app/" }
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

  // ---- UI ----
  return (
    <div style={{ maxWidth: 480, margin: "80px auto", textAlign: "center", fontFamily: "system-ui" }}>
      <h1>Lancelot Sign-In</h1>

      {!session && !sent && (
        <form onSubmit={sendLink} style={{ display: "grid", gap: "10px", marginTop: "20px" }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@school.edu"
            required
            style={{ padding: "10px", borderRadius: "8px", border: "1px solid #ccc" }}
          />
          <button type="submit" style={{ padding: "10px", borderRadius: "8px", cursor: "pointer" }}>
            Send sign-in link
          </button>
          {error && <div style={{ color: "red" }}>{error}</div>}
        </form>
      )}

      {sent && (
        <div style={{ marginTop: "20px" }}>
          <p>✅ Check your email for the magic link.</p>
          <p>This page will redirect automatically after you click it.</p>
        </div>
      )}

      {session && (
        <div style={{ marginTop: "20px" }}>
          <p>You are already signed in.</p>
          <button onClick={signOut}>Sign out</button>
        </div>
      )}
    </div>
  );
}
