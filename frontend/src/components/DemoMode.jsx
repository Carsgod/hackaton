import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, RotateCcw, SkipForward, X, Volume2, CheckCircle2 } from 'lucide-react'

const DEMO_CONVERSATION = [
  { speaker: 'agent', text: 'Good afternoon, welcome to MTN service center. How can I help you today?', delay: 1800 },
  { speaker: 'customer', text: 'I sent fifty Ghana cedis to my sister yesterday but she didn\'t receive it. My account was debited.', delay: 2800 },
  { speaker: 'agent', text: 'I\'m sorry to hear that. Let me check the transaction for you. Can you tell me the phone number you sent to?', delay: 2400 },
  { speaker: 'customer', text: 'Yes, it was zero two four four five five six two two.', delay: 2200 },
  { speaker: 'agent', text: 'Thank you. I can see the transaction. Reference number is REF88321. It shows fifty Ghana cedis was debited from your account on September twelfth at three forty five PM. The transaction is currently pending on the receiver side.', delay: 4200 },
  { speaker: 'agent', text: 'I can initiate a reversal for you. The amount is GHS fifty point zero zero. Do you approve the refund?', delay: 2600 },
  { speaker: 'customer', text: 'Yes please, approve the refund.', delay: 1800 },
  { speaker: 'agent', text: 'I have approved the refund. Your money will be returned to your mobile money wallet within twenty-four hours. Your case number is CASE45678. An SMS confirmation has been sent to your phone number ending in nine zero.', delay: 4200 },
  { speaker: 'customer', text: 'Thank you so much. I can read everything on my screen. This is very helpful.', delay: 2400 },
  { speaker: 'agent', text: 'You\'re welcome. If you have any other issues, please don\'t hesitate to visit us. Have a great day.', delay: 2400 },
]

