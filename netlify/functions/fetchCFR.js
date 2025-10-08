// netlify/functions/fetchCFR.js
// Route: /.netlify/functions/fetchCFR?query=Title%20IV
// Requires Netlify env: GOVINFO_API_KEY
export const config = { path: "/fetchCFR" };

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const q = url.searchParams.get("query") || "Title IV";
    const key = process.env.GOVINFO_API_KEY;
    if (!key) return res.status(500).json({ error: "Missing GOVINFO_API_KEY" });

    const api = `https://api.govinfo.gov/search?api_key=${encodeURIComponent(key)}&pageSize=5&offset=0&q=${encodeURIComponent(q)}%20collection:CFR`;
    const r = await fetch(api, { headers: { Accept: "application/json" } });
    const j = await r.json();

    const items = (j?.results || []).map(d => ({
      title: d.title,
      collection: d.collectionName,
      date: d.dateIssued || d.date,
      citation: d.citation || d.granuleId || d.packageId,
      url: d.download || d.pdfLink || d.htmlLink || d.packageLink
    }));

    res.setHeader("Content-Type", "application/json");
    res.status(200).send(JSON.stringify({ query: q, results: items }, null, 2));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
