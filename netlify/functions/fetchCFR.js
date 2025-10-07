// netlify/functions/fetchCFR.js
// Federal Register CFR lookup by Title (and optional Part). No API key needed.

export async function handler(event) {
  try {
    const title = (event.queryStringParameters?.title || "34").trim();  // CFR Title number
    const part  = (event.queryStringParameters?.part  || "").trim();    // optional Part number
    const per   = (event.queryStringParameters?.per_page || "10").trim();

    // Build FR API with CFR filters. Docs: https://www.federalregister.gov/developers/documentation/api/v1
    const base = new URL("https://www.federalregister.gov/api/v1/documents.json");
    base.searchParams.set("order", "newest");
    base.searchParams.set("per_page", per);
    base.searchParams.set("conditions[cfr][title]", title);
    if (part) base.searchParams.set("conditions[cfr][part]", part);

    const resp = await fetch(base.toString());
    const data = await resp.json();

    if (!resp.ok) {
      return send(resp.status, { error: data?.errors || data?.error || "FR API error" });
    }

    // Map into compact items (title, date, agency, links)
    const items = (data?.results || []).map(d => ({
      title: d.title,
      publication_date: d.publication_date,
      agencies: (d.agencies || []).map(a => a.name),
      html_url: d.html_url,
      pdf_url: d.pdf_url || null,
      citation: d.citation || null
    })).slice(0, 10);

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
