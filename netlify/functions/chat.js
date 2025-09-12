// /netlify/functions/chat.js  (ESM)

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

// Choose the model (can override in Netlify env with OPENAI_MODEL)
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

// Small helper: fetch JSON safely
async function postJSON(url, headers, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

export async function handler(event) {
  // Handle preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Use POST" })
    };
  }

  try {
    const { messages = [], userName = "", q = "", tags = [] } = JSON.parse(event.body || "{}");

    // ---- Pull context from Supabase (via REST; no extra packages needed) ----
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

    let kbSnippets = [];
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      // Build a query: optional tag filter and/or text search on title/content
      // REST docs: /rest/v1/<table>?select=*&column=ilike.*term*
      const params = new URLSearchParams();
      params.set("select", "title,content,tags");

      const filters = [];
      if (q && q.trim()) {
        // search title or content using ilike
        filters.push(`or=(title.ilike.*${encodeURIComponent(q)}*,content.ilike.*${encodeURIComponent(q)}*)`);
      }
      if (Array.isArray(tags) && tags.length > 0) {
        // tags is a simple text column; match any tag text fragment
        // You can change this to a stricter policy later if you convert to text[]
        const tagFilter = tags
          .map(t => `tags.ilike.*${encodeURIComponent(t)}*`)
          .join(",");
        filters.push(`or=(${tagFilter})`);
      }
      // limit results
      params.set("limit", "6");

      const url = `${SUPABASE_URL}/rest/v1/knowledge_base?${params.toString()}${filters.length ? `&${filters.join("&")}` : ""}`;

      const res = await fetch(url, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          Accept: "application/json"
        }
      });

      if (res.ok) {
        kbSnippets = await res.json();
      } else {
        // Don’t fail chat if KB lookup fails—just continue without it
        // const errText = await res.text();
        kbSnippets = [];
      }
    }

    // ---- Build the system prompt (tone + guardrails) ----
    const systemPrompt = `
You are "Lancelot", a friendly, sharp higher-education strategy partner.
Personality: warm, concise, collaborative; never condescending or gushy.
Bond first: learn the person's name and goal, then help them reach it.
Ask 1–3 focused questions if the goal isn't clear; otherwise move quickly to next actions, examples, and templates.
Use the user's name "${userName || "there"}" naturally once per answer.
Prefer checklists, short bullets, and concrete next steps.
If the question is a quick one-off, answer directly—no fishing for plans.
Only cite knowledge below if it's actually relevant; otherwise answer from general expertise.

Knowledge snippets (may be empty):
${kbSnippets.map((r, i) => `- [${i+1}] ${r.title}: ${r.content}`.slice(0, 1200)).join("\n")}
    `.trim();

    // ---- Prepare messages for OpenAI ----
    // Expecting messages like [{role:"user", content:"..."}, ...]
    const openAiMessages = [
      { role: "system", content: systemPrompt },
      ...messages
    ];

    // ---- Call OpenAI ----
    const openaiRes = await postJSON(
      "https://api.openai.com/v1/chat/completions",
      { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      {
        model: MODEL,
        temperature: 0.3,
        messages: openAiMessages
      }
    );

    const reply =
      openaiRes.choices?.[0]?.message?.content ??
      "I'm here and ready—could you please try that again?";

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      body: JSON.stringify({ reply })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message || "Server error" })
    };
  }
}
