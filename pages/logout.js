// pages/logout.js
// Simple sign-out route: clears Supabase session + local chat state, then sends to /login
import { useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function Logout() {
  useEffect(() => {
    (async () => {
      try {
        await supabase.auth.signOut();
      } catch {}
      // clear local chat/session keys (keep this minimal)
      try {
        localStorage.removeItem("lancelot_session");
        localStorage.removeItem("lancelot_ctx");
      } catch {}
      window.location.replace("/login");
    })();
  }, []);
  return <div style={{ padding: 20 }}>Signing you out…</div>;
}
