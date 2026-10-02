import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Activity, AlertTriangle, CheckCircle2, XCircle, Clock, Users } from 'lucide-react'

export default function SupervisorDashboard({ onBack }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedSession, setSelectedSession] = useState(null)

  const loadSessions = async () => {
    setLoading(true)
    setError(null)
    try {
      const baseUrl = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000').replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://')
      const response = await fetch(`${baseUrl}/api/supervisor/sessions`)
      if (!response.ok) throw new Error('Failed to load sessions')
      const data = await response.json()
      setSessions(data.sessions || [])
    } catch (err) {
      setError(err.message || 'Unable to load sessions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSessions()
    const interval = setInterval(loadSessions, 5000)
    return () => clearInterval(interval)
  }, [])

  const riskColor = (risk) => {
    if (risk === 'high') return '#ef4444'
    if (risk === 'medium') return '#f59e0b'
    return '#10b981'
  }

  const statusColor = (status) => {
    if (status === 'resolved') return '#10b981'
    if (status === 'escalated') return '#f59e0b'
    if (status === 'investigating') return '#ef4444'
    return '#6b7280'
  }

  return (
    <div className="supervisor-dashboard">
      <header className="supervisor-header">
        <div>
          <button className="btn-icon" onClick={onBack} aria-label="Back" style={{ marginRight: 12 }}>
            ←
          </button>
          <div style={{ display: 'inline' }}>
            <h1 style={{ display: 'inline', marginRight: 12 }}>Supervisor Dashboard</h1>
            <span style={{ color: 'var(--text-secondary)' }}>Live view of all active sessions across counters</span>
          </div>
        </div>
        <button className="btn btn-primary" onClick={loadSessions} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      {error && (
        <div className="supervisor-error" role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="supervisor-grid">
        {sessions.map((session) => (
          <motion.div
            key={session.session_id}
            className="supervisor-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => setSelectedSession(session)}
          >
            <div className="supervisor-card-header">
              <div>
                <div className="supervisor-session-id">{session.session_id}</div>
                <div className="supervisor-counter">Counter: {session.counter_id}</div>
              </div>
              <span className="supervisor-status-badge" style={{ background: statusColor(session.case_summary?.status) }}>
                {session.case_summary?.status || 'open'}
              </span>
            </div>

            <div className="supervisor-card-body">
              <div className="supervisor-metric">
                <Clock size={14} />
                <span>{session.language?.toUpperCase()}</span>
              </div>
              <div className="supervisor-metric">
                <Users size={14} />
                <span>{session.roles?.join(', ') || 'unknown'}</span>
              </div>
              <div className="supervisor-metric">
                <Activity size={14} />
                <span>{session.transcript_count || 0} turns</span>
              </div>
              {session.case_summary?.fraud_risk && session.case_summary.fraud_risk !== 'low' && (
                <div className="supervisor-metric" style={{ color: riskColor(session.case_summary.fraud_risk) }}>
                  <AlertTriangle size={14} />
                  <span>Risk: {session.case_summary.fraud_risk}</span>
                </div>
              )}
              {session.case_summary?.problem_label && (
                <div className="supervisor-problem">
                  {session.case_summary.problem_label}
                </div>
              )}
            </div>

            <div className="supervisor-card-footer">
              <span className="supervisor-time">
                Started: {new Date(session.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </motion.div>
        ))}

        {!loading && sessions.length === 0 && (
          <div className="supervisor-empty">
            <CheckCircle2 size={32} />
            <p>No active sessions right now.</p>
          </div>
        )}
      </div>

      {selectedSession && (
        <div className="supervisor-modal-overlay" onClick={() => setSelectedSession(null)}>
          <motion.div
            className="supervisor-modal"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="supervisor-modal-header">
              <div>
                <h2>Session {selectedSession.session_id}</h2>
                <p>Counter: {selectedSession.counter_id}</p>
              </div>
              <button className="btn-icon" onClick={() => setSelectedSession(null)} aria-label="Close">
                <XCircle size={20} />
              </button>
            </div>

            <div className="supervisor-modal-body">
              <div className="supervisor-detail-grid">
                <div className="supervisor-detail-item">
                  <span className="supervisor-detail-label">Status</span>
                  <span className="supervisor-detail-value" style={{ color: statusColor(selectedSession.case_summary?.status) }}>
                    {selectedSession.case_summary?.status || 'open'}
                  </span>
                </div>
                <div className="supervisor-detail-item">
                  <span className="supervisor-detail-label">Language</span>
                  <span className="supervisor-detail-value">{selectedSession.language?.toUpperCase()}</span>
                </div>
                <div className="supervisor-detail-item">
                  <span className="supervisor-detail-label">Turns</span>
                  <span className="supervisor-detail-value">{selectedSession.transcript_count || 0}</span>
                </div>
                <div className="supervisor-detail-item">
                  <span className="supervisor-detail-label">Escalations</span>
                  <span className="supervisor-detail-value">{selectedSession.metrics?.escalations || 0}</span>
                </div>
                <div className="supervisor-detail-item">
                  <span className="supervisor-detail-label">Resolutions</span>
                  <span className="supervisor-detail-value">{selectedSession.metrics?.resolutions || 0}</span>
                </div>
                <div className="supervisor-detail-item">
                  <span className="supervisor-detail-label">Fraud Risk</span>
                  <span className="supervisor-detail-value" style={{ color: riskColor(selectedSession.case_summary?.fraud_risk) }}>
                    {selectedSession.case_summary?.fraud_risk || 'low'}
                  </span>
                </div>
              </div>

              {selectedSession.case_summary?.fraud_indicators?.length > 0 && (
                <div className="supervisor-fraud-alert">
                  <AlertTriangle size={16} />
                  <div>
                    <strong>Fraud Signals</strong>
                    <ul>
                      {selectedSession.case_summary.fraud_indicators.slice(0, 5).map((indicator, idx) => (
                        <li key={idx}>{indicator}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {selectedSession.case_summary?.recommended_actions?.length > 0 && (
                <div className="supervisor-actions">
                  <strong>Recommended Actions</strong>
                  <ul>
                    {selectedSession.case_summary.recommended_actions.slice(0, 5).map((action, idx) => (
                      <li key={idx}>{action}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="supervisor-modal-actions">
              <button className="btn btn-secondary" onClick={() => setSelectedSession(null)}>Close</button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
