// netlify/functions/ipeds-lookup.js
// Looks up IPEDS/College Scorecard data by institution name
// Returns { unit_id, inst_url, name }

exports.handler = async (event) => {
  try {
    const params = new URLSearchParams(event.queryStringParameters || {});
    const name = (params.get("name") || "").trim();

    if (!name) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing 'name' query parameter" }) };
    }

    const query = encodeURIComponent(name);

    // College Scorecard (IPEDS) — using DEMO_KEY for limited fields
    const url = `https://api.data.gov/ed/collegescorecard/v1/schools.json?school.name=${query}&fields=id,school.name,school.school_url&per_page=1&api_key=DEMO_KEY`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("Fetch failed");
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ name, unit_id: null, inst_url: null }) };
    }

    const school = data.results[0];
    const inst_url = (school["school.school_url"] || "")
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "");

    return {
      statusCode: 200,
      body: JSON.stringify({
        name: school["school.name"] || name,
        unit_id: school.id || null,
        inst_url: inst_url || null
      })
    };
  } catch (e) {
    console.error("Lookup error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: "Server error" }) };
  }
};
