// Federal Register search (proxy for CFR/federal rules lookups)
export const config = { path: "/fetchCFR" }; // /.netlify/functions/fetchCFR?query=Title%20IV

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const q = url.searchParams.get("query") || "Title IV";
    const api = `https://www.federalregister.gov/api/v1/documents.json?per_page=5&order=newest&conditions[term]=${encodeURIComponent(q)}`;
    const r = await fetch(api);
    const j = await r.json();
    // return a compact list
    const items = (j?.results || []).map(d => ({
      title: d.title,
      agency_names: d.agency_names,
      publication_date: d.publication_date,
      citation: d.citation || d.document_number,
      url: d.html_url
    }));
    res.setHeader("Content-Type", "application/json");
    res.status(200).send(JSON.stringify({ query: q, results: items }, null, 2));
  } catch (e) {
    res.status(500).send(JSON.stringify({ error: e.message }));
  }
}
