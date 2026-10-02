import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send, RotateCcw, Accessibility,
  X, AlertTriangle, Smartphone, CheckCircle2, Globe, Printer, Settings,
} from 'lucide-react'
import { useWebSocket } from '../hooks/useWebSocket'
import { useAccessibility } from '../hooks/useAccessibility'
import PinnedCards from '../components/PinnedCards'
import QuickResponses from '../components/QuickResponses'
import AccessibilityControls from '../components/AccessibilityControls'
import { DEMO_TREE_EN, DEMO_TREE_TWI, extractCards, getTree } from '../data/conversationTree'

export default function TranscriptionPage({ sessionId, onBack, demoMode, onComplete }) {
  if (!sessionId) {
    return null
  }
  const { currentFontSize } = useAccessibility()
  const [language, setLanguage] = useState('en')
  const [transcripts, setTranscripts] = useState([])
  const [cards, setCards] = useState([])
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [smsSent, setSmsSent] = useState(false)
  const [caseNumber, setCaseNumber] = useState('')
  const [caseSummary, setCaseSummary] = useState({})
  const [customerResponse, setCustomerResponse] = useState('')
  const [networkStatus, setNetworkStatus] = useState('online')
  const [offlineQueue, setOfflineQueue] = useState([])
  const [showControls, setShowControls] = useState(false)
  const [showChatSettings, setShowChatSettings] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [lastError, setLastError] = useState(null)
  const [connectionRestored, setConnectionRestored] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showCompletion, setShowCompletion] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [currentNodeId, setCurrentNodeId] = useState('root')
  const [waitingForCustomer, setWaitingForCustomer] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [tree, setTree] = useState(DEMO_TREE_EN)
  const [dualLanguage, setDualLanguage] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [speakingId, setSpeakingId] = useState(null)
  const [translationMode, setTranslationMode] = useState('translated')
  const responseInputRef = useRef(null)
  const intervalRef = useRef(null)
  const timeoutRef = useRef(null)
  const isPlayingRef = useRef(false)
  const transcriptsContainerRef = useRef(null)
  const isNearBottomRef = useRef(true)
  const showCompletionRef = useRef(false)
  const getBackendBaseUrl = () => {
    const raw = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'
    if (raw.startsWith('ws://') || raw.startsWith('wss://')) return raw
    if (raw.startsWith('https://')) return raw.replace(/^https:\/\//, 'wss://')
    return raw.replace(/^http:\/\//, 'ws://')
  }
  const getHttpBaseUrl = () => {
    const raw = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'
    if (raw.startsWith('ws://')) return raw.replace(/^ws:\/\//, 'http://')
    if (raw.startsWith('wss://')) return raw.replace(/^wss:\/\//, 'https://')
    return raw
  }
  const safeSessionId = encodeURIComponent(sessionId || '')
  const wsUrl = `${getBackendBaseUrl()}/ws/${safeSessionId}?language=${language}&role=customer`

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
  const lastTranscript = transcripts[transcripts.length - 1]
  const isWaitingForResponse = waitingForCustomer || (lastTranscript && lastTranscript.speaker === 'agent')

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
    if (!demoMode) return
    const node = tree[nodeId]
    if (!node) {
      setIsPlaying(false)
      isPlayingRef.current = false
      setWaitingForCustomer(false)
      setSmsSent(true)
      setCaseNumber('CASE45678')
      setShowCompletion(true)
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

    if (!node.options || node.options.length === 0) {
      setTimeout(() => {
        setIsPlaying(false)
        isPlayingRef.current = false
        setWaitingForCustomer(false)
        setSmsSent(true)
        setCaseNumber('CASE45678')
        setShowCompletion(true)
      }, 1500 / speed)
    }
  }

  const sendCustomerResponse = (text) => {
    if (!text.trim()) return
    if (demoMode) {
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
    } else {
      const trimmed = text.trim()
      setTranscripts(prev => [...prev, { type: 'transcript', text: trimmed, speaker: 'customer', timestamp: Date.now(), is_local: true }])
      setCustomerResponse('')
      setSuggestions([])
      setWaitingForCustomer(false)
      const sent = send({ type: 'response', data: { text: trimmed, speaker: 'customer', timestamp: Date.now() } })
    }
  }

  const startSession = () => {
    if (demoMode) {
      setIsPlaying(true)
      isPlayingRef.current = true
      setTranscripts([])
      setCards([])
      setCurrentNodeId('root')
      setWaitingForCustomer(false)
      setSuggestions([])
      setCustomerResponse('')
      setShowCompletion(false)
      showCompletionRef.current = false
      showAgentNode('root')
    } else {
      setTranscripts([])
      setCards([])
      setCurrentNodeId('root')
      setWaitingForCustomer(false)
      setSuggestions([])
      setCustomerResponse('')
      setShowCompletion(false)
      showCompletionRef.current = false
      connect()
    }
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

  const onConnect = useCallback(() => {
    console.info('[customer] connected', 'session=', sessionId)
    setConnectionStatus('connected')
  }, [sessionId])
  const onDisconnect = useCallback(() => {
    console.warn('[customer] disconnected', 'session=', sessionId)
    setConnectionStatus('disconnected')
  }, [sessionId])
  const onError = useCallback((err) => {
    console.error('[customer] websocket error', err)
    setLastError(err || 'WebSocket error')
  }, [])

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

    if (data.type === 'transcript') {

    }
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
        if (!demoMode && data.speaker === 'agent') {
          setWaitingForCustomer(true)
          setSuggestions([])
          if (data.translation_mode) {
            setTranslationMode(data.translation_mode)
          }
          const agentText = data.text || ''
          const suggested = Array.isArray(data.suggested_replies) ? data.suggested_replies : []
          if (suggested.length) {
            setSuggestions(suggested.slice(0, 3))
          } else {
            const originalText = data.original_text || agentText
            if (originalText.trim()) {
              fetch(`${getHttpBaseUrl()}/api/suggestions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: originalText, language, mix: translationMode, role: 'customer', context: transcripts.slice(-4).map(t => `${t.speaker}:${t.text}`).join('\n') }),
              })
                .then(res => res.ok ? res.json() : { suggestions: [] })
                .then(result => {
                  if (Array.isArray(result.suggestions) && result.suggestions.length) {
                    setSuggestions(result.suggestions.slice(0, 3))
                  }
                })
                .catch(() => setSuggestions([]))
            }
          }
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
        if (data.status === 'ended' && !showCompletionRef.current) {
          showCompletionRef.current = true
          setShowCompletion(true)
        }
        break
      case 'sms':
        setSmsSent(true)
        setCaseNumber(data.data?.case_number || '')
        if (!showCompletionRef.current) {
          showCompletionRef.current = true
          setShowCompletion(true)
        }
        break
      case 'case_summary':
        if (data.case_summary) {
          setCaseSummary(data.case_summary)
          if (data.case_summary?.case_number) {
            setCaseNumber(data.case_summary.case_number)
          }
        }
        break
      case 'post_call_summary':
        if (data.data?.summary?.case_number) {
          setCaseNumber(data.data.summary.case_number)
        }
        if (!showCompletionRef.current) {
          showCompletionRef.current = true
          setShowCompletion(true)
        }
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
  }, [demoMode])

  const { isConnected, error, connect, disconnect, send } = useWebSocket(
    wsUrl,
    handleMessage,
    onConnect,
    onDisconnect
  )

  const joinedSessionRef = useRef(null)
  const connectingRef = useRef(false)
  useEffect(() => {
    if (!sessionId) return
    const normalized = String(sessionId).trim().toLowerCase()
    if (joinedSessionRef.current === normalized) return
    joinedSessionRef.current = normalized
    if (connectingRef.current) return
    connectingRef.current = true
    console.info('[customer] joining session', normalized, 'raw=', sessionId)
    const timer = setTimeout(() => {
      connect()
      connectingRef.current = false
    }, 50)
    return () => {
      console.info('[customer] leaving session', normalized)
      joinedSessionRef.current = null
      connectingRef.current = false
      clearTimeout(timer)
      disconnect()
    }
  }, [sessionId, connect, disconnect])

  useEffect(() => {
    const handleOnline = () => {
      setNetworkStatus('online')
      setConnectionRestored(true)
      setTimeout(() => setConnectionRestored(false), 3000)
    }
    const handleOffline = () => setNetworkStatus('offline')
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (!isConnected || offlineQueue.length === 0) return
    const queue = [...offlineQueue]
    let sent = 0
    for (const message of queue) {
      const ok = send(message)
      if (ok) {
        sent += 1
      }
    }
    if (sent > 0) {
      setOfflineQueue(prev => prev.slice(sent))
    }
  }, [isConnected, offlineQueue.length, send])

  useEffect(() => {
    if (demoMode || !isConnected) return
    send({ type: 'set_language', data: { language } })
  }, [isConnected, demoMode, send, language])

  useEffect(() => {
    if (demoMode || !isConnected) return
    send({ type: 'set_mode', data: { mode: dualLanguage ? 'dual' : 'translated' } })
  }, [isConnected, demoMode, send, dualLanguage])

  useEffect(() => {
    if (isConnected && demoMode) {
      send({ type: 'start_demo' })
    }
  }, [isConnected, demoMode, send])

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

  useEffect(() => {
    if (isNearBottomRef.current) {
      scrollToBottom('auto')
    }
  }, [transcripts, scrollToBottom])

  useEffect(() => {
    const el = transcriptsContainerRef.current
    if (!el) return
    const handleScroll = () => {
      isNearBottomRef.current = checkNearBottom()
      setShowScrollTop(el.scrollTop > 300)
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [checkNearBottom])

  const scrollToTop = () => {
    const el = transcriptsContainerRef.current
    if (!el) return
    el.scrollTo({ top: 0, behavior: 'smooth' })
  }

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
    const onError = (event) => {

      setLastError(event.error || 'Unhandled error')
    }
    window.addEventListener('error', onError)
    return () => window.removeEventListener('error', onError)
  }, [])

  useEffect(() => {
    return () => clearTimers()
  }, [])

  useEffect(() => {
    clearTimers()
    if (demoMode) {
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
      setShowCompletion(false)
      showCompletionRef.current = false
      isPlayingRef.current = false
    }
    let cancelled = false
    getTree(language).then(loadedTree => {
      if (!cancelled) setTree(loadedTree)
    })
    return () => {
      cancelled = true
    }
  }, [language, demoMode])

  useEffect(() => {
    if (demoMode || !isConnected) return
    send({ type: 'set_language', data: { language } })
  }, [isConnected, demoMode, send, language])

  useEffect(() => {
    if (demoMode || !isConnected) return
    send({ type: 'set_mode', data: { mode: dualLanguage ? 'dual' : 'translated' } })
  }, [isConnected, demoMode, send, dualLanguage])

  const sendResponse = (text) => {
    if (!text.trim()) return
    const message = { type: 'response', data: { text, speaker: 'customer', timestamp: Date.now() } }
    if (networkStatus === 'offline') {
      setOfflineQueue(prev => [...prev, message])
      setTranscripts(prev => [...prev, { type: 'transcript', text, speaker: 'customer', timestamp: Date.now(), is_local: true, pending: true }])
    } else {
      const sent = send(message)
      if (!sent) {

      } else {

      }
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
    setCaseSummary({})
    setSmsSent(false)
    setCaseNumber('')
  }

  const hasContent = transcripts.length > 0 || cards.length > 0

  const smartCards = useMemo(() => {
    const merged = [...cards]
    const summary = caseSummary || {}
    const stage = String(summary.stage || '').toLowerCase()
    const problemType = String(summary.problem_type || '').toLowerCase()
    const urgency = String(summary.urgency || '').toLowerCase()
    const problemLabel = String(summary.problem_summary || summary.problem_label || '').trim()
    const hasAmount = Boolean(summary.amount || summary.currency)
    const hasReference = Boolean(summary.reference || summary.case_number)
    const verificationComplete = Boolean(summary.verified || summary.verification_complete)
    const refundApproved = Boolean(summary.refund_approved)
    const smsSent = Boolean(summary.sms_sent)
    const actions = Array.isArray(summary.actions) ? summary.actions : []
    const recommended = Array.isArray(summary.recommended_actions) ? summary.recommended_actions : []

    if (problemLabel && !merged.find(c => c.type === 'problem')) {
      merged.push({
        id: 'smart_problem',
        type: 'problem',
        label: 'Problem',
        value: problemLabel,
        icon: '🧩',
        priority: 1,
        confidence: summary.confidence || 0.8,
        context: stage ? `Stage: ${stage.replace(/_/g, ' ')}` : '',
      })
    }
    if (urgency === 'high' && !merged.find(c => c.type === 'urgency')) {
      merged.push({
        id: 'smart_urgency',
        type: 'urgency',
        label: 'Urgency',
        value: 'High priority',
        icon: '🚨',
        priority: 2,
        confidence: 0.9,
        context: 'Detected from conversation',
      })
    }
    if (stage && !merged.find(c => c.type === 'stage')) {
      const stageLabel = stage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      merged.push({
        id: 'smart_stage',
        type: 'stage',
        label: 'Stage',
        value: stageLabel,
        icon: '🧭',
        priority: 3,
        confidence: 0.9,
        context: '',
      })
    }
    if (!verificationComplete && ['problem_identification', 'solution', 'resolution'].includes(stage)) {
      merged.push({
        id: 'smart_next_verify',
        type: 'next_step',
        label: 'Next',
        value: 'Verify identity',
        icon: '🪪',
        priority: 4,
        confidence: 0.7,
        context: 'Recommended before proceeding',
      })
    } else if (verificationComplete && !refundApproved && ['solution'].includes(stage)) {
      merged.push({
        id: 'smart_next_approve',
        type: 'next_step',
        label: 'Next',
        value: 'Approve resolution',
        icon: '✅',
        priority: 4,
        confidence: 0.7,
        context: 'Awaiting agent confirmation',
      })
    } else if (smsSent) {
      merged.push({
        id: 'smart_next_sms',
        type: 'next_step',
        label: 'Status',
        value: 'SMS sent',
        icon: '📩',
        priority: 4,
        confidence: 1.0,
        context: 'Confirmation delivered',
      })
    }
    merged.sort((a, b) => (a.priority || 99) - (b.priority || 99))
    return merged
  }, [cards, caseSummary])


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
          <button className="btn-icon" onClick={() => setShowChatSettings(prev => !prev)} aria-label="Chat settings">
            <Settings size={20} />
          </button>
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

      <PinnedCards cards={smartCards} />

      <main id="transcript-main" className="transcription-main" ref={transcriptsContainerRef}>
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
              {demoMode && (
                <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={startSession}>
                  Start Demo Session
                </button>
              )}
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
                </div>
                <div className="transcript-text-wrap">
                  <p className="transcript-text" style={{ fontSize: currentFontSize, direction: 'ltr' }}>
                    {transcript.text}
                  </p>
                  {!demoMode && transcript.translation_mode === 'dual' && transcript.original_text && (
                    <p className="transcript-text transcript-text-secondary" style={{ fontSize: currentFontSize, direction: 'ltr' }}>
                      {transcript.original_text}
                    </p>
                  )}
                  {demoMode && dualLanguage && transcript.translation && (
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
        </div>
        {showScrollTop && (
          <button
            className="transcription-scroll-top"
            onClick={scrollToTop}
            aria-label="Scroll to top"
          >
            ↑
          </button>
        )}
      </main>

      {isWaitingForResponse && (
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
            <div className="quick-responses" role="region" aria-label="AI suggested replies">
              <div className="quick-responses-header">
                <span className="quick-responses-title">AI Suggestions</span>
              </div>
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

      <AnimatePresence>
        {showChatSettings && (
          <motion.div
            className="controls-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }}
          >
            <div className="settings-panel">
              <div className="settings-header">
                <h3>Chat Settings</h3>
                <button className="btn-icon" onClick={() => setShowChatSettings(false)} aria-label="Close chat settings">
                  <X size={20} />
                </button>
              </div>
              <div className="settings-body">
                <div className="setting-item">
                  <div>
                    <div className="setting-label">Auto-scroll</div>
                    <div className="setting-desc">Jump to new messages automatically</div>
                  </div>
                  <button className={'lang-btn' + (!isNearBottomRef.current ? ' active' : '')} onClick={() => {
                    const el = transcriptsContainerRef.current
                    if (!el) return
                    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80
                    if (!near) {
                      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
                    }
                  }}>Auto</button>
                </div>
                <div className="setting-item">
                  <div>
                    <div className="setting-label">Live suggestions</div>
                    <div className="setting-desc">Show AI quick replies when available</div>
                  </div>
                  <button className={'lang-btn' + (suggestions.length > 0 ? ' active' : '')} onClick={() => setSuggestions(prev => prev.length ? [] : [])}>On</button>
                </div>
                <div className="setting-item">
                  <div>
                    <div className="setting-label">Session</div>
                    <div className="setting-desc">Current session ID</div>
                  </div>
                  <span className="setting-value">{sessionId}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCompletion && (
          <motion.div
            key="completion-overlay"
            className="completion-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setShowCompletion(false)
              showCompletionRef.current = false
              onComplete?.()
            }}
          >
            <motion.div
              className="completion-modal"
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="completion-icon">
                <CheckCircle2 size={28} />
              </div>
              <h2>Support Complete</h2>
              <p>The agent has updated your case. You can safely leave the counter.</p>
              <div className="completion-meta">
                <div className="completion-meta-row">
                  <span className="completion-meta-label">Case</span>
                  <span className="completion-meta-value">{caseNumber || 'CASE45678'}</span>
                </div>
                <div className="completion-meta-row">
                  <span className="completion-meta-label">Status</span>
                  <span className="completion-meta-value">Refund Approved</span>
                </div>
                <div className="completion-meta-row">
                  <span className="completion-meta-label">SMS</span>
                  <span className="completion-meta-value">Confirmation sent</span>
                </div>
              </div>
              <div className="completion-actions">
                <button className="btn btn-primary" onClick={() => window.print?.()}>
                  <Printer size={16} /> Print Receipt
                </button>
                <button className="btn btn-secondary" onClick={() => {
                  setShowCompletion(false)
                  onComplete?.()
                }}>
                  Continue
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
