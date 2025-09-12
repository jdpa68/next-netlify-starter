// netlify/functions/chat.js
// Lancelot — always ask name on first user message; remember name for session.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// warm-instance session memory
const sessions = new Map();

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => {
        const i = c.indexOf("=");
        return [decodeURIComponent(c.slice(0, i)), decodeURIComponent(c.slice(i + 1))];
      })
  );
}
function newSessionId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function extractName(text = "") {
  if (!text) return null;
  const patterns = [
    /\bmy name is\s+([A-Z][a-zA-Z'.\- ]{1,40})\b/i,
    /\bi am\s+([A-Z][a-zA-Z'.\- ]{1,40})\b/i,
    /\bi'm\s+([A-Z][a-zA-Z'.\- ]{1,40})\b/i,
    /\bthis is\s+([A-Z][a-zA-Z'.\- ]{1,40})\b/i,
    /^([A-Z][a-zA-Z'.\- ]{1,40})\s+here\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) return m[1].replace(/\b(Mr|Ms|Mrs|Dr|Prof)\.?\s*/i, "").trim();
  }
  if (/^[A-Z][a-zA-Z'.\-]{1,40}$/.test(text.trim())) return text.trim();
  return null;
}

async function callOpenAI({ systemPrompt, messages }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, text: "Server missing OPENAI_API_KEY." };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    return { ok: false, text: `Upstream error: ${res.status} ${res.statusText} ${err}` };
  }
  const data = await res.json();
  return { ok: true, text: data?.choices?.[0]?.message?.content || "No response from model." };
}

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

    // session
    const cookies = parseCookies(event.headers.cookie || event.headers.Cookie || "");
    let sid = cookies.lancelot_sid;
    if (!sid) {
      sid = newSessionId();
      setCookie = `lancelot_sid=${encodeURIComponent(sid)}; Path=/; Max-Age=86400; SameSite=Lax`;
    }
    if (!sessions.has(sid)) sessions.set(sid, { name: null, sawFirstUser: false });

    const session = sessions.get(sid);

    // If UI hasn't sent any messages yet, send greeting that asks for name
    if (userMessages.length === 0) {
      const greet = "Hello! How may I assist you? May I please have your name?";
      const payload = JSON.stringify({ reply: greet, message: greet, text: greet, content: greet });
      return {
        statusCode: 200,
        headers: { ...CORS, ...(setCookie ? { "Set-Cookie": setCookie } : {}) },
        body: payload,
      };
    }

    // FIRST user message handling: always try to collect a name
    if (!session.sawFirstUser) {
      session.sawFirstUser = true;
      const maybeName = extractName(lastUserText);
      if (maybeName) {
        session.name = maybeName;
        sessions.set(sid, session);
        // proceed to model immediately with the user's question
      } else {
        // ask for name and stop here (no model call yet)
        const ask = "Hello! How may I assist you? May I please have your name?";
        const payload = JSON.stringify({ reply: ask, message: ask, text: ask, content: ask });
        return {
          statusCode: 200,
          headers: { ...CORS, ...(setCookie ? { "Set-Cookie": setCookie } : {}) },
          body: payload,
        };
      }
    } else if (!session.name) {
      // Not first message, but see if they just provided a name now
      const maybeName = extractName(lastUserText);
      if (maybeName) {
        session.name = maybeName;
        sessions.set(sid, session);
        const ack = `Nice to meet you, ${maybeName}! How may I assist you today?`;
        const payload = JSON.stringify({ reply: ack, message: ack, text: ack, content: ack });
        return {
          statusCode: 200,
          headers: { ...CORS, ...(setCookie ? { "Set-Cookie": setCookie } : {}) },
          body: payload,
        };
      }
    }

    const displayName = session.name || null;
    const systemPrompt = [
      "You are Lancelot, a friendly higher-ed strategy copilot.",
      "Speak like a thoughtful consultant and teammate—concise, warm, and practical.",
      "Ask a smart follow-up when the goal is unclear; avoid generic boilerplate.",
      displayName ? `The user's preferred name is "${displayName}". Use it naturally.` : "If you don't know the user's name, don't ask again unless invited.",
    ].join(" ");

    const { ok, text } = await callOpenAI({ systemPrompt, messages: userMessages });
    const out = ok ? text : `Error: ${text}`;

    return {
      statusCode: ok ? 200 : 500,
      headers: { ...CORS, ...(setCookie ? { "Set-Cookie": setCookie } : {}) },
      body: JSON.stringify({
        reply: out,
        message: out,
        text: out,
        content: out,
        nameRemembered: displayName,
      }),
    };
  } catch (err) {
    const msg = `Server error: ${err?.message || err}`;
    return { statusCode: 500, headers: { ...CORS, ...(setCookie ? { "Set-Cookie": setCookie } : {}) }, body: JSON.stringify({ error: msg }) };
  }
}
