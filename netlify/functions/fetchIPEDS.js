// netlify/functions/fetchIPEDS.js
// Route: /.netlify/functions/fetchIPEDS?unitid=217156
// Requires Netlify env: DATA_GOV_KEY (College Scorecard API key)
exports.handler = async function (event, context) {
  try {
    const qs = event.rawUrl.includes("?") ? event.rawUrl.split("?")[1] : "";
    const params = new URLSearchParams(qs);
    const unitid = params.get("unitid") || "217156";
    const key = process.env.DATA_GOV_KEY;
    if (!key) {
      return { statusCode: 500, body: JSON.stringify({ error: "Missing DATA_GOV_KEY" }) };
    }

    const fields = [
      "id","school.name","school.city","school.state",
      "latest.student.enrollment.all",
      "latest.admissions.admission_rate.overall",
      "latest.cost.attendance.academic_year",
      "latest.completion.rate_suppressed.overall"
    ].join(",");

    const api = `https://api.data.gov/ed/collegescorecard/v1/schools?id=${encodeURIComponent(unitid)}&api_key=${encodeURIComponent(key)}&fields=${encodeURIComponent(fields)}`;
    const response = await fetch(api, { headers: { Accept: "application/json" } });
    const text = await response.text();

    return {
      statusCode: response.ok ? 200 : response.status,
      headers: { "Content-Type": "application/json" },
      body: text
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
