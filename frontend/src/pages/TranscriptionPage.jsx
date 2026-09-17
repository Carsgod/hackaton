import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Volume2, Send, RotateCcw, Accessibility,
  X, AlertTriangle, Smartphone, CheckCircle2, Globe,
} from 'lucide-react'
import { useWebSocket } from '../hooks/useWebSocket'
import { useAccessibility } from '../hooks/useAccessibility'
import PinnedCards from '../components/PinnedCards'
import QuickResponses from '../components/QuickResponses'
import AccessibilityControls from '../components/AccessibilityControls'

const QUICK_PROMPTS = [
  'Yes, I approve',
  'No, please explain again',
  'Can you repeat that?',
  'I need a refund',
  'Thank you',
  'Hold on, please',
]

export default function TranscriptionPage({ sessionId, onBack, demoMode, onComplete }) {
  const [language, setLanguage] = useState('en')
  const [transcripts, setTranscripts] = useState([])
  const [cards, setCards] = useState([])
  const [displayedText, setDisplayedText] = useState('')
  const [liveSpeaker, setLiveSpeaker] = useState(null)
  const [showControls, setShowControls] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [smsSent, setSmsSent] = useState(false)
  const [caseNumber, setCaseNumber] = useState('')
  const [customerResponse, setCustomerResponse] = useState('')
  const [networkStatus, setNetworkStatus] = useState('online')
  const [offlineQueue, setOfflineQueue] = useState([])
  const messagesEndRef = useRef(null)
  const { currentFontSize } = useAccessibility()
  const wsUrl = `ws://localhost:8000/ws/${sessionId}?language=${language}`

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
  }, [])

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
    const onOnline = () => setNetworkStatus('online')
    const onOffline = () => setNetworkStatus('offline')
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const sendResponse = (text) => {
    if (!text.trim()) return
    const message = { type: 'response', data: { text, speaker: 'customer', timestamp: Date.now() } }
    if (networkStatus === 'offline') {
      setOfflineQueue(prev => [...prev, message])
      setTranscripts(prev => [...prev, { type: 'transcript', text, speaker: 'customer', timestamp: Date.now(), is_local: true, pending: true }])
    } else {
      send(message)
      setTranscripts(prev => [...prev, { type: 'transcript', text, speaker: 'customer', timestamp: Date.now(), is_local: true }])
    }
    setCustomerResponse('')
  }

  const sendSMS = () => {
    const cn = caseNumber || `CASE${Date.now().toString().slice(-6)}`
    setCaseNumber(cn)
    send({ type: 'request_sms', case_number: cn })
    setSmsSent(true)
    onComplete?.()
  }

  const clearTranscript = () => {
    setTranscripts([])
    setCards([])
    setSmsSent(false)
    setCaseNumber('')
  }

  const statusColor = connectionStatus === 'connected' ? 'var(--accent)' : connectionStatus === 'connecting' ? '#b45309' : '#dc2626'
  const statusLabel = connectionStatus === 'connected' ? 'LIVE' : connectionStatus === 'connecting' ? 'CONNECTING' : connectionStatus === 'ended' ? 'ENDED' : 'OFFLINE'
  const hasContent = transcripts.length > 0 || cards.length > 0 || connectionStatus === 'connected' || connectionStatus === 'connecting'

  return (
    <div className="transcription-page">
      <header className="transcription-header">
        <div className="header-left">
          <button className="btn-icon" onClick={onBack} aria-label="Go back">
            <X size={20} />
          </button>
          <div className="session-info">
            <h1 className="app-title">EchoText</h1>
            <div className="session-meta">
              <span className="session-id">Session: {sessionId}</span>
              <div className="transcription-lang-toggle">
                <button className={'lang-btn' + (language === 'en' ? ' active' : '')} onClick={() => setLanguage('en')}>EN</button>
                <button className={'lang-btn' + (language === 'tw' ? ' active' : '')} onClick={() => setLanguage('tw')}>TW</button>
              </div>
            </div>
          </div>
        </div>
        <div className="header-right">
          <div className="connection-indicator" style={{ background: statusColor }}>
            <span className="pulse-dot" />
            <span className="status-text">{statusLabel}</span>
          </div>
          <div className="network-indicator">
            <span className={`network-dot ${networkStatus}`} />
            <span className="network-text">{networkStatus === 'online' ? 'Online' : 'Offline'}</span>
          </div>
          {offlineQueue.length > 0 && (
            <div className="offline-badge" title={`${offlineQueue.length} messages pending`}>
              <AlertTriangle size={13} />
              {offlineQueue.length}
            </div>
          )}
          <button className="btn-icon" onClick={() => setShowControls(!showControls)} aria-label="Accessibility settings">
            <Accessibility size={20} />
          </button>
        </div>
      </header>

      <PinnedCards cards={cards} />

      <main className="transcription-main">
        <div className="transcripts-container">
          {!hasContent && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <Volume2 size={48} color="var(--border-color)" style={{ marginBottom: 16 }} />
              <p style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 8 }}>Waiting for transcription...</p>
              <p style={{ fontSize: '0.9rem' }}>The agent's speech will appear here in real time.</p>
            </div>
          )}
          <AnimatePresence>
            {transcripts.map((transcript, index) => (
              <motion.div
                key={transcript.timestamp || index}
                className={`transcript-bubble ${transcript.speaker} ${transcript.pending ? 'pending' : ''} ${transcript.is_local ? 'local' : ''}`}
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.22 }}
              >
                <div className="transcript-speaker">
                  <span className={`speaker-dot ${transcript.speaker}`} />
                  <span className="speaker-label">{transcript.speaker === 'agent' ? 'Agent' : 'You'}</span>
                  {transcript.confidence && (
                    <span className="confidence">{Math.round(transcript.confidence * 100)}%</span>
                  )}
                </div>
                <p className="transcript-text" style={{ fontSize: currentFontSize }}>
                  {transcript.text}
                </p>
                {transcript.is_local && <span className="local-badge">You</span>}
                {transcript.pending && <span className="pending-badge">Pending</span>}
              </motion.div>
            ))}
          </AnimatePresence>
          {liveSpeaker && displayedText && (
            <motion.div
              className={`transcript-bubble ${liveSpeaker} transcript-live`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="transcript-speaker">
                <span className={`speaker-dot ${liveSpeaker}`} />
                <span className="speaker-label">{liveSpeaker === 'agent' ? 'Agent' : 'You'}</span>
              </div>
              <p className="transcript-text" style={{ fontSize: currentFontSize }}>
                {displayedText}
                <span className="typing-cursor" />
              </p>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      <QuickResponses
        prompts={QUICK_PROMPTS}
        onSelect={sendResponse}
        disabled={networkStatus === 'offline'}
      />

      <div className="response-bar">
        <div className="response-input-wrapper">
          <input
            type="text"
            placeholder="Type your response..."
            value={customerResponse}
            onChange={(e) => setCustomerResponse(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendResponse(customerResponse)}
            className="response-input"
            aria-label="Type your response"
            style={{ fontSize: currentFontSize }}
            disabled={networkStatus === 'offline'}
          />
          <button className="btn-send" onClick={() => sendResponse(customerResponse)} disabled={!customerResponse.trim() || networkStatus === 'offline'} aria-label="Send response">
            <Send size={20} />
          </button>
        </div>
        <div className="response-actions">
          {!smsSent ? (
            <button className="btn-sms" onClick={sendSMS} disabled={networkStatus === 'offline'}>
              <Smartphone size={15} /> Get SMS Confirmation
            </button>
          ) : (
            <div className="sms-confirmation">
              <CheckCircle2 size={15} color="var(--accent)" />
              <span>SMS sent{caseNumber ? ` — ${caseNumber}` : ''}</span>
            </div>
          )}
          <button className="btn-icon" onClick={clearTranscript} aria-label="Clear transcript">
            <RotateCcw size={18} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showControls && (
          <motion.div
            className="controls-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }}
          >
            <AccessibilityControls onClose={() => setShowControls(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {networkStatus === 'offline' && (
        <div className="offline-toast" role="status" aria-live="polite">
          <AlertTriangle size={18} />
          <span>You're offline. Responses will sync when connection resumes.</span>
        </div>
      )}

      {error && (
        <div className="offline-toast" role="alert" style={{ background: 'rgba(220,38,38,0.12)', borderColor: 'rgba(220,38,38,0.4)', color: '#dc2626' }}>
          <AlertTriangle size={18} />
          <span>Connection issue. Showing cached session. Retrying...</span>
        </div>
      )}
    </div>
  )
}
