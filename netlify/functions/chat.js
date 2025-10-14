// netlify/functions/chat.js
// Refined consulting tone + greeting shortcut + KB injection intact
const { createClient } = require("@supabase/supabase-js");
const MODEL = "gpt-4o-mini";

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); }
  finally { clearTimeout(id); }
}

function inferFocus(text = "") {
  const s = text.toLowerCase();
  const has = (...w) => w.some(x => s.includes(x));
  if (has("retention","persist","student success","advis")) return "issue_student_success";
  if (has("accreditation","rsi","title iv","compliance","audit")) return "issue_compliance";
  if (has("pricing","net tuition","discount","budget","aid","fafsa","pell")) return "issue_cost_pricing";
  if (has("declin","yield","melt","pipeline","recruit","inquiry","enrollment")) return "issue_declining_enrollment";
  if (has("quality","learning outcomes","curriculum","instruction","qm","udl")) return "issue_academic_quality";
  return "general";
}

function ok(payload) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, ...payload })
  };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
      return ok({ reply: "Missing environment variables.", text: "Missing environment variables.", citations: [], sessionId: null });
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = JSON.parse(event.body || "{}");
    const message = (body.message || "").trim();
    const ctx = body.ctx || {};
    if (!message) return ok({ reply: "Please share your question.", text: "Please share your question.", citations: [], sessionId: null });

    // 👉 Ultra‑concise greeting shortcut
    const greetingRx = /^(hi|hello|hey|good\s*(morning|afternoon|evening))\b/i;
    if (greetingRx.test(message) && message.length < 24) {
      const name = ctx.firstName ? ` ${ctx.firstName}` : "";
      const short = `Hello${name}! How can I help today?`;
      return ok({ reply: short, text: short, citations: [], sessionId: null });
    }

    // Build tiny session (optional; skip DB writes for now to stay fast)
    let sessionId = body.sessionId || null;

    // --- KB search ---
    const focusTag = ctx.pref_area || inferFocus(message);
    let kbResults = [];
    try {
    // Build internal base URL from headers (Netlify-safe)
    const host = event.headers["x-forwarded-host"] || event.headers.host;
    const proto = event.headers["x-forwarded-proto"] || "https";
    const base = `${proto}://${host}`;
    const kbRes = await fetchWithTimeout(`${base}/.netlify/functions/knowledge-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: message, pref_area: focusTag, limit: 5 })
      }, 15000).then(r => r.json());
      kbResults = Array.isArray(kbRes?.results) ? kbRes.results.slice(0, 5) : [];
    } catch { kbResults = []; }

    const evidenceText = kbResults.length
      ? kbResults.map((r, i) => `${i + 1}. ${r.title || "Untitled"} — ${r.summary || ""}`).join("\n")
      : "(No direct knowledge base entries surfaced. Use sector best practices and ask follow‑ups to clarify context.)";

    const citations = kbResults.map(r => ({ title: r.title, source_url: r.source_url }));

    // Persona — concise consulting tone
    const persona = `
You are Lancelot, a higher‑education consultant (PeerQuest). 
Style rules:
• Be brief, clear, and specific. ≤130 words unless asked for detail.
• Start with the user’s name if provided.
• Offer 2–3 actionable steps, then a single “Next step:” line.
• If KB snippets are provided, anchor advice to them (mention "[#]" numbers when relevant).
• If evidence is thin, say so and ask 1 clarifying question.

Return plain text only.
`;

    const sessionContext = [
      ctx.firstName ? `User: ${ctx.firstName}` : null,
      ctx.institutionName ? `Institution: ${ctx.institutionName}` : null,
      ctx.unit_id ? `IPEDS: ${ctx.unit_id}` : null
    ].filter(Boolean).join(" · ") || "General";

    // Model call
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
            { role: "system", content: `Session: ${sessionContext}` },
            { role: "system", content: `Focus hint: ${focusTag}` },
            { role: "system", content: `Knowledge Base Insights:\n${evidenceText}` },
            { role: "user", content: message }
          ]
        })
      }, 25000);
      if (!res.ok) throw new Error(`OpenAI ${res.status}`);
      const data = await res.json();
      reply = data?.choices?.[0]?.message?.content?.trim() || "";
    } catch (e) {
      reply = "I had trouble generating a response just now. Can you restate your goal in one sentence?";
    }

    return ok({ reply, text: reply, citations, sessionId });
  } catch (err) {
    return ok({ reply: "Unexpected error.", text: "Unexpected error.", citations: [], sessionId: null });
  }
};
