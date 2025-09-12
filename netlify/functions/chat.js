// netlify/functions/chat.js  — Step 4: Supabase-powered answers

// CORS for the browser widget
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// --- Helper: tiny keyword picker (safe + dependency-free) ---
function topKeywords(str, max = 3) {
  if (!str) return [];
  const stop = new Set([
    "the","a","an","and","or","to","of","for","with","in","on","at","by","is","are","was","were",
    "i","we","you","they","it","this","that","from","as","about","into","over","be","can","do"
  ]);
  return Array.from(
    (str.toLowerCase().match(/[a-z0-9]+/g) || [])
      .filter(w => !stop.has(w) && w.length > 2)
      .reduce((m,w)=>m.set(w,(m.get(w)||0)+1), new Map())
  )
  .sort((a,b)=>b[1]-a[1])
  .slice(0, max)
  .map(([w])=>w);
}

export async function handler(event) {
  try {
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 200, headers: CORS, body: "" };
    }

    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    const {
      message = "",
      name = ""
    } = JSON.parse(event.body || "{}");

    // Env vars (already added in Netlify)
    const OPENAI_API_KEY     = process.env.OPENAI_API_KEY;
    const SUPABASE_URL       = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY  = process.env.SUPABASE_ANON_KEY;

    if (!OPENAI_API_KEY) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Missing OPENAI_API_KEY" }) };
    }
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Missing Supabase credentials" }) };
    }

    // --- 1) Search Supabase REST Data API (no external libs needed) ---
    const terms = topKeywords(message, 3);
    // Build a simple OR ilike filter; if no keywords yet, just pull a few recent rows
    let supaUrl = `${SUPABASE_URL}/rest/v1/knowledge_base?select=title,content,tags&limit=6`;
    if (terms.length) {
      const encoded = terms.map(t => `title.ilike.*${encodeURIComponent(t)}*,
content.ilike.*${encodeURIComponent(t)}*,
tags.ilike.*${encodeURIComponent(t)}*`).join(",");
      supaUrl += `&or=(${encoded})`;
    }

    const kbRes = await fetch(supaUrl, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    let kbItems = [];
    if (kbRes.ok) {
      kbItems = await kbRes.json();
    }

    const contextBlock = kbItems.length
      ? kbItems.map((r,i) => {
          const t = (r.title || "").trim();
          const c = (r.content || "").trim();
          const g = (r.tags || "").trim();
          return `#${i+1} Title: ${t}\nTags: ${g}\nNotes: ${c}`;
        }).join("\n\n")
      : "No direct matches found in the knowledge base for this query. Fall back to general expertise and ask a couple of clarifying questions before answering.";

    // --- 2) Compose the prompt with your tone & bonding rules ---
    const systemPrompt = `
You are Lancelot, a friendly, consultative higher-ed advisor. He who bonds, wins.
Tone: warm, concise, team-oriented. Never condescending or sycophantic.
Always:
- Greet by name if provided (use “${name || ""}” when available).
- Ask 1–2 sharp clarifying questions when the goal is ambiguous.
- Use the knowledge base context when relevant; cite concept names naturally (no URLs).
- If user only gave their name, politely ask how you can help.
- When asked for plans, provide a short actionable outline first, then offer deeper steps.
- Keep paragraphs compact for mobile.

Knowledge Base (summaries):
${contextBlock}
`.trim();

    // --- 3) If the user only gave their name, nudge for the task ---
    const userMsg = (name && message.trim().toLowerCase() === name.trim().toLowerCase())
      ? `My name is ${name}.`
      : message || (name ? `My name is ${name}.` : "Hello");

    // --- 4) Call OpenAI (Chat Completions) ---
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          // Light greeting/behavior rule to capture the name-on-first-turn behavior
          { role: "user", content: userMsg }
        ]
      })
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => "");
      return {
        statusCode: 502,
        headers: CORS,
        body: JSON.stringify({ error: "OpenAI error", detail: errText })
      };
    }

    const data = await aiRes.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || "I’m here—how can I help today?";

    // Return multiple keys (your UI reads any of these)
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        reply,
        message: reply,
        text: reply,
        content: reply
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: "Server error", detail: String(err) })
    };
  }
}
