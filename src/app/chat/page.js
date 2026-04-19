'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import ReactMarkdown from 'react-markdown';
import toast from 'react-hot-toast';
import { FiSend, FiPlus, FiFile, FiClock, FiTarget, FiMic, FiMicOff, FiChevronRight, FiMessageSquare, FiTrash2, FiCheck, FiLoader, FiZap, FiCpu, FiSearch, FiEdit3, FiShield, FiArrowUpRight } from 'react-icons/fi';

export default function ChatPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pipelineData, setPipelineData] = useState(null);
  const [showPipeline, setShowPipeline] = useState(true);
  const [listening, setListening] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [userCredits, setUserCredits] = useState(100);
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);

  const getToken = () => localStorage.getItem('token');

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch('/api/documents/list', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.status === 401) { router.push('/login'); return; }
      const data = await res.json();
      setDocuments(data.documents?.filter(d => d.status === 'ready') || []);
    } catch (e) { console.error(e); }
  }, [router]);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/sessions', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    const userData = localStorage.getItem('user');
    if (userData) {
      const u = JSON.parse(userData);
      setUserCredits(u.credits || 0);
    }
    fetchDocuments();
    fetchSessions();
  }, [router, fetchDocuments, fetchSessions]);

  // Listen for credit updates
  useEffect(() => {
    const handleCredits = (e) => setUserCredits(e.detail);
    window.addEventListener('credits-update', handleCredits);
    return () => window.removeEventListener('credits-update', handleCredits);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadSession = async (sessionId) => {
    try {
      const res = await fetch(`/api/chat/history?sessionId=${sessionId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.session) {
        setCurrentSession(sessionId);
        setMessages(data.session.messages || []);
        setSelectedDoc(data.session.documentId);
        const lastAssistant = data.session.messages?.filter(m => m.role === 'assistant').pop();
        if (lastAssistant?.pipelineSteps) {
          setPipelineData({ steps: lastAssistant.pipelineSteps });
        }
      }
    } catch (e) { console.error(e); }
  };

  const handleNewChat = () => {
    setCurrentSession(null);
    setMessages([]);
    setPipelineData(null);
  };

  const handleSend = async () => {
    if (!input.trim() || !selectedDoc || loading) return;

    // Check credits before sending
    if (userCredits <= 0) {
      setShowUpgradeModal(true);
      return;
    }

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);
    setPipelineData(null);

    try {
      const res = await fetch('/api/chat/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          query: userMessage,
          documentId: selectedDoc,
          sessionId: currentSession,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 && data.error?.includes('credits')) {
          setShowUpgradeModal(true);
        } else {
          toast.error(data.error || 'Query failed');
        }
        setLoading(false);
        return;
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.answer,
        confidence: data.confidence,
        citations: data.citations,
        responseTime: data.responseTime,
        cached: data.cached,
      }]);

      setPipelineData(data.pipeline);
      setCurrentSession(data.sessionId);

      // Update credits in navbar
      if (data.creditsRemaining !== undefined) {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        user.credits = data.creditsRemaining;
        localStorage.setItem('user', JSON.stringify(user));
        window.dispatchEvent(new CustomEvent('credits-update', { detail: data.creditsRemaining }));
        setUserCredits(data.creditsRemaining);

        // Show upgrade modal when credits hit 0
        if (data.creditsRemaining <= 0) {
          setTimeout(() => setShowUpgradeModal(true), 1000);
        }
      }

      fetchSessions();
    } catch (e) {
      toast.error('Connection error');
    } finally {
      setLoading(false);
    }
  };

  // Voice input
  const toggleVoice = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      toast.error('Speech recognition not supported');
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      setInput(event.results[0][0].transcript);
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  const pipelineStepIcons = {
    cache: { icon: FiZap, label: 'Cache Layer', color: '#3b82f6' },
    preprocessing: { icon: FiEdit3, label: 'Query Intelligence', color: '#7c3aed' },
    spellCorrection: { icon: FiEdit3, label: 'Spell Correction', color: '#7c3aed', sub: true },
    queryExpansion: { icon: FiSearch, label: 'Query Expansion', color: '#7c3aed', sub: true },
    intentClassification: { icon: FiTarget, label: 'Intent Classification', color: '#7c3aed', sub: true },
    contextualRewrite: { icon: FiEdit3, label: 'Contextual Rewrite', color: '#7c3aed', sub: true },
    retrieval: { icon: FiSearch, label: 'Retrieval', color: '#06d6a0' },
    hyde: { icon: FiCpu, label: 'HyDE Generation', color: '#06d6a0', sub: true },
    vectorSearch: { icon: FiSearch, label: 'Vector Search', color: '#06d6a0', sub: true },
    bm25Search: { icon: FiSearch, label: 'BM25 Search', color: '#06d6a0', sub: true },
    fusion: { icon: FiTarget, label: 'Rank Fusion', color: '#06d6a0', sub: true },
    reranking: { icon: FiTarget, label: 'Semantic Re-rank', color: '#06d6a0', sub: true },
    generation: { icon: FiCpu, label: 'Generation', color: '#f59e0b' },
    contextCompression: { icon: FiFile, label: 'Context Compression', color: '#f59e0b', sub: true },
    draftGeneration: { icon: FiCpu, label: 'Draft (Llama 3.3)', color: '#f59e0b', sub: true },
    refinement: { icon: FiShield, label: 'Refinement (Gemini)', color: '#f59e0b', sub: true },
    selfReflection: { icon: FiShield, label: 'Self-Reflection', color: '#f59e0b', sub: true },
    citations: { icon: FiFile, label: 'Citations', color: '#f59e0b', sub: true },
    postProcessing: { icon: FiCheck, label: 'Post-Processing', color: '#ec4899' },
  };

  return (
    <div className="gradient-bg" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', height: 'calc(100vh - 60px)' }}>

        {/* Left Sidebar - Sessions */}
        <div style={{
          width: 260,
          borderRight: '1px solid var(--border-color)',
          background: 'rgba(13, 13, 31, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}>
          <div style={{ padding: 16 }}>
            <button className="btn-primary" onClick={handleNewChat}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <FiPlus size={16} /> New Chat
            </button>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '0 8px' }}>
            {sessions.map(s => (
              <button key={s._id} onClick={() => loadSession(s._id)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  marginBottom: 4,
                  fontFamily: 'Inter, sans-serif',
                  transition: 'all 0.2s',
                  background: currentSession === s._id ? 'rgba(124,58,237,0.12)' : 'transparent',
                  color: currentSession === s._id ? 'var(--primary-light)' : 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
                <FiMessageSquare size={14} />
                <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.title}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Main Chat Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Document Selector */}
          <div style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--border-color)',
            background: 'rgba(13, 13, 31, 0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <FiFile size={16} color="var(--text-muted)" />
            <select
              value={selectedDoc || ''}
              onChange={(e) => setSelectedDoc(e.target.value)}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 8,
                padding: '6px 12px',
                color: 'var(--text-primary)',
                fontSize: 13,
                fontFamily: 'Inter, sans-serif',
                outline: 'none',
                cursor: 'pointer',
                minWidth: 200,
              }}
            >
              <option value="">Select a document...</option>
              {documents.map(d => (
                <option key={d.id} value={d.id}>{d.name} ({d.chunkCount} chunks)</option>
              ))}
            </select>
            {documents.length === 0 && (
              <button className="btn-ghost" onClick={() => router.push('/workspace')}
                style={{ fontSize: 12 }}>
                📁 Open Workspace
              </button>
            )}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', padding: 60 }}>
                <div style={{
                  width: 72, height: 72, borderRadius: 18,
                  background: 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(6,214,160,0.15))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 36, margin: '0 auto 20px',
                }}>🧠</div>
                <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
                  {selectedDoc ? 'Ask a question about your document' : 'Select a document to begin'}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                  The AI will analyze your document using a multi-stage RAG pipeline
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} style={{
                marginBottom: 20,
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  maxWidth: '75%',
                  padding: '14px 18px',
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: msg.role === 'user'
                    ? 'linear-gradient(135deg, var(--primary), var(--primary-light))'
                    : 'var(--bg-card)',
                  border: msg.role === 'assistant' ? '1px solid var(--border-color)' : 'none',
                }}>
                  {msg.role === 'assistant' ? (
                    <>
                      <div className="markdown-content">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                      {/* Meta info */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-color)' }}>
                        {msg.confidence != null && (
                          <span className={`confidence-badge ${msg.confidence >= 80 ? 'confidence-high' : msg.confidence >= 50 ? 'confidence-medium' : 'confidence-low'}`}>
                            {msg.confidence}% confident
                          </span>
                        )}
                        {msg.responseTime && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <FiClock size={11} /> {msg.responseTime}ms
                          </span>
                        )}
                        {msg.cached && (
                          <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <FiZap size={11} /> Cached
                          </span>
                        )}
                      </div>
                      {/* Citations */}
                      {msg.citations && msg.citations.length > 0 && (
                        <div style={{ marginTop: 10 }}>
                          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Sources:</p>
                          {msg.citations.map((c, j) => (
                            <div key={j} style={{
                              fontSize: 12, color: 'var(--text-secondary)',
                              padding: '6px 10px', borderRadius: 8,
                              background: 'rgba(124,58,237,0.06)',
                              marginBottom: 4,
                              borderLeft: '2px solid var(--primary)',
                            }}>
                              {c.pageNumber && <span style={{ color: 'var(--primary-light)', fontWeight: 600 }}>Page {c.pageNumber}: </span>}
                              {c.content?.substring(0, 120)}...
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <p style={{ fontSize: 14, lineHeight: 1.6 }}>{msg.content}</p>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                <div style={{
                  padding: '14px 18px',
                  borderRadius: '16px 16px 16px 4px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}>
                  <div className="spinner"></div>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Processing through pipeline...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div style={{
            padding: '16px 20px',
            borderTop: '1px solid var(--border-color)',
            background: 'rgba(13, 13, 31, 0.7)',
          }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                className="input-field"
                placeholder={selectedDoc ? "Ask a question about your document..." : "Select a document first..."}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                disabled={!selectedDoc || loading}
                style={{ flex: 1 }}
              />
              <button onClick={toggleVoice}
                style={{
                  width: 44, height: 44, borderRadius: 12,
                  border: `1px solid ${listening ? 'var(--danger)' : 'var(--border-color)'}`,
                  background: listening ? 'rgba(239,68,68,0.12)' : 'var(--bg-card)',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: listening ? 'var(--danger)' : 'var(--text-muted)',
                }}>
                {listening ? <FiMicOff size={18} /> : <FiMic size={18} />}
              </button>
              <button onClick={handleSend} className="btn-primary"
                disabled={!selectedDoc || !input.trim() || loading}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FiSend size={16} /> Ask
              </button>
            </div>
          </div>
        </div>

        {/* Right Sidebar - Pipeline Inspector */}
        {showPipeline && (
          <div style={{
            width: 300,
            borderLeft: '1px solid var(--border-color)',
            background: 'rgba(13, 13, 31, 0.5)',
            overflow: 'auto',
            flexShrink: 0,
          }}>
            <div style={{
              padding: '16px 16px 12px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FiCpu size={16} color="var(--primary-light)" />
                <span style={{ fontSize: 13, fontWeight: 700 }}>Pipeline Inspector</span>
              </div>
              <span className="status-dot live"></span>
            </div>

            <div style={{ padding: 12 }}>
              {!pipelineData && !loading && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>
                  Pipeline data will appear here after a query
                </p>
              )}

              {loading && (
                <div style={{ textAlign: 'center', padding: 20 }}>
                  <div className="spinner" style={{ margin: '0 auto 10px' }}></div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Running pipeline...</p>
                </div>
              )}

              {pipelineData && !loading && (
                <div>
                  {/* Total time */}
                  <div style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, rgba(124,58,237,0.08), rgba(6,214,160,0.08))',
                    border: '1px solid var(--border-color)',
                    marginBottom: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>Total Pipeline Time</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
                      {pipelineData.totalTime || '—'}ms
                    </span>
                  </div>

                  {/* Pipeline steps */}
                  {Object.entries(pipelineData.steps || {}).map(([key, stepData]) => {
                    const stepConfig = pipelineStepIcons[key] || { icon: FiChevronRight, label: key, color: '#64748b' };
                    const StepIcon = stepConfig.icon;

                    return (
                      <div key={key}>
                        <div className="pipeline-step done">
                          <div style={{
                            width: 28, height: 28, borderRadius: 7,
                            background: `${stepConfig.color}18`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            <StepIcon size={14} color={stepConfig.color} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{stepConfig.label}</p>
                            {stepData.time != null && (
                              <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>{stepData.time}ms</p>
                            )}
                          </div>
                          <FiCheck size={14} color="var(--accent)" />
                        </div>

                        {/* Sub-steps */}
                        {typeof stepData === 'object' && Object.entries(stepData).map(([subKey, subVal]) => {
                          const subConfig = pipelineStepIcons[subKey];
                          if (!subConfig || !subConfig.sub) return null;
                          const SubIcon = subConfig.icon;

                          return (
                            <div key={subKey} className="pipeline-step done" style={{ marginLeft: 20, padding: '6px 10px' }}>
                              <SubIcon size={12} color={subConfig.color} />
                              <div style={{ flex: 1 }}>
                                <p style={{ fontSize: 11, fontWeight: 500 }}>{subConfig.label}</p>
                                {subVal?.time != null && (
                                  <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>{subVal.time}ms</p>
                                )}
                              </div>
                              <FiCheck size={12} color="var(--accent)" />
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Upgrade Modal — shown when credits are exhausted */}
      {showUpgradeModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 300,
        }}>
          <div className="glass-card animate-slide-up" style={{
            width: 440, padding: '40px 36px', textAlign: 'center',
            border: '1px solid rgba(124, 58, 237, 0.4)',
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: 18,
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(249, 115, 22, 0.15))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 36, margin: '0 auto 20px',
            }}>⚡</div>

            <h3 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
              Credits Exhausted
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.7, marginBottom: 8 }}>
              You've used all your free credits. Upgrade your plan to continue using the AI pipeline.
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 28 }}>
              Pro plan starts at just <span style={{ color: 'var(--primary-light)', fontWeight: 700 }}>₹499/month</span> with 5,000 credits
            </p>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="btn-ghost"
                style={{ flex: 1, padding: '12px 0', fontSize: 14 }}
              >
                Maybe Later
              </button>
              <button
                onClick={() => router.push('/upgrade')}
                style={{
                  flex: 2, padding: '12px 0', borderRadius: 12, border: 'none',
                  cursor: 'pointer', fontWeight: 700, fontSize: 14,
                  fontFamily: 'Inter, sans-serif',
                  background: 'linear-gradient(135deg, var(--primary), var(--accent))',
                  color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: '0 4px 20px rgba(124, 58, 237, 0.4)',
                }}
              >
                <FiArrowUpRight size={16} /> Upgrade Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
