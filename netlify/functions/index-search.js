// netlify/functions/index-search.js
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

const TABLES = [
  // Feel free to add/remove table names as you finalize your schema.
  { name: "dissertations", titleCols: ["title"], textCols: ["abstract", "summary"], urlCols: ["url", "source_url"] },
  { name: "accreditation_docs", titleCols: ["title","name"], textCols: ["summary","content","text","body"], urlCols: ["url"] },
  { name: "feasibility_docs",   titleCols: ["title","name"], textCols: ["summary","content","text","body"], urlCols: ["url"] },
  { name: "strategic_plans",    titleCols: ["title","name"], textCols: ["summary","content","text","body"], urlCols: ["url"] },
  { name: "leadership_docs",    titleCols: ["title","name"], textCols: ["summary","content","text","body"], urlCols: ["url"] },
  { name: "lms_guides",         titleCols: ["title","name"], textCols: ["summary","content","text","body"], urlCols: ["url"] },
  { name: "crm_guides",         titleCols: ["title","name"], textCols: ["summary","content","text","body"], urlCols: ["url"] },
  { name: "ir_analytics_docs",  titleCols: ["title","name"], textCols: ["summary","content","text","body"], urlCols: ["url"] },
];

function buildOrIlike(cols, term) {
  // or=(col.ilike.%25term%25,col2.ilike.%25term%25)
  const enc = (s) => encodeURIComponent(s);
  const pattern = `%${term}%`;
  const parts = cols.map((c) => `${c}.ilike.${enc(pattern)}`);
  return `or=(${parts.join(",")})`;
}

function pickFirst(obj, candidates = []) {
  for (const c of candidates) if (obj && obj[c] != null) return obj[c];
  return "";
}

function scoreRow(row, q, titleCols, textCols) {
  const ql = q.toLowerCase();
  const title = pickFirst(row, titleCols) + "";
  const text  = pickFirst(row, textCols) + "";
  const tHit  = title.toLowerCase().includes(ql) ? 20 : 0;
  const bHit  = text.toLowerCase().includes(ql)  ? 10 : 0;
  const lenPenalty = Math.min(5, Math.floor((text.length || 0) / 2000));
  return tHit + bHit - lenPenalty;
}

function snippetAround(text = "", q = "", maxLen = 420) {
  if (!text) return "";
  const t = text.replace(/\s+/g, " ").trim();
  if (!q) return t.slice(0, maxLen);
  const i = t.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return t.slice(0, maxLen);
  const start = Math.max(0, i - Math.floor(maxLen / 2));
  const s = t.slice(start, start + maxLen);
  return (start > 0 ? "… " : "") + s + (start + maxLen < t.length ? " …" : "");
}

async function searchTable(q, tableCfg, limitPerTable = 6) {
  const titleCols = tableCfg.titleCols || ["title","name"];
  const textCols  = tableCfg.textCols  || ["summary","content","text","abstract","body"];
  const urlCols   = tableCfg.urlCols   || ["url","source_url"];

  // Build select list
  const selectCols = new Set(["id", ...titleCols, ...textCols, ...urlCols]);
  const select = Array.from(selectCols).join(",");

  const where = buildOrIlike([...titleCols, ...textCols], q);
  const url = `${SUPABASE_URL}/rest/v1/${tableCfg.name}?select=${encodeURIComponent(select)}&${where}&limit=${limitPerTable}`;

  const res = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
  if (!res.ok) {
    // If table doesn't exist or other error, skip silently
    return [];
  }
  const rows = await res.json();

  return rows.map((r) => {
    const title = pickFirst(r, titleCols) || "(untitled)";
    const body  = pickFirst(r, textCols);
    const url   = pickFirst(r, urlCols);
    return {
      table: tableCfg.name,
      id: r.id ?? null,
      title,
      snippet: snippetAround(body, q, 420),
      url: url || "",
      __score: scoreRow(r, q, titleCols, textCols)
    };
  });
}

exports.handler = async (event) => {
  try {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_ANON_KEY" }) };
    }

    const method = event.httpMethod || "GET";
    const q =
      method === "POST"
        ? (JSON.parse(event.body || "{}").query || "").trim()
        : (event.queryStringParameters?.q || "").trim();

    if (!q) return { statusCode: 400, body: JSON.stringify({ error: "Provide a query (?q= or POST {query})" }) };

    // Fan out to tables (in parallel)
    const perTable = 6; // tune as needed
    const batches = await Promise.all(TABLES.map((t) => searchTable(q, t, perTable)));
    const all = batches.flat();

    // De-duplicate by (title + table) and sort by score desc
    const dedupMap = new Map();
    for (const r of all) {
      const key = `${r.table}::${r.title}`.toLowerCase();
      if (!dedupMap.has(key) || dedupMap.get(key).__score < r.__score) {
        dedupMap.set(key, r);
      }
    }
    const results = Array.from(dedupMap.values()).sort((a, b) => b.__score - a.__score).slice(0, 12);

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: q, count: results.length, results })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err?.message || err) }) };
  }
};
