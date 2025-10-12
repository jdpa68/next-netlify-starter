// netlify/functions/chat.js
// Step 10c-3: Session recall — returns/accepts sessionId, logs messages, keeps persona

const { createClient } = require("@supabase/supabase-js");
const MODEL = "gpt-4o-mini";

// helper: fetch with timeout
async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); } finally { clearTimeout(id); }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
      return { statusCode: 500, body: JSON.stringify({ error: "Missing environment variables." }) };
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = JSON.parse(event.body || "{}");
    const message = (body.message || "").trim();
    const ctx = body.ctx || {};
    let sessionId = body.sessionId || null;

    if (!message) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing message" }) };
    }

    // persona
    const persona = `
You are **Lancelot**, the higher-education consultant built by PeerQuest.
Your mission: help campus leaders, faculty, and staff make better decisions about enrollment, retention, finance, and academic quality.

Tone:
• Empathetic, steady, professional — never salesy.
• Write as if you are a trusted peer in higher education.
• Blend data-driven reasoning with coaching warmth.
• Keep replies under ~150 words unless asked for detail.

Voice:
• Start with the user’s name if available.
• Acknowledge their institution context.
• Offer 2–3 actionable insights, then a helpful next step.
• Cite or reference your Knowledge Base when possible (“According to national benchmarks…”).

Compliance:
• Never include personal student data.
• Flag uncertainty honestly and suggest where to verify.
`;

    const contextLines = [
      ctx.firstName ? `User: ${ctx.firstName}` : null,
      ctx.institutionName ? `Institution: ${ctx.institutionName}` : null,
      ctx.inst_url ? `.edu: ${ctx.inst_url}` : null,
      ctx.unit_id ? `IPEDS ID: ${ctx.unit_id}` : null
    ].filter(Boolean);
    const sessionContext = contextLines.length
      ? `Session context → ${contextLines.join(" · ")}`
      : "Session context → General (no school set)";

    // 1) Ensure we have a session
    if (!sessionId) {
      const { data: newSession, error: insErr } = await supabase
        .from("chat_sessions")
        .insert({
          user_name: ctx.firstName || null,
          institution: ctx.institutionName || null,
          inst_url: ctx.inst_url || null,
          unit_id: ctx.unit_id || null
        })
        .select()
        .single();
      if (insErr) console.error("session insert error:", insErr);
      sessionId = newSession?.id || null;
    } else {
      // touch last_active
      const { error: updErr } = await supabase
        .from("chat_sessions")
        .update({ last_active: new Date().toISOString() })
        .eq("id", sessionId);
      if (updErr) console.error("session update error:", updErr);
    }

    // 2) Save user's message
    if (sessionId) {
      const { error: msgErr } = await supabase.from("chat_messages").insert({
        session_id: sessionId,
        role: "user",
        content: message
      });
      if (msgErr) console.error("user msg insert error:", msgErr);
    }

    // 3) Load prior messages for recall (last 8 turns)
    let history = [];
    if (sessionId) {
      const { data: prior, error: histErr } = await supabase
        .from("chat_messages")
        .select("role, content")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true })
        .limit(16); // 8 user + 8 assistant
      if (histErr) console.error("history select error:", histErr);
      history = (prior || []).map((m) => ({ role: m.role, content: m.content }));
    }

    // 4) Call OpenAI
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
            ...history,
            { role: "user", content: message }
          ],
          temperature: 0.4,
          max_tokens: 600
        })
      }, 25000);

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`OpenAI ${res.status}: ${txt.slice(0, 200)}`);
      }

      const data = await res.json();
      replyText = data?.choices?.[0]?.message?.content?.trim() ||
        "I couldn’t generate a response just now.";
    } catch (err) {
      console.error("OpenAI error:", err);
      replyText = fallbackReply(ctx, message, "temporary model issue");
    }

    // 5) Save assistant's reply
    if (sessionId) {
      const { error: asstErr } = await supabase.from("chat_messages").insert({
        session_id: sessionId,
        role: "assistant",
        content: replyText
      });
      if (asstErr) console.error("assistant msg insert error:", asstErr);
    }

    // 6) Return both reply and sessionId (for reuse by client)
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        reply: replyText,
        citations: [],
        sessionId
      })
    };
  } catch (err) {
    console.error("chat handler error:", err);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        reply: "I hit an unexpected issue just now, but I’m still here. Ask again in a moment.",
        citations: [],
        sessionId: null
      })
    };
  }
};

// helpers
function fallbackReply(ctx, message, reason) {
  const greet = ctx.firstName
    ? (ctx.institutionName ? `Hi ${ctx.firstName} — ${ctx.institutionName} is set.` : `Hi ${ctx.firstName}.`)
    : "Hello there.";
  const note = reason ? `\n\n(Quick fallback because: ${reason}.)` : "";
  const next = "\n\nNext step: ask me another question or share a document you’d like help summarizing.";
  return `${greet}\n\nI received your message: “${message}”.${note}${next}`;
}
