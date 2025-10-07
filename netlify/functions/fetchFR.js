// netlify/functions/fetchFR.js
// Simple connector for the Federal Register API (no API key required)

export async function handler(event) {
  try {
    const term = event.queryStringParameters?.term || "gainful employment";
    const limit = event.queryStringParameters?.limit || "3";

    const url = `https://www.federalregister.gov/api/v1/documents.json?conditions[term]=${encodeURIComponent(
      term
    )}&per_page=${limit}`;

    const resp = await fetch(url);
    const data = await resp.json();

    return {
      statusCode: resp.status,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
      },
      body: JSON.stringify(data, null, 2),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
