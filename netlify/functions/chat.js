const handler = async (event) => {
  try {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 200, headers, body: "" };
    }

    const { messages } = JSON.parse(event.body || "{}");
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing messages" }) };
    }

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      const systemPrompt = `
You are Lancelot, PeerQuest’s higher-ed copilot for feasibility, enrollment strategy,
financial modeling, CRM/SIS operations (Slate, Salesforce, Banner, Colleague, etc.),
Title IV/FA process, academic advising/transfer credit, curriculum & instruction, and accreditation.
Be professional, friendly, and concise. Open every new conversation with:

"Jim Dunn has asked me to remind you that I'm here to assist you and you will not break me.
Feel free to get creative with your questions and know I’m here to help build this tool
to match the needs of your institution. Let’s get started!"

Never mention internal sources or competitors by name. Do not store student PII.
If users ask for feasibility or CEPRs, follow our locked headings/checklists.
`;

const fullMessages = [
  { role: "system", content: systemPrompt },
  ...messages
];

body: JSON.stringify({
  model: "gpt-4o-mini",
  temperature: 0.3,
  messages: fullMessages
}),
    });

    const data = await r.json();
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};

module.exports = { handler };
