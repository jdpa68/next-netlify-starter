// netlify/functions/knowledge-search.js
// FIXED version — uses POST + fetch pattern only
// Queries Supabase view v_kb_chat_ready and returns JSON results for chat.js

import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  try {
    // --- Enforce POST only ---
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "POST only" });
    }

    // --- Read environment variables ---
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return res.status(200).json({ ok: false, error: "Missing Supabase environment variables." });
    }

    // --- Initialize client ---
    const supabase = createClient(supabaseUrl, serviceKey);

    // --- Parse body ---
    const body = req.body || {};
    const qRaw = (body.q || body.query || "").toString().trim();
    const prefArea = (body.pref_area || body.prefArea || "").toString().trim();
    const limit = Math.max(1, Math.min(15, Number(body.limit) || 8));
    const q = qRaw.replace(/[%_]/g, ""); // simple sanitize

    // --- Build query ---
    let query = supabase
      .from("v_kb_chat_ready")
      .select("title, summary, source_url, area_tags, issue_tags, is_dissertation")
      .limit(limit);

    if (prefArea) query = query.contains("area_tags", [prefArea]);
    if (q.length >= 2) {
      query = query.or(`title.ilike.%${q}%,summary.ilike.%${q}%`);
    }

    // --- Dissertation preference ---
    const wantsDissertations = /dissertation|thesis|doctoral/i.test(q);
    if (wantsDissertations) {
      const { data: d1, error: e1 } = await query.eq("is_dissertation", true).limit(limit);
      if (!e1 && Array.isArray(d1) && d1.length > 0) {
        return res.status(200).json({ ok: true, results: d1 });
      }
    }

    // --- Run query and return ---
    const { data, error } = await query.order("title", { ascending: true });
    if (error) {
      return res.status(200).json({ ok: false, error: error.message });
    }

    return res.status(200).json({ ok: true, results: Array.isArray(data) ? data : [] });
  } catch (err) {
    return res.status(200).json({ ok: false, error: String(err?.message || err) });
  }
}
