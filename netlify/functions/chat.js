// /netlify/functions/chat.js
import fetch from "node-fetch";

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
    const body = JSON.parse(event.body || "{}");
    const messages = body.messages || [
      { role: "user", content: "Hello Lancelot!" },
    ];

    // Call OpenAI API
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // ✅ use gpt-4o-mini for responsiveness
        messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        statusCode: response.status,
        headers: CORS,
        body: JSON.stringify({ error: errText }),
      };
    }

    const data = await response.json();
    const reply =
      data.choices?.[0]?.message?.content ||
      "⚠️ No reply received from model.";

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
  } catch (error) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
