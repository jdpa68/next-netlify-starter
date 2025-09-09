// netlify/functions/chat.js

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

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",      // use 4o-mini for broad availability
        temperature: 0.5,
        messages,
      }),
    });

    const data = await r.json();

    // Log to Netlify for debugging
    console.log("OpenAI raw response:", JSON.stringify(data, null, 2));

    if (!r.ok) {
      return {
        statusCode: r.status,
        headers,
        body: JSON.stringify({ error: data?.error?.message || data }),
      };
    }

    // Normalize the shape the UI expects
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
