// netlify/functions/chat.js
// Temporary safe version — confirms route + UI wiring
// No external API calls yet.

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const body = JSON.parse(event.body || "{}");
    const message = (body.message || "").toString().trim();
    const ctx = body.ctx || {}; // { firstName, institutionName, inst_url, unit_id }

    if (!message) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing message" }) };
    }

    const greeting = ctx.firstName
      ? (ctx.institutionName
          ? `Hi ${ctx.firstName} — ${ctx.institutionName} is set.`
          : `Hi ${ctx.firstName}.`)
      : "Hello there.";

    const replyLines = [
      greeting,
      "",
      `I received your message: "${message}"`,
      "",
      "The chat function is connected and responding correctly.",
      "Next step: we’ll re-enable the model to provide full answers."
    ];

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        reply: replyLines.join("\n"),
        citations: []
      })
    };
  } catch (err) {
    console.error("chat error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        reply: "The chat function encountered an error. (See logs for details.)",
        citations: []
      })
    };
  }
};
