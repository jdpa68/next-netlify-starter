// netlify/functions/fetchIPEDS.js
// College Scorecard (IPEDS) proxy via data.gov
// Requires Netlify env var: DATA_GOV_KEY

export const config = { path: "/fetchIPEDS" }; // /.netlify/functions/fetchIPEDS?unitid=217156

export default async function handler(req, res) {
  try {
    // read params
    const url = new URL(req.url, `http://${req.headers.host}`);
    const unitid = url.searchParams.get("unitid") || "217156";

    // api key
    const key = process.env.DATA_GOV_KEY;
    if (!key) {
      res.status(500).json({ error: "Missing DATA_GOV_KEY environment variable." });
      return;
    }

    // fields to return (compact but useful)
    const fields = [
      "id",
      "school.name",
      "school.city",
      "school.state",
      "latest.student.enrollment.all",
      "latest.admissions.admission_rate.overall",
      "latest.cost.attendance.academic_year",
      "latest.completion.rate_suppressed.overall"
    ].join(",");

    // data.gov College Scorecard endpoint (json)
    const api = `https://api.collegescorecard.ed.gov/v1/schools?id=${encodeURIComponent(
  unitid
)}&api_key=${encodeURIComponent(key)}&fields=${encodeURIComponent(fields)}`;


    const r = await fetch(api, { headers: { Accept: "application/json" } });

    // non-200 -> bubble up response text for easier debugging
    if (!r.ok) {
      const text = await r.text();
      res.status(r.status).json({ error: `Scorecard error ${r.status}`, detail: text });
      return;
    }

    const j = await r.json();

    // normalize a minimal shape for the UI preview
    const row = (j?.results && j.results[0]) || {};
    const out = {
      unitid,
      name: row["school.name"] || null,
      city: row["school.city"] || null,
      state: row["school.state"] || null,
      enrollment_all: row["latest.student.enrollment.all"] ?? null,
      admit_rate: row["latest.admissions.admission_rate.overall"] ?? null,
      cost_ay: row["latest.cost.attendance.academic_year"] ?? null,
      completion_overall: row["latest.completion.rate_suppressed.overall"] ?? null,
      raw: j, // keep full payload for inspection
    };

    res.setHeader("Content-Type", "application/json");
    res.status(200).send(JSON.stringify(out, null, 2));
  } catch (e) {
    res.status(500).json({ error: e.message || "Unexpected error" });
  }
}
