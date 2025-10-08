// College Scorecard (IPEDS proxy). Requires API key in env: SCORECARD_KEY
export const config = { path: "/fetchIPEDS" }; // /.netlify/functions/fetchIPEDS?unitid=217156

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const unitid = url.searchParams.get("unitid") || "217156";
    const key = process.env.SCORECARD_KEY; // add in Netlify → Environment variables
    if (!key) {
      res.status(500).send(JSON.stringify({ error: "Missing SCORECARD_KEY env var" }));
      return;
    }
    const fields = [
      "id","school.name","school.city","school.state","school.region_id",
      "latest.student.enrollment.all","latest.admissions.admission_rate.overall",
      "latest.cost.attendance.academic_year","latest.completion.rate_suppressed.overall"
    ].join(",");
    const api = `https://api.collegescorecard.ed.gov/v1/schools?id=${encodeURIComponent(unitid)}&api_key=${key}&fields=${fields}`;
    const r = await fetch(api);
    const j = await r.json();
    res.setHeader("Content-Type", "application/json");
    res.status(200).send(JSON.stringify({ unitid, data: j }, null, 2));
  } catch (e) {
    res.status(500).send(JSON.stringify({ error: e.message }));
  }
}
