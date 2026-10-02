import { motion, AnimatePresence } from 'framer-motion'

const STYLES = {
  amount:     { borderColor: 'var(--accent)',       bg: 'var(--accent-light)', icon: '💳', label: 'Amount' },
  reference:  { borderColor: 'var(--green-400)',    bg: 'rgba(77,195,132,0.12)', icon: '🔢', label: 'Reference' },
  phone:      { borderColor: 'var(--green-700)',    bg: 'rgba(0,122,61,0.08)',   icon: '📱', label: 'Phone' },
  action:     { borderColor: 'var(--green-800)',    bg: 'rgba(0,77,38,0.08)',    icon: '✅', label: 'Action' },
  case_number:{ borderColor: 'var(--orange-400)',   bg: 'rgba(251,191,36,0.12)', icon: '🎫', label: 'Case' },
  name:       { borderColor: 'var(--purple-400)',   bg: 'rgba(168,85,247,0.10)', icon: '👤', label: 'Name' },
  national_id:{ borderColor: 'var(--red-400)',      bg: 'rgba(239,68,68,0.10)',  icon: '🪪', label: 'ID' },
  problem:    { borderColor: '#f59e0b',             bg: 'rgba(245,158,11,0.10)', icon: '🧩', label: 'Problem' },
  urgency:    { borderColor: '#ef4444',             bg: 'rgba(239,68,68,0.10)',  icon: '🚨', label: 'Urgency' },
  stage:      { borderColor: '#3b82f6',             bg: 'rgba(59,130,246,0.10)', icon: '🧭', label: 'Stage' },
  next_step:  { borderColor: '#10b981',             bg: 'rgba(16,185,129,0.10)', icon: '👉', label: 'Next' },
}

function ConfidenceBar({ confidence }) {
  if (confidence == null) return null
  const pct = Math.round(confidence * 100)
  const color = pct >= 90 ? 'var(--green-400)' : pct >= 75 ? 'var(--accent)' : 'var(--orange-400)'
  return (
    <div className="pin-confidence" aria-label={`Confidence ${pct}%`}>
      <div className="pin-confidence-track">
        <div className="pin-confidence-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="pin-confidence-label">{pct}%</span>
    </div>
  )
}

function ContextSnippet({ context }) {
  if (!context) return null
  return <span className="pin-context" title={context}>{context}</span>
}

export default function PinnedCards({ cards }) {
  if (!cards || cards.length === 0) return null

  return (
    <div className="pinned-cards-container" role="region" aria-label="Pinned summary cards">
      <div className="pinned-cards-scroll">
        <AnimatePresence initial={false}>
          {cards.map((card, index) => {
            const style = STYLES[card.type] || STYLES.reference
            const isNew = index >= (cards.length - 1)
            return (
              <motion.div
                key={card.id || card.value}
                className={`pinned-card ${isNew ? 'pinned-card-new' : ''}`}
                style={{ borderColor: style.borderColor, background: style.bg }}
                data-card-type={card.type}
                initial={isNew ? { opacity: 0, scale: 0.85, y: -8 } : false}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={isNew ? { delay: 0.05, type: 'spring', damping: 20 } : { type: 'spring', damping: 22 }}
                layout
              >
                <div className="pinned-card-icon" aria-hidden="true">{card.icon}</div>
                <div className="pinned-card-content">
                  <div className="pinned-card-header">
                    <span className="pinned-card-label">{card.label}</span>
                  </div>
                  <span className="pinned-card-value">{card.value}</span>
                  <ConfidenceBar confidence={card.confidence} />
                  <ContextSnippet context={card.context} />
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
