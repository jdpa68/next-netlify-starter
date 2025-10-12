// netlify/functions/chat.js
// Step 10c-2: Adds Supabase logging for session + message memory

const MODEL = "gpt-4o-mini";
const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");

// Helper: fetch with timeout
async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
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
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing environment variables." })
      };
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = JSON.parse(event.body || "{}");
    const message = (body.message || "").trim();
    const ctx = body.ctx || {};

    if (!message) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing message" }) };
    }

    // -------- Persona Prompt --------
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
• Offer 2-3 actionable insights, then a helpful next step.
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

    // --- 1️⃣ Get or create session ---
    let sessionId = null;
    const { data: session } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("user_name", ctx.firstName || null)
      .eq("institution", ctx.institutionName || null)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (session) {
      sessionId = session.id;
      await supabase.from("chat_sessions")
        .update({ last_active: new Date().toISOString() })
        .eq("id", sessionId);
    } else {
      const { data: newSession } = await supabase
        .from("chat_sessions")
        .insert({
          user_name: ctx.firstName || null,
          institution: ctx.institutionName || null,
          inst_url: ctx.inst_url || null,
          unit_id: ctx.unit_id || null
        })
        .select()
        .single();
      sessionId = newSession?.id;
    }

    // --- 2️⃣ Save user question ---
    await supabase.from("chat_messages").insert({
      session_id: sessionId,
      role: "user",
      content: message
    });

    // --- 3️⃣ Retrieve prior messages for memory (last 5) ---
    const { data: previousMsgs } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(5);

    const history = (previousMsgs || []).map((m) => ({
      role: m.role,
      content: m.content
    }));

    // --- 4️⃣ Call OpenAI ---
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

    // --- 5️⃣ Save assistant reply ---
    await supabase.from("chat_messages").insert({
      session_id: sessionId,
      role: "assistant",
      content: replyText
    });

    // --- 6️⃣ Return reply to UI ---
    return okReply(replyText, []);
  } catch (err) {
    console.error("chat handler error:", err);
    return okReply(
      "I hit an unexpected issue just now, but I’m still here. Ask again in a moment.",
      []
    );
  }
};

// ---------- Helpers ----------
function okReply(reply, citations) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, reply, citations })
  };
}

function fallbackReply(ctx, message, reason) {
  const greet = ctx.firstName
    ? (ctx.institutionName ? `Hi ${ctx.firstName} — ${ctx.institutionName} is set.` : `Hi ${ctx.firstName}.`)
    : "Hello there.";
  const note = reason ? `\n\n(Quick fallback because: ${reason}.)` : "";
  const next = "\n\nNext step: ask me another question or share a document you’d like help summarizing.";
  return `${greet}\n\nI received your message: “${message}”.${note}${next}`;
}
