// pages_app/register.js
// Step 11e — Minimal client-only profile gate (no Supabase Auth yet)
// This page writes a lightweight profile into localStorage so the chat page can pass its redirect guard.
// Later, when you add Supabase Auth, this page should be replaced with a proper sign-in/up flow.

import React, { useEffect, useState } from "react";

const PROFILE_KEY = "lancelot_profile";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isUS, setIsUS] = useState(null); // true/false
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = "Create your profile — Lancelot";
  }, []);

  function saveProfile(e) {
    e?.preventDefault?.();
    if (saving) return;
    setSaving(true);

    const profile = {
      name: name.trim(),
      email: email.trim(),
      us_accredited: isUS,
      createdAt: Date.now()
    };

    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      // Optionally you could POST to a Netlify function to store this server-side.
      window.location.replace("/");
    } catch {
      alert("Unable to save your profile in this browser.");
      setSaving(false);
    }
  }

  function continueWithoutRegister() {
    try {
      // Set a minimal placeholder so the chat page lets the user in.
      const profile = { placeholder: true, createdAt: Date.now() };
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      window.location.replace("/");
    } catch {
      alert("Unable to continue without registering in this browser.");
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>Create your profile</h1>
      <p style={{ marginTop: 4, opacity: 0.8 }}>
        This quick setup saves a local profile in your browser so Lancelot can personalize
        answers. No password is required for this MVP.
      </p>

      <form onSubmit={saveProfile} style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <label>
          <div>Full name</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe"
            required
            style={{ width: "100%" }}
          />
        </label>

        <label>
          <div>Email</div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@school.edu"
            required
            style={{ width: "100%" }}
          />
        </label>

        <fieldset style={{ border: "none", padding: 0 }}>
          <legend>Are you using this platform for a US-based, accredited institution?</legend>
          <label style={{ marginRight: 12 }}>
            <input
              type="radio"
              name="isUS"
              checked={isUS === true}
              onChange={() => setIsUS(true)}
              required
            />{" "}
            Yes
          </label>
          <label>
            <input
              type="radio"
              name="isUS"
              checked={isUS === false}
              onChange={() => setIsUS(false)}
              required
            />{" "}
            No
          </label>
        </fieldset>

        <button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Create profile"}
        </button>
      </form>

      <div style={{ marginTop: 16 }}>
        <button onClick={continueWithoutRegister} style={{ background: "transparent", border: "1px solid #ccc", padding: "6px 10px" }}>
          Continue without registering
        </button>
      </div>

      <div style={{ marginTop: 20, fontSize: 12, opacity: 0.7 }}>
        <strong>Note:</strong> This MVP uses a local profile stored in your browser. Clearing your browser data or
        using a different device will ask you to create a profile again. A full sign-in (Supabase Auth) is planned for a later step.
      </div>
    </div>
  );
}
