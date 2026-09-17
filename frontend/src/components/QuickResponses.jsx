import { motion } from 'framer-motion'

export default function QuickResponses({ prompts, onSelect, disabled }) {
  return (
    <div className="quick-responses" role="region" aria-label="Quick response prompts">
      <div className="quick-responses-scroll">
        {prompts.map((prompt, index) => (
          <motion.button
            key={index}
            className="quick-prompt"
            onClick={() => onSelect(prompt)}
            disabled={disabled}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            aria-label={`Quick response: ${prompt}`}
          >
            <span className="prompt-text">{prompt}</span>
          </motion.button>
        ))}
      </div>
    </div>
  )
}
