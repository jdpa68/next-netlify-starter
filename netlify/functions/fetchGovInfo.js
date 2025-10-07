// netlify/functions/fetchGovInfo.js
// Simpler GovInfo search (POST) for CFR by "34 CFR" and optional Part.
// Requires GOVINFO_API_KEY in Netlify env.

export async function handler(event) {
  try {
    const apiKey = process.env.GOVINFO_API_KEY;
    if (!apiKey) return send(500, { error: "Missing GOVINFO_API_KEY" });

    const title = (event.queryStringParameters?.title || "34").trim(); // CFR Title number
    const part  = (event.queryStringParameters?.part  || "").trim();   // optional Part number
    const max   = 6;

    // Build two practical queries that usually return packages:
    // 1) Exact "34 CFR 668" style phrase if part is present
    // 2) Fallback broader form with Title/Part words
    const queries = part
      ? [
          `"${title} CFR ${part}"`,
          `"Code of Federal Regulations" AND Title ${title} AND Part ${part}`
        ]
      : [
          `"${title} CFR"`,
          `"Code of Federal Regulations" AND Title ${title}`
        ];

    // POST search helper
    const searchPOST = async (query) => {
      const url = `https://api.govinfo.gov/search?api_key=${apiKey}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, collection: "CFR", pageSize: 25 })
      });
      const text = await resp.text();
      let data;
      try { data = JSON.parse(text); } catch {
        throw new Error(`GovInfo search error ${resp.status}: ${text.slice(0,180)}`);
      }
      if (!resp.ok) throw new Error(data?.message || data?.detail || `Status ${resp.status}`);
      return Array.isArray(data.results) ? data.results : [];
    };

    // Try each query until we find results
    let hits = [];
    for (const q of queries) {
      hits = await searchPOST(q);
      if (hits.length) break;
    }

    if (!hits.length) return send(200, { count: 0, items: [] });

    // Summarize first few results; include download links when available
    const firstFew = hits.slice(0, max);
    const items = firstFew.map(r => ({
      packageId: r.packageId,
      title: r.title,
      dateIssued: r.dateIssued,
      link: r.download?.pdf || r.download?.txt || null,
      downloads: r.download || {}
    }));

    return send(200, { count: items.length, items });
  } catch (err) {
    return send(500, { error: err.message || String(err) });
  }
}

function send(statusCode, data) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS"
    },
    body: JSON.stringify(data, null, 2)
  };
}
