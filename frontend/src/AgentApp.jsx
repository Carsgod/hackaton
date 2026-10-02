import { useState, useEffect } from 'react'
import AgentLogin from './pages/AgentLogin'
import AgentDashboard from './pages/AgentDashboard'
import ErrorBoundary from './components/ErrorBoundary'

function AgentApp() {
  const [view, setView] = useState('login')
  const [sessionId, setSessionId] = useState(null)
  const [renderError, setRenderError] = useState(null)
  const [agentLoginState, setAgentLoginState] = useState(null)

  const normalizeSessionId = (id) => String(id || '').trim().toLowerCase()

  const handleAgentLogin = (state) => {
    setAgentLoginState(state)
    const finalSessionId = normalizeSessionId(state.counterId || 'counter_1')
    setSessionId(finalSessionId)
    setView('dashboard')
  }

  const handleBackToLogin = () => {
    setView('login')
    setSessionId(null)
    setAgentLoginState(null)
    setRenderError(null)
  }

  if (renderError) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        padding: '24px',
        textAlign: 'center',
      }}>
        <p style={{ fontSize: '18px', fontWeight: 700 }}>Something went wrong</p>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '420px', wordBreak: 'break-word' }}>{renderError?.message || 'Unknown error'}</p>
        <button className="btn btn-primary" onClick={handleBackToLogin}>Back to Sign In</button>
      </div>
    )
  }

  if (view === 'dashboard' && sessionId) {
    return (
      <ErrorBoundary onError={(err) => setRenderError(err instanceof Error ? err : new Error(String(err)))}>
        {() => <AgentDashboard sessionId={sessionId} demoMode={false} onBack={handleBackToLogin} agentLogin={agentLoginState} />}
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary onError={(err) => setRenderError(err instanceof Error ? err : new Error(String(err)))}>
      {() => <AgentLogin onBack={handleBackToLogin} onLogin={handleAgentLogin} />}
    </ErrorBoundary>
  )
}

export default AgentApp
