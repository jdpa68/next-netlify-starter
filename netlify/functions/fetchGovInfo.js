// netlify/functions/fetchGovInfo.js
// GovInfo API connector for official CFR packages and metadata (requires GOVINFO_API_KEY)

export async function handler(event) {
  try {
    const apiKey = process.env.GOVINFO_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: "Missing GOVINFO_API_KEY environment variable" };
    }

    // Query params
    const title = event.queryStringParameters?.title || "34";   // CFR Title (e.g., 34 = Education)
    const year  = event.queryStringParameters?.year  || "2025"; // Edition year
    const part  = event.queryStringParameters?.part  || "";     // Optional CFR Part (e.g., 668)

    // If a specific part is provided, try to find a package that contains it
    // Fallback: list the CFR collection for the given year
    let url;

    if (part) {
      // Example package path often used by GovInfo: CFR-2025-title34-vol3 (varies by year/volume)
      // We'll query the CFR collection for matches, then return the first few results.
      url = `https://api.govinfo.gov/collections/CFR/${year}-01-01?api_key=${apiKey}`;
    } else {
      // List the CFR collection (edition as of Jan 1)
      url = `https://api.govinfo.gov/collections/CFR/${year}-01-01?api_key=${apiKey}`;
    }

    const collResp = await fetch(url);
    if (!collResp.ok) {
      const txt = await collResp.text().catch(()=> "");
      return { statusCode: collResp.status, body: `GovInfo collections error: ${txt}` };
    }
    const collection = await collResp.json();

    // Extract packageIds related to Title number if present
    const items = (collection?.packages || []).filter(pkg => {
      // crude filter: title number often appears in the title or in packageId
      const t = (pkg?.title || "").toLowerCase();
      const id = (pkg?.packageId || "").toLowerCase();
      return t.includes(`title ${title}`) || id.includes(`title${title}`);
    }).slice(0, 5);

    // Fetch summaries for the first few packageIds to expose PDF links and metadata
    const results = [];
    for (const pkg of items) {
      const pid = pkg.packageId;
      const sumUrl = `https://api.govinfo.gov/packages/${encodeURIComponent(pid)}/summary?api_key=${apiKey}`;
      const sumResp = await fetch(sumUrl);
      if (!sumResp.ok) continue;
      const summary = await sumResp.json();
      results.push({
        packageId: pid,
        title: summary?.title || pkg?.title,
        dateIssued: summary?.dateIssued,
        docClass: summary?.docClass || summary?.documentClass,
        link: summary?.download?.pdf || summary?.download?.txt || summary?.download?.xml,
        downloads: summary?.download || {},
        raw: summary
      });
    }

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
      },
      body: JSON.stringify({ count: results.length, items: results }, null, 2)
    };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
