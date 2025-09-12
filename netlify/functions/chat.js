// /netlify/functions/chat.js

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }

  try {
    const { messages } = JSON.parse(event.body);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: messages || [{ role: "user", content: "Hello" }],
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error("OpenAI API Error:", data.error);
      return {
        statusCode: 500,
        headers: CORS,
        body: JSON.stringify({ error: data.error.message }),
      };
    }

    const reply = data.choices?.[0]?.message?.content || "No response from model";

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        reply,
        message: reply,
        text: reply,
        content: reply,
      }),
    };

  } catch (err) {
    console.error("Server error:", err);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
