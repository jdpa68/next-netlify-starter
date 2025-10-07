// netlify/functions/fetchGovInfo.js
// Final: GovInfo search (POST) for CFR by Title (and optional Part).
// Uses offsetMark="*" as required by GovInfo; returns first few results with download links when present.
// Requires Netlify env var: GOVINFO_API_KEY

export async function handler(event) {
  try {
    const apiKey = process.env.GOVINFO_API_KEY;
    if (!apiKey) return send(500, { error: "Missing GOVINFO_API_KEY" });

    const title = (event.queryStringParameters?.title || "34").trim();  // CFR Title number, e.g., 34
    const part  = (event.queryStringParameters?.part  || "").trim();    // optional Part number, e.g., 668
    const pageSize = 25;                                                // keep responses small
    const maxItems = 6;                                                 // trim to the first few

    // Build two practical queries and try them in order.
    //  - Exact phrase "34 CFR 668" often yields best matches
    //  - Broader query uses Title/Part words
    const queries = part
      ? [
          `"${title} CFR ${part}"`,
          `"Code of Federal Regulations" AND Title ${title} AND Part ${part}`
        ]
      : [
          `"${title} CFR"`,
          `"Code of Federal Regulations" AND Title ${title}`
        ];

    // Helper to call GovInfo search via POST (offsetMark is required; "*" for first page)
    const doSearch = async (query) => {
      const url = `https://api.govinfo.gov/search?api_key=${apiKey}`;
      const body = {
        query,                     // lucene-style query string
        collection: "CFR",         // only pull CFR
        pageSize,                  // number of hits
        offsetMark: "*"            // FIRST PAGE marker (GovInfo requirement)
      };
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const text = await resp.text();
      let data;
      try { data = JSON.parse(text); } catch {
        throw new Error(`GovInfo search parse error ${resp.status}: ${text.slice(0, 180)}`);
      }
      if (!resp.ok) {
        const msg = data?.message || data?.detail || text;
        throw new Error(`GovInfo search error ${resp.status}: ${msg}`);
      }
      return Array.isArray(data.results) ? data.results : [];
    };

    // Try each query until we get results
    let hits = [];
    for (const q of queries) {
      hits = await doSearch(q);
      if (hits.length) break;
    }

    if (!hits.length) return send(200, { count: 0, items: [] });

    // Map the first few results into a compact, UI-friendly shape
    const items = hits.slice(0, maxItems).map(r => ({
      packageId: r.packageId,
      title: r.title,
      dateIssued: r.dateIssued,
      // GovInfo often includes direct download links in search results
      link: r.download?.pdf || r.download?.txt || r.download?.xml || null,
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
