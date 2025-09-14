// netlify/functions/chat-context.js
exports.handler = async (event) => {
  try {
    const method = event.httpMethod || "GET";
    const q =
      method === "POST"
        ? (JSON.parse(event.body || "{}").query || "").trim()
        : (event.queryStringParameters?.q || "").trim();

    if (!q) {
      return { statusCode: 400, body: JSON.stringify({ error: "Provide a query (?q= or POST {query})" }) };
    }

    // Build self URL for index-search
    const siteBase =
      process.env.URL ||
      (event.headers && event.headers.host ? `https://${event.headers.host}` : "");

    const searchUrl = `${siteBase}/.netlify/functions/index-search?q=${encodeURIComponent(q)}`;
    const res = await fetch(searchUrl);
    if (!res.ok) {
      const t = await res.text();
      return { statusCode: 500, body: JSON.stringify({ error: `index-search error: ${t}` }) };
    }

    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];

    // Build compact context (top 6)
    const top = results.slice(0, 6);
    const sources = top.map((r) => ({
      title: r.title,
      table: r.table,
      url: r.url || ""
    }));

    // Compose context block with clear separators
    const parts = top.map((r, i) => {
      const label = r.title ? r.title : `Source ${i + 1}`;
      return [
        `### ${label} [${r.table}]`,
        r.snippet || ""
      ].join("\n");
    });

    const context_block = parts.join("\n\n---\n\n");

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: q, context_block, sources })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err?.message || err) }) };
  }
};
