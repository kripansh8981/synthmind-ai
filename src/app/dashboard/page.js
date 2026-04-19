'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { FiFile, FiLayers, FiZap, FiClock, FiActivity } from 'react-icons/fi';

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [recentQueries, setRecentQueries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.push('/login'); return; }
    fetchStats(token);
  }, [router]);

  const fetchStats = async (token) => {
    try {
      const res = await fetch('/api/dashboard/stats', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { router.push('/login'); return; }
      const data = await res.json();
      setStats(data.stats);
      setRecentQueries(data.recentQueries || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { label: 'DOCUMENTS', value: stats?.documents || 0, icon: FiFile, color: '#7c3aed' },
    { label: 'TOTAL CHUNKS', value: stats?.totalChunks || 0, icon: FiLayers, color: '#3b82f6' },
    { label: 'TOTAL QUERIES', value: stats?.totalQueries || 0, icon: FiZap, color: '#06d6a0' },
    { label: 'AVG RESPONSE', value: `${stats?.avgResponseTime || 0} ms`, icon: FiClock, color: '#f59e0b' },
    { label: 'CREDITS', value: stats?.credits || 0, icon: FiActivity, color: '#a855f7' },
  ];

  const pipelineStages = [
    { name: 'Document Upload', type: 'input', color: '#64748b' },
    { name: 'Ingestion Pipeline', type: 'ingestion', items: ['Text Extraction (PDF/DOCX/TXT/URL)', 'Sentence-Based Chunking (500 chars + overlap)', 'Embedding Generation → Gemini', 'TF-IDF Extractive Summary', 'LLM Abstractive Summary → Gemini', 'Store in Vector Store + MongoDB'], color: '#8b5cf6', note: 'Auto-summarization on upload' },
    { name: 'User Question', type: 'input', color: '#64748b' },
    { name: 'Cache Layer', type: 'cache', items: ['Exact Cache Check', 'Semantic Cache Check'], color: '#3b82f6', note: 'HIT → Instant Answer' },
    { name: 'Query Intelligence', type: 'preprocessing', items: ['Spell Correction', 'Query Expansion', 'Intent Classification', 'Contextual Rewrite'], color: '#7c3aed', model: 'Gemini' },
    { name: 'Retrieval', type: 'retrieval', items: ['HyDE Generation', 'Vector Search (Cosine)', 'BM25 Keyword Search', 'Reciprocal Rank Fusion', 'Semantic Re-rank → Top 7'], color: '#06d6a0' },
    { name: 'Generation', type: 'generation', items: ['Context Compression', 'Draft Answer → Groq/Llama 3.3', 'Reasoning + Refinement → Gemini', 'Self-Reflection + Confidence → Gemini', 'Citation Extraction'], color: '#f59e0b' },
    { name: 'Post-Processing', type: 'post', items: ['Save to Semantic Cache', 'Log Analytics', 'Update Credits'], color: '#ec4899' },
  ];

  return (
    <div className="gradient-bg" style={{ minHeight: '100vh' }}>
      <Navbar />
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className="status-dot live"></span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', letterSpacing: 1 }}>LIVE DASHBOARD</span>
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 800 }}>
            <span style={{ background: 'linear-gradient(135deg, var(--primary-light), var(--accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>SynthMind</span> AI Dashboard
          </h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>Real-time intelligence pipeline — query analytics & system health</p>
        </div>

        {/* Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 40 }}>
          {statCards.map((card, i) => (
            <div key={i} className="glass-card animate-slide-up" style={{ padding: '24px 20px', animationDelay: `${i * 0.1}s` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: `${card.color}18`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <card.icon size={20} color={card.color} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>#{i + 1}</span>
              </div>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 4 }}>{card.label}</p>
              <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>{loading ? '—' : card.value}</p>
              <div style={{ marginTop: 8, height: 3, borderRadius: 2, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '60%', borderRadius: 2, background: `linear-gradient(90deg, ${card.color}, ${card.color}88)` }}></div>
              </div>
            </div>
          ))}
        </div>

        {/* RAG Pipeline Section */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <FiActivity size={20} color="var(--primary-light)" />
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>RAG PIPELINE</h2>
          </div>

          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Terminal header */}
            <div style={{
              padding: '12px 20px',
              background: 'rgba(0,0,0,0.3)',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ef4444' }}></div>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#f59e0b' }}></div>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#06d6a0' }}></div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 2 }}>RAG · PIPELINE · LIVE</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="status-dot live"></span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>LIVE</span>
              </div>
            </div>

            {/* Pipeline Flow */}
            <div style={{ padding: '40px 32px' }}>
              <p style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 2, marginBottom: 32 }}>
                RAG PIPELINE · SYNTHMIND
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                {pipelineStages.map((stage, idx) => (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: 700 }}>
                    {/* Arrow */}
                    {idx > 0 && (
                      <div style={{ width: 2, height: 24, background: `linear-gradient(to bottom, ${pipelineStages[idx-1].color}88, ${stage.color}88)` }}></div>
                    )}

                    {/* Stage Box */}
                    <div style={{
                      width: '100%',
                      borderRadius: 14,
                      border: `1px solid ${stage.color}44`,
                      background: `${stage.color}08`,
                      padding: stage.items ? '16px 24px' : '12px 24px',
                      position: 'relative',
                    }}>
                      {/* Stage label */}
                      {stage.items && (
                        <div style={{
                          position: 'absolute', top: -10, left: 16,
                          background: 'var(--bg-primary)',
                          padding: '0 8px',
                          fontSize: 10, fontWeight: 700, color: stage.color,
                          letterSpacing: 1.5, textTransform: 'uppercase',
                        }}>
                          {stage.name}
                        </div>
                      )}

                      {!stage.items ? (
                        <div style={{ textAlign: 'center', padding: '6px 0' }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: stage.color }}>● {stage.name}</span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 6 }}>
                          {stage.items.map((item, j) => (
                            <div key={j} style={{
                              padding: '6px 14px',
                              borderRadius: 8,
                              background: `${stage.color}12`,
                              border: `1px solid ${stage.color}30`,
                              fontSize: 12,
                              fontWeight: 500,
                              color: 'var(--text-secondary)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}>
                              {item.includes('Gemini') && <span style={{ fontSize: 9, fontWeight: 700, color: stage.color, background: `${stage.color}20`, padding: '1px 5px', borderRadius: 4 }}>Gemini</span>}
                              {item.includes('Groq') && <span style={{ fontSize: 9, fontWeight: 700, color: stage.color, background: `${stage.color}20`, padding: '1px 5px', borderRadius: 4 }}>Groq</span>}
                              {item.replace('→ Gemini', '').replace('→ Groq/Llama 3.3', '').trim()}
                            </div>
                          ))}
                          {stage.note && (
                            <div style={{ width: '100%', fontSize: 11, color: 'var(--accent)', marginTop: 4, fontWeight: 500 }}>
                              💡 {stage.note}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Final output */}
                <div style={{ width: 2, height: 24, background: 'linear-gradient(to bottom, #ec489988, #06d6a088)' }}></div>
                <div style={{
                  padding: '12px 28px',
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, rgba(6, 214, 160, 0.12), rgba(124, 58, 237, 0.12))',
                  border: '1px solid var(--accent)',
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'var(--accent)',
                  boxShadow: '0 0 20px var(--accent-glow)',
                }}>
                  ✅ Final Answer
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Queries */}
        {recentQueries.length > 0 && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Recent Queries</h2>
            <div className="glass-card" style={{ overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    {['Query', 'Response Time', 'Cached', 'Confidence', 'Date'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 1 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentQueries.map((q, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(42, 42, 90, 0.3)' }}>
                      <td style={{ padding: '12px 16px', fontSize: 13 }}>{q.query}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{q.responseTime}ms</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          padding: '2px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                          background: q.cached ? 'rgba(6,214,160,0.12)' : 'rgba(100,116,139,0.12)',
                          color: q.cached ? 'var(--accent)' : 'var(--text-muted)',
                        }}>{q.cached ? 'HIT' : 'MISS'}</span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span className={`confidence-badge ${q.confidence >= 80 ? 'confidence-high' : q.confidence >= 50 ? 'confidence-medium' : 'confidence-low'}`}>
                          {q.confidence || '—'}%
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>{q.createdAt ? new Date(q.createdAt).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
