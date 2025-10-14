// netlify/functions/chat.js
const { createClient } = require("@supabase/supabase-js");
const MODEL = "gpt-4o-mini";

async function fetchWithTimeout(url, options={}, ms=20000){
  const c=new AbortController(); const t=setTimeout(()=>c.abort(),ms);
  try{ return await fetch(url,{...options,signal:c.signal}); } finally{ clearTimeout(t); }
}
function ok(p){ return {statusCode:200,headers:{ "Content-Type":"application/json"},body:JSON.stringify({ok:true,...p})}; }

exports.handler = async (event)=>{
  try{
    if(event.httpMethod!=="POST") return {statusCode:405,body:"Method Not Allowed"};

    const apiKey=process.env.OPENAI_API_KEY;
    const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey =process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!apiKey||!supabaseUrl||!serviceKey){
      const msg="Missing env vars (OPENAI_API_KEY / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).";
      return ok({reply:msg,text:msg,citations:[],sessionId:null});
    }
    const body=JSON.parse(event.body||"{}");
    const message=(body.message||"").trim();
    if(!message) return ok({reply:"Please share your question.",text:"Please share your question.",citations:[],sessionId:null});

    // HARD-CODE your site origin here:
    const base = "https://pqlancelot.netlify.app";

    // --- KB search ---
    let kbResults=[];
    try{
      const r = await fetchWithTimeout(`${base}/.netlify/functions/knowledge-search`,{
        method:"POST",
        headers:{ "Content-Type":"application/json"},
        body:JSON.stringify({ q: message, limit: 10 })
      },15000);
      const j = await r.json();
      kbResults = Array.isArray(j?.results)? j.results : [];
    }catch{ kbResults=[]; }

    const KB_HITS = kbResults.length;
    const citations = kbResults.map(r=>({title:r.title, source_url:r.source_url}));
    const evidenceText = KB_HITS
      ? kbResults.map((r,i)=>`${i+1}. ${r.title||"Untitled"} — ${r.summary||""}`).join("\n")
      : "(No KB matches returned; avoid guessing and ask one clarifying question.)";

    const persona = `
You are Lancelot, a higher-ed consultant. ≤130 words, practical, 2–3 actions + "Next step:".
Ground advice in the KB snippets when present.
`;

    // Model
    let reply="";
    try{
      const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions",{
        method:"POST",
        headers:{ "Authorization":`Bearer ${apiKey}`,"Content-Type":"application/json"},
        body:JSON.stringify({
          model:MODEL, temperature:0.3,
          messages:[
            {role:"system",content:persona},
            {role:"system",content:`Knowledge Base Insights:\n${evidenceText}`},
            {role:"user",content:message}
          ]
        })
      },25000);
      const data = await res.json();
      reply = data?.choices?.[0]?.message?.content?.trim() || "I couldn't form a reply just now.";
    }catch{ reply="I had trouble generating a response just now."; }

    const finalReply = reply + `\n\nKB hits: ${KB_HITS}`;
    return ok({ reply: finalReply, text: finalReply, citations, sessionId:null });
  }catch{
    return ok({reply:"Unexpected error in chat function.",text:"Unexpected error in chat function.",citations:[],sessionId:null});
  }
};
