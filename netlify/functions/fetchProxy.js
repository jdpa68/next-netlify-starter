// netlify/functions/fetchBLS.js
// Simple proxy to query BLS Public Data API v2
export async function handler(event) {
  try {
    const series = event.queryStringParameters?.series || "CUUR0000SA0"; // default CPI-U
    const start = event.queryStringParameters?.start || "2022";
    const end = event.queryStringParameters?.end || "2025";

    const payload = {
      seriesid: [series],
      startyear: start,
      endyear: end,
      registrationkey: process.env.BLS_API_KEY,
    };

    const resp = await fetch("https://api.bls.gov/publicAPI/v2/timeseries/data/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();

    return {
      statusCode: resp.status,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
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

