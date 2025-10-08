// Fetch latest BLS series data (no key needed for light use)
export const config = { path: "/fetchBLS" }; // /.netlify/functions/fetchBLS?series=CES6562140001

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const series = url.searchParams.get("series") || "CES6562140001";
    const api = `https://api.bls.gov/publicAPI/v2/timeseries/data/${encodeURIComponent(series)}?latest=true`;
    const r = await fetch(api);
    const j = await r.json();
    res.setHeader("Content-Type", "application/json");
    res.status(200).send(JSON.stringify({ series, data: j }, null, 2));
  } catch (e) {
    res.status(500).send(JSON.stringify({ error: e.message }));
  }
}
