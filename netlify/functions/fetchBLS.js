// netlify/functions/fetchBLS.js
// Route: /.netlify/functions/fetchBLS?series=CES6562140001
export const config = { path: "/fetchBLS" };

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const series = url.searchParams.get("series") || "CES6562140001";
    const key = process.env.BLS_API_KEY; // optional
    const api = key
      ? `https://api.bls.gov/publicAPI/v2/timeseries/data/${encodeURIComponent(series)}?latest=true&registrationkey=${encodeURIComponent(key)}`
      : `https://api.bls.gov/publicAPI/v2/timeseries/data/${encodeURIComponent(series)}?latest=true`;

    const r = await fetch(api, { headers: { Accept: "application/json" } });
    const text = await r.text();
    res.setHeader("Content-Type", "application/json");
    res.status(r.ok ? 200 : r.status).send(text);
  } catch (e) {
    res.status(500).send(JSON.stringify({ error: e.message }));
  }
}
