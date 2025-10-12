// netlify/functions/chat.js
// Step 10d: Context Recall — adds ephemeral thread summary when history grows
// CommonJS + Supabase logging + Jenn-style persona + safe fallbacks

const { createClient } = require("@supabase/supabase-js");
const MODEL = "gpt-4o-mini";

// helper: fetch with timeout
async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); }
  finally { clearTimeout(id); }
}

// quick, lightweight intent guess (helps with focus)
function inferFocus(text = "") {
  const s = text.toLowerCase();
  const has = (...w) => w.some(x => s.includes(x));
  if (has("retention", "persist", "student success", "advis")) return "issue_student_success";
  if (has("accreditation", "rsi", "title iv", "compliance", "audit")) return "issue_compliance";
  if (has("pricing", "net tuition", "discount", "budget", "aid", "fafsa", "pell")) return "issue_cost_pricing";
  if (has("declin", "yield", "melt", "pipeline", "recruit", "inquiry", "enrollment")) return "issue_declining_enrollment";
  if (has("quality", "learning outcomes", "curriculum", "instruction", "qm", "udl")) return "issue_academic_quality";
  return "general";
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

    // --- Persona (Jenn-style) ---
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

    // Session context line
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

    // 3) Load prior messages for recall (up to 24 items)
    let history = [];
    let totalCount = 0;
    if (sessionId) {
      const { data: prior, error: histErr } = await supabase
        .from("chat_messages")
        .select("role, content")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
      if (histErr) console.error("history select error:", histErr);

      const items = prior || [];
      totalCount = items.length;

      // Keep last ~10 messages for direct context
      const tail = items.slice(-10).map(m => ({ role: m.role, content: m.content }));
      history = tail;

      // If thread is long, create a short summary of earlier turns
      if (items.length > 12) {
        const earlier = items.slice(0, -10).map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n");
        const summary = await summarizeThread(apiKey, earlier).catch(() => null);
        if (summary) {
          history = [
            { role: "system", content: `Thread summary:\n${summary}` },
            ...history
          ];
        }
      }
    }

    // lightweight focus (for future tuning; no UI change)
    const focusTag = ctx.pref_area || inferFocus(`${message}`);

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
            // focus hint
            { role: "system", content: `Focus hint: ${focusTag}` },
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

    // 5) Save assistant reply
    if (sessionId) {
      const { error: asstErr } = await supabase.from("chat_messages").insert({
        session_id: sessionId,
        role: "assistant",
        content: replyText
      });
      if (asstErr) console.error("assistant msg insert error:", asstErr);
    }

    // 6) Return reply + sessionId
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        reply: replyText,
        citations: [],
        sessionId,
        meta: { totalMessages: totalCount, focusTag }
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

// --- helpers ---

async function summarizeThread(apiKey, text) {
  const prompt = `
Summarize the earlier parts of this higher-ed conversation into a crisp, <120-word briefing a consultant would use.
Focus on the user's goals, constraints, and any chosen direction. No fluff. Plain sentences.

Conversation:
${text}
`;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 220
    })
  });
  if (!res.ok) throw new Error(`Summarizer ${res.status}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || null;
}

function fallbackReply(ctx, message, reason) {
  const greet = ctx.firstName
    ? (ctx.institutionName ? `Hi ${ctx.firstName} — ${ctx.institutionName} is set.` : `Hi ${ctx.firstName}.`)
    : "Hello there.";
  const note = reason ? `\n\n(Quick fallback because: ${reason}.)` : "";
  const next = "\n\nNext step: ask me another question or share a document you’d like help summarizing.";
  return `${greet}\n\nI received your message: “${message}”.${note}${next}`;
}