export default function DemoMode({ sessionId, onClose }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTurn, setCurrentTurn] = useState(0)
  const [displayedText, setDisplayedText] = useState('')
  const [cards, setCards] = useState([])
  const [transcripts, setTranscripts] = useState([])
  const [speed, setSpeed] = useState(1)
  const intervalRef = useRef(null)
  const timeoutRef = useRef(null)
  const hasStartedRef = useRef(false)
  const isPlayingRef = useRef(false)

  const extractCards = (text) => {
    const next = []
    const lower = text.toLowerCase()
    let cardIndex = 0
    const amountMatch = text.match(/(?:GHS\s+)?(fifty|twenty|fifteen|one hundred|five hundred)\s+Ghana\s+cedis|GHS\s+(\d+(?:\.\d{1,2})?)/i)
    if (amountMatch && (/\b(?:amount|fifty|ghs|ref88321|cash)\b/i.test(text) || /ref88321|cash?/i.test(text))) {
      const amountValue = amountMatch[1] ? amountMatch[1] + ' Ghana cedis' : 'GHS ' + amountMatch[2]
      next.push({ id: `card_amount_${cardIndex++}`, type: 'amount', label: 'Amount', value: amountValue, icon: '💳' })
    }
    const refMatch = text.match(/reference\s+number\s+is\s+([A-Z0-9]+)/i)
    if (refMatch) {
      next.push({ id: `card_ref_${refMatch[1]}`, type: 'reference', label: 'Reference', value: refMatch[1], icon: '🔢' })
    }
    const caseMatch = text.match(/case\s+number\s+is\s+([A-Z0-9]+)/i)
    if (caseMatch) {
      next.push({ id: `card_case_${caseMatch[1]}`, type: 'reference', label: 'Case Number', value: caseMatch[1], icon: '📋' })
    }
    if (/approve|reversal|reversed|approved/i.test(text)) {
      next.push({ id: `card_action_${cardIndex++}`, type: 'action', label: 'Action', value: 'Refund Approved', icon: '✅' })
    }
    return next
  }

  const playTurn = (turnIndex) => {
    if (turnIndex >= DEMO_CONVERSATION.length) {
      setIsPlaying(false)
      return
    }
    setCurrentTurn(turnIndex)
    const turn = DEMO_CONVERSATION[turnIndex]
    const words = turn.text.split(' ')
    let wordIndex = 0
    setDisplayedText('')

    clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      if (wordIndex < words.length) {
        setDisplayedText(prev => (prev ? prev + ' ' : '') + words[wordIndex])
        wordIndex++
      } else {
        clearInterval(intervalRef.current)
        setTranscripts(prev => [...prev, { speaker: turn.speaker, text: turn.text, timestamp: Date.now(), is_final: true }])
        const newCards = extractCards(turn.text)
        setCards(prev => {
          const merged = [...prev]
          newCards.forEach(card => { if (!merged.find(c => c.value === card.value)) merged.push(card) })
          return merged
        })
        clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(() => {
          if (isPlayingRef.current) playTurn(turnIndex + 1)
        }, turn.delay / speed)
      }
    }, 110 / speed)
  }

  const startDemo = () => {
    setSpeed(1)
    setIsPlaying(true)
    isPlayingRef.current = true
    setTranscripts([])
    setCards([])
    setCurrentTurn(0)
    setDisplayedText('')
    playTurn(0)
  }

  const pauseDemo = () => {
    setIsPlaying(false)
    isPlayingRef.current = false
    clearInterval(intervalRef.current)
    clearTimeout(timeoutRef.current)
  }

  const resetDemo = () => {
    pauseDemo()
    setCurrentTurn(0)
    setDisplayedText('')
    setTranscripts([])
    setCards([])
    setSpeed(1)
    hasStartedRef.current = false
  }

  const skipTurn = () => {
    pauseDemo()
    if (currentTurn < DEMO_CONVERSATION.length - 1) playTurn(currentTurn + 1)
  }

  useEffect(() => () => {
    clearInterval(intervalRef.current)
    clearTimeout(timeoutRef.current)
  }, [])

  useEffect(() => {
    if (!hasStartedRef.current) {
      hasStartedRef.current = true
      const timer = setTimeout(() => startDemo(), 400)
      return () => clearTimeout(timer)
    }
  }, [])

  return (
    <motion.div className="demo-mode-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="demo-panel" role="dialog" aria-label="EchoText Demo">
        <div className="demo-header">
          <div className="demo-title">
            <Volume2 size={22} color="var(--accent)" />
            <h2>EchoText Demo</h2>
          </div>
          <div className="demo-controls-top">
            <div className="speed-control">
              <label>Speed</label>
              {[0.5, 1, 1.5].map(s => (
                <button key={s} className={`speed-btn ${speed === s ? 'active' : ''}`} onClick={() => setSpeed(s)}>{s}x</button>
              ))}
            </div>
            <button className="btn-icon" onClick={onClose} aria-label="Close demo"><X size={20} /></button>
          </div>
        </div>

        <div className="demo-content">
          <div className="demo-cards" aria-label="Extracted summary cards">
            <AnimatePresence>
              {cards.map(card => (
                <motion.div key={card.id || card.value} className={`demo-card demo-card-${card.type}`} initial={{ opacity: 0, scale: 0.85, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', damping: 20 }}>
                  <span className="demo-card-icon">{card.icon}</span>
                  <div className="demo-card-info">
                    <span className="demo-card-label">{card.label}</span>
                    <span className="demo-card-value">{card.value}</span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="demo-transcripts" aria-live="polite" aria-label="Conversation transcript">
            {transcripts.map((t, i) => (
              <div key={i} className={`demo-transcript ${t.speaker}`}>
                <div className="demo-transcript-speaker">
                  <span className={`demo-dot ${t.speaker}`} />
                  <span>{t.speaker === 'agent' ? 'Agent' : 'Customer'}</span>
                </div>
                <p>{t.text}</p>
              </div>
            ))}
            {displayedText && (
              <div className="demo-transcript agent demo-transcript-live">
                <div className="demo-transcript-speaker">
                  <span className="demo-dot agent" />
                  <span>Agent</span>
                </div>
                <p>
                  {displayedText}
                  <span className="typing-cursor" />
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="demo-footer">
          <div className="demo-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${Math.max((currentTurn / DEMO_CONVERSATION.length) * 100, 0)}%` }} />
            </div>
            <span className="progress-text">{currentTurn} / {DEMO_CONVERSATION.length}</span>
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
      </div>
    </motion.div>
  )
}
