// pages/lib/supabaseClient.js  (Shim for imports from files under /pages)
// Mirrors the root lib client so imports like '../lib/supabaseClient' from /pages/* work.
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
