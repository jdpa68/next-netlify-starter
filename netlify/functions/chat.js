// netlify/functions/chat.js
// Diagnostic version — confirms environment variable visibility

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const body = JSON.parse(event.body || "{}");
    const message = (body.message || "").toString().trim();
    const ctx = body.ctx || {};

    const hasKey = !!process.env.OPENAI_API_KEY;
    console.log("🔍 Diagnostic: OPENAI_API_KEY present?", hasKey);

    const partialKey = process.env.OPENAI_API_KEY
      ? process.env.OPENAI_API_KEY.slice(0, 5) + "..." // never prints full key
      : "undefined";

    console.log("🔍 Diagnostic: partial key value ->", partialKey);

    const replyLines = [
      "Diagnostic run successful.",
      hasKey
        ? "✅ The environment variable OPENAI_API_KEY is detected by this function."
        : "❌ The environment variable OPENAI_API_KEY is NOT visible to this function.",
      "",
      `Partial key (first 5 chars): ${partialKey}`,
      "",
      "If you see ❌ above, double-check:",
      "1. The key is saved under Site configuration → Environment variables for *pqlancelot*.",
      "2. It is set under Production context.",
      "3. After saving, use 'Clear cache and deploy site'."
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
  } catch (e) {
    console.error("Diagnostic error:", e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Diagnostic function error" })
    };
  }
};
