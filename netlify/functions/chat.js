// /netlify/functions/chat.js  (Temporary wiring test)
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }
  // Always return a payload with multiple common keys so the UI can find one.
  const reply = "✅ Function is wired correctly. Hello from Lancelot’s server!";
  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({
      reply,
      message: reply,
      text: reply,
      content: reply
    })
  };
}
