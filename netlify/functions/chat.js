// netlify/functions/chat.js
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Model: you can switch later to "gpt-4.1-mini" or similar
const MODEL = process.env.LANCELOT_MODEL || "gpt-4o-mini";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper: get top KB snippets for a user question
async function kbSearch(query, limit = 5) {
  if (!query || query.trim().length < 2) return [];
  const { data, error } = await supabase.rpc("kb_search", { q: query, lim: limit });
  if (error) {
    console.error("kb_search error:", error);
    return [];
  }
  return data || [];
}

// Build a friendly, bonded system prompt that uses KB context
function buildSystemPrompt(name, kbSnippets = []) {
  const bondedIntro =
    `You are Lancelot — a friendly, expert higher-ed advisor and partner. ` +
    `Be concise, concrete, and collaborative. Avoid saying obvious things like "this is important." ` +
    `Bond early: ask for their goal and use their name if known. Motto: "He who bonds, wins."`;

  const starter = `When the conversation begins, say: "Hello! I’m Lancelot. What projects can I assist you with today? May I please have your name?"`;

  const kbBlock = kbSnippets.length
    ? `\nRelevant knowledge base snippets (use when helpful; do not copy verbatim):\n` +
      kbSnippets
        .map((s, i) => `(${i + 1}) [${s.domain}] ${s.title}\n${s.content}`)
        .join("\n\n")
    : `\n(No KB snippets matched; rely on your expertise and ask 1–2 clarifying questions before proposing a plan.)`;

  const etiquette =
    `Style: consultant, teammate, and friend. If the user only gives their name, ask "How may I assist you today?" ` +
    `If the user provides a name and a question, proceed without re-asking for name. ` +
    `Offer a brief 2–4 bullet action plan when appropriate.`;

  return `${bondedIntro}\n${starter}\n${etiquette}\n${kbBlock}`;
}

// OpenAI call
async function askOpenAI(messages) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.4,
      messages
    })
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`OpenAI error ${resp.status}: ${t}`);
  }

  const data = await resp.json();
  const answer = data?.choices?.[0]?.message?.content ?? "";
  return answer;
}

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const body = JSON.parse(event.body || "{}");
    const userText = (body?.message || "").toString().trim();
    const userName = (body?.userName || "").toString().trim(); // optional if you pass it from UI

    // 1) Pull top KB snippets based on the latest user question
    const kbSnippets = await kbSearch(userText, 5);

    // 2) Build system prompt with snippets
    const systemPrompt = buildSystemPrompt(userName, kbSnippets);

    // 3) Build messages (include short conversation context if your UI sends it)
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText || "Say hello." }
    ];

    // 4) Ask OpenAI
    const answer = await askOpenAI(messages);

    // 5) Return answer + (optional) snippets back to UI for transparency
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        reply: answer,
        usedKB: kbSnippets.map(s => ({ title: s.title, domain: s.domain }))
      })
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
}

export const config = { path: "/.netlify/functions/chat" };
