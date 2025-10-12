// netlify/functions/chat.js
// Fail-safe "brain": tries OpenAI; on any error, returns a friendly fallback.
// Reads OPENAI_API_KEY from Netlify environment variables.

const MODEL = "gpt-4o-mini"; // fast, low cost

// Small helper: timeout wrapper for fetch
async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const apiKey = process.env.OPENAI_API_KEY || "";
    const body = JSON.parse(event.body || "{}");
    const message = (body.message || "").toString().trim();
    const ctx = body.ctx || {}; // { firstName, institutionName, inst_url, unit_id }

    if (!message) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing 'message' in request body" }) };
    }

    // Persona + context
    const persona = `
You are Lancelot, a calm, empathetic higher-ed partner.
Style: concise (≈120 words), practical next step, cite sources when clear.
Avoid hype and sensitive personal data. If unsure, say so and suggest how to verify.`;
    const contextLines = [
      ctx.firstName ? `User: ${ctx.firstName}` : null,
      ctx.institutionName ? `Institution: ${ctx.institutionName}` : null,
      ctx.inst_url ? `.edu: ${ctx.inst_url}` : null,
      ctx.unit_id ? `IPEDS ID: ${ctx.unit_id}` : null
    ].filter(Boolean);
    const sessionContext = contextLines.length
      ? `Session context → ${contextLines.join(" · ")}`
      : "Session context → General (no school set)";

    // If no key present, skip model and return fallback
    if (!apiKey) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: true,
          reply: fallbackReply(ctx, message, "Model key not configured"),
          citations: []
        })
      };
    }

    // Call OpenAI Chat Completions (fail-safe)
    try {
      const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: persona.trim() },
            { role: "system", content: sessionContext },
            { role: "user", content: message }
          ],
          temperature: 0.4,
          max_tokens: 450
        })
      }, 25000);

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`OpenAI ${res.status}: ${t.slice(0, 300)}`);
      }

      const data = await res.json();
      const reply =
        data?.choices?.[0]?.message?.content?.trim() ||
        "I couldn’t generate a response just now.";

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true, reply, citations: [] })
      };
    } catch (modelErr) {
      // Log the real error; return a friendly fallback (UI stays happy)
      console.error("OpenAI call failed:", modelErr);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: true,
          reply: fallbackReply(ctx, message, "Temporary issue reaching the model"),
          citations: []
        })
      };
    }
  } catch (e) {
    console.error("chat handler error:", e);
    // Final safety net: still return 200 with a user-friendly reply
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        reply: "I hit an unexpected issue just now, but I’m still here. Ask again in a moment, or try a simpler phrasing.",
        citations: []
      })
    };
  }
};

// Fallback response that never breaks the UI
function fallbackReply(ctx, message, reason) {
  const greet = ctx.firstName
    ? (ctx.institutionName ? `Hi ${ctx.firstName} — ${ctx.institutionName} is set.` : `Hi ${ctx.firstName}.`)
    : "Hello there.";
  const note = reason ? `\n\n(Using a quick fallback because: ${reason}.)` : "";
  const next = "\n\nNext step: ask me another question or share a document you’d like help summarizing.";
  return `${greet}\n\nI received your message: “${message}”.${note}${next}`;
}
