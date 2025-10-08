// netlify/functions/fetchBLS.js
// Route: /.netlify/functions/fetchBLS?series=CES6562140001
exports.handler = async function (event, context) {
  try {
    const qs = event.rawUrl.includes("?") ? event.rawUrl.split("?")[1] : "";
    const params = new URLSearchParams(qs);
    const series = params.get("series") || "CES6562140001";
    const key = process.env.BLS_API_KEY; // optional for light use

    const api = key
      ? `https://api.bls.gov/publicAPI/v2/timeseries/data/${encodeURIComponent(series)}?latest=true&registrationkey=${encodeURIComponent(key)}`
      : `https://api.bls.gov/publicAPI/v2/timeseries/data/${encodeURIComponent(series)}?latest=true`;

    const response = await fetch(api, { headers: { Accept: "application/json" } });
    const text = await response.text();

    return {
      statusCode: response.ok ? 200 : response.status,
      headers: { "Content-Type": "application/json" },
      body: text
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
