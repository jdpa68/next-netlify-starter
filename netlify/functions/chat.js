// netlify/functions/chat.js
const { createClient } = require("@supabase/supabase-js");
const MODEL = "gpt-4o-mini";
async function fetchWithTimeout(u,o={},ms=20000){const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);try{return await fetch(u,{...o,signal:c.signal});}finally{clearTimeout(t);}}
function ok(p){return{statusCode:200,headers:{"Content-Type":"application/json"},body:JSON.stringify({ok:true,...p})};}

exports.handler=async(event)=>{
  try{
    if(event.httpMethod!=="POST")return{statusCode:405,body:"Method Not Allowed"};
    const apiKey=process.env.OPENAI_API_KEY, url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!apiKey||!url||!key){const m="Missing env vars.";return ok({reply:m,text:m,citations:[],sessionId:null});}
    const body=JSON.parse(event.body||"{}"); const message=(body.message||"").trim();
    if(!message)return ok({reply:"Please share your question.",text:"Please share your question.",citations:[],sessionId:null});

    // HARD-CODE base to your live site (works): 
    const base="https://pqlancelot.netlify.app";

    // --- KB via GET probe (known good): force q=dissertation for test ---
    const probe = await fetchWithTimeout(`${base}/.netlify/functions/knowledge-search?q=dissertation`,{method:"GET"},15000).then(r=>r.json()).catch(()=>null);
    const hits = Array.isArray(probe?.results)? probe.results.length : 0;
    const previews = (probe?.results||[]).slice(0,3).map(x=>`• ${x.title}`).join("\n");

    // Short, clear reply so we can see the count
    const reply = hits>0
      ? `Found ${hits} dissertations in your Knowledge Base:\n${previews}\n\nKB hits: ${hits}`
      : `I couldn't read any KB items yet.\n\nKB hits: ${hits}`;

    return ok({reply, text:reply, citations:[], sessionId:null});
  }catch(e){
    return ok({reply:"Unexpected error in chat function.",text:"Unexpected error in chat function.",citations:[],sessionId:null});
  }
};
