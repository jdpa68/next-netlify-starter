// netlify/functions/chat.js
export async function handler(event) {
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Missing OPENAI_API_KEY" }) };
  }

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}
  const name = (body.name || "").toString().trim();
  const convo = Array.isArray(body.messages) ? body.messages : [];

  // Extract the last user message content, if any
  const lastUserMsg = [...convo].reverse().find(m => m.role === "user")?.content || "";

  const systemPrompt = `
You are Lancelot, a friendly, high-signal higher-ed advisor.
Style & rules:
- Start by ANSWERING the user's latest message directly. Your FIRST sentence must be substantive, not a question.
- Never open with "How can I help/assist you today?" or similar.
- Use the user's name when known (name: "${name || ""}") in a natural way.
- Keep replies concise, skimmable, and tactical. Ask at most 1–3 targeted follow-ups at the end if needed.
- No lectures on why topics are important; they already know. Be a peer consultant.
`.trim();

  const messages = [
    { role: "system", content: systemPrompt },
    // Give the model the conversation for context, but make the target explicit:
    ...convo.map(m => ({ role: m.role, content: m.content })),
    { role: "system", content: `Respond directly to the user's most recent message:\n"""${lastUserMsg}"""` }
  ];

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return { statusCode: resp.status, headers: CORS, body: JSON.stringify({ error: txt.slice(0, 800) }) };
    }

    const data = await resp.json();
    const reply = data?.choices?.[0]?.message?.content || "OK.";
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ reply }) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: String(e).slice(0, 800) }) };
  }
}
