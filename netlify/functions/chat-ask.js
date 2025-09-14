// netlify/functions/chat-ask.js
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL   = process.env.OPENAI_MODEL || "gpt-4o-mini";

exports.handler = async (event) => {
  try {
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

    // ---- build a friendly persona and simple “name” heuristic ----
    // If user already told us a name (“I’m Jim”, “My name is …”), capture it; otherwise leave empty.
    const nameMatch = q.match(/\b(?:i am|i’m|im|my name is|this is)\s+([A-Za-z][\w'-]*)/i);
    const userName = nameMatch ? nameMatch[1] : "";

    // ---- fetch grounded context from our own endpoint ----
    const siteBase =
      process.env.URL ||
      (event.headers && event.headers.host ? `https://${event.headers.host}` : "");

    const ctxUrl = `${siteBase}/.netlify/functions/chat-context?q=${encodeURIComponent(q)}`;
    const ctxRes = await fetch(ctxUrl);
    let context_block = "";
    if (ctxRes.ok) {
      const ctxJson = await ctxRes.json();
      context_block = ctxJson?.context_block || "";
    }

    // ---- prompt with warmth + grounding rules ----
    const system = [
      "You are Lancelot, a warm, professional higher-ed operations copilot.",
      "Be concise, pragmatic, and encouraging. Use bullets for steps.",
      "GROUNDING: Prefer the provided CONTEXT. If context is thin, say briefly what’s missing and suggest which documents would help.",
      "CITATIONS: When drawing from the context list, mention the source name in brackets like [Feasibility Study] if helpful.",
      "NAME: If you do not know the user’s name yet, begin with ONE short, friendly sentence asking for their preferred name, then answer the question.",
      "If a name is provided, greet them by name once at the top, then continue."
    ].join(" ");

    const preface = userName
      ? `User name (from message): ${userName}`
      : `User name: (unknown — ask once, then answer)`;

    const user = [
      `META: ${preface}`,
      `CONTEXT:\n${context_block || "(no relevant context found)"}`,
      `QUESTION:\n${q}`
    ].join("\n\n");

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${OPENAI_API_KEY}`,
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
      body: JSON.stringify({
        query: q,
        answer,
        context_used: Boolean(context_block),
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err?.message || err) }) };
  }
};
