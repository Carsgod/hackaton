import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Play, Pause, RotateCcw, Send, Mic, Square, Monitor,
  User, Users, CheckCircle2, AlertTriangle,
  ArrowLeft, Search, Settings, HelpCircle, MessageSquare, Smartphone,
  Activity, Clock, Zap, WifiOff, Globe,
} from 'lucide-react'
import { useWebSocket } from '../hooks/useWebSocket'
import { useAccessibility } from '../hooks/useAccessibility'

const DEMO_CONVERSATION = [
  { speaker: 'agent', text: 'Good afternoon, welcome to MTN service center. How can I help you today?', delay: 2200 },
  { speaker: 'customer', text: 'I sent fifty Ghana cedis to my sister yesterday but she didn\'t receive it. My account was debited.', delay: 3200 },
  { speaker: 'agent', text: 'I\'m sorry to hear that. Let me check the transaction for you. Can you tell me the phone number you sent to?', delay: 2600 },
  { speaker: 'customer', text: 'Yes, it was zero two four four five six seven eight nine zero.', delay: 2400 },
  { speaker: 'agent', text: 'Thank you. I can see the transaction. Reference number is REF88321. It shows fifty Ghana cedis was debited from your account on September twelfth at three forty five PM. The transaction is currently pending on the receiver side.', delay: 5000 },
  { speaker: 'customer', text: 'What should I do? Will the money come back?', delay: 2200 },
  { speaker: 'agent', text: 'I can initiate a reversal for you. The amount is GHS fifty point zero zero. Do you approve the refund?', delay: 3000 },
  { speaker: 'customer', text: 'Yes please, approve the refund.', delay: 2000 },
  { speaker: 'agent', text: 'I have approved the refund. Your money will be returned to your mobile money wallet within twenty four hours. Your case number is CASE45678. An SMS confirmation has been sent to your phone number ending in nine zero.', delay: 5000 },
  { speaker: 'customer', text: 'Thank you so much. I can read everything on my screen. This is very helpful.', delay: 2800 },
  { speaker: 'agent', text: 'You\'re welcome. If you have any other issues, please don\'t hesitate to visit us. Have a great day.', delay: 2600 },
]

const DEMO_CONVERSATION_TWI = [
  { speaker: 'agent', text: 'Ahobrasee, akwaaba wɔ MTN service center no. Dɛn na metumi ayɛ wo nnɛ?', delay: 2200 },
  { speaker: 'customer', text: 'Mɛtrɛɛ Ghana cedis ahahanu kɔɔ me nuabea nkyɛn nnora, na ɔnnyaa. Me account no bɔɔ me ka.', delay: 3200 },
  { speaker: 'agent', text: 'Mente ase. Ma me hwɛ transaction no. Bɛtumi ka wo telefon number no a wokɔɔ hɔ no?', delay: 2600 },
  { speaker: 'customer', text: 'Aane, na ɛyɛ zero two four four five six seven eight nine zero.', delay: 2400 },
  { speaker: 'agent', text: 'Medaase. Mɛ hu transaction no. Reference number yɛ REF88321. Ɛkyerɛ sɛ Ghana cedis ahahanu bɔɔ wo ka wɔ September twelfth, three forty five PM. Transaction no da so wɔ receiver nkyɛn.', delay: 5000 },
  { speaker: 'customer', text: 'Dɛn na menyɛ? Sika no bɛsan aba?', delay: 2200 },
  { speaker: 'agent', text: 'Metumi asan nkɔma wo. Sika no yɛ GHS fifty point zero zero. Wopɛ sɛ me ma refund?', delay: 3000 },
  { speaker: 'customer', text: 'Aane, please ma me refund.', delay: 2000 },
  { speaker: 'agent', text: 'Mɛma refund no. Wo sika bɛsan aba wo mobile money wallet mu wɔ nnɔnhwerehahanu mu. Wo case number yɛ CASE45678. SMS confirmation no akɔ wo telefon number a ɛwɔ nine zero no.', delay: 5000 },
  { speaker: 'customer', text: 'Medaase pii. Metumi akenkan biribiara wɔ me screen so. Ɛyɛ hwee.', delay: 2800 },
  { speaker: 'agent', text: 'Yɛ akyekyerɛ. Sɛ wo wɔ nsɛm foforo bi a, ɛnsɛ sɛ wo ho yɛ hu. Da biara wo nsa.', delay: 2600 },
]

