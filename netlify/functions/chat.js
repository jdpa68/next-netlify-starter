// /netlify/functions/chat.js
// Full version: Supabase-aware + GPT-4o-mini

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;          // e.g. https://xxxx.supabase.co
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY; // anon public key for reads

// ---- Helpers ---------------------------------------------------------------

/** Get the latest user message text from an OpenAI-style messages array */
function getUserQuery(messages) {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return String(messages[i].content ?? "");
  }
  return "";
}

/** Simple keyword string -> URL-encoded ilike filter */
function buildIlikeFilter(q) {
  // Basic sanitization
  const cleaned = (q || "").trim().slice(0, 500);
  const star = `*${cleaned.replace(/\s+/g, " ")}*`;
  const enc = encodeURIComponent(star);
  // or=(title.ilike.*q*,content.ilike.*q*,tags.ilike.*q*)
  return `or=(title.ilike.${enc},content.ilike.${enc},tags.ilike.${enc})`;
}

/** Query Supabase REST for relevant rows from knowledge_base */
async function fetchKBMatches(queryText, limit = 5) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];

  const filter = buildIlikeFilter(queryText || "");
  const url = `${SUPABASE_URL}/rest/v1/knowledge_base?select=title,content,tags&${filter}&order=created_at.desc&limit=${limit}`;

  const resp = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: "application/json",
    },
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.error("Supabase error:", resp.status, text);
    return [];
  }
  const data = await resp.json();
  return Array.isArray(data) ? data : [];
}

/** Build system prompt with your bonding-first persona */
function systemPrompt(name = "there") {
  return [
    `You are Lancelot — a friendly, senior higher-ed advisor and teammate.`,
    `Bond first. Use the user's name ("${name}") when known. Ask 1–2 clarifying,`,
    `goal-focused questions before prescribing. Be concise, specific, and practical.`,
    `Avoid hype and "as an AI" phrasing. Speak like a consultant and partner.`,
    `He who bonds, wins.`,
  ].join(" ");
}

/** Turn KB rows into compact context */
function kbToContext(rows) {
  if (!rows?.length) return "No internal notes matched.";
  return rows
    .map((r, i) => {
      const title = r.title || `Doc ${i + 1}`;
      const tags = r.tags ? ` [${r.tags}]` : "";
      const body = (r.content || "").slice(0, 1500); // keep it tight
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

    const { messages = [], userName } = JSON.parse(event.body || "{}");
    const userQuery = getUserQuery(messages);

    // 1) Pull context from Supabase (best-effort; safe to proceed without)
    const kbRows = await fetchKBMatches(userQuery, 5);
    const kbContext = kbToContext(kbRows);

    // 2) Build the chat for OpenAI
    const chatMessages = [
      { role: "system", content: systemPrompt(userName || "there") },
      {
        role: "system",
        content:
          "Internal notes (summarized matches from our knowledge base):\n" +
          kbContext,
      },
      // keep the prior conversation the user sent us (if any)
      ...messages,
      // gentle nudge to be concrete
      {
        role: "system",
        content:
          "When giving next steps, provide a short numbered plan, cite which note (by bullet title) informed your advice when relevant, and ask one focused follow-up.",
      },
    ];

    // 3) Call OpenAI (GPT-4o-mini)
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

    if (data.error) {
      console.error("OpenAI API Error:", data.error);
      return {
        statusCode: 500,
        headers: CORS,
        body: JSON.stringify({ error: data.error.message }),
      };
    }

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
    console.error("Server error:", err);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
