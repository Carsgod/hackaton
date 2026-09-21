import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send, RotateCcw, Accessibility,
  X, AlertTriangle, Smartphone, CheckCircle2, Globe,
} from 'lucide-react'
import { useWebSocket } from '../hooks/useWebSocket'
import { useAccessibility } from '../hooks/useAccessibility'
import PinnedCards from '../components/PinnedCards'
import QuickResponses from '../components/QuickResponses'
import AccessibilityControls from '../components/AccessibilityControls'
import { DEMO_TREE_EN, DEMO_TREE_TWI, extractCards, getTree } from '../data/conversationTree'

export default function TranscriptionPage({ sessionId, onBack, demoMode, onComplete }) {
  const { currentFontSize } = useAccessibility()
  const [language, setLanguage] = useState('en')
  const [transcripts, setTranscripts] = useState([])
  const [cards, setCards] = useState([])
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [smsSent, setSmsSent] = useState(false)
  const [caseNumber, setCaseNumber] = useState('')
  const [customerResponse, setCustomerResponse] = useState('')
  const [networkStatus, setNetworkStatus] = useState('online')
  const [offlineQueue, setOfflineQueue] = useState([])
  const [showControls, setShowControls] = useState(false)
  const [currentNodeId, setCurrentNodeId] = useState('root')
  const [waitingForCustomer, setWaitingForCustomer] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [tree, setTree] = useState(DEMO_TREE_EN)
  const [dualLanguage, setDualLanguage] = useState(false)
  const [speakingId, setSpeakingId] = useState(null)
  const [retrying, setRetrying] = useState(false)
  const [lastError, setLastError] = useState(null)
  const [connectionRestored, setConnectionRestored] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const messagesEndRef = useRef(null)
  const responseInputRef = useRef(null)
  const intervalRef = useRef(null)
  const timeoutRef = useRef(null)
  const isPlayingRef = useRef(false)
  const safeSessionId = encodeURIComponent(sessionId || '')
  const wsUrl = `${import.meta.env.VITE_BACKEND_URL || 'ws://localhost:8000'}/ws/${safeSessionId}?language=${language}`

  useEffect(() => {
    const visited = localStorage.getItem('echotext-visited')
    if (!visited) {
      setShowOnboarding(true)
      localStorage.setItem('echotext-visited', 'true')
    }
  }, [])

  const connectionState = connectionStatus === 'connected' ? 'live' : connectionStatus === 'connecting' ? 'connecting' : connectionStatus === 'ended' ? 'ended' : 'offline'
  const isOnline = networkStatus === 'online'
  const showOfflineBanner = !isOnline || connectionState !== 'live'

  useEffect(() => {
    if (waitingForCustomer && responseInputRef.current && isOnline) {
      responseInputRef.current.focus()
    }
  }, [waitingForCustomer, isOnline])

  const clearTimers = () => {
    clearInterval(intervalRef.current)
    clearTimeout(timeoutRef.current)
    intervalRef.current = null
    timeoutRef.current = null
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

  const showAgentNode = (nodeId) => {
    const node = tree[nodeId]
    if (!node) {
      setIsPlaying(false)
      isPlayingRef.current = false
      setWaitingForCustomer(false)
      setSmsSent(true)
      setCaseNumber('CASE45678')
      onComplete?.()
      return
    }

    setTranscripts(prev => [...prev, { speaker: 'agent', text: node.agent, timestamp: Date.now(), nodeId, translation: getTranslation(nodeId, 'agent') }])
    const nextCards = extractCards(node.agent)
    setCards(prev => {
      const merged = [...prev]
      nextCards.forEach(card => { if (!merged.find(c => c.value === card.value)) merged.push(card) })
      return merged
    })

    setCurrentNodeId(nodeId)
    setSuggestions((node.options || []).map(option => option.label))
    setWaitingForCustomer(true)
    setCustomerResponse('')
  }

  const sendCustomerResponse = (text) => {
    if (!text.trim()) return
    setTranscripts(prev => [...prev, { speaker: 'customer', text: text.trim(), timestamp: Date.now(), translation: null }])
    setCustomerResponse('')
    setSuggestions([])
    setWaitingForCustomer(false)
    clearTimers()

    const currentNode = tree[currentNodeId]
    const matched = currentNode?.options?.find(option => option.label.toLowerCase() === text.trim().toLowerCase())
    const nextNodeId = matched?.next || 'end'

    const t = setTimeout(() => {
      showAgentNode(nextNodeId)
    }, 600)
    timeoutRef.current = t
  }

  const startSession = () => {
    setIsPlaying(true)
    isPlayingRef.current = true
    setTranscripts([])
    setCards([])
    setCurrentNodeId('root')
    setWaitingForCustomer(false)
    setSuggestions([])
    setCustomerResponse('')
    showAgentNode('root')
  }

  const pauseSession = () => {
    setIsPlaying(false)
    isPlayingRef.current = false
    clearTimers()
  }

  const resetSession = () => {
    pauseSession()
    setCurrentNodeId('root')
    setTranscripts([])
    setCards([])
    setWaitingForCustomer(false)
    setSuggestions([])
    setCustomerResponse('')
  }

  const onConnect = useCallback(() => setConnectionStatus('connected'), [])
  const onDisconnect = useCallback(() => setConnectionStatus('disconnected'), [])

  const retryConnection = () => {
    setRetrying(true)
    setLastError(null)
    disconnect()
    setTimeout(() => {
      connect()
      setRetrying(false)
    }, 800)
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
        setConnectionRestored(true)
        setLastError(null)
        setTimeout(() => setConnectionRestored(false), 3000)
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
      case 'error':
        setLastError(data.message || 'Connection error')
        break
      default:
        break
    }
  }, [])

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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcripts])

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

  useEffect(() => {
    return () => clearTimers()
  }, [])

  useEffect(() => {
    clearTimers()
    setTranscripts([])
    setCards([])
    setCurrentNodeId('root')
    setWaitingForCustomer(false)
    setSuggestions([])
    setCustomerResponse('')
    setSmsSent(false)
    setCaseNumber('')
    setOfflineQueue([])
    setIsPlaying(false)
    isPlayingRef.current = false
    let cancelled = false
    getTree(language).then(loadedTree => {
      if (!cancelled) setTree(loadedTree)
    })
    return () => {
      cancelled = true
    }
  }, [language])

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

  const hasContent = transcripts.length > 0 || cards.length > 0

  return (
    <div className="transcription-page">
      <a href="#transcript-main" className="skip-link">Skip to transcript</a>
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
              <button className={'lang-btn' + (dualLanguage ? ' active' : '')} onClick={() => setDualLanguage(prev => !prev)}>EN+TW</button>
            </div>
          </div>
        </div>
        <div className="header-right">
          <button className="btn-icon" onClick={() => setShowControls(!showControls)} aria-label="Accessibility settings">
            <Accessibility size={20} />
          </button>
        </div>
      </header>

      {showOnboarding && (
        <div className="transcription-onboarding" role="alert">
          <div className="transcription-onboarding-content">
            <strong>Welcome to EchoText</strong>
            <p>This demo shows live captions, quick responses, and dual-language subtitles. Use the accessibility button to adjust text size and contrast.</p>
            <button className="btn btn-primary" onClick={() => setShowOnboarding(false)}>Got it</button>
          </div>
        </div>
      )}

      {showOfflineBanner && (
        <div className={`transcription-status-banner transcription-status-banner-${connectionState}`} role="status" aria-live="polite">
          {!isOnline ? (
            <>
              <AlertTriangle size={16} />
              <span>Device offline</span>
            </>
          ) : connectionState === 'live' ? (
            <>
              <span className="pulse-dot" />
              <span>Live session active</span>
            </>
          ) : connectionState === 'connecting' ? (
            <>
              <span className="transcription-status-spinner" />
              <span>Connecting{retrying ? '...' : ''}</span>
              <button className="transcription-status-retry" onClick={retryConnection} disabled={retrying}>
                {retrying ? 'Retrying...' : 'Retry'}
              </button>
            </>
          ) : connectionState === 'offline' ? (
            <>
              <AlertTriangle size={16} />
              <span>You are offline</span>
              <button className="transcription-status-retry" onClick={retryConnection} disabled={retrying}>
                {retrying ? 'Retrying...' : 'Retry'}
              </button>
            </>
          ) : connectionState === 'ended' ? (
            <>
              <AlertTriangle size={16} />
              <span>Session ended</span>
            </>
          ) : null}
        </div>
      )}

      {connectionRestored && (
        <div className="transcription-success-banner" role="status" aria-live="polite">
          <CheckCircle2 size={16} />
          <span>Connection restored</span>
        </div>
      )}

      {lastError && !showOfflineBanner && (
        <div className="transcription-error-banner" role="alert">
          <AlertTriangle size={16} />
          <span>{lastError}</span>
          <button className="transcription-status-retry" onClick={retryConnection} disabled={retrying}>
            {retrying ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      )}

      {offlineQueue.length > 0 && (
        <div className="transcription-offline-queue" role="status" aria-live="polite">
          <AlertTriangle size={16} />
          <span>{offlineQueue.length} message{offlineQueue.length === 1 ? '' : 's'} pending sync</span>
        </div>
      )}

      <PinnedCards cards={cards} />

      <main id="transcript-main" className="transcription-main">
        <div className="transcripts-container">
          {!hasContent && (
            <div className="transcription-waiting">
              <div className="transcription-waiting-wave">
                <span></span>
                <span></span>
                <span></span>
                <span></span>
                <span></span>
              </div>
              <p className="transcription-waiting-title">Waiting for transcription...</p>
              <p className="transcription-waiting-subtitle">The agent's speech will appear here in real time.</p>
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={startSession}>
                Start Demo Session
              </button>
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
                <div className="transcript-text-wrap">
                  <p className="transcript-text" style={{ fontSize: currentFontSize, direction: 'ltr' }}>
                    {transcript.text}
                  </p>
                  {dualLanguage && transcript.translation && (
                    <p className="transcript-text transcript-text-secondary" style={{ fontSize: currentFontSize, direction: 'ltr' }}>
                      {transcript.translation}
                    </p>
                  )}
                </div>
                <div className="transcript-actions">
                  <button className="transcript-action-btn" onClick={() => speakText(transcript.text, transcript.timestamp)} aria-label="Read aloud">
                    {speakingId === transcript.timestamp ? '🔊' : '🔈'}
                  </button>
                </div>
                {transcript.is_local && <span className="local-badge">You</span>}
                {transcript.pending && <span className="pending-badge">Pending</span>}
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>
      </main>

      {waitingForCustomer && (
        <div className="response-bar">
          <div className="response-input-wrapper">
            <input
              id="transcription-customer-input"
              ref={responseInputRef}
              type="text"
              placeholder={isOnline ? 'Type your response...' : 'You are offline...'}
              value={customerResponse}
              onChange={(e) => setCustomerResponse(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendCustomerResponse(customerResponse)}
              className="response-input"
              aria-label="Type your response"
              aria-describedby="connection-status-description"
              style={{ fontSize: currentFontSize }}
              disabled={!isOnline}
            />
            <button className="btn-send" onClick={() => sendCustomerResponse(customerResponse)} disabled={!customerResponse.trim() || !isOnline} aria-label="Send response">
              <Send size={20} />
            </button>
          </div>
          <div id="connection-status-description" className="sr-only">
            {isOnline ? 'Connected and ready to send' : 'You are currently offline. Responses will be queued and sent when connection resumes.'}
          </div>
          <div className="response-actions">
            <div className="quick-responses" role="region" aria-label="Quick response prompts">
              <div className="quick-responses-scroll">
                {suggestions.filter(s => s.toLowerCase().includes(customerResponse.toLowerCase())).map((prompt, index) => (
                  <button
                    key={prompt + index}
                    className="quick-prompt"
                    onClick={() => sendCustomerResponse(prompt)}
                    disabled={!isOnline}
                  >
                    <span className="prompt-text">{prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

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
    </div>
  )
}