function extractCards(text) {
  const cards = []
  const refMatch = text.match(/reference\s+number\s+is\s+([A-Z0-9]+)/i)
  if (refMatch) cards.push({ id: 'card_ref', type: 'reference', label: 'Reference', value: refMatch[1], icon: '🔢' })
  const caseMatch = text.match(/case\s+number\s+is\s+([A-Z0-9]+)/i)
  if (caseMatch) cards.push({ id: 'card_case', type: 'reference', label: 'Case Number', value: caseMatch[1], icon: '📋' })
  if (/\b(?:approve|reversal|refund)\b/i.test(text)) cards.push({ id: 'card_action', type: 'action', label: 'Action', value: 'Refund Approved', icon: '✅' })
  if (/\bGHS\b|\b(?:fifty|cedis)\b/i.test(text)) cards.push({ id: 'card_amount', type: 'amount', label: 'Amount', value: 'GHS 50.00', icon: '💳' })
  return cards
}

export default function AgentDashboard({ sessionId, onBack }) {
  const [language, setLanguage] = useState('en')
  const [transcripts, setTranscripts] = useState([])
  const [cards, setCards] = useState([])
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [smsSent, setSmsSent] = useState(false)
  const [caseNumber, setCaseNumber] = useState('')
  const [customerResponse, setCustomerResponse] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [networkStatus, setNetworkStatus] = useState('online')
  const [offlineQueue, setOfflineQueue] = useState(0)
  const [ready, setReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTurn, setCurrentTurn] = useState(0)
  const [displayedText, setDisplayedText] = useState('')
  const [liveSpeaker, setLiveSpeaker] = useState(null)
  const [speed, setSpeed] = useState(1)
  const [activeTab, setActiveTab] = useState('transcript')
  const intervalRef = useRef(null)
  const timeoutRef = useRef(null)
  const isPlayingRef = useRef(false)
  const hasAutoStarted = useRef(false)
  const messagesEndRef = useRef(null)
  const { currentFontSize } = useAccessibility()
  const conversation = language === 'tw' ? DEMO_CONVERSATION_TWI : DEMO_CONVERSATION
  const wsUrl = `ws://localhost:8000/ws/${sessionId}?language=${language}`

  const clearTimers = () => {
    clearInterval(intervalRef.current)
    clearTimeout(timeoutRef.current)
    intervalRef.current = null
    timeoutRef.current = null
  }

  const playTurn = (turnIndex) => {
    clearTimers()
    if (turnIndex >= conversation.length) {
      setIsPlaying(false)
      isPlayingRef.current = false
      setDisplayedText('')
      setLiveSpeaker(null)
      return
    }

    setCurrentTurn(turnIndex)
    const turn = conversation[turnIndex]
    const words = turn.text.split(' ')
    let wordIndex = 0
    setLiveSpeaker(turn.speaker)
    setDisplayedText('')

    intervalRef.current = setInterval(() => {
      if (wordIndex < words.length) {
        setDisplayedText(prev => (prev ? prev + ' ' : '') + words[wordIndex])
        wordIndex++
      } else {
        clearInterval(intervalRef.current)
        intervalRef.current = null

        setTranscripts(prev => [...prev, { speaker: turn.speaker, text: turn.text, timestamp: Date.now() + turnIndex }])
        const nextCards = extractCards(turn.text)
        setCards(prev => {
          const merged = [...prev]
          nextCards.forEach(card => { if (!merged.find(c => c.value === card.value)) merged.push(card) })
          return merged
        })

        setDisplayedText('')
        setLiveSpeaker(null)

        timeoutRef.current = setTimeout(() => {
          if (isPlayingRef.current) playTurn(turnIndex + 1)
        }, turn.delay / speed)
      }
    }, 200 / speed)
  }

  const startDemo = () => {
    setSpeed(1)
    setIsPlaying(true)
    isPlayingRef.current = true
    setTranscripts([])
    setCards([])
    setCurrentTurn(0)
    setDisplayedText('')
    setLiveSpeaker(null)
    playTurn(0)
  }

  const pauseDemo = () => {
    setIsPlaying(false)
    isPlayingRef.current = false
    clearTimers()
    setDisplayedText('')
    setLiveSpeaker(null)
  }

  const resetDemo = () => {
    pauseDemo()
    setCurrentTurn(0)
    setTranscripts([])
    setCards([])
    setSpeed(1)
    hasAutoStarted.current = false
  }

  const handleMessage = useCallback((data) => {
    switch (data.type) {
      case 'transcript':
        if (data.is_final) {
          setTranscripts(prev => {
            const exists = prev.find(t => t.timestamp === data.timestamp)
            if (exists) return prev.map(t => t.timestamp === data.timestamp ? { ...t, ...data } : t)
            return [...prev, data]
          })
          setDisplayedText('')
          setLiveSpeaker(null)
        } else {
          setDisplayedText(data.text)
          setLiveSpeaker(data.speaker)
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
        pauseDemo()
        break
      case 'status':
        setConnectionStatus(data.status === 'ended' ? 'ended' : data.status)
        break
      case 'sms':
        setSmsSent(true)
        setCaseNumber(data.data?.case_number || '')
        break
      case 'ack':
        setCustomerResponse('')
        break
      default:
        break
    }
  }, [pauseDemo])

  const onConnect = useCallback(() => setConnectionStatus('connected'), [])
  const onDisconnect = useCallback(() => setConnectionStatus('disconnected'), [])

  const { isConnected, error, connect, disconnect, send } = useWebSocket(
    wsUrl,
    handleMessage,
    onConnect,
    onDisconnect
  )

  useEffect(() => {
    connect()
    return () => disconnect()
  }, [sessionId, connect, disconnect])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcripts, displayedText])

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
    if (ready && !hasAutoStarted.current) {
      hasAutoStarted.current = true
      const t = setTimeout(() => startDemo(), 400)
      return () => clearTimeout(t)
    }
  }, [ready])

  useEffect(() => {
    return () => clearTimers()
  }, [])

  const sendResponse = (text) => {
    if (!text.trim()) return
    const message = { type: 'response', data: { text, speaker: 'agent', timestamp: Date.now() } }
    send(message)
    setTranscripts(prev => [...prev, { type: 'transcript', text, speaker: 'agent', timestamp: Date.now(), is_local: true }])
    setCustomerResponse('')
  }

  const toggleRecording = () => {
    setIsRecording(prev => !prev)
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
      <aside className="agent-sidebar">
        <div className="agent-sidebar-header">
          <div className="agent-logo">
            <Monitor size={22} />
            <span>EchoText</span>
          </div>
          <span className="agent-badge">Agent</span>
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
            <div className="agent-user-name">Agent Kofi</div>
            <div className="agent-user-role">Counter Support</div>
          </div>
        </div>
      </aside>

      <div className="agent-body">
        <header className="agent-topbar">
          <div className="agent-topbar-left">
            <button className="btn-icon" onClick={onBack} aria-label="Back">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="agent-topbar-title">Session {sessionId}</h1>
              <div className="agent-topbar-meta">
                <span className="agent-status-dot" style={{ background: statusColor }} />
                {statusLabel} • MTN Service Center
              </div>
            </div>
          </div>
          <div className="agent-topbar-right">
            <div className="agent-metrics">
              <div className="agent-metric">
                <Zap size={14} />
                <span className="agent-metric-value">&lt;1.5s</span>
                <span>Latency</span>
              </div>
              <div className="agent-metric">
                <Activity size={14} />
                <span className="agent-metric-value">98%</span>
                <span>Confidence</span>
              </div>
              <div className="agent-metric">
                <Clock size={14} />
                <span className="agent-metric-value">~4 min</span>
                <span>Resolution</span>
              </div>
              {offlineQueue > 0 && (
                <div className="offline-queue-badge">
                  <WifiOff size={14} />
                  <span>{offlineQueue} queued</span>
                </div>
              )}
            </div>
            <div className="agent-search">
              <Search size={16} />
              <input type="text" placeholder="Search session..." />
            </div>
            <button className="btn-icon" aria-label="Help"><HelpCircle size={20} /></button>
            <button className="btn-icon" aria-label="Settings"><Settings size={20} /></button>
          </div>
        </header>

        <main className="agent-content">
          {activeTab === 'transcript' && (
            <div className="agent-layout">
              <div className="agent-main-panel">
                <div className="agent-card agent-transcript-card">
                  <div className="agent-card-header">
                    <h2>Live Transcript</h2>
                    <div className="agent-badges">
                      <span className="agent-badge-live">LIVE</span>
                      <span className="agent-badge-lang">EN / TW</span>
                    </div>
                  </div>
                  <div className="agent-transcripts">
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
                            <span className="agent-chat-name">{transcript.speaker === 'agent' ? 'You' : 'Customer'}</span>
                            <span className="agent-chat-time">Now</span>
                          </div>
                          <p className="agent-chat-text">{transcript.text}</p>
                        </motion.div>
                      ))}
                    </AnimatePresence>

                      {liveSpeaker && displayedText && (
                      <motion.div
                        className={'agent-chat-bubble ' + liveSpeaker + ' agent-chat-live'}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        <div className="agent-chat-header">
                          <span className="agent-avatar-sm">
                            {liveSpeaker === 'agent' ? <User size={14} /> : <Users size={14} />}
                          </span>
                          <span className="agent-chat-name">{liveSpeaker === 'agent' ? 'You' : 'Customer'}</span>
                          <span className="agent-chat-time">Now</span>
                        </div>
                        <p className="agent-chat-text">
                          {displayedText}
                          <span className="agent-typing-cursor" />
                        </p>
                      </motion.div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="agent-playback">
                    <div className="agent-playback-controls">
                      {!isPlaying ? (
                        <button className="agent-btn-primary" onClick={startDemo}><Play size={16} /> Play</button>
                      ) : (
                        <button className="agent-btn-secondary" onClick={pauseDemo}><Pause size={16} /> Pause</button>
                      )}
                      <button className="agent-btn-secondary" onClick={resetDemo}><RotateCcw size={16} /> Reset</button>
                    </div>
                    <div className="agent-speed-control">
                      <span className="agent-speed-label">Speed</span>
                      {[0.5, 1, 1.5].map(s => (
                        <button
                          key={s}
                          onClick={() => { setSpeed(s); if (isPlayingRef.current) playTurn(currentTurn) }}
                          className={'agent-speed-btn' + (speed === s ? ' active' : '')}
                        >
                          {s}x
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="agent-side-panel">
                <div className="agent-card agent-customer-card">
                  <div className="agent-customer-header">
                    <div className="agent-avatar-lg">
                      <Users size={24} />
                    </div>
                    <div>
                      <div className="agent-customer-name">Customer</div>
                      <div className="agent-customer-meta">Mobile • MTN Ghana</div>
                    </div>
                  </div>
                  <div className="agent-customer-stats">
                    <div className="agent-stat">
                      <div className="agent-stat-value">{transcripts.length}</div>
                      <div className="agent-stat-label">Messages</div>
                    </div>
                    <div className="agent-stat">
                      <div className="agent-stat-value">EN</div>
                      <div className="agent-stat-label">Language</div>
                    </div>
                    <div className="agent-stat">
                      <div className="agent-stat-value">98%</div>
                      <div className="agent-stat-label">Confidence</div>
                    </div>
                  </div>
                </div>

                <div className="agent-card agent-details-card">
                  <h3 className="agent-card-title">Key Details</h3>
                  <div className="agent-details-list">
                    {cards.map(card => (
                      <div key={card.id || card.value} className="agent-detail-item">
                        <span className="agent-detail-icon">{card.icon}</span>
                        <div className="agent-detail-content">
                          <span className="agent-detail-label">{card.label}</span>
                          <span className="agent-detail-value">{card.value}</span>
                        </div>
                      </div>
                    ))}
                    {cards.length === 0 && (
                      <div className="agent-detail-empty">No key details yet</div>
                    )}
                  </div>
                </div>

                <div className="agent-card agent-quick-actions">
                  <h3 className="agent-card-title">Quick Actions</h3>
                  <div className="agent-actions-grid">
                    <button className="agent-action-btn" onClick={toggleRecording}>
                      <div className="agent-action-icon">
                        {isRecording ? <Square size={18} /> : <Mic size={18} />}
                      </div>
                      <span>{isRecording ? 'Stop Recording' : 'Start Recording'}</span>
                    </button>
                    <button className="agent-action-btn" onClick={resolveCase}>
                      <div className="agent-action-icon">
                        <Smartphone size={18} />
                      </div>
                      <span>Resolve & SMS</span>
                    </button>
                    <button className="agent-action-btn agent-action-danger" onClick={escalateCase}>
                      <div className="agent-action-icon">
                        <AlertTriangle size={18} />
                      </div>
                      <span>Escalate</span>
                    </button>
                  </div>
                </div>

                {smsSent && (
                  <motion.div
                    className="sms-phone-card"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div className="sms-phone-icon">
                      <Smartphone size={20} />
                    </div>
                    <div className="sms-phone-body">
                      <div className="sms-phone-to">To: +233 XX XXX XXXX</div>
                      <div className="sms-phone-message">
                        EchoText Ghana: Your support case {caseNumber || 'CASE45678'} has been confirmed. Your refund of GHS 50.00 has been approved. Funds will arrive within 24 hours.
                      </div>
                      <div className="sms-phone-meta">Delivered via SMS Gateway</div>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'customer' && (
            <div className="agent-placeholder">
              <User size={48} />
              <h3>Customer Profile</h3>
              <p>Customer details and history would appear here.</p>
            </div>
          )}

          {activeTab === 'case' && (
            <div className="agent-placeholder">
              <CheckCircle2 size={48} />
              <h3>Case Management</h3>
              <p>Case history and resolution tools would appear here.</p>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="agent-placeholder">
              <Settings size={48} />
              <h3>Agent Settings</h3>
              <p>Preferences, shortcuts, and integrations would appear here.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
