// netlify/functions/chat.js
// Step 10b-1: Starter "brain" — no model call yet.
// Returns a structured, Jenn-style echo so we can test the plumbing.

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const body = JSON.parse(event.body || "{}");
    const message = (body.message || "").toString().trim();
    const ctx = body.ctx || {}; // { firstName, institutionName, inst_url, unit_id }

    if (!message) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing 'message' in request body" }) };
    }

    // Build a friendly, structured response (no AI yet)
    const greeting = ctx.firstName
      ? (ctx.institutionName ? `Hi ${ctx.firstName} — ${ctx.institutionName} is set.` : `Hi ${ctx.firstName}.`)
      : "Hi there.";

    const lines = [
      greeting,
      "I heard:",
      `• "${message}"`,
      "",
      "This is a placeholder reply from the /chat function (no AI model yet).",
      "Next step: we’ll call the model and return a real answer with citations."
    ];

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        reply: lines.join("\n"),
        citations: [] // placeholder
      })
    };
  } catch (e) {
    console.error("chat error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: "Server error" }) };
  }
};
