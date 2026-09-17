import { motion, AnimatePresence } from 'framer-motion'

const STYLES = {
  amount:     { borderColor: 'var(--accent)',       bg: 'var(--accent-light)', icon: '💳', label: 'Amount' },
  reference:  { borderColor: 'var(--green-400)',    bg: 'rgba(77,195,132,0.12)', icon: '🔢', label: 'Reference' },
  phone:      { borderColor: 'var(--green-700)',    bg: 'rgba(0,122,61,0.08)',   icon: '📱', label: 'Phone' },
  action:     { borderColor: 'var(--green-800)',    bg: 'rgba(0,77,38,0.08)',    icon: '✅', label: 'Action' },
}

export default function PinnedCards({ cards }) {
  if (!cards || cards.length === 0) return null

  return (
    <div className="pinned-cards-container" role="region" aria-label="Pinned summary cards">
      <div className="pinned-cards-scroll">
        <AnimatePresence>
          {cards.map((card, index) => {
            const style = STYLES[card.type] || STYLES.reference
            return (
              <motion.div
                key={card.id || card.value}
                className="pinned-card"
                style={{ borderColor: style.borderColor, background: style.bg }}
                initial={{ opacity: 0, scale: 0.85, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: index * 0.08, type: 'spring', damping: 20 }}
              >
                <div className="pinned-card-icon">{card.icon}</div>
                <div className="pinned-card-content">
                  <span className="pinned-card-label">{card.label}</span>
                  <span className="pinned-card-value">{card.value}</span>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
