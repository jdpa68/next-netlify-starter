// netlify/functions/chat.js
// Chat with KB injection + on-screen KB hit debug
const { createClient } = require("@supabase/supabase-js");
const MODEL = "gpt-4o-mini";

// ---------- tiny helpers ----------
async function fetchWithTimeout(url, options = {}, ms = 20000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...options, signal: c.signal }); }
  finally { clearTimeout(t); }
}
function ok(payload) {
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true, ...payload }) };
}
function safe(v, d = "") { return (v ?? d).toString(); }

// ---------- main ----------
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

    const apiKey = process.env.OPENAI_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!apiKey || !supabaseUrl || !serviceKey) {
      const msg = "Missing env vars (OPENAI_API_KEY / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).";
      return ok({ reply: msg, text: msg, citations: [], sessionId: null });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = JSON.parse(event.body || "{}");
    const message = safe(body.message).trim();
    const ctx = body.ctx || {};
    if (!message) return ok({ reply: "Please share your question.", text: "Please share your question.", citations: [], sessionId: null });

    // --- Build internal base URL (Netlify-safe) ---
    const host  = event.headers["x-forwarded-host"] || event.headers.host;
    const proto = event.headers["x-forwarded-proto"] || "https";
    const base  = `${proto}://${host}`;

    // --- KB search ---
    let kbResults = [];
    try {
      const r = await fetchWithTimeout(`${base}/.netlify/functions/knowledge-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: message, limit: 5 })
      }, 15000);
      const j = await r.json();
      kbResults = Array.isArray(j?.results) ? j.results : [];
    } catch { kbResults = []; }

    const KB_HITS = kbResults.length;
    const citations = kbResults.map(r => ({ title: r.title, source_url: r.source_url }));
    const evidenceText = KB_HITS
      ? kbResults.map((r,i) => `${i+1}. ${r.title || "Untitled"} — ${r.summary || ""}`).join("\n")
      : "(No KB matches returned; avoid guessing and ask one clarifying question.)";

    // --- Persona (concise consulting tone) ---
    const who = ctx.firstName ? `Hi ${ctx.firstName}.` : "Hi there.";
    const persona = `
You are Lancelot, a higher-ed consultant (PeerQuest).
Be brief (≤130 words), practical, and specific.
Start with the user's name if given.
Offer 2–3 actions, then a "Next step:" line.
If KB snippets exist, ground advice in them.
Plain text only.
`;

    // --- Model call ---
    let reply = "";
    try {
      const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.3,
          messages: [
            { role: "system", content: persona },
            { role: "system", content: `Knowledge Base Insights:\n${evidenceText}` },
            { role: "user", content: `${who} ${message}` }
          ]
        })
      }, 25000);
      const data = await res.json();
      reply = data?.choices?.[0]?.message?.content?.trim() || "I couldn't form a reply just now.";
    } catch {
      reply = "I had trouble generating a response just now.";
    }

    // --- Show KB hit count at the end (temporary debug) ---
    const debugNote = `\n\nKB hits: ${KB_HITS}`;
    const finalReply = reply + debugNote;

    return ok({ reply: finalReply, text: finalReply, citations, sessionId: null });
  } catch (err) {
    const msg = "Unexpected error in chat function.";
    return ok({ reply: msg, text: msg, citations: [], sessionId: null });
  }
};
