import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, RotateCcw, SkipForward, X, Volume2, CheckCircle2, ArrowLeft, Activity, Clock, Zap, Wifi, WifiOff, Smartphone, Globe } from 'lucide-react'

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

export default function DemoPage({ onBack, onComplete }) {
  const [language, setLanguage] = useState('en')
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTurn, setCurrentTurn] = useState(0)
  const [displayedText, setDisplayedText] = useState('')
  const [liveSpeaker, setLiveSpeaker] = useState(null)
  const [cards, setCards] = useState([])
  const [transcripts, setTranscripts] = useState([])
  const [speed, setSpeed] = useState(1)
  const [ready, setReady] = useState(false)
  const [offlineQueue, setOfflineQueue] = useState(0)
  const [smsSent, setSmsSent] = useState(false)
  const [caseNumber, setCaseNumber] = useState('')
  const intervalRef = useRef(null)
  const timeoutRef = useRef(null)
  const isPlayingRef = useRef(false)
  const hasAutoStarted = useRef(false)
  const conversation = language === 'tw' ? DEMO_CONVERSATION_TWI : DEMO_CONVERSATION

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
      setSmsSent(true)
      setCaseNumber('CASE45678')
      onComplete?.()
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
    setLanguage('en')
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
    setSmsSent(false)
    setCaseNumber('')
    setOfflineQueue(0)
    hasAutoStarted.current = false
  }

  const skipTurn = () => {
    pauseDemo()
    if (currentTurn < conversation.length - 1) playTurn(currentTurn + 1)
  }

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

  if (!ready) {
    return (
      <div className="demo-loading">
        <div className="demo-loading-dot" />
      </div>
    )
  }

  const progress = Math.round((currentTurn / conversation.length) * 100)

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
          <div className="demo-metrics">
            <div className="demo-metric">
              <Zap size={14} />
              <span className="demo-metric-value">&lt;1.5s</span>
              <span>Latency</span>
            </div>
            <div className="demo-metric">
              <Activity size={14} />
              <span className="demo-metric-value">98%</span>
              <span>Confidence</span>
            </div>
            <div className="demo-metric">
              <Clock size={14} />
              <span className="demo-metric-value">~4 min</span>
              <span>Resolution</span>
            </div>
            {offlineQueue > 0 && (
              <div className="offline-queue-badge">
                <WifiOff size={14} />
                <span>{offlineQueue} queued</span>
              </div>
            )}
          </div>
          <div className="speed-control">
            <span className="speed-label">Speed</span>
            {[0.5, 1, 1.5].map(s => (
              <button
                key={s}
                onClick={() => { setSpeed(s); if (isPlayingRef.current) playTurn(currentTurn) }}
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
                  <span>{t.speaker === 'agent' ? 'Agent' : 'Customer'}</span>
                </div>
                <p>{t.text}</p>
              </motion.div>
            ))}
          </AnimatePresence>

          {liveSpeaker && displayedText && (
            <motion.div
              className={'demo-transcript ' + liveSpeaker + ' demo-transcript-live'}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="demo-transcript-speaker">
                <span className={'demo-dot ' + liveSpeaker} />
                <span>{liveSpeaker === 'agent' ? 'Agent' : 'Customer'}</span>
              </div>
              <p>
                {displayedText}
                <span className="typing-cursor" />
              </p>
            </motion.div>
          )}
        </div>

        <div className="demo-footer">
          <div className="demo-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: progress + '%' }} />
            </div>
            <span className="progress-text">{currentTurn} / {conversation.length}</span>
          </div>
          <div className="demo-actions">
            {!isPlaying ? (
              <button className="btn btn-primary btn-sm" onClick={startDemo}><Play size={16} /> Play Demo</button>
            ) : (
              <button className="btn btn-secondary btn-sm" onClick={pauseDemo}><Pause size={16} /> Pause</button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={skipTurn} disabled={currentTurn >= DEMO_CONVERSATION.length - 1}><SkipForward size={16} /> Skip</button>
            <button className="btn btn-secondary btn-sm" onClick={resetDemo}><RotateCcw size={16} /> Reset</button>
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
      </main>
    </div>
  )
}
