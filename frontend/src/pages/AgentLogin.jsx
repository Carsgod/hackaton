import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Shield, ArrowLeft, Lock, User, Eye, EyeOff, Radio } from 'lucide-react'

const getBackendBaseUrl = () => {
  const raw = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'
  if (raw.startsWith('ws://')) return raw.replace(/^ws:\/\//, 'http://')
  if (raw.startsWith('wss://')) return raw.replace(/^wss:\/\//, 'https://')
  return raw
}

export default function AgentLogin({ onBack, onLogin, initialCounterId }) {
  const [counterId, setCounterId] = useState(initialCounterId || '')
  const [pin, setPin] = useState('')
  const [agentName, setAgentName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPin, setShowPin] = useState(false)
  const [waitingCounters, setWaitingCounters] = useState([])

  // Show which counters currently have a customer waiting, so the agent
  // signs in to the same counter the customer joined.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`${getBackendBaseUrl()}/api/sessions/active`)
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        const sessions = (data.sessions || []).filter(s => s.customer_connected)
        setWaitingCounters(sessions.map(s => s.counter_id))
      } catch {
        // offline is fine - the agent can still type a counter id
      }
    }
    load()
    const timer = setInterval(load, 5000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!counterId.trim() || !pin.trim() || !agentName.trim()) {
      setError('Please enter your name, counter ID, and PIN')
      return
    }
    setLoading(true)
    try {
      const baseUrl = getBackendBaseUrl()
      const res = await fetch(`${baseUrl}/api/counter/validate-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counter_id: counterId.trim(), pin: pin.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.detail || 'Invalid counter ID or PIN')
        setLoading(false)
        return
      }
      const data = await res.json().catch(() => ({}))
      // Use the canonical counter id from the server so the agent always
      // joins the same session as the customer.
      onLogin?.({
        counterId: data.counter_id || counterId.trim(),
        agentName: agentName.trim(),
        pin: pin.trim(),
      })
    } catch (err) {
      setError('Unable to verify PIN. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="agent-login-page">
      <div className="agent-login-bg" aria-hidden="true">
        <img className="agent-login-bg-image" src="/call-center-agent-1.jpg" alt="" />
        <div className="agent-login-bg-overlay" />
      </div>

      <motion.div
        className="agent-login-card"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <div className="agent-login-header">
          <motion.div
            className="agent-login-logo"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            <img src="/logo1.jpg" alt="EchoText" className="agent-login-logo-img nav-logo-img" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h1 className="agent-login-title">Agent Sign In</h1>
            <p className="agent-login-subtitle">Enter your counter details to access the live session dashboard.</p>
          </motion.div>
        </div>

        <form onSubmit={handleSubmit} className="agent-login-form">
          <motion.div
            className="agent-form-group"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25 }}
          >
            <label className="agent-label" htmlFor="agent-name">
              <User size={16} />
              Agent Name
            </label>
            <input
              id="agent-name"
              className="agent-input"
              type="text"
              placeholder="e.g. Augustine Nana"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              autoComplete="name"
            />
          </motion.div>

          <motion.div
            className="agent-form-group"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            <label className="agent-label" htmlFor="counter-id">
              <Shield size={16} />
              Counter ID
            </label>
            <input
              id="counter-id"
              className="agent-input"
              type="text"
              placeholder="e.g. counter_1"
              value={counterId}
              onChange={(e) => setCounterId(e.target.value)}
              autoComplete="off"
            />
            {waitingCounters.length > 0 && (
              <div className="agent-waiting-counters">
                <span className="agent-waiting-label">
                  <Radio size={13} /> Customer waiting at:
                </span>
                {waitingCounters.map(c => (
                  <button
                    key={c}
                    type="button"
                    className={'agent-waiting-chip' + (counterId.trim().toLowerCase() === c ? ' active' : '')}
                    onClick={() => setCounterId(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </motion.div>

          <motion.div
            className="agent-form-group"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.35 }}
          >
            <label className="agent-label" htmlFor="counter-pin">
              <Lock size={16} />
              PIN
            </label>
            <div className="agent-input-wrapper">
              <input
                id="counter-pin"
                className="agent-input"
                type={showPin ? 'text' : 'password'}
                placeholder="Enter counter PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                autoComplete="off"
              />
              <button
                type="button"
                className="agent-pin-toggle"
                onClick={() => setShowPin(prev => !prev)}
                aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
              >
                {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </motion.div>

          {error && (
            <motion.p
              className="agent-login-error"
              role="alert"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {error}
            </motion.p>
          )}

          <motion.button
            className="btn btn-primary btn-lg agent-login-submit"
            type="submit"
            disabled={loading}
            style={{ width: '100%' }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            whileHover={{ scale: loading ? 1 : 1.01 }}
            whileTap={{ scale: loading ? 1 : 0.99 }}
          >
            {loading ? (
              <span className="agent-login-spinner" />
            ) : (
              <>
                <Shield size={18} />
                Sign In
              </>
            )}
          </motion.button>
        </form>

        <motion.div
          className="agent-login-footer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <p className="agent-login-hint">Use the counter ID and PIN provided at your service desk.</p>
        </motion.div>
      </motion.div>
    </div>
  )
}
