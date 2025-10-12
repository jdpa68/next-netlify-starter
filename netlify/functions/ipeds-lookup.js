// netlify/functions/ipeds-lookup.js
// Looks up IPEDS/College Scorecard data for a given institution name
// and returns { unit_id, inst_url, name }

import fetch from "node-fetch";

export async function handler(event) {
  try {
    const { name } = Object.fromEntries(new URLSearchParams(event.queryStringParameters));

    if (!name) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing 'name' query parameter" })
      };
    }

    // Clean and encode the name
    const query = encodeURIComponent(name.trim());

    // College Scorecard (IPEDS) endpoint (public, no API key for limited fields)
    const url = `https://api.data.gov/ed/collegescorecard/v1/schools.json?school.name=${query}&fields=id,school.name,school.school_url&per_page=1&api_key=DEMO_KEY`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("Fetch failed");

    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ name, unit_id: null, inst_url: null })
      };
    }

    const school = data.results[0];
    const inst_url = (school["school.school_url"] || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const result = {
      name: school["school.name"] || name,
      unit_id: school.id || null,
      inst_url: inst_url || null
    };

    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (e) {
    console.error("Lookup error:", e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error" })
    };
  }
}
