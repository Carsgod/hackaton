import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, RotateCcw, SkipForward, X, Volume2, CheckCircle2, ArrowLeft, Smartphone, Send } from 'lucide-react'
import { useAccessibility } from '../hooks/useAccessibility'
import { DEMO_TREE_EN, extractCards, getTree } from '../data/conversationTree'

export default function DemoPage({ onBack, onComplete }) {
  const { currentFontSize } = useAccessibility()
  const [language, setLanguage] = useState('en')
  const [transcripts, setTranscripts] = useState([])
  const [cards, setCards] = useState([])
  const [speed, setSpeed] = useState(1)
  const [ready, setReady] = useState(false)
  const [offlineQueue, setOfflineQueue] = useState(0)
  const [smsSent, setSmsSent] = useState(false)
  const [caseNumber, setCaseNumber] = useState('')
  const [customerInput, setCustomerInput] = useState('')
  const [waitingForCustomer, setWaitingForCustomer] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [currentNodeId, setCurrentNodeId] = useState('root')
  const [isPlaying, setIsPlaying] = useState(false)
  const [tree, setTree] = useState(DEMO_TREE_EN)
  const intervalRef = useRef(null)
  const timeoutRef = useRef(null)
  const isPlayingRef = useRef(false)

  const clearTimers = () => {
    clearInterval(intervalRef.current)
    clearTimeout(timeoutRef.current)
    intervalRef.current = null
    timeoutRef.current = null
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

    setTranscripts(prev => [...prev, { speaker: 'agent', text: node.agent, timestamp: Date.now() }])
    const nextCards = extractCards(node.agent)
    setCards(prev => {
      const merged = [...prev]
      nextCards.forEach(card => { if (!merged.find(c => c.value === card.value)) merged.push(card) })
      return merged
    })

    setCurrentNodeId(nodeId)
    setSuggestions((node.options || []).map(option => option.label))
    setWaitingForCustomer(true)
    setCustomerInput('')
  }

  const sendCustomerResponse = (text) => {
    if (!text.trim()) return
    setTranscripts(prev => [...prev, { speaker: 'customer', text: text.trim(), timestamp: Date.now() }])
    setCustomerInput('')
    setSuggestions([])
    setWaitingForCustomer(false)
    clearTimers()

    const currentNode = tree[currentNodeId]
    const matched = currentNode?.options?.find(option => option.label.toLowerCase() === text.trim().toLowerCase())
    const nextNodeId = matched?.next || 'end'

    const t = setTimeout(() => {
      showAgentNode(nextNodeId)
    }, 600 / speed)
    timeoutRef.current = t
  }

  const startDemo = () => {
    try {
      setSpeed(1)
      setIsPlaying(true)
      isPlayingRef.current = true
      setTranscripts([])
      setCards([])
      setCurrentNodeId('root')
      setWaitingForCustomer(false)
      setSuggestions([])
      setCustomerInput('')
      showAgentNode('root')
    } catch (err) {
      console.error('Demo start failed', err)
      setIsPlaying(false)
      isPlayingRef.current = false
    }
  }

  const pauseDemo = () => {
    setIsPlaying(false)
    isPlayingRef.current = false
    clearTimers()
  }

  const resetDemo = () => {
    pauseDemo()
    setCurrentNodeId('root')
    setTranscripts([])
    setCards([])
    setSpeed(1)
    setSmsSent(false)
    setCaseNumber('')
    setOfflineQueue(0)
    setWaitingForCustomer(false)
    setSuggestions([])
    setCustomerInput('')
  }

  const skipToNext = () => {
    if (waitingForCustomer && suggestions.length > 0) {
      sendCustomerResponse(suggestions[0])
      return
    }
    pauseDemo()
  }

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 50)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    return () => clearTimers()
  }, [])

  useEffect(() => {
    if (!ready) return
    clearTimers()
    setIsPlaying(false)
    isPlayingRef.current = false
    setTranscripts([])
    setCards([])
    setCurrentNodeId('root')
    setWaitingForCustomer(false)
    setSuggestions([])
    setCustomerInput('')
    setSmsSent(false)
    setCaseNumber('')
    setOfflineQueue(0)
    let cancelled = false
    getTree(language).then(loadedTree => {
      if (!cancelled) setTree(loadedTree)
    })
    return () => {
      cancelled = true
    }
  }, [language, ready])

  const visibleSuggestions = suggestions.filter(s =>
    s.toLowerCase().includes(customerInput.toLowerCase())
  )

  if (!ready) {
    return (
      <div className="demo-loading">
        <div className="demo-loading-dot" />
      </div>
    )
  }

  const progress = Math.round((transcripts.length / 10) * 100)

  return (
    <div className="demo-page">
      <header className="demo-header">
        <div className="demo-header-left">
          <button className="btn-icon" onClick={onBack} aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <div className="demo-header-title">
            <h1>EchoText Demo</h1>
            <p>Deaf Accessibility — MoMo Refund Journey</p>
          </div>
        </div>
        <div className="demo-controls-top">
          <div className="speed-control">
            <span className="speed-label">Speed</span>
            {[0.5, 1, 1.5].map(s => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={'speed-btn' + (speed === s ? ' active' : '')}
              >
                {s}x
              </button>
            ))}
          </div>
          <div className="demo-lang-toggle">
            <button className={'lang-btn' + (language === 'en' ? ' active' : '')} onClick={() => setLanguage('en')}>EN</button>
            <button className={'lang-btn' + (language === 'tw' ? ' active' : '')} onClick={() => setLanguage('tw')}>TW</button>
          </div>
          <button className="btn-icon" onClick={onBack} aria-label="Close demo"><X size={20} /></button>
        </div>
      </header>

      <main className="demo-content">
        <div className="demo-cards" aria-label="Summary cards">
          <AnimatePresence>
            {cards.map(card => (
              <motion.div
                key={card.id || card.value}
                className={'demo-card demo-card-' + card.type}
                initial={{ opacity: 0, scale: 0.85, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
              >
                <span className="demo-card-icon">{card.icon}</span>
                <div className="demo-card-info">
                  <div className="demo-card-label">{card.label}</div>
                  <div className="demo-card-value">{card.value}</div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div
          aria-live="polite"
          aria-label="Conversation transcript"
          className="demo-transcripts"
        >
          <AnimatePresence>
            {transcripts.map((t, i) => (
              <motion.div
                key={i}
                className={'demo-transcript ' + t.speaker}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="demo-transcript-speaker">
                  <span className={'demo-dot ' + t.speaker} />
                  <span>{t.speaker === 'agent' ? 'Agent' : 'You'}</span>
                </div>
                <p style={{ fontSize: currentFontSize, direction: 'ltr' }}>{t.text}</p>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="demo-footer">
          <div className="demo-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: progress + '%' }} />
            </div>
            <span className="progress-text">{transcripts.length} / 10</span>
          </div>
          <div className="demo-actions">
            {!waitingForCustomer ? (
              <button className="btn btn-primary btn-sm" onClick={startDemo} disabled={isPlaying}><Play size={16} /> Play</button>
            ) : (
              <button className="btn btn-secondary btn-sm" onClick={pauseDemo}><Pause size={16} /> Pause</button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={skipToNext} disabled={!waitingForCustomer}>
              <SkipForward size={16} /> Next
            </button>
            <button className="btn btn-secondary btn-sm" onClick={resetDemo}><RotateCcw size={16} /> Reset</button>
          </div>
        </div>

        {waitingForCustomer && (
          <div className="demo-response-area">
            <div className="demo-suggestions" role="list" aria-label="Suggested responses">
              {visibleSuggestions.map((suggestion, index) => (
                <button
                  key={index}
                  className="demo-suggestion-chip"
                  role="listitem"
                  onClick={() => sendCustomerResponse(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <div className="demo-input-row">
              <input
                id="demo-customer-input"
                type="text"
                value={customerInput}
                onChange={(e) => setCustomerInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') sendCustomerResponse(customerInput)
                }}
                placeholder="Type your response..."
                aria-label="Your response"
                style={{ fontSize: currentFontSize }}
              />
              <button className="btn btn-primary btn-sm" onClick={() => sendCustomerResponse(customerInput)} disabled={!customerInput.trim()} aria-label="Send response">
                <Send size={16} />
              </button>
            </div>
          </div>
        )}

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
                 EchoText Ghana: Your support case {caseNumber || 'CASE45678'} has been confirmed. Your refund of fifty Ghana cedis has been approved. Funds will arrive within twenty-four hours.
              </div>
              <div className="sms-phone-meta">Delivered via SMS Gateway</div>
            </div>
          </motion.div>
        )}

        {smsSent && (
          <motion.div
            className="agent-progress-tracker"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="agent-progress-header">
              <span className="agent-progress-title">Resolution Progress</span>
              <span className="agent-progress-status">In Progress</span>
            </div>
            <div className="agent-progress-bar">
              <div className="agent-progress-fill" style={{ width: '65%' }} />
            </div>
          </motion.div>
        )}
      </main>
    </div>
  )
}
