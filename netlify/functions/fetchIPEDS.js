// /.netlify/functions/fetchIPEDS?unitid=217156
// College Scorecard via DATA_GOV_KEY
export const config = { path: "/fetchIPEDS" };

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const unitid = url.searchParams.get("unitid") || "217156";
    const key = process.env.DATA_GOV_KEY;
    if (!key) return res.status(500).json({ error: "Missing DATA_GOV_KEY" });

    const fields = [
      "id","school.name","school.city","school.state",
      "latest.student.enrollment.all",
      "latest.admissions.admission_rate.overall",
      "latest.cost.attendance.academic_year",
      "latest.completion.rate_suppressed.overall"
    ].join(",");

    const api = `https://api.collegescorecard.ed.gov/v1/schools?id=${encodeURIComponent(unitid)}&api_key=${encodeURIComponent(key)}&fields=${encodeURIComponent(fields)}`;

    const r = await fetch(api, { headers: { Accept: "application/json" } });
    const text = await r.text();
    res.setHeader("Content-Type", "application/json");
    res.status(r.ok ? 200 : r.status).send(text);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
