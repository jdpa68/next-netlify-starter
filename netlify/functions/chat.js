// netlify/functions/chat.js
// Debug version: show OpenAI error details in the reply (temporary).

const MODEL = "gpt-4o-mini"; // safe default for broad access

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); }
  finally { clearTimeout(id); }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const apiKey = process.env.OPENAI_API_KEY || "";
    const body = JSON.parse(event.body || "{}");
    const message = (body.message || "").trim();
    const ctx = body.ctx || {};

    if (!message) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing 'message'" }) };
    }

    const persona = `
You are Lancelot, a calm, empathetic higher-ed partner.
Style: concise (~120 words), practical next step, cite sources when clear.
Avoid hype and sensitive personal data.`;

    const contextLines = [
      ctx.firstName ? `User: ${ctx.firstName}` : null,
      ctx.institutionName ? `Institution: ${ctx.institutionName}` : null,
      ctx.inst_url ? `.edu: ${ctx.inst_url}` : null,
      ctx.unit_id ? `IPEDS ID: ${ctx.unit_id}` : null
    ].filter(Boolean);
    const sessionContext = contextLines.length
      ? `Session context → ${contextLines.join(" · ")}`
      : "Session context → General (no school set)";

    if (!apiKey) {
      return okReply(debugMsg("No OPENAI_API_KEY set on server."), []);
    }

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
        const text = await res.text().catch(() => "");
        // <<<<<< SHOW ERROR DETAIL IN REPLY >>>>>>
        const detail = `OpenAI returned ${res.status}. Body: ${text.slice(0, 300)}`;
        return okReply(debugMsg(detail), []);
      }

      const data = await res.json();
      const reply =
        data?.choices?.[0]?.message?.content?.trim() ||
        "I couldn’t generate a response just now.";

      return okReply(reply, []);
    } catch (err) {
      const detail = `Network/timeout error: ${String(err).slice(0, 300)}`;
      return okReply(debugMsg(detail), []);
    }
  } catch (err) {
    const detail = `Handler error: ${String(err).slice(0, 300)}`;
    return okReply(debugMsg(detail), []);
  }
};

function okReply(reply, citations) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, reply, citations })
  };
}

function debugMsg(s) {
  return [
    "⚠️ Debug info (temporary):",
    s,
    "",
    "If this mentions 401 → key invalid or wrong account/endpoint.",
    "If 404/400 → model name not available to this key.",
    "If 429 → rate limited.",
    "If 5xx → transient; try again."
  ].join("\n");
}
