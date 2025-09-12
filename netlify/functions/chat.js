// /netlify/functions/chat.js
// Lancelot — greeting + name handling + Supabase context + OpenAI call (with debug errors)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// env
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

// ---------- helpers ----------
function getUserText(messages) {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return String(messages[i].content ?? "");
  }
  return "";
}

function extractName(text = "") {
  const m1 = text.match(/\bmy name is\s+([A-Za-z][\w'-]*)/i);
  if (m1) return m1[1];
  const m2 = text.match(/\b(i am|i'm)\s+([A-Za-z][\w'-]*)/i);
  if (m2) return m2[2];
  const m3 = text.trim().match(/^([A-Za-z][\w'-]*)[.!?]?\s*$/);
  return m3 ? m3[1] : null;
}

async function fetchKBMatches(query, limit = 5) {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
    const q = (query || "").trim();
    if (!q) return [];
    const star = `*${q.replace(/\s+/g, " ")}*`;
    const enc = encodeURIComponent(star);
    const url =
      `${SUPABASE_URL}/rest/v1/knowledge_base` +
      `?select=title,content,tags` +
      `&or=(title.ilike.${enc},content.ilike.${enc},tags.ilike.${enc})` +
      `&order=created_at.desc&limit=${limit}`;

    const r = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Accept: "application/json",
      },
    });
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function kbBlock(rows) {
  if (!rows?.length) return "No internal notes matched.";
  return rows
    .map((r, i) => {
      const title = r.title || `Doc ${i + 1}`;
      const tags = r.tags ? ` [${r.tags}]` : "";
      const body = (r.content || "").slice(0, 900);
      return `• ${title}${tags}\n${body}`;
    })
    .join("\n\n");
}

function systemPrompt(name = "there") {
  return [
    `You are Lancelot — a friendly, senior higher-ed advisor and teammate.`,
    `Bond first. Use the user's name ("${name}") when known.`,
    `Avoid hype or canned praise. Be concise, practical, and consultative.`,
    `Ask the "question behind the question" before prescribing plans.`,
    `He who bonds, wins.`,
  ].join(" ");
}

// ---------- handler ----------
export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }

  try {
    const { messages = [] } = JSON.parse(event.body || "{}");
    const userText = getUserText(messages).trim();

    // 1) First contact → ask for name
    if (!messages.length || !userText) {
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({
          reply: "Hello! How may I assist you? May I please have your name?",
        }),
      };
    }

    // 2) If they only gave a name → acknowledge and ask how to help
    const name = extractName(userText);
    const looksLikeOnlyName =
      !!name &&
      (userText.length <= name.length + 15 ||
        /^my name is\s+/i.test(userText) ||
        /^(i am|i'm)\s+/i.test(userText));

    if (looksLikeOnlyName) {
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({
          reply: `Thank you, ${name}. How may I assist you today?`,
        }),
      };
    }

    // 3) Pull lightweight context from your Supabase KB (optional)
    const kbRows = await fetchKBMatches(userText, 5);

    // 4) Call OpenAI
    if (!OPENAI_API_KEY) {
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({
          reply:
            "Server is missing OPENAI_API_KEY. Please add it in Netlify → Environment variables.",
        }),
      };
    }

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt(name || "there") },
          { role: "system", content: "Internal notes:\n" + kbBlock(kbRows) },
          ...messages,
        ],
      }),
    });

    if (!openaiRes.ok) {
      const errTxt = await openaiRes.text().catch(() => "");
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({
          reply: `OpenAI error: ${openaiRes.status} ${openaiRes.statusText}\n${errTxt}`,
        }),
      };
    }

    const data = await openaiRes.json();
    const reply =
      data?.choices?.[0]?.message?.content?.trim() ||
      "I’m here and listening—could you try that once more?";

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ reply }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        reply: `Server error: ${err?.message || err}`,
      }),
    };
  }
}
