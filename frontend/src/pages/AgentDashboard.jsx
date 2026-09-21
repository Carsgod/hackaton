import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  User, Users, CheckCircle2, AlertTriangle,
  ArrowLeft, Search, Settings, HelpCircle, MessageSquare, Smartphone, Send, RotateCcw, Mic,
} from 'lucide-react'
import { useWebSocket } from '../hooks/useWebSocket'
import { useAccessibility } from '../hooks/useAccessibility'
import { extractCards, DEMO_TREE_EN, DEMO_TREE_TWI } from '../data/conversationTree'

const AUTO_CUSTOMER_RESPONSES = [
  'I sent money to my sister',
  'I have an account issue',
  'I need help with a transaction',
  '0595759917',
  'I don\'t have the number right now',
  'What should I do?',
  'Will the money come back?',
  'Yes, please reverse it',
  'I want a refund',
  'Thank you',
  'Thank you so much',
  'My balance is incorrect',
  'I can\'t access my account',
  'There is an unauthorized charge',
  'A MoMo transfer',
  'A bank deposit',
  'A bill payment',
]

export default function AgentDashboard({ sessionId, onBack }) {
  const [language, setLanguage] = useState('en')
  const [transcripts, setTranscripts] = useState([])
  const [cards, setCards] = useState([])
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [smsSent, setSmsSent] = useState(false)
  const [caseNumber, setCaseNumber] = useState('')
  const [agentInput, setAgentInput] = useState('')
  const [networkStatus, setNetworkStatus] = useState('online')
  const [offlineQueue, setOfflineQueue] = useState(0)
  const [ready, setReady] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [activeTab, setActiveTab] = useState('transcript')
  const [dualLanguage, setDualLanguage] = useState(false)
  const [speakingId, setSpeakingId] = useState(null)
  const [showSignIn, setShowSignIn] = useState(false)
  const [agentName, setAgentName] = useState('')
  const [agentId, setAgentId] = useState('')
  const [agentRole] = useState('Counter Support')
  const [signInName, setSignInName] = useState('')
  const [signInId, setSignInId] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const transcriptsContainerRef = useRef(null)
  const isNearBottomRef = useRef(true)
  const recognitionRef = useRef(null)
  const { currentFontSize } = useAccessibility()
  const safeSessionId = encodeURIComponent(sessionId || '')
  const wsUrl = `${import.meta.env.VITE_BACKEND_URL || 'ws://localhost:8000'}/ws/${safeSessionId}?language=${language}`

  const checkNearBottom = useCallback(() => {
    const el = transcriptsContainerRef.current
    if (!el) return true
    const threshold = 80
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  }, [])

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    const el = transcriptsContainerRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  const addAgentMessage = (text) => {
    setTranscripts(prev => [...prev, { speaker: 'agent', text, timestamp: Date.now() }])
    const nextCards = extractCards(text)
    setCards(prev => {
      const merged = [...prev]
      nextCards.forEach(card => { if (!merged.find(c => c.value === card.value)) merged.push(card) })
      return merged
    })
  }

  const getTranslation = (nodeId, speaker) => {
    if (!dualLanguage) return null
    const otherLang = language === 'en' ? DEMO_TREE_TWI : DEMO_TREE_EN
    const otherNode = otherLang[nodeId]
    if (!otherNode) return null
    return speaker === 'agent' ? otherNode?.agent : null
  }

  const speakText = (text, id) => {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = language === 'tw' ? 'tw-GH' : 'en-GH'
    utterance.rate = 1
    utterance.pitch = 1
    utterance.volume = 1
    utterance.onstart = () => setSpeakingId(id)
    utterance.onend = () => setSpeakingId(null)
    utterance.onerror = () => setSpeakingId(null)
    window.speechSynthesis.speak(utterance)
  }

  const simulateCustomerResponse = () => {
    const responses = AUTO_CUSTOMER_RESPONSES
    const randomResponse = responses[Math.floor(Math.random() * responses.length)]
    const delay = 1500 + Math.random() * 2000

    setTimeout(() => {
      setTranscripts(prev => [...prev, { speaker: 'customer', text: randomResponse, timestamp: Date.now() }])
    }, delay)
  }

  const sendAgentMessage = (text) => {
    if (!text.trim()) return
    addAgentMessage(text.trim())
    setAgentInput('')
    simulateCustomerResponse()
  }

  const handleMessage = useCallback((data) => {
    switch (data.type) {
      case 'transcript':
        if (data.is_final) {
          setTranscripts(prev => {
            const exists = prev.find(t => t.timestamp === data.timestamp)
            if (exists) return prev.map(t => t.timestamp === data.timestamp ? { ...t, ...data } : t)
            return [...prev, { ...data, translation: null }]
          })
        }
        if (data.cards) {
          setCards(prev => {
            const next = [...prev]
            data.cards.forEach(card => {
              if (!next.find(c => c.value === card.value)) next.push(card)
            })
            return next
          })
        }
        break
      case 'connected':
        setConnectionStatus('connected')
        break
      case 'status':
        setConnectionStatus(data.status === 'ended' ? 'ended' : data.status)
        break
      case 'sms':
        setSmsSent(true)
        setCaseNumber(data.data?.case_number || '')
        break
      case 'ack':
        setAgentInput('')
        break
      default:
        break
    }
  }, [])

  const onConnect = useCallback(() => setConnectionStatus('connected'), [])
  const onDisconnect = useCallback(() => setConnectionStatus('disconnected'), [])

  const startRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser.')
      return
    }
    const recognition = new SpeechRecognition()
    recognition.lang = language === 'tw' ? 'tw-GH' : 'en-GH'
    recognition.interimResults = true
    recognition.continuous = false
    recognitionRef.current = recognition

    recognition.onstart = () => setIsRecording(true)
    recognition.onend = () => setIsRecording(false)
    recognition.onerror = () => setIsRecording(false)
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(result => result[0].transcript)
        .join('')
      setAgentInput(transcript)
    }
    recognition.start()
  }

  const stopRecording = () => {
    recognitionRef.current?.stop()
    setIsRecording(false)
  }

  const { isConnected, error, connect, disconnect, send } = useWebSocket(
    wsUrl,
    handleMessage,
    onConnect,
    onDisconnect
  )

  useEffect(() => {
    connect()
    return () => disconnect()
  }, [sessionId, wsUrl, connect, disconnect])

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
    }
  }, [])

  useEffect(() => {
    const el = transcriptsContainerRef.current
    if (!el) return
    const handleScroll = () => {
      isNearBottomRef.current = checkNearBottom()
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [checkNearBottom])

  useEffect(() => {
    if (isNearBottomRef.current) {
      scrollToBottom('smooth')
    }
  }, [transcripts, scrollToBottom])

  useEffect(() => {
    const onOnline = () => { setNetworkStatus('online'); setOfflineQueue(0) }
    const onOffline = () => setNetworkStatus('offline')
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 50)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!ready) return
    setTranscripts([])
    setCards([])
    setConnectionStatus('connecting')
    setSmsSent(false)
    setCaseNumber('')
    setAgentInput('')
  }, [language, ready])

  const sendAgentResponse = (text) => {
    if (!text.trim()) return
    const message = { type: 'response', data: { text: text.trim(), speaker: 'agent', timestamp: Date.now() } }
    send(message)
    addAgentMessage(text.trim())
    setAgentInput('')
    simulateCustomerResponse()
  }

  const resolveCase = () => {
    const cn = caseNumber || `CASE${Date.now().toString().slice(-6)}`
    setCaseNumber(cn)
    send({ type: 'request_sms', case_number: cn })
    setSmsSent(true)
  }

  const escalateCase = () => {
    send({ type: 'status', status: 'escalated' })
  }

  const handleSignIn = () => {
    if (!signInName.trim() || !signInId.trim()) {
      alert('Please enter both Agent Name and Agent ID')
      return
    }
    setAgentName(signInName.trim())
    setAgentId(signInId.trim())
    setShowSignIn(false)
    setSignInName('')
    setSignInId('')
  }

  const statusColor = connectionStatus === 'connected' ? '#10b981' : connectionStatus === 'connecting' ? '#f59e0b' : '#ef4444'
  const statusLabel = connectionStatus === 'connected' ? 'LIVE' : connectionStatus === 'connecting' ? 'CONNECTING' : connectionStatus === 'ended' ? 'ENDED' : 'OFFLINE'

  if (!ready) {
    return (
      <div className="agent-loading">
        <div className="agent-loading-spinner" />
        <div style={{ marginTop: 12, color: '#374151', fontWeight: 700 }}>Loading agent dashboard...</div>
      </div>
    )
  }

  return (
    <div className="agent-dashboard">
      <a href="#agent-main" className="skip-link">Skip to main content</a>

      <aside className="agent-sidebar">
        <div className="agent-sidebar-header">
          <div className="agent-logo">
            <img src={`/logo1.jpg?t=${Date.now()}`} alt="EchoText" className="agent-logo-img" />
          </div>
          {agentName ? (
            <span className="agent-badge-signed-in">Signed in</span>
          ) : (
            <button className="agent-sign-in-btn" onClick={() => setShowSignIn(true)}>
              Sign In
            </button>
          )}
        </div>

        <nav className="agent-nav">
          <button className={'agent-nav-item active'} onClick={() => setActiveTab('transcript')}>
            <MessageSquare size={18} />
            <span>Transcript</span>
          </button>
          <button className={'agent-nav-item'} onClick={() => setActiveTab('customer')}>
            <User size={18} />
            <span>Customer</span>
          </button>
          <button className={'agent-nav-item'} onClick={() => setActiveTab('case')}>
            <CheckCircle2 size={18} />
            <span>Case</span>
          </button>
          <button className={'agent-nav-item'} onClick={() => setActiveTab('settings')}>
            <Settings size={18} />
            <span>Settings</span>
          </button>
        </nav>

        <div className="agent-sidebar-footer">
          <div className="agent-avatar">
            <User size={20} />
          </div>
          <div className="agent-user-info">
            <div className="agent-user-name">{agentName || 'Agent'}</div>
            <div className="agent-user-role">{agentRole}</div>
          </div>
        </div>
      </aside>

      <div className="agent-body">
        <header className="agent-topbar">
          <div className="agent-topbar-left">
            <button className="btn-icon" onClick={onBack} aria-label="Back">
              <ArrowLeft size={20} />
            </button>
            <div className="agent-topbar-brand">
              <img src={`/logo1.jpg?t=${Date.now()}`} alt="EchoText" className="agent-logo-img" />
              <div>
                <h1 className="agent-topbar-title">Session {sessionId}</h1>
                <div className="agent-topbar-meta">
                  <span className="agent-status-dot" style={{ background: statusColor }} />
                  {statusLabel} • MTN Service Center
                </div>
              </div>
            </div>
          </div>
          <div className="agent-topbar-right">
            <div className="agent-lang-toggle">
              <button className={'lang-btn' + (language === 'en' ? ' active' : '')} onClick={() => setLanguage('en')}>EN</button>
              <button className={'lang-btn' + (language === 'tw' ? ' active' : '')} onClick={() => setLanguage('tw')}>TW</button>
            </div>
            <div className="agent-search-icon" onClick={() => setShowSearch(prev => !prev)}>
              <Search size={18} />
            </div>
            <input
              id="agent-search-input"
              className={'agent-search-input' + (showSearch ? ' open' : '')}
              type="text"
              placeholder="Search session..."
            />
            <button className="btn-icon" onClick={() => setShowHelp(true)} aria-label="Help">
              <HelpCircle size={20} />
            </button>
            <button className="btn-icon" onClick={() => setActiveTab('settings')} aria-label="Settings">
              <Settings size={20} />
            </button>
          </div>
        </header>

        <AnimatePresence>
          {showHelp && (
            <div className="agent-modal-overlay" onClick={() => setShowHelp(false)}>
              <motion.div
                className="agent-modal"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="agent-modal-title">Help & Support</h2>
                <p className="agent-modal-subtitle">Quick guide for using the agent dashboard</p>
                <div className="agent-help-list">
                  <div className="agent-help-item">
                    <strong>Transcript</strong>
                    <p>View live captions, toggle languages, and read aloud messages.</p>
                  </div>
                  <div className="agent-help-item">
                    <strong>Customer</strong>
                    <p>See customer details, phone number, and session history.</p>
                  </div>
                  <div className="agent-help-item">
                    <strong>Case</strong>
                    <p>Manage cases, send SMS confirmations, and escalate issues.</p>
                  </div>
                  <div className="agent-help-item">
                    <strong>Settings</strong>
                    <p>Switch language, enable dual subtitles, and view session info.</p>
                  </div>
                </div>
                <div className="agent-modal-actions">
                  <button className="btn btn-primary" onClick={() => setShowHelp(false)}>Got it</button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <main id="agent-main" className="agent-content">
          {activeTab === 'transcript' && (
            <div className="agent-layout">
              <div className="agent-main-panel">
                <div className="agent-card agent-transcript-card">
                  <div className="agent-card-header">
                    <h2>Live Transcript</h2>
                    <div className="agent-badges">
                      <span className="agent-badge-live">
                        LIVE
                        <span className="agent-live-wave">
                          <span></span>
                          <span></span>
                          <span></span>
                          <span></span>
                        </span>
                      </span>
                      <span className="agent-badge-lang">EN / TW</span>
                    </div>
                  </div>
                  <div className="agent-transcripts" ref={transcriptsContainerRef}>
                    <AnimatePresence>
                      {transcripts.map((transcript, index) => (
                        <motion.div
                          key={transcript.timestamp || index}
                          className={'agent-chat-bubble ' + transcript.speaker}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <div className="agent-chat-header">
                            <span className="agent-avatar-sm">
                              {transcript.speaker === 'agent' ? <User size={14} /> : <Users size={14} />}
                            </span>
                            <span className="agent-chat-name">{transcript.speaker === 'agent' ? 'Agent' : 'Customer'}</span>
                            <span className="agent-chat-time">Now</span>
                          </div>
                          <div className="agent-chat-text-wrap">
                            <p className="agent-chat-text" style={{ fontSize: currentFontSize, direction: 'ltr' }}>{transcript.text}</p>
                            {dualLanguage && transcript.translation && (
                              <p className="agent-chat-text agent-chat-text-secondary" style={{ fontSize: currentFontSize, direction: 'ltr' }}>{transcript.translation}</p>
                            )}
                          </div>
                          <button className="agent-chat-tts" onClick={() => speakText(transcript.text, transcript.timestamp)} aria-label="Read aloud">
                            {speakingId === transcript.timestamp ? '🔊' : '🔈'}
                          </button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>

                  <div className="agent-response-area">
                    <div className="agent-input-row">
                      <input
                        id="agent-message-input"
                        type="text"
                        value={agentInput}
                        onChange={(e) => setAgentInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && sendAgentMessage(agentInput)}
                        placeholder="Type your message or use voice..."
                        aria-label="Agent message"
                        style={{ fontSize: currentFontSize }}
                      />
                      <button
                        className={'agent-mic-btn' + (isRecording ? ' recording' : '')}
                        onClick={isRecording ? stopRecording : startRecording}
                        aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
                      >
                        <Mic size={18} />
                      </button>
                      <button className="btn btn-primary btn-sm" onClick={() => sendAgentMessage(agentInput)} disabled={!agentInput.trim()} aria-label="Send message">
                        <Send size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'customer' && (
            <div className="agent-customer-view">
              <div className="agent-card">
                <h2 className="agent-card-title">Customer Profile</h2>
                <div className="agent-customer-details">
                  <div className="agent-detail-item">
                    <span className="agent-detail-icon">👤</span>
                    <div className="agent-detail-content">
                      <span className="agent-detail-label">Name</span>
                      <span className="agent-detail-value">Augustine Nana</span>
                    </div>
                  </div>
                  <div className="agent-detail-item">
                    <span className="agent-detail-icon">📱</span>
                    <div className="agent-detail-content">
                      <span className="agent-detail-label">Phone</span>
                      <span className="agent-detail-value">0595759917</span>
                    </div>
                  </div>
                  <div className="agent-detail-item">
                    <span className="agent-detail-icon">🆔</span>
                    <div className="agent-detail-content">
                      <span className="agent-detail-label">National ID</span>
                      <span className="agent-detail-value">GHA-156438876-9</span>
                    </div>
                  </div>
                  <div className="agent-detail-item">
                    <span className="agent-detail-icon">📶</span>
                    <div className="agent-detail-content">
                      <span className="agent-detail-label">Network</span>
                      <span className="agent-detail-value">MTN Ghana</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="agent-card">
                <h2 className="agent-card-title">Session History</h2>
                <div className="agent-session-list">
                  <div className="agent-session-item">
                    <div>
                      <div className="agent-session-title">MoMo Refund Issue</div>
                      <div className="agent-session-meta">Today • {language.toUpperCase()}</div>
                    </div>
                    <span className="agent-session-status">Active</span>
                  </div>
                  <div className="agent-session-item">
                    <div>
                      <div className="agent-session-title">Balance Inquiry</div>
                      <div className="agent-session-meta">Yesterday • EN</div>
                    </div>
                    <span className="agent-session-status agent-session-resolved">Resolved</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'case' && (
            <div className="agent-case-view">
              <div className="agent-card">
                <h2 className="agent-card-title">Current Case</h2>
                <div className="agent-case-header">
                  <div>
                    <div className="agent-case-number">{caseNumber || 'CASE45678'}</div>
                    <div className="agent-case-meta">Opened today • MTN Service Center</div>
                  </div>
                  <span className={'agent-case-status ' + (smsSent ? 'resolved' : 'open')}>
                    {smsSent ? 'Resolved' : 'Open'}
                  </span>
                </div>
                <div className="agent-case-actions">
                  <button className="btn btn-primary btn-sm" onClick={resolveCase} disabled={smsSent}>
                    <Smartphone size={16} />
                    {smsSent ? 'SMS Sent' : 'Resolve & SMS'}
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={escalateCase}>
                    <AlertTriangle size={16} />
                    Escalate
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setTranscripts([]); setCards([]); setCaseNumber(''); setSmsSent(false); }}>
                    <RotateCcw size={16} />
                    New Case
                  </button>
                </div>
              </div>

              <div className="agent-card">
                <h2 className="agent-card-title">Case Notes</h2>
                <div className="agent-case-notes">
                  <div className="agent-case-note">
                    <div className="agent-case-note-header">
                      <span className="agent-case-note-time">10:42 AM</span>
                      <span className="agent-case-note-author">Agent</span>
                    </div>
                    <p>Customer reported failed MoMo transfer. Fifty Ghana cedis debited but not received. Reference REF88321.</p>
                  </div>
                  {smsSent && (
                    <div className="agent-case-note">
                      <div className="agent-case-note-header">
                        <span className="agent-case-note-time">10:45 AM</span>
                        <span className="agent-case-note-author">System</span>
                      </div>
                      <p>Refund approved. SMS confirmation sent to customer.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="agent-settings-view">
              <div className="agent-card">
                <h2 className="agent-card-title">Agent Settings</h2>
                <div className="agent-settings-list">
                  <div className="agent-setting-item">
                    <div>
                      <div className="agent-setting-label">Language</div>
                      <div className="agent-setting-desc">Default transcript language</div>
                    </div>
                    <div className="agent-lang-toggle">
                      <button className={'lang-btn' + (language === 'en' ? ' active' : '')} onClick={() => setLanguage('en')}>EN</button>
                      <button className={'lang-btn' + (language === 'tw' ? ' active' : '')} onClick={() => setLanguage('tw')}>TW</button>
                    </div>
                  </div>
                  <div className="agent-setting-item">
                    <div>
                      <div className="agent-setting-label">Dual-Language Subtitles</div>
                      <div className="agent-setting-desc">Show EN + TW simultaneously</div>
                    </div>
                    <button className={'lang-btn' + (dualLanguage ? ' active' : '')} onClick={() => setDualLanguage(prev => !prev)}>
                      {dualLanguage ? 'On' : 'Off'}
                    </button>
                  </div>
                  <div className="agent-setting-item">
                    <div>
                      <div className="agent-setting-label">Session</div>
                      <div className="agent-setting-desc">Current session ID</div>
                    </div>
                    <span className="agent-setting-value">{sessionId}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {showSignIn && (
        <div className="agent-modal-overlay" onClick={() => setShowSignIn(false)}>
          <div className="agent-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Agent sign in">
            <h2 className="agent-modal-title">Agent Sign In</h2>
            <p className="agent-modal-subtitle">Enter your details to access the dashboard</p>
            <div className="agent-form-group">
              <label className="agent-label" htmlFor="agent-signin-name">Agent Name</label>
              <input
                id="agent-signin-name"
                className="agent-input"
                type="text"
                placeholder="e.g. Augustine Nana"
                value={signInName}
                onChange={(e) => setSignInName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
              />
            </div>
            <div className="agent-form-group">
              <label className="agent-label" htmlFor="agent-signin-id">Agent ID</label>
              <input
                id="agent-signin-id"
                className="agent-input"
                type="text"
                placeholder="e.g. AGT-1042"
                value={signInId}
                onChange={(e) => setSignInId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
              />
            </div>
            <div className="agent-modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowSignIn(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSignIn}>Sign In</button>
            </div>
          </div>
        </div>
      )}

      <nav className="agent-mobile-bottom-nav" aria-label="Mobile navigation">
        <button className={'agent-mobile-nav-item' + (activeTab === 'transcript' ? ' active' : '')} onClick={() => setActiveTab('transcript')} aria-label="Transcript">
          <MessageSquare size={20} />
          <span>Transcript</span>
        </button>
        <button className={'agent-mobile-nav-item' + (activeTab === 'customer' ? ' active' : '')} onClick={() => setActiveTab('customer')} aria-label="Customer">
          <User size={20} />
          <span>Customer</span>
        </button>
        <button className={'agent-mobile-nav-item' + (activeTab === 'case' ? ' active' : '')} onClick={() => setActiveTab('case')} aria-label="Case">
          <CheckCircle2 size={20} />
          <span>Case</span>
        </button>
        <button className={'agent-mobile-nav-item' + (activeTab === 'settings' ? ' active' : '')} onClick={() => setActiveTab('settings')} aria-label="Settings">
          <Settings size={20} />
          <span>Settings</span>
        </button>
      </nav>
    </div>
  )
}
