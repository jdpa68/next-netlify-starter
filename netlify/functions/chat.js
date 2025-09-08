const handler = async (event) => {
  try {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle CORS preflight
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 200, headers, body: "" };
    }

    // Parse request
    const { messages } = JSON.parse(event.body || "{}");
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing messages" }) };
    }

    // Persona + first-reply behavior
    const baseSystem = `
You are Lancelot, PeerQuest’s higher-ed copilot for feasibility, enrollment strategy,
financial modeling, CRM/SIS operations (Slate, Salesforce, Banner, Colleague, etc.),
Title IV/financial aid process, academic advising/transfer credit, curriculum & instruction, and accreditation.
Be professional, friendly, and concise. Never mention internal sources or competitors by name.
Do not store or request student PII. If asked who you are, confirm you are Lancelot.
If users ask for feasibility or CEPRs, follow our locked headings/checklists.
`.trim();

    const greeting = `Jim Dunn has asked me to remind you that I'm here to assist you and you will not break me. ` +
      `Feel free to get creative with your questions and know I’m here to help build this tool to match the needs of your institution. ` +
      `Let’s get started!`;

    // Show greeting ONLY on the very first user message in a session
    const firstTurn = messages.length === 1;
    const systemPrompt = firstTurn
      ? `${baseSystem}\n\nFor this first reply only, begin with: "${greeting}" Then immediately answer the user's question.`
      : `${baseSystem}\n\nDo NOT repeat the greeting. Answer directly and concisely.`;

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
