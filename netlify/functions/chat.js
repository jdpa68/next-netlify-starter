// netlify/functions/chat.js
// POSTs to knowledge-search, injects KB snippets, returns reply + citations + KB count
const { createClient } = require("@supabase/supabase-js");
const MODEL = "gpt-4o-mini";

async function fetchWithTimeout(url, options={}, ms=20000){
  const c=new AbortController(); const t=setTimeout(()=>c.abort(),ms);
  try{ return await fetch(url,{...options,signal:c.signal}); } finally{ clearTimeout(t); }
}
function ok(p){ return { statusCode:200, headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ ok:true, ...p }) }; }

exports.handler = async (event) => {
  try{
    if (event.httpMethod !== "POST") return { statusCode:405, body:"Method Not Allowed" };

    const apiKey = process.env.OPENAI_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!apiKey || !supabaseUrl || !serviceKey){
      const msg = "Missing environment variables.";
      return ok({ reply: msg, text: msg, citations: [], sessionId: null });
    }

    const body = JSON.parse(event.body || "{}");
    const message = String(body.message || "").trim();
    const ctx = body.ctx || {};
    if (!message) return ok({ reply: "Please share your question.", text: "Please share your question.", citations: [], sessionId: null });

    const host  = event.headers["x-forwarded-host"]  || event.headers.host;
    const proto = event.headers["x-forwarded-proto"] || "https";
    const base  = `${proto}://${host}`;

    // ---- KB search (POST) ----
    let kbResults = [];
    try{
      const res = await fetchWithTimeout(`${base}/.netlify/functions/knowledge-search`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ q: message, limit: 8 })
      }, 15000);
      const j = await res.json().catch(()=>null);
      kbResults = Array.isArray(j?.results) ? j.results : [];
    }catch{ kbResults = []; }

    const KB_HITS = kbResults.length;
    const citations = kbResults.map(r => ({ title: r.title, source_url: r.source_url }));
    const evidenceText = KB_HITS
      ? kbResults.map((r,i)=>`${i+1}. ${r.title || "Untitled"} — ${r.summary || ""}`).join("\n")
      : "(No KB matches returned; avoid guessing and ask one clarifying question.)";

    const who = ctx.firstName ? `Hi ${ctx.firstName}.` : "Hi there.";
    const persona = `
You are Lancelot, a higher-ed consultant.
Be brief (≤130 words), practical, and specific.
Give 2–3 actions and a "Next step:" line.
If KB snippets are present, ground advice in them.
Plain text only.
`;

    let reply = "";
    try{
      const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
        method:"POST",
        headers:{ "Authorization":`Bearer ${apiKey}`, "Content-Type":"application/json" },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.3,
          messages: [
            { role:"system", content: persona },
            { role:"system", content: `Knowledge Base Insights:\n${evidenceText}` },
            { role:"user",   content: `${who} ${message}` }
          ]
        })
      }, 25000);
      const data = await res.json().catch(()=>null);
      reply = data?.choices?.[0]?.message?.content?.trim() || "I couldn’t form a reply just now.";
    }catch{
      reply = "I had trouble generating a response just now.";
    }

    // --- Add debug line for KB hit count ---
    const finalReply = `${reply}\n\n(KB hits: ${KB_HITS})`;

    return ok({ reply: finalReply, text: finalReply, citations, sessionId: null });
  }catch{
    const msg = "Unexpected error in chat function.";
    return ok({ reply: msg, text: msg, citations: [], sessionId: null });
  }
};
