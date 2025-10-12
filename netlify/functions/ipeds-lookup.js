// netlify/functions/ipeds-lookup.js
// Looks up IPEDS/College Scorecard data by institution name.
// Returns { unit_id, inst_url, name } with exact-name preference.

function cleanUrl(u = "") {
  return u.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function normalize(s = "") {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

exports.handler = async (event) => {
  try {
    const params = new URLSearchParams(event.queryStringParameters || {});
    const rawName = (params.get("name") || "").trim();
    if (!rawName) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing 'name' query parameter" }) };
    }

    const query = encodeURIComponent(rawName);
    const apiKey = process.env.SCORECARD_API_KEY || "DEMO_KEY"; // optional: add your own key in Netlify env

    // Ask for up to 25 matches so we can choose the best one
    const url = `https://api.data.gov/ed/collegescorecard/v1/schools.json?school.name=${query}&fields=id,school.name,school.school_url,school.state&per_page=25&api_key=${apiKey}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Scorecard fetch failed: ${res.status}`);
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ name: rawName, unit_id: null, inst_url: null }) };
    }

    const wanted = normalize(rawName);

    // Prefer exact case-insensitive match on normalized name
    let match =
      data.results.find(r => normalize(r["school.name"]) === wanted) ||
      // Otherwise, prefer those that start with the query (helps with "Univ of ..." vs "University of ...")
      data.results.find(r => normalize(r["school.name"]).startsWith(wanted)) ||
      // Fallback: first result
      data.results[0];

    const inst_url = cleanUrl(match["school.school_url"] || "");

    return {
      statusCode: 200,
      body: JSON.stringify({
        name: match["school.name"] || rawName,
        unit_id: match.id || null,
        inst_url: inst_url || null
      })
    };
  } catch (e) {
    console.error("ipeds-lookup error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: "Server error" }) };
  }
};
