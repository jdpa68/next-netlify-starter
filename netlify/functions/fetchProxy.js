// netlify/functions/fetchProxy.js
// Whitelist-aware fetch proxy for Lancelot
const TLD_ALLOW = ['.gov', '.edu', '.org'];
let kbDomains = null; // cached per cold start

const domainFromUrl = (urlStr) => {
  try {
    const { hostname } = new URL(urlStr);
    return hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
  } catch {
    return '';
  }
};

const endsWithAny = (host, list) => list.some(s => host.endsWith(s));

async function loadKbDomains() {
  if (kbDomains) return kbDomains;

  const restUrl = process.env.SUPABASE_REST_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!restUrl || !anon) throw new Error('Missing Supabase env vars');

  const url = `${restUrl}/v_kb_allowed_domains?select=domain`;
  const resp = await fetch(url, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` }
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`KB allowlist load failed: ${resp.status} ${text}`);
  }

  const rows = await resp.json();
  kbDomains = new Set(rows.map(r => String(r.domain || '').toLowerCase()));
  return kbDomains;
}

export async function handler(event) {
  try {
    const target = event.queryStringParameters?.url;
    if (!target) return { statusCode: 400, body: 'Missing url parameter' };

    const host = domainFromUrl(target);
    if (!host) return { statusCode: 400, body: 'Invalid URL' };

    // Allow any globally safe TLD without loading KB (fast path)
    if (!endsWithAny(host, TLD_ALLOW)) {
      // Otherwise require the host to be in the KB domain view
      const domains = await loadKbDomains();
      if (!domains.has(host)) {
        return { statusCode: 403, body: `Blocked: ${host}` };
      }
    }

    const upstream = await fetch(target, { headers: { 'User-Agent': 'Lancelot/1.0' } });
    const contentType = upstream.headers.get('content-type') || 'text/plain';
    const body = await upstream.text();

    return {
      statusCode: upstream.status,
      headers: {
        'content-type': contentType,
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, OPTIONS',
      },
      body
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, OPTIONS',
      },
      body: (err && err.message) || 'Server error'
    };
  }
}
