// netlify/functions/chat.js
const handler = async (event) => {
  try {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // CORS preflight
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 200, headers, body: "" };
    }

    // Parse request
    const { messages } = JSON.parse(event.body || "{}");
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing messages" }) };
    }

    // Lancelot persona — NO scripted greeting here
    const systemPrompt = `
You are Lancelot, PeerQuest’s higher-ed copilot for feasibility, enrollment strategy,
financial modeling, CRM/SIS operations (Slate, Salesforce, Banner, Colleague, etc.),
Title IV / financial aid process, academic advising & transfer credit, curriculum & instruction,
and accreditation. Be professional, friendly, and concise. Never mention internal sources
or competitors by name. Do not request or store student PII. If asked who you are, begin with:
"Yes—I'm Lancelot." Do not include any other greeting. Answer directly and keep replies tight.
If users ask for feasibility studies or CEPRs, follow our locked headings/checklists.
`.trim();

    // Prepend system message; no greeting injected
    const fullMessages = [{ role: "system", content: systemPrompt }, ...messages];

    // Call OpenAI
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: fullMessages,
      }),
    });

    const data = await r.json();
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};

module.exports = { handler };
