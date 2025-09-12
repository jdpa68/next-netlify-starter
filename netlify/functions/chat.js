// netlify/functions/chat.js
export async function handler(event) {
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  if (!OPENAI_API_KEY) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Missing OPENAI_API_KEY" }) };

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}
  const name = (body.name || "").toString().trim();
  const convo = Array.isArray(body.messages) ? body.messages : [];
  const lastUser = [...convo].reverse().find(m => m.role === "user")?.content || "";

  // --- 2) intent routing: question vs project (simple heuristic) ---
  const isProject = lastUser.length > 180 || /\b(feasibility|accreditation|budget|timeline|deliverable|proposal|implementation|roadmap|plan)\b/i.test(lastUser);
  const intent = isProject ? "project" : "question";

  // --- 3) Supabase KB lookup (optional; read-only) ---
  let kbSnippets = [];
  let kbHits = 0;
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      // naive vector: text search via PostgREST; you could upgrade to pg_trgm later
      const q = encodeURIComponent(lastUser.slice(0, 200));
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/knowledge_base?select=domain,title,content,tags&or=(title.ilike.*${q}*,content.ilike.*${q}*,tags.ilike.*${q}*)&limit=3`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
      });
      if (resp.ok) {
        kbSnippets = await resp.json();
        kbHits = kbSnippets.length || 0;
      }
    } catch (e) { /* fail soft */ }
  }

  const stylePreset = `
You are Lancelot, a friendly, high-signal higher-ed advisor. Be a peer consultant for academics.
- Start by ANSWERING the user's latest message directly. Do not open with “How can I help?”
- Use the user's name naturally when known (name: "${name || ""}").
- Keep replies concise, skimmable, and practical. No fluff about importance.
- Ask at most 1–3 targeted follow-ups when needed.
`.trim();

  // Build a compact context that includes any KB finds
  const kbContext = kbSnippets.map((r, i) => `(${i+1}) [${r.domain}] ${r.title}: ${r.content}`).join("\n");

  const messages = [
    { role: "system", content: stylePreset },
    ...(kbContext ? [{ role: "system", content: `If helpful, you may draw on these internal notes:\n${kbContext}` }] : []),
    ...convo.map(m => ({ role: m.role, content: m.content })),
    { role: "system", content: `Respond directly to this user message:\n"""${lastUser}"""` },
    ...(intent === "project"
      ? [{ role: "system", content: "If this reads like a project, briefly confirm the objective, timeline, and constraints, then outline the first 3–5 steps." }]
      : [])
  ];

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.35, messages }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return { statusCode: resp.status, headers: CORS, body: JSON.stringify({ error: txt.slice(0, 800) }) };
    }

    const data = await resp.json();
    const reply = data?.choices?.[0]?.message?.content || "OK.";
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ reply, intent, kbHits }) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: String(e).slice(0, 800) }) };
  }
}
