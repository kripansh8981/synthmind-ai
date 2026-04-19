'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import toast from 'react-hot-toast';
import { FiUpload, FiFile, FiTrash2, FiGlobe, FiX, FiCheck, FiLoader, FiChevronDown, FiChevronUp, FiHash, FiBookOpen, FiCpu, FiLayers } from 'react-icons/fi';

export default function WorkspacePage() {
  const router = useRouter();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalTab, setModalTab] = useState('upload');
  const [uploading, setUploading] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState(null);
  const [summaryTab, setSummaryTab] = useState({}); // {docId: 'abstractive' | 'extractive'}
  const [deleteConfirm, setDeleteConfirm] = useState(null); // docId to confirm delete

  const getToken = () => localStorage.getItem('token');

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch('/api/documents/list', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.status === 401) { router.push('/login'); return; }
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    fetchDocuments();
  }, [router, fetchDocuments]);

  const handleFileUpload = async (file) => {
    if (!file) return;
    const validExts = ['pdf', 'docx', 'txt'];
    const ext = file.name.split('.').pop().toLowerCase();

    if (!validExts.includes(ext)) {
      toast.error('Only PDF, DOCX, and TXT files are supported');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Upload failed');
        return;
      }
      toast.success(`"${data.document.name}" uploaded — ${data.document.chunkCount} chunks created`);
      setShowModal(false);
      fetchDocuments();
    } catch (e) {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleScrape = async () => {
    if (!scrapeUrl) { toast.error('Enter a URL'); return; }
    setUploading(true);
    try {
      const res = await fetch('/api/documents/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ url: scrapeUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Scrape failed');
        return;
      }
      toast.success(`"${data.document.name}" scraped — ${data.document.chunkCount} chunks`);
      setShowModal(false);
      setScrapeUrl('');
      fetchDocuments();
    } catch (e) {
      toast.error('Scrape failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await fetch(`/api/documents/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      toast.success('Document deleted');
      setDeleteConfirm(null);
      fetchDocuments();
    } catch (e) {
      toast.error('Delete failed');
      setDeleteConfirm(null);
    }
  };

  const toggleExpand = (docId) => {
    setExpandedDoc(expandedDoc === docId ? null : docId);
  };

  const getDocSummaryTab = (docId) => summaryTab[docId] || 'abstractive';
  const setDocSummaryTab = (docId, tab) => setSummaryTab(prev => ({ ...prev, [docId]: tab }));

  const typeIcons = { pdf: '📄', docx: '📝', txt: '📃', url: '🌐' };
  const typeColors = { pdf: '#ef4444', docx: '#3b82f6', txt: '#f59e0b', url: '#06d6a0' };

  return (
    <div className="gradient-bg" style={{ minHeight: '100vh' }}>
      <Navbar />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800 }}>Your Documents</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
              Upload documents and get AI-powered summaries with TF-IDF analysis
            </p>
          </div>
          <button className="btn-accent" onClick={() => setShowModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FiUpload size={16} /> Upload Document
          </button>
        </div>

        {/* Documents Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <div className="spinner" style={{ width: 40, height: 40, margin: '0 auto' }}></div>
          </div>
        ) : documents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <div style={{
              width: 80, height: 80, borderRadius: 20,
              background: 'rgba(6, 214, 160, 0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 36, margin: '0 auto 20px',
            }}>📁</div>
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No documents yet</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
              Upload a PDF, DOCX, or TXT file to get started with AI-powered Q&A.
            </p>
            <button className="btn-accent" onClick={() => setShowModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 auto' }}>
              <FiUpload /> Upload Your First Document
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {documents.map((doc, i) => (
              <div key={doc.id} className="glass-card animate-slide-up" style={{ animationDelay: `${i * 0.05}s`, overflow: 'hidden' }}>
                {/* Card Header */}
                <div style={{ padding: '20px 24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: 14, flex: 1 }}>
                      <div style={{
                        width: 48, height: 48, borderRadius: 14,
                        background: `${typeColors[doc.type]}15`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 24, flexShrink: 0,
                      }}>
                        {typeIcons[doc.type] || '📄'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                          <h3 style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}>
                            {doc.name}
                          </h3>
                          <span style={{
                            fontSize: 10, fontWeight: 700,
                            padding: '2px 8px', borderRadius: 6,
                            background: `${typeColors[doc.type]}18`,
                            color: typeColors[doc.type],
                            textTransform: 'uppercase',
                            letterSpacing: 0.5,
                          }}>{doc.type}</span>
                        </div>
                        
                        {/* Stats Row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <FiLayers size={12} color="var(--text-muted)" />
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{doc.chunkCount} chunks</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            {doc.status === 'ready' ? (
                              <FiCheck size={12} color="var(--accent)" />
                            ) : doc.status === 'processing' ? (
                              <FiLoader size={12} color="var(--warning)" />
                            ) : (
                              <FiX size={12} color="var(--danger)" />
                            )}
                            <span style={{ fontSize: 12, fontWeight: 500, color: doc.status === 'ready' ? 'var(--accent)' : doc.status === 'processing' ? 'var(--warning)' : 'var(--danger)' }}>
                              {doc.status}
                            </span>
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {new Date(doc.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                          
                          {/* Keywords Badges */}
                          {doc.keywords && doc.keywords.length > 0 && (
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {doc.keywords.slice(0, 4).map((kw, j) => (
                                <span key={j} style={{
                                  fontSize: 10, fontWeight: 600,
                                  padding: '2px 7px', borderRadius: 5,
                                  background: 'rgba(124, 58, 237, 0.1)',
                                  color: 'var(--primary-light)',
                                  letterSpacing: 0.3,
                                }}>
                                  <FiHash size={8} style={{ marginRight: 2, verticalAlign: 'middle' }} />{kw}
                                </span>
                              ))}
                              {doc.keywords.length > 4 && (
                                <span style={{ fontSize: 10, color: 'var(--text-muted)', padding: '2px 4px' }}>
                                  +{doc.keywords.length - 4}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {/* Summary Toggle */}
                      {doc.summary && (
                        <button onClick={() => toggleExpand(doc.id)}
                          title="View AI Summary"
                          style={{
                            background: expandedDoc === doc.id ? 'rgba(6, 214, 160, 0.12)' : 'none',
                            border: `1px solid ${expandedDoc === doc.id ? 'var(--accent)' : 'var(--border-color)'}`,
                            borderRadius: 8,
                            cursor: 'pointer',
                            color: expandedDoc === doc.id ? 'var(--accent)' : 'var(--text-muted)',
                            padding: '6px 10px',
                            display: 'flex', alignItems: 'center', gap: 4,
                            fontSize: 11, fontWeight: 600,
                            transition: 'all 0.2s',
                          }}>
                          <FiBookOpen size={13} />
                          Summary
                          {expandedDoc === doc.id ? <FiChevronUp size={12} /> : <FiChevronDown size={12} />}
                        </button>
                      )}
                      <button onClick={() => setDeleteConfirm(doc.id)}
                        title="Delete document"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6 }}>
                        <FiTrash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expandable Summary Section */}
                {expandedDoc === doc.id && doc.summary && (
                  <div style={{
                    borderTop: '1px solid var(--border-color)',
                    background: 'rgba(0, 0, 0, 0.15)',
                  }}>
                    {/* Summary Type Tabs */}
                    <div style={{
                      display: 'flex', gap: 0,
                      borderBottom: '1px solid var(--border-color)',
                    }}>
                      {[
                        { key: 'abstractive', label: 'AI Summary', icon: FiCpu, desc: 'LLM-polished abstractive summary' },
                        { key: 'extractive', label: 'Key Sentences', icon: FiBookOpen, desc: 'TF-IDF extracted top sentences' },
                        { key: 'keywords', label: 'Keywords', icon: FiHash, desc: 'Top TF-IDF keywords' },
                      ].map(tab => (
                        <button key={tab.key} onClick={() => setDocSummaryTab(doc.id, tab.key)}
                          title={tab.desc}
                          style={{
                            flex: 1,
                            padding: '10px 16px',
                            border: 'none',
                            cursor: 'pointer',
                            fontFamily: 'Inter, sans-serif',
                            fontSize: 12, fontWeight: 600,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            background: getDocSummaryTab(doc.id) === tab.key ? 'rgba(124, 58, 237, 0.08)' : 'transparent',
                            color: getDocSummaryTab(doc.id) === tab.key ? 'var(--primary-light)' : 'var(--text-muted)',
                            borderBottom: getDocSummaryTab(doc.id) === tab.key ? '2px solid var(--primary-light)' : '2px solid transparent',
                            transition: 'all 0.2s',
                          }}>
                          <tab.icon size={13} /> {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* Summary Content */}
                    <div style={{ padding: '16px 24px' }}>
                      {getDocSummaryTab(doc.id) === 'abstractive' && (
                        <div>
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            marginBottom: 10,
                          }}>
                            <FiCpu size={13} color="var(--primary-light)" />
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary-light)', letterSpacing: 0.5 }}>
                              ABSTRACTIVE SUMMARY
                            </span>
                            <span style={{
                              fontSize: 9, fontWeight: 600,
                              padding: '1px 6px', borderRadius: 4,
                              background: 'rgba(6, 214, 160, 0.12)',
                              color: 'var(--accent)',
                              marginLeft: 4,
                            }}>TF-IDF + Gemini</span>
                          </div>
                          <p style={{
                            fontSize: 13, lineHeight: 1.8,
                            color: 'var(--text-secondary)',
                            padding: '12px 16px',
                            borderRadius: 10,
                            background: 'rgba(124, 58, 237, 0.04)',
                            border: '1px solid rgba(124, 58, 237, 0.1)',
                          }}>
                            {doc.summary}
                          </p>
                        </div>
                      )}

                      {getDocSummaryTab(doc.id) === 'extractive' && (
                        <div>
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            marginBottom: 10,
                          }}>
                            <FiBookOpen size={13} color="#06d6a0" />
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#06d6a0', letterSpacing: 0.5 }}>
                              EXTRACTIVE SUMMARY — TOP TF-IDF SENTENCES
                            </span>
                            <span style={{
                              fontSize: 9, fontWeight: 600,
                              padding: '1px 6px', borderRadius: 4,
                              background: 'rgba(6, 214, 160, 0.12)',
                              color: 'var(--accent)',
                              marginLeft: 4,
                            }}>Pure TF-IDF</span>
                          </div>
                          <p style={{
                            fontSize: 13, lineHeight: 1.8,
                            color: 'var(--text-secondary)',
                            padding: '12px 16px',
                            borderRadius: 10,
                            background: 'rgba(6, 214, 160, 0.04)',
                            border: '1px solid rgba(6, 214, 160, 0.1)',
                          }}>
                            {doc.extractiveSummary || 'No extractive summary available.'}
                          </p>
                          {/* Summary Stats */}
                          {doc.summaryStats && (
                            <div style={{
                              display: 'flex', gap: 20, marginTop: 10,
                              padding: '8px 16px', borderRadius: 8,
                              background: 'rgba(0,0,0,0.1)',
                            }}>
                              {[
                                { label: 'Total Sentences', value: doc.summaryStats.totalSentences },
                                { label: 'Selected', value: doc.summaryStats.selectedSentences },
                                { label: 'Unique Terms', value: doc.summaryStats.uniqueTerms },
                                { label: 'Input Length', value: doc.summaryStats.inputLength ? `${(doc.summaryStats.inputLength / 1000).toFixed(1)}K chars` : '—' },
                              ].filter(s => s.value != null).map((stat, j) => (
                                <div key={j}>
                                  <p style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: 0.5 }}>{stat.label}</p>
                                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{stat.value}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {getDocSummaryTab(doc.id) === 'keywords' && (
                        <div>
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            marginBottom: 10,
                          }}>
                            <FiHash size={13} color="#f59e0b" />
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', letterSpacing: 0.5 }}>
                              TOP TF-IDF KEYWORDS
                            </span>
                            <span style={{
                              fontSize: 9, fontWeight: 600,
                              padding: '1px 6px', borderRadius: 4,
                              background: 'rgba(245, 158, 11, 0.12)',
                              color: '#f59e0b',
                              marginLeft: 4,
                            }}>Ranked by TF-IDF score</span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {doc.keywords && doc.keywords.length > 0 ? doc.keywords.map((kw, j) => (
                              <div key={j} style={{
                                padding: '8px 16px',
                                borderRadius: 10,
                                background: `hsla(${(j * 37) % 360}, 60%, 50%, 0.08)`,
                                border: `1px solid hsla(${(j * 37) % 360}, 60%, 50%, 0.2)`,
                                display: 'flex', alignItems: 'center', gap: 6,
                              }}>
                                <span style={{
                                  fontSize: 10, fontWeight: 700,
                                  color: `hsla(${(j * 37) % 360}, 60%, 70%, 1)`,
                                  background: `hsla(${(j * 37) % 360}, 60%, 50%, 0.15)`,
                                  padding: '1px 6px', borderRadius: 4,
                                }}>#{j + 1}</span>
                                <span style={{
                                  fontSize: 13, fontWeight: 600,
                                  color: 'var(--text-primary)',
                                }}>{kw}</span>
                              </div>
                            )) : (
                              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No keywords extracted yet.</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Upload Modal */}
        {showModal && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 200,
          }} onClick={() => !uploading && setShowModal(false)}>
            <div className="glass-card animate-slide-up" style={{ width: 480, padding: 32 }}
              onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: 'rgba(6,214,160,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <FiUpload size={20} color="var(--accent)" />
                </div>
                <div>
                  <h3 style={{ fontWeight: 700, fontSize: 18 }}>Add Knowledge Source</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Document or Live URL — auto-summarized with TF-IDF</p>
                </div>
                <button onClick={() => setShowModal(false)}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                  <FiX size={20} />
                </button>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: 4, marginTop: 20, marginBottom: 20, background: 'var(--bg-secondary)', borderRadius: 10, padding: 4 }}>
                {[{ key: 'upload', label: 'File Upload', icon: FiFile }, { key: 'scrape', label: 'Web Scraping', icon: FiGlobe }].map(t => (
                  <button key={t.key} onClick={() => setModalTab(t.key)}
                    style={{
                      flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif',
                      background: modalTab === t.key ? 'var(--bg-card)' : 'transparent',
                      color: modalTab === t.key ? 'var(--text-primary)' : 'var(--text-muted)',
                      transition: 'all 0.2s',
                    }}>
                    <t.icon size={14} /> {t.label}
                  </button>
                ))}
              </div>

              {modalTab === 'upload' ? (
                <div
                  style={{
                    border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border-color)'}`,
                    borderRadius: 14,
                    padding: 40,
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.3s',
                    background: dragOver ? 'rgba(6,214,160,0.05)' : 'transparent',
                  }}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const file = e.dataTransfer.files[0];
                    if (file) handleFileUpload(file);
                  }}
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.pdf,.docx,.txt';
                    input.onchange = (e) => handleFileUpload(e.target.files[0]);
                    input.click();
                  }}
                >
                  {uploading ? (
                    <>
                      <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 12px' }}></div>
                      <p style={{ fontWeight: 600 }}>Processing document...</p>
                      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>Extracting text → Chunking → Embeddings → TF-IDF Summary</p>
                    </>
                  ) : (
                    <>
                      <FiUpload size={32} color="var(--text-muted)" style={{ marginBottom: 12 }} />
                      <p style={{ fontWeight: 600 }}>Drag document here or click to browse</p>
                      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>PDF, DOCX, TXT format — auto-summarized on upload</p>
                    </>
                  )}
                </div>
              ) : (
                <div>
                  <input
                    className="input-field"
                    placeholder="https://example.com/article"
                    value={scrapeUrl}
                    onChange={(e) => setScrapeUrl(e.target.value)}
                    style={{ marginBottom: 16 }}
                  />
                  <button className="btn-accent" onClick={handleScrape} disabled={uploading}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    {uploading ? <div className="spinner"></div> : <><FiGlobe size={16} /> Scrape & Index</>}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 300,
          }} onClick={() => setDeleteConfirm(null)}>
            <div className="glass-card animate-slide-up" style={{
              width: 400, padding: 32, textAlign: 'center',
            }} onClick={(e) => e.stopPropagation()}>
              <div style={{
                width: 56, height: 56, borderRadius: 16,
                background: 'rgba(239, 68, 68, 0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <FiTrash2 size={24} color="#ef4444" />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Delete Document?</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
                This will permanently remove this document and all its embeddings. This action cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button onClick={() => setDeleteConfirm(null)} style={{
                  flex: 1, padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border-color)',
                  background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer',
                  fontWeight: 600, fontSize: 13, fontFamily: 'Inter, sans-serif',
                  transition: 'all 0.2s',
                }}>
                  Cancel
                </button>
                <button onClick={() => handleDelete(deleteConfirm)} style={{
                  flex: 1, padding: '10px 20px', borderRadius: 10, border: 'none',
                  background: '#ef4444', color: '#fff', cursor: 'pointer',
                  fontWeight: 600, fontSize: 13, fontFamily: 'Inter, sans-serif',
                  transition: 'all 0.2s',
                }}>
                  Yes, Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
