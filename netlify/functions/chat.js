// netlify/functions/chat.js
// Step 10b-4: Working AI "brain" with upgraded Lancelot persona prompt

const MODEL = "gpt-4o-mini"; // higher reasoning + tone control

// helper for fetch with timeout
async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const body = JSON.parse(event.body || "{}");
    const message = (body.message || "").trim();
    const ctx = body.ctx || {};

    if (!message) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing 'message'" }) };
    }

    // --- Updated persona ---
    const persona = `
You are **Lancelot**, the higher-education consultant built by PeerQuest.
Your mission: help campus leaders, faculty, and staff make better decisions about enrollment, retention, finance, and academic quality.

Tone:
• Empathetic, steady, professional — never salesy.
• Write as if you are a trusted peer in higher education.
• Blend data-driven reasoning with coaching warmth.
• Keep replies under ~150 words unless asked for detail.

Voice:
• Start with the user’s name if available.
• Acknowledge their institution context.
• Offer 2-3 actionable insights, then a helpful next step.
• Cite or reference your Knowledge Base when possible (“According to national benchmarks…”).

Compliance:
• Never include personal student data.
• Flag uncertainty honestly and suggest where to verify.
`;

    const contextLines = [
      ctx.firstName ? `User: ${ctx.firstName}` : null,
      ctx.institutionName ? `Institution: ${ctx.institutionName}` : null,
      ctx.inst_url ? `.edu: ${ctx.inst_url}` : null,
      ctx.unit_id ? `IPEDS ID: ${ctx.unit_id}` : null
    ].filter(Boolean);

    const sessionContext = contextLines.length
      ? `Session context → ${contextLines.join(" · ")}`
      : "Session context → General (no school set)";

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
          max_tokens: 500
        })
      }, 25000);

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`OpenAI ${res.status}: ${txt.slice(0, 200)}`);
      }

      const data = await res.json();
      const reply =
        data?.choices?.[0]?.message?.content?.trim() ||
        "I couldn’t generate a response just now.";

      return okReply(reply, []);
    } catch (modelErr) {
      console.error("OpenAI call failed:", modelErr);
      return okReply(fallbackReply(ctx, message, "temporary model issue"), []);
    }
  } catch (err) {
    console.error("chat handler error:", err);
    return okReply(
      "I hit an unexpected issue just now, but I’m still here. Ask again in a moment.",
      []
    );
  }
};

// ------------- helpers -------------
function okReply(reply, citations) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, reply, citations })
  };
}

function fallbackReply(ctx, message, reason) {
  const greet = ctx.firstName
    ? (ctx.institutionName ? `Hi ${ctx.firstName} — ${ctx.institutionName} is set.` : `Hi ${ctx.firstName}.`)
    : "Hello there.";
  const note = reason ? `\n\n(Quick fallback because: ${reason}.)` : "";
  const next = "\n\nNext step: ask me another question or share a document you’d like help summarizing.";
  return `${greet}\n\nI received your message: “${message}”.${note}${next}`;
}
