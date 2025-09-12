// /netlify/functions/chat.js
// Netlify function: handles CORS, calls OpenAI Chat Completions, and returns a friendly message.
// Uses a safe default model and surfaces any API errors back to the UI for quick debugging.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

// Safer default; you can override in Netlify env with OPENAI_MODEL if desired
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Lancelot's friendly, consultant-style system prompt
const SYSTEM_PROMPT = `
You are “Lancelot,” a warm, professional higher-ed strategy partner.
Bond first: learn (and remember) the user's preferred name if given. Be concise, specific, and useful.
Avoid fluff like “this is important.” Never be condescending or overly formal.
Ask 1–3 clarifying questions only when needed to advance the user’s goal.
When asked for plans, produce clear step-by-step actions with brief justifications.
If the user provides a “project summary,” reflect it back crisply and then propose next actions.
Tone: collaborative consultant + teammate. Short paragraphs, bullets when helpful.
`;

// Helper: POST JSON with better error messaging
async function postJSON(url, headers, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

export async function handler(event, context) {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  try {
    if (!OPENAI_API_KEY) {
      throw new Error("Missing OPENAI_API_KEY environment variable.");
    }

    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: CORS_HEADERS,
        body: JSON.stringify({ reply: "Please POST a message to this endpoint." })
      };
    }

    // Expecting JSON: { messages: [{role:'user'|'assistant'|'system', content:'...'}] }
    // Your UI already sends { messages }, but we guard just in case.
    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      // ignore, handled below if messages is missing
    }

    const incomingMessages = Array.isArray(body.messages) ? body.messages : [];
    const name = (body.name || "").trim();

    // Build chat history for OpenAI (system + user-provided history)
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(name ? [{ role: "system", content: `User prefers to be called: ${name}` }] : []),
      ...incomingMessages
    ];

    // Call OpenAI Chat Completions (stable + broadly enabled)
    const data = await postJSON(
      "https://api.openai.com/v1/chat/completions",
      { Authorization: `Bearer ${OPENAI_API_KEY}` },
      {
        model: MODEL,
        messages,
        temperature: 0.3,
        max_tokens: 600
      }
    );

    const reply =
      data?.choices?.[0]?.message?.content?.trim() ||
      "I’m here and ready—what would you like to tackle next?";

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ reply })
    };
  } catch (err) {
    // Bubble the actual error text back to the UI so you can see what's wrong
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        reply:
          "I hit a snag talking to the model. Here are the details so we can fix it quickly:\n\n" +
          (err?.message || String(err))
      })
    };
  }
}
