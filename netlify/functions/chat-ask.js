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

    if (!q) return { statusCode: 400, body: JSON.stringify({ error: "Provide a query (?q= or POST {query})" }) };
    if (!OPENAI_API_KEY) return { statusCode: 500, body: JSON.stringify({ error: "Missing OPENAI_API_KEY" }) };

    // Optional name detection if user volunteers it (“I’m Jim”, “my name is…”)
    const nameMatch = q.match(/\b(?:i am|i’m|im|my name is|this is)\s+([A-Za-z][\w'-]*)/i);
    const userName = nameMatch ? nameMatch[1] : "";

    // Pull grounding context from our function
    const siteBase = process.env.URL || (event.headers?.host ? `https://${event.headers.host}` : "");
    const ctxUrl   = `${siteBase}/.netlify/functions/chat-context?q=${encodeURIComponent(q)}`;
    let context_block = "";
    try {
      const ctxRes = await fetch(ctxUrl);
      if (ctxRes.ok) {
        const ctxJson = await ctxRes.json();
        context_block = ctxJson?.context_block || "";
      }
    } catch {}

    // Persona + behavior
    const system = [
      "You are Lancelot, a warm, professional higher-ed operations copilot.",
      "Start with: “Of course I can help with that.” Keep it friendly and concise.",
      "INQUIRY FIRST: If key details are missing, ask 2–4 short scoping questions before prescribing steps.",
      "Examples of scoping: audience/region, program level, modality (online/on-campus), timeline, budget or policy constraints, target outcomes.",
      "GROUNDING: Prefer the provided CONTEXT; cite source names in brackets (e.g., [Accreditation Master Summary]) when appropriate.",
      "If context is thin, say what’s missing and which docs would help.",
      "NAME: If unknown, politely ask for preferred name once; if known, greet them by name once."
    ].join(" ");

    const preface = userName
      ? `User name: ${userName}`
      : `User name: (unknown — ask once, then continue)`;

    const user = [
      `META: ${preface}`,
      `CONTEXT:\n${context_block || "(no relevant context found)"}`,
      `QUESTION:\n${q}`
    ].join("\n\n");

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        temperature: 0.3
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
      body: JSON.stringify({ query: q, answer, context_used: Boolean(context_block) })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err?.message || err) }) };
  }
};
