// lib/supabaseClient.js  (TEMP SHIM so existing imports don't break)
// This duplicates the client so both '../lib/supabaseClient' and './lib/supabaseClient' imports work.
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
