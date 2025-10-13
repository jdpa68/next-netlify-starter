// ===========================================
// netlify/functions/chat.js
// Step 11c — Knowledge Base Retrieval + Citations
// ===========================================

const { createClient } = require("@supabase/supabase-js");
const MODEL = "gpt-4o-mini";

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); }
  finally { clearTimeout(id); }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

    const apiKey = process.env.OPENAI_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
      return json200({ ok: false, error: "Missing environment variables." });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = JSON.parse(event.body || "{}");
    const message = (body.message || "").trim();
    const ctx = body.ctx || {};
    let sessionId = body.sessionId || null;

    if (!message) return json200({ ok: false, error: "Missing message." });

    // --- Step 1: Call knowledge-search for evidence ---
    const prefArea = ctx.pref_area || ctx.prefArea || null;
    const kbRes = await fetchWithTimeout(`${process.env.URL || ""}/.netlify/functions/knowledge-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: message, pref_area: prefArea, limit: 5 })
    }, 15000).then(r => r.json()).catch(() => ({ ok: false }));

    const evidence = Array.isArray(kbRes?.results) ? kbRes.results.slice(0, 5) : [];

    // Build readable evidence snippet for context
    let evidenceText = "";
    if (evidence.length > 0) {
      const formatted = evidence.map((r, i) => `${i + 1}. ${r.title || "Untitled"} — ${r.summary || ""}`).join("\n");
      evidenceText = `\nRelevant knowledge base entries:\n${formatted}\n\nUse these for factual grounding and cite them naturally in your answer.`;
    } else {
      evidenceText = "\n(No direct knowledge base entries found; answer based on general higher-ed best practices.)";
    }

    // --- Persona ---
    const persona = `
You are Lancelot, the higher-education consultant built by PeerQuest.
Use a calm, data-driven tone.
If evidence from the Knowledge Base is available, summarize key points and cite titles naturally (e.g., “According to IPEDS Benchmark Trends…”).
Keep answers ≤150 words, offer 2–3 actionable ideas + a next step.
`;

    // --- System context ---
    const contextLines = [
      ctx.firstName ? `User: ${ctx.firstName}` : null,
      ctx.institutionName ? `Institution: ${ctx.institutionName}` : null,
      ctx.org_type ? `Org type: ${ctx.org_type}` : null
    ].filter(Boolean);
    const sessionContext = contextLines.length ? `Session context → ${contextLines.join(" · ")}` : "";

    // --- Step 2: Main model call ---
    let replyText = "";
    try {
      const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: persona.trim() },
            { role: "system", content: sessionContext },
            { role: "system", content: evidenceText },
            { role: "user", content: message }
          ],
          temperature: 0.4,
          max_tokens: 600
        })
      }, 25000);

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      replyText = data?.choices?.[0]?.message?.content?.trim() || "No reply.";
    } catch (err) {
      console.error("OpenAI call failed:", err);
      replyText = "I hit a temporary issue reaching the model. Please try again.";
    }

    // --- Step 3: Save assistant reply (optional logging) ---
    try {
      if (sessionId) {
        await supabase.from("chat_messages").insert({
          session_id: sessionId,
          role: "assistant",
          content: replyText
        });
      }
    } catch (e) {
      console.warn("logging skipped:", e.message);
    }

    // --- Step 4: Return reply + citations ---
    const citations = evidence.map((r) => ({
      title: r.title,
      source_url: r.source_url
    }));

    return json200({ ok: true, reply: replyText, citations, sessionId });
  } catch (err) {
    console.error("chat handler error:", err);
    return json200({ ok: false, error: "Server error." });
  }
};

// --- Helper ---
function json200(payload) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  };
}
