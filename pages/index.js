import Head from 'next/head';
import { createClient } from '@supabase/supabase-js';

// --- Supabase connection using Netlify environment variables ---
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
);

// --- Server-side data fetch from the Knowledge Base table ---
export async function getServerSideProps() {
  const { data, error } = await supabase
    .from('knowledge_base')
    .select('id, title, summary, tags, source_url')
    .limit(5);

  return {
    props: {
      kbSamples: data || [],
      kbError: error ? String(error.message) : null,
    },
  };
}

// --- Main page component ---
export default function Home({ kbSamples = [], kbError = null }) {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 20 }}>
      <Head>
        <title>PeerQuest Lancelot UI</title>
      </Head>

      <header style={{ borderBottom: '1px solid #ccc', marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>PeerQuest Lancelot</h1>
        <p style={{ opacity: 0.7 }}>Knowledge Base Connection Test</p>
      </header>

      <main>
        <section
          style={{
            marginTop: 24,
            padding: 16,
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            background: '#fff',
            maxWidth: 720,
          }}
        >
          <h2 style={{ marginTop: 0 }}>KB connection check</h2>

          {kbError && (
            <p style={{ color: '#b91c1c' }}>Error: {kbError}</p>
          )}

          {!kbError && kbSamples.length === 0 && (
            <p>No rows found in knowledge_base.</p>
          )}

          {!kbError && kbSamples.length > 0 && (
            <ul style={{ paddingLeft: 18 }}>
              {kbSamples.map((r) => (
                <li key={r.id} style={{ marginBottom: 10 }}>
                  <strong>{r.title}</strong>
                  <div style={{ fontSize: 14, opacity: 0.85 }}>
                    {r.summary}
                  </div>
                  {r.source_url && (
                    <div style={{ fontSize: 13 }}>
                      <a
                        href={r.source_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Source
                      </a>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer
        style={{
          marginTop: 40,
          fontSize: 13,
          opacity: 0.6,
          borderTop: '1px solid #ccc',
          paddingTop: 10,
        }}
      >
        Lancelot • Netlify Demo • © {new Date().getFullYear()}
      </footer>
    </div>
  );
}
