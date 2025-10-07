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
    .limit(10); // show up to 10 for the tray

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
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 24, background: '#f8fafc' }}>
      <Head>
        <title>PeerQuest Lancelot Evidence Tray</title>
      </Head>

      <header style={{ borderBottom: '2px solid #0f172a', marginBottom: 24 }}>
        <h1 style={{ margin: 0, color: '#0f172a' }}>PeerQuest Lancelot</h1>
        <p style={{ opacity: 0.7 }}>Evidence Tray Prototype</p>
      </header>

      <main>
        <section
          style={{
            padding: 20,
            background: 'white',
            borderRadius: 16,
            boxShadow: '0 10px 30px rgba(0,0,0,0.05)',
            maxWidth: 900,
            margin: '0 auto',
          }}
        >
          <h2 style={{ marginTop: 0, borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>
            Evidence Tray
          </h2>

          {kbError && <p style={{ color: '#b91c1c' }}>Error: {kbError}</p>}

          {!kbError && kbSamples.length === 0 && (
            <p>No records found in knowledge_base.</p>
          )}

          {!kbError && kbSamples.length > 0 && (
            <div
              style={{
                maxHeight: '60vh',
                overflowY: 'auto',
                display: 'grid',
                gap: 16,
                paddingRight: 6,
              }}
            >
              {kbSamples.map((r) => (
                <div
                  key={r.id}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    padding: 16,
                    background: '#ffffff',
                  }}
                >
                  <h3 style={{ marginTop: 0, marginBottom: 4, color: '#1e293b' }}>
                    {r.title}
                  </h3>
                  <p style={{ marginTop: 0, marginBottom: 8, fontSize: 14, color: '#334155' }}>
                    {r.summary}
                  </p>
                  {r.tags && (
                    <div style={{ marginBottom: 8 }}>
                      {r.tags.split(',').slice(0, 3).map((t, i) => (
                        <span
                          key={i}
                          style={{
                            display: 'inline-block',
                            background: '#e2e8f0',
                            color: '#0f172a',
                            borderRadius: 6,
                            padding: '2px 8px',
                            fontSize: 12,
                            marginRight: 6,
                          }}
                        >
                          {t.trim()}
                        </span>
                      ))}
                    </div>
                  )}
                  {r.source_url && (
                    <a
                      href={r.source_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 13, color: '#2563eb' }}
                    >
                      View source ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer
        style={{
          marginTop: 40,
          fontSize: 13,
          opacity: 0.6,
          textAlign: 'center',
        }}
      >
        Lancelot • Netlify Demo • © {new Date().getFullYear()}
      </footer>
    </div>
  );
}

