// netlify/functions/chat.js
// Lancelot — session-name memory + friendly greet

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// Tiny in-memory session store (survives warm function invocations)
const sessions = new Map();

// --- helpers ---------------------------------------------------------------

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => {
        const idx = c.indexOf("=");
        return [decodeURIComponent(c.slice(0, idx)), decodeURIComponent(c.slice(idx + 1))];
      })
  );
}

function newSessionId() {
  // simple random id
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function extractName(text = "") {
  if (!text) return null;

  // very forgiving patterns
  const patterns = [
    /\bmy name is\s+([A-Z][a-zA-Z'.\- ]{1,40})\b/i,
    /\bi am\s+([A-Z][a-zA-Z'.\- ]{1,40})\b/i,
    /\bi'm\s+([A-Z][a-zA-Z'.\- ]{1,40})\b/i,
    /\bthis is\s+([A-Z][a-zA-Z'.\- ]{1,40})\b/i,
    /^([A-Z][a-zA-Z'.\- ]{1,40})\s+here\b/i,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) {
      // trim titles if present
      return m[1].replace(/\b(Mr\.?|Ms\.?|Mrs\.?|Dr\.?|Prof\.?)\b\.?\s*/i, "").trim();
    }
  }
  // one-word name fallback if user just sent a single token like "Sam"
  if (/^[A-Z][a-zA-Z'.\-]{1,40}$/.test(text.trim())) return text.trim();

  return null;
}

// --- OpenAI call -----------------------------------------------------------

async function callOpenAI({ systemPrompt, messages }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, text: "Server is missing OPENAI_API_KEY." };
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    return { ok: false, text: `Upstream error: ${res.status} ${res.statusText} ${err}` };
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || "No response from model.";
  return { ok: true, text };
}

// --- Netlify handler -------------------------------------------------------

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let setCookie = null;
  try {
    const body = JSON.parse(event.body || "{}");
    const userMessages = Array.isArray(body.messages) ? body.messages : [];
    const lastUserText = userMessages.filter(m => m?.role === "user").slice(-1)[0]?.content || "";

    // --- session: get or create id from cookie ----------------------------
    const cookies = parseCookies(event.headers.cookie || event.headers.Cookie || "");
    let sid = cookies.lancelot_sid;
    if (!sid) {
      sid = newSessionId();
      setCookie = `lancelot_sid=${encodeURIComponent(sid)}; Path=/; Max-Age=86400; SameSite=Lax`;
    }
    if (!sessions.has(sid)) sessions.set(sid, { name: null });

    const session = sessions.get(sid);

    // First-time greeting if there are no user messages yet
    if (userMessages.length === 0) {
      const greeting =
        "Hello! How may I assist you? May I please have your name?";
      const payload = JSON.stringify({ reply: greeting, message: greeting, text: greeting, content: greeting });
      return { statusCode: 200, headers: { ...CORS, ...(setCookie ? { "Set-Cookie": setCookie } : {}) }, body: payload };
    }

    // Try to learn name from this message if we don't have it yet
    if (!session.name) {
      const maybe = extractName(lastUserText);
      if (maybe) {
        session.name = maybe;
        sessions.set(sid, session);
      }
    }

    // If we still don't have a name AND the user *only* gave a name-like phrase,
    // ask them what they need.
    if (!session.name) {
      const maybe = extractName(lastUserText);
      if (maybe) {
        const ask =
          `Nice to meet you, ${maybe}! How may I assist you today?`;
        const payload = JSON.stringify({ reply: ask, message: ask, text: ask, content: ask });
        return {
          statusCode: 200,
          headers: { ...CORS, ...(setCookie ? { "Set-Cookie": setCookie } : {}) },
          body: payload,
        };
      }
    }

    // Build a friendly system prompt that uses the stored name if present
    const displayName = session.name ? session.name : null;
    const systemPrompt = [
      "You are Lancelot, a friendly higher-ed strategy copilot.",
      "Speak like a thoughtful consultant and teammate, concise but warm.",
      "Always tailor advice to the user's goal. Ask a smart follow-up if the goal is unclear.",
      displayName ? `The user's preferred name is "${displayName}". Use it naturally.` : "If the user hasn't given a name, you don't need to ask again.",
      "Avoid fluff and generic checklists; be specific and helpful.",
    ].join(" ");

    // If we have a name, prepend a short acknowledgment once
    const prefixedMessages =
      displayName && !/^\s*(hi|hello)\b/i.test(lastUserText)
        ? [{ role: "system", content: `When appropriate, acknowledge ${displayName} briefly in your replies.` }, ...userMessages]
        : userMessages;

    const { ok, text } = await callOpenAI({ systemPrompt, messages: prefixedMessages });

    const out = ok ? text : `Error: ${text}`;
    return {
      statusCode: ok ? 200 : 500,
      headers: { ...CORS, ...(setCookie ? { "Set-Cookie": setCookie } : {}) },
      body: JSON.stringify({
        reply: out,
        message: out,
        text: out,
        content: out,
        nameRemembered: session.name || null,
      }),
    };
  } catch (err) {
    const msg = `Server error: ${err?.message || err}`;
    return { statusCode: 500, headers: { ...CORS, ...(setCookie ? { "Set-Cookie": setCookie } : {}) }, body: JSON.stringify({ error: msg }) };
  }
}
