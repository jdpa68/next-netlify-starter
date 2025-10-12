// netlify/functions/chat.js
// Step 10b-3: Real "brain" — calls OpenAI and returns a Jenn-style answer.
// Reads OPENAI_API_KEY from Netlify environment variables.

const MODEL = "gpt-4o-mini"; // sensible default (fast, low cost)
// If you prefer another model later, change the constant above.

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing OPENAI_API_KEY on server" })
      };
    }

    const body = JSON.parse(event.body || "{}");
    const message = (body.message || "").toString().trim();
    const ctx = body.ctx || {}; // { firstName, institutionName, inst_url, unit_id }

    if (!message) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing 'message' in request body" }) };
    }

    // Build a compact persona + context
    const persona = `
You are Lancelot, a calm, helpful higher-ed partner. 
Tone: empathetic consultant; concise (≤120 words unless asked for detail); cite sources when available.
If a school is set, keep responses relevant to that context. Offer a helpful next step at the end.
Avoid hype. No sensitive personal data. If unsure, say so and suggest how to verify.`;

    const contextLines = [
      ctx?.firstName ? `User: ${ctx.firstName}` : null,
      ctx?.institutionName ? `Institution: ${ctx.institutionName}` : null,
      ctx?.inst_url ? `.edu: ${ctx.inst_url}` : null,
      ctx?.unit_id ? `IPEDS ID: ${ctx.unit_id}` : null
    ].filter(Boolean);

    const systemContext = contextLines.length
      ? `Session context → ${contextLines.join(" · ")}`
      : "Session context → General (no school set)";

    // Compose chat messages for OpenAI
    const messages = [
      { role: "system", content: persona.trim() },
      { role: "system", content: systemContext },
      { role: "user", content: message }
    ];

    // Call OpenAI Chat Completions
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.4,
        max_tokens: 450
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`OpenAI error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const reply =
      data?.choices?.[0]?.message?.content?.trim() ||
      "I couldn’t generate a response just now.";

    // Placeholder for future citation extraction (Snoopy or RAG can populate this later)
    const citations = [];

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, reply, citations })
    };
  } catch (e) {
    console.error("chat error:", e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error" })
    };
  }
};
