// ===========================================
// netlify/functions/chat.js
// Step 11d — Conversational Consultant Voice + KB Context
// ===========================================

const { createClient } = require("@supabase/supabase-js");
const MODEL = "gpt-4o-mini";

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); }
  finally { clearTimeout(id); }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

    const apiKey = process.env.OPENAI_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!apiKey || !supabaseUrl || !supabaseServiceKey)
      return json200({ ok: false, error: "Missing environment variables." });

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = JSON.parse(event.body || "{}");
    const message = (body.message || "").trim();
    const ctx = body.ctx || {};
    let sessionId = body.sessionId || null;

    if (!message) return json200({ ok: false, error: "Missing message." });

    // --- Step 1: Knowledge Base lookup
    const prefArea = ctx.pref_area || ctx.prefArea || null;
    const kbRes = await fetchWithTimeout(`${process.env.URL || ""}/.netlify/functions/knowledge-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: message, pref_area: prefArea, limit: 5 })
    }, 15000).then(r => r.json()).catch(() => ({ ok: false }));

    const evidence = Array.isArray(kbRes?.results) ? kbRes.results.slice(0, 5) : [];

    const evidenceText = evidence.length
      ? evidence.map((r, i) => `${i + 1}. ${r.title || "Untitled"} — ${r.summary || ""}`).join("\n")
      : "(No direct knowledge base entries found; use best higher-ed practice.)";

    // --- Step 2: Persona & style instructions
    const persona = `
You are Lancelot, a conversational higher-ed consultant built by PeerQuest.
Your tone is professional but warm, collaborative, and peer-like.
You never lecture. You respond as if in dialogue with a colleague.

STYLE & VOICE RULES:
• Always start with a short greeting (e.g., “Hi Jim —”) if name known.
• Give a one-line diagnostic: what this seems to be about.
• Offer 2–3 concise, actionable recommendations in bullets.
• If the question is vague or missing data, ask 1–2 clarifying questions before concluding.
• End with “Next Step:” — a specific, do-able action for tomorrow.
• Keep under 150 words unless asked to expand.
• Favor friendly, conversational phrasing (“let’s look at,” “you might try”).
• Cite sources naturally using phrases like “According to recent retention studies…” instead of numeric citations.
• Prioritize the top knowledge base summaries below before general reasoning.

Knowledge Base Insights:
${evidenceText}
`;

    // --- Step 3: Session context
    const contextLines = [
      ctx.firstName ? `User: ${ctx.firstName}` : null,
      ctx.institutionName ? `Institution: ${ctx.institutionName}` : null,
      ctx.org_type ? `Org type: ${ctx.org_type}` : null
    ].filter(Boolean);
    const sessionContext = contextLines.length ? contextLines.join(" · ") : "";

    // --- Step 4: Compose messages
    const messages = [
      { role: "system", content: persona },
      { role: "system", content: sessionContext },
      { role: "user", content: message }
    ];

    // --- Step 5: Call OpenAI
    let replyText = "";
    try {
      const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, messages, temperature: 0.6, max_tokens: 600 })
      }, 25000);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      replyText = data?.choices?.[0]?.message?.content?.trim() || "No reply.";
    } catch (err) {
      console.error("OpenAI error:", err);
      replyText = "I hit a temporary issue reaching the model. Please try again.";
    }

    // --- Step 6: Save assistant reply (optional)
    try {
      if (sessionId) {
        await supabase.from("chat_messages").insert({
          session_id: sessionId,
          role: "assistant",
          content: replyText
        });
      }
    } catch (e) {
      console.warn("Logging skipped:", e.message);
    }

    // --- Step 7: Return reply & citations
    const citations = evidence.map((r) => ({
      title: r.title,
      source_url: r.source_url
    }));

    return json200({ ok: true, reply: replyText, citations, sessionId });
  } catch (err) {
    console.error("chat handler error:", err);
    return json200({ ok: false, error: "Server error." });
  }
};

// --- Utility
function json200(payload) {
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) };
}
