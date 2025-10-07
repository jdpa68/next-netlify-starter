// netlify/functions/fetchGovInfo.js
// GovInfo API connector: returns official CFR package summaries (with PDF links) by Title (and optional Part).
// Requires Netlify env var: GOVINFO_API_KEY

export async function handler(event) {
  try {
    const apiKey = process.env.GOVINFO_API_KEY;
    if (!apiKey) {
      return resp(500, { error: "Missing GOVINFO_API_KEY environment variable" });
    }

    const title = (event.queryStringParameters?.title || "34").trim(); // CFR Title, e.g., 34
    const year  = (event.queryStringParameters?.year  || "2025").trim(); // Edition year
    const part  = (event.queryStringParameters?.part  || "").trim();    // Optional Part, e.g., 668
    const pageSize = "200";

    // Helper: JSON fetch with readable errors
    const getJSON = async (url) => {
      const r = await fetch(url);
      const text = await r.text();
      let data = null;
      try { data = JSON.parse(text); } catch {
        throw new Error(`GovInfo error ${r.status}: ${text?.slice(0, 180)}`);
      }
      if (!r.ok) {
        const msg = data?.message || data?.detail || text;
        throw new Error(`GovInfo error ${r.status}: ${msg}`);
      }
      return data;
    };

    // 1) Try collections endpoint first (CFR collection as of Jan 1 ISO date)
    const isoDate = `${year}-01-01T00:00:00Z`;
    const collURL = `https://api.govinfo.gov/collections/CFR/${encodeURIComponent(isoDate)}?pageSize=${pageSize}&api_key=${apiKey}`;
    let packages = [];

    try {
      const coll = await getJSON(collURL);
      const items = Array.isArray(coll?.packages) ? coll.packages : [];
      const tLower = `title ${title}`;
      packages = items.filter(pkg => {
        const pTitle = (pkg?.title || "").toLowerCase();
        const pId    = (pkg?.packageId || "").toLowerCase();
        const titleMatch = pTitle.includes(tLower) || pId.includes(`title${title}`);
        const partMatch  = part ? (pTitle.includes(`part ${part}`) || pId.includes(`part${part}`)) : true;
        return titleMatch && partMatch;
      });
    } catch (e) {
      // If collections call fails, fall through to search fallback below
      packages = [];
    }

    // 2) Fallback: use GovInfo search if no matching packages found
    if (packages.length === 0) {
      const query = part
        ? `"Code of Federal Regulations" AND Title ${title} AND Part ${part}`
        : `"Code of Federal Regulations" AND Title ${title}`;
      const searchURL = `https://api.govinfo.gov/search?query=${encodeURIComponent(query)}&collection=CFR&pageSize=50&api_key=${apiKey}`;
      const search = await getJSON(searchURL);
      const results = Array.isArray(search?.results) ? search.results : [];
      packages = results.map(r => ({ packageId: r.packageId, title: r.title }));
    }

    // 3) For each packageId, fetch summary to expose downloads (PDF/TXT/XML) & metadata
    const firstFew = packages.slice(0, 6); // keep the response light
    const summaries = [];
    for (const pkg of firstFew) {
      const pid = pkg.packageId;
      if (!pid) continue;
      try {
        const sumURL = `https://api.govinfo.gov/packages/${encodeURIComponent(pid)}/summary?api_key=${apiKey}`;
        const summary = await getJSON(sumURL);
        summaries.push({
          packageId: pid,
          title: summary?.title || pkg?.title,
          dateIssued: summary?.dateIssued,
          docClass: summary?.docClass || summary?.documentClass,
          downloads: summary?.download || {},
          link: summary?.download?.pdf || summary?.download?.txt || summary?.download?.xml || null
        });
      } catch { /* skip broken package */ }
    }

    return resp(200, { count: summaries.length, items: summaries });

  } catch (err) {
    return resp(500, { error: err.message || String(err) });
  }
}

// Small helper to keep responses consistent with CORS for browser calls
function resp(statusCode, data) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
    },
    body: JSON.stringify(data, null, 2),
  };
}

