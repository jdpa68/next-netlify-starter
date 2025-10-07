// netlify/functions/fetchGovInfo.js
// GovInfo API connector (POST search for CFR content)

export async function handler(event) {
  const apiKey = process.env.GOVINFO_API_KEY;
  if (!apiKey) {
    return send(500, { error: "Missing GOVINFO_API_KEY environment variable" });
  }

  const title = (event.queryStringParameters?.title || "34").trim();
  const year = (event.queryStringParameters?.year || "2025").trim();
  const part = (event.queryStringParameters?.part || "").trim();

  try {
    const isoDate = `${year}-01-01T00:00:00Z`;
    const collURL = `https://api.govinfo.gov/collections/CFR/${encodeURIComponent(isoDate)}?pageSize=100&api_key=${apiKey}`;

    const collResp = await fetch(collURL);
    const collData = await collResp.json();

    let packages = Array.isArray(collData.packages)
      ? collData.packages.filter(pkg => {
          const id = (pkg.packageId || "").toLowerCase();
          const t = (pkg.title || "").toLowerCase();
          return (
            t.includes(`title ${title}`) ||
            id.includes(`title${title}`)
          );
        })
      : [];

    // If no results found in collection, use /search (POST)
    if (packages.length === 0) {
      const query = part
        ? `"Code of Federal Regulations" AND Title ${title} AND Part ${part}`
        : `"Code of Federal Regulations" AND Title ${title}`;

      const searchURL = `https://api.govinfo.gov/search?api_key=${apiKey}`;
      const searchResp = await fetch(searchURL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, collection: "CFR", pageSize: 25 })
      });
      const searchData = await searchResp.json();
      packages = Array.isArray(searchData.results)
        ? searchData.results.map(r => ({
            packageId: r.packageId,
            title: r.title,
            dateIssued: r.dateIssued,
            link: r.download?.pdf || r.download?.txt || null
          }))
        : [];
    }

    return send(200, { count: packages.length, items: packages.slice(0, 6) });
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
