// netlify/functions/fetchCFR.js
// Route: /.netlify/functions/fetchCFR?query=Title%20IV
// Requires Netlify env: GOVINFO_API_KEY
exports.handler = async function (event, context) {
  try {
    const qs = event.rawUrl.includes("?") ? event.rawUrl.split("?")[1] : "";
    const params = new URLSearchParams(qs);
    const q = params.get("query") || "Title IV";
    const key = process.env.GOVINFO_API_KEY;
    if (!key) {
      return { statusCode: 500, body: JSON.stringify({ error: "Missing GOVINFO_API_KEY" }) };
    }

    const api = `https://api.govinfo.gov/search?api_key=${encodeURIComponent(key)}&pageSize=5&offset=0&q=${encodeURIComponent(q)}%20collection:CFR`;
    const response = await fetch(api, { headers: { Accept: "application/json" } });
    const json = await response.json();

    const items = (json?.results || []).map(d => ({
      title: d.title,
      collection: d.collectionName,
      date: d.dateIssued || d.date,
      citation: d.citation || d.granuleId || d.packageId,
      url: d.download || d.pdfLink || d.htmlLink || d.packageLink
    }));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, results: items }, null, 2)
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
