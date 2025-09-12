// /netlify/functions/chat.js
// Full version with friendly bonding-first behavior

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// ---- Helpers ---------------------------------------------------------------

function getUserQuery(messages) {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return String(messages[i].content ?? "");
  }
  return "";
}

function extractName(text) {
  const match = text.match(/my name is\s+(\w+)/i);
  return match ? match[1] : null;
}

async function fetchKBMatches(queryText, limit = 5) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  const cleaned = (queryText || "").trim().slice(0, 500);
  if (!cleaned) return [];
  const star = `*${cleaned.replace(/\s+/g, " ")}*`;
  const enc = encodeURIComponent(star);

  const url = `${SUPABASE_URL}/rest/v1/knowledge_base?select=title,content,tags&or=(title.ilike.${enc},content.ilike.${enc},tags.ilike.${enc})&order=created_at.desc&limit=${limit}`;

  const resp = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: "application/json",
    },
  });

  if (!resp.ok) return [];
  const data = await resp.json();
  return Array.isArray(data) ? data : [];
}

function systemPrompt(name = "there") {
  return [
    `You are Lancelot — a friendly, senior higher-ed advisor.`,
    `Bond first. Use the user's name ("${name}") when known.`,
    `Avoid hype. Act like a consultant and teammate.`,
    `He who bonds, wins.`,
  ].join(" ");
}

function kbToContext(rows) {
  if (!rows?.length) return "No internal notes matched.";
  return rows
    .map((r, i) => {
      const title = r.title || `Doc ${i + 1}`;
      const tags = r.tags ? ` [${r.tags}]` : "";
      const body = (r.content || "").slice(0, 1000);
      return `• ${title}${tags}\n${body}`;
    })
    .join("\n\n");
}

// ---- Netlify handler -------------------------------------------------------

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }

  try {
    if (!OPENAI_API_KEY) {
      return {
        statusCode: 500,
        headers: CORS,
        body: JSON.stringify({ error: "Missing OPENAI_API_KEY" }),
      };
    }

    const { messages = [] } = JSON.parse(event.body || "{}");
    const userQuery = getUserQuery(messages);
    const possibleName = extractName(userQuery);

    // --- Bonding-first logic ---
    if (!messages.length || !userQuery) {
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({
          reply: "Hello! How may I assist you? May I please have your name?",
        }),
      };
    }

    if (possibleName && userQuery.toLowerCase().trim() === `my name is ${possibleName.toLowerCase()}`) {
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({
          reply: `Thank you, ${possibleName}. How may I assist you today?`,
        }),
      };
    }

    // --- If we have a question ---
    const kbRows = await fetchKBMatches(userQuery, 5);
    const kbContext = kbToContext(kbRows);

    const chatMessages = [
      { role: "system", content: systemPrompt(possibleName || "there") },
      { role: "system", content: "Internal notes:\n" + kbContext },
      ...messages,
    ];

    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: chatMessages,
        temperature: 0.3,
      }),
    });

    const data = await aiResp.json();
    const reply = data.choices?.[0]?.message?.content || "No response from model.";

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        reply,
        message: reply,
        text: reply,
        content: reply,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
