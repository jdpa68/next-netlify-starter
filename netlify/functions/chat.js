// netlify/functions/chat.js
// Step 11e — FIXED (session + memory + KB citations)
// Expects: POST JSON {
//   message: string,
//   sessionId?: string,
//   history?: Array<{role: "user"|"assistant"|"system", content: string}>,
//   pref_area?: string
// }
// Returns: { ok, sessionId, reply, citations: Array, evidence: Array, used_messages }
//
// Notes:
// - Generates a sessionId if missing (client should store it in lancelot_session).
// - Uses last 5 exchanges from provided history for lightweight conversation memory.
// - Pulls KB context via the sibling Netlify function `knowledge-search`.
// - Injects KB snippets into the system prompt for grounded answers with citations.

const crypto = require("crypto");

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const body = safeJson(event.body);
    const userMessage = ((body.message || "").toString() || "").trim();
    if (!userMessage) {
      return json200({ ok: false, error: "Missing message" });
    }

    // Session
    const sessionId = (body.sessionId && String(body.sessionId)) || crypto.randomUUID();

    // History: keep last 10 turns max, but we will downselect to 5 in prompt
    const incomingHistory = Array.isArray(body.history) ? body.history : [];
    const cleanedHistory = incomingHistory
      .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-10);

    const prefArea = (body.pref_area || body.prefArea || "").toString().trim();

    // ---- Retrieve KB context via internal function ----
    const kbResults = await searchKBInternal(event, {
      q: userMessage,
      pref_area: prefArea,
      limit: 5
    });

    // Build KB snippets + citations
    const snippets = kbResults.map(r => formatSnippet(r)).join("\n\n");
    const citations = kbResults.map(r => ({
      id: r.id,
      title: r.title,
      url: r.source_url || null
    }));
    const evidence = kbResults; // pass-through for your Evidence Drawer

    // ---- Compose messages for the model ----
    const system = buildSystemPrompt(snippets);
    const historyForModel = cleanedHistory.slice(-10);
    const messages = [
      { role: "system", content: system },
      ...historyForModel,
      { role: "user", content: userMessage }
    ];

    // ---- Call OpenAI (or compatible) ----
    const { reply, used_messages } = await callOpenAI(messages);

    // Return payload with citations + evidence
    return json200({
      ok: true,
      sessionId,
      reply,
      citations,
      evidence,
      used_messages
    });
  } catch (err) {
    console.error("chat error:", err);
    return json200({ ok: false, error: "Server error" });
  }
};

/**
 * Helpers
 */

function json200(payload) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  };
}

function safeJson(body) {
  try { return JSON.parse(body || "{}"); }
  catch { return {}; }
}

// Build the system prompt with persona + KB snippets (grounding)
function buildSystemPrompt(snippets) {
  return [
    "You are Lancelot, a higher-education enrollment & student-success copilot.",
    "Be concise, stepwise, and cite evidence using [#] markers tied to provided sources.",
    "Only cite from the provided 'KB Snippets' section.",
    "",
    "KB Snippets:",
    snippets || "(no snippets found)",
    "",
    "Citing rules: when a statement is supported by a specific snippet, add [#] using the 1-based index of the snippet in the search results.",
    "If no snippet supports something, say you lack evidence rather than guessing."
  ].join("\n");
}

// Little formatter for each KB result
function formatSnippet(r) {
  const title = r.title || "Untitled";
  const sum = (r.summary || "").trim();
  const url = r.source_url || "";
  const area = r.area_primary || r.area_secondary || "";
  const issue = r.issue_primary || r.issue_secondary || "";
  const tag = r.tags || "";
  return `• ${title}\n  ${sum}\n  Source: ${url}\n  Area/Issue: ${area} / ${issue}\n  Tags: ${tag}`;
}

// Internal call to sibling Netlify function (works locally and in prod)
async function searchKBInternal(event, payload) {
  const host = event.headers["x-forwarded-host"] || "localhost:8888";
  const proto = event.headers["x-forwarded-proto"] || "http";
  const base = `${proto}://${host}`;
  try {
    const res = await fetch(`${base}/.netlify/functions/knowledge-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!json || !json.ok) return [];
    return Array.isArray(json.results) ? json.results : [];
  } catch {
    return [];
  }
}

// OpenAI call — uses env OPENAI_API_KEY and optional OPENAI_MODEL
async function callOpenAI(messages) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  if (!apiKey) {
    // Development fallback: echo last user message with a gentle note
    const lastUser = messages.filter(m => m.role === "user").slice(-1)[0]?.content || "";
    return { reply: `(Dev mode) You said: ${lastUser}\n\n[No OPENAI_API_KEY set, so this is a stub reply.]`, used_messages: messages.length };
  }

  // Minimal streaming-free JSON call
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error: ${res.status} ${text}`);
  }

  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content || "";
  return { reply, used_messages: messages.length };
}
