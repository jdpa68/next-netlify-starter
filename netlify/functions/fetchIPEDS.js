// netlify/functions/fetchIPEDS.js
// College Scorecard (IPEDS) proxy. Returns JSON results for a given school name.
export async function handler(event) {
  try {
    const school = event.queryStringParameters?.school || "";
    const fields = event.queryStringParameters?.fields
      || "id,school.name,school.city,school.state,latest.student.size,latest.admissions.admission_rate.overall,latest.completion.rate_suppressed.overall,latest.cost.tuition.in_state,latest.cost.tuition.out_of_state";

    if (!school) {
      return { statusCode: 400, body: "Missing 'school' query parameter" };
    }

    const apiKey = process.env.DATA_GOV_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: "Missing DATA_GOV_KEY environment variable" };
    }

    const params = new URLSearchParams({
      "school.name": school,
      "fields": fields,
      "per_page": "5",
      "api_key": apiKey
    });

    const url = `https://api.data.gov/ed/collegescorecard/v1/schools?${params.toString()}`;

    const resp = await fetch(url);
    const data = await resp.json();

    return {
      statusCode: resp.status,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS"
      },
      body: JSON.stringify(data, null, 2)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}
