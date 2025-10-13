// pages/index.js
// Safe landing page with no Supabase imports (prevents build failures).
// Provides clear links into the actual app pages.

export default function RootLanding() {
  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ marginTop: 0 }}>Lancelot</h1>
      <p>Welcome. Use the links below to continue:</p>
      <ul>
        <li><a href="/login">Sign in</a></li>
        <li><a href="/register">Create profile</a></li>
        <li><a href="/">Open chat</a> (after sign in)</li>
      </ul>
      <p style={{ fontSize: 12, opacity: 0.7 }}>This page intentionally contains no Supabase imports so the build cannot fail on path resolution.</p>
    </main>
  );
}
