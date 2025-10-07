// netlify/functions/fetchGovInfo.js
// GovInfo CFR search (POST) — filters to CFR only and returns first few results with download links.
// Requires Netlify env var: GOVINFO_API_KEY

export async function handler(event) {
  try {
    const apiKey = process.env.GOVINFO_API_KEY;
    if (!apiKey) return send(500, { error: "Missing GOVINFO_API_KEY" });

    const title = (event.queryStringParameters?.title || "34").trim();   // CFR Title number, e.g., 34
    const part  = (event.queryStringParameters?.part  || "").trim();     // Optional Part number, e.g., 668
    const pageSize = 25;                                                 // Keep responses small
    const maxItems = 6;                                                  // Return first few

    // Build two practical queries; try in order until we get hits.
    // Exact phrase often returns best matches, then a broader form.
    const queries = part
      ? [
          `"${title} CFR ${part}"`,
          `"Code of Federal Regulations" AND Title ${title} AND Part ${part}`
        ]
      : [
          `"${title} CFR"`,
          `"Code of Federal Regulations" AND Title ${title}`
        ];

    const hits = await searchCFR(queries, pageSize, apiKey);

    if (!hits.length) return send(200, { count: 0, items: [] });

    // Only keep CFR results (discard US Reports / other collections)
    const cfrOnly = hits.filter(r => {
      const pid = (r.packageId || "").toUpperCase();
      const ttl = r.title || "";
      return pid.startsWith("CFR-") || /code of federal regulations/i.test(ttl);
    });

    const items = cfrOnly.slice(0, maxItems).map(r => ({
      packageId: r.packageId,
      title: r.title,
      dateIssued: r.dateIssued,
      link: r.download?.pdf || r.download?.txt || r.download?.xml || null,
      downloads: r.download || {}
    }));

    return send(200, { count: items.length, items });
  } catch (err) {
    return send(500, { error: err.message || String(err) });
  }
}

// --- helpers ---

async function searchCFR(queries, pageSize, apiKey) {
  for (const query of queries) {
    const url = `https://api.govinfo.gov/search?api_key=${apiKey}`;
    const body = {
      query,                // lucene-like string
      collection: "CFR",    // limit to CFR
      pageSize,
      offsetMark: "*"       // REQUIRED: "*" for first page
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch {
      throw new Error(`GovInfo parse error ${resp.status}: ${text.slice(0,180)}`);
    }
    if (!resp.ok) {
      const msg = data?.message || data?.detail || text;
      throw new Error(`GovInfo search error ${resp.status}: ${msg}`);
    }

    const results = Array.isArray(data.results) ? data.results : [];
    if (results.length) return results;
  }
  return [];
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
