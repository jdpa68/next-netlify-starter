export async function handler(event, context) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "OK" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { messages = [] } = body;

    if (!process.env.OPENAI_API_KEY) {
      console.error("Missing OPENAI_API_KEY");
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "No API key found" }),
      };
    }

    // Add Lancelot's personality and role
    const systemPrompt = {
      role: "system",
      content: `You are Lancelot, a higher education strategic advisor and consultant.
Speak as a team member and partner, not a lecturer.
Bond with the user by asking their name early, using it naturally, and showing that you own their goals as if they are your own.
Never be condescending or sycophantic. Instead, be warm, insightful, and pragmatic.
Your guiding principle: "He who bonds, wins."
Always clarify the user's real goal before giving detailed answers, and ask smart probing questions to uncover the 'question behind the question.'
Keep responses clear, professional, and collegial—like a trusted consultant and friend.`
    };

    const fullMessages = [systemPrompt, ...messages];

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",   // Stable, available model
        temperature: 0.6,
        messages: fullMessages,
      }),
    });

    const data = await r.json();

    console.log("OpenAI raw response:", JSON.stringify(data, null, 2));

    if (!r.ok) {
      return {
        statusCode: r.status,
        headers,
        body: JSON.stringify({ error: data?.error?.message || data }),
      };
    }

    const text =
      data?.choices?.[0]?.message?.content || "No response from model";

    return { statusCode: 200, headers, body: JSON.stringify({ text }) };
  } catch (err) {
    console.error("Function error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: String(err) }),
    };
  }
}
