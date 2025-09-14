// netlify/functions/chat-ask.js
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL  = process.env.OPENAI_MODEL || "gpt-4o-mini";
const SITE_BASE = process.env.URL || "https://YOUR-SITE.netlify.app"; // fallback if URL isn't set

exports.handler = async (event) => {
  try {
    // Accept GET ?q=... for quick testing, or POST {query:"..."} from the UI
    const method = event.httpMethod || "GET";
    const q =
      method === "POST"
        ? (JSON.parse(event.body || "{}").query || "").trim()
        : (event.queryStringParameters?.q || "").trim();

    if (!q) {
      return { statusCode: 400, body: JSON.stringify({ error: "Provide a query (?q= on GET or {query} on POST)" }) };
    }
    if (!OPENAI_API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: "Missing OPENAI_API_KEY in Netlify env" }) };
    }

    // 1) Get grounded context from our own function
    const ctxUrl = `${SITE_BASE}/.netlify/functions/chat-context?q=${encodeURIComponent(q)}`;
    const ctxRes = await fetch(ctxUrl);
    if (!ctxRes.ok) {
      const e = await ctxRes.text();
      return { statusCode: 500, body: JSON.stringify({ error: `chat-context failed: ${e}` }) };
    }
    const { context_block = "" } = await ctxRes.json();

    // 2) Build prompt
    const system = [
      "You are Lancelot, a higher-ed operations copilot.",
      "Use the provided CONTEXT to answer pragmatically and concisely.",
      "If context is thin, say what is missing and suggest next documents to consult.",
      "Prefer actionable steps, and reference sources with their [index] from CONTEXT when useful."
    ].join(" ");

    const user = `CONTEXT:\n${context_block || "(no context found)"}\n\nQUESTION:\n${q}`;

    // 3) Call OpenAI
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${OPENAI_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        temperature: 0.2
      })
    });

    if (!resp.ok) {
      const e = await resp.text();
      return { statusCode: 500, body: JSON.stringify({ error: `OpenAI error: ${e}` }) };
    }

    const data = await resp.json();
    const answer = data?.choices?.[0]?.message?.content || "(no answer)";
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: q, answer, context_used: !!context_block })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err?.message || err) }) };
  }
};
