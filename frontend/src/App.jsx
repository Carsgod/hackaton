import { useState } from 'react'
import LandingPage from './pages/LandingPage'
import TranscriptionPage from './pages/TranscriptionPage'
import DemoPage from './pages/DemoPage'
import AgentDashboard from './pages/AgentDashboard'
import CompletionScreen from './pages/CompletionScreen'
import ErrorBoundary from './components/ErrorBoundary'

function App() {
  const [view, setView] = useState('landing')
  const [sessionId, setSessionId] = useState(null)
  const [demoMode, setDemoMode] = useState(false)
  const [renderError, setRenderError] = useState(null)
  const [completion, setCompletion] = useState(null)

  const handleJoinSession = (id) => {
    setSessionId(id)
    setDemoMode(false)
    setView('transcription')
    setRenderError(null)
  }

  const handleStartDemo = () => {
    setSessionId(`demo_${Date.now()}`)
    setDemoMode(true)
    setView('demo')
    setRenderError(null)
    setCompletion(null)
  }

  const handleBack = () => {
    setView('landing')
    setSessionId(null)
    setDemoMode(false)
    setRenderError(null)
    setCompletion(null)
  }

  const handleOpenAgent = (id) => {
    setSessionId(id || `agent_${Date.now()}`)
    setView('agent')
    setRenderError(null)
  }

  const handleComplete = (data) => {
    setCompletion(data)
    setView('completion')
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
        <button className="btn btn-primary" onClick={handleBack}>Back to Home</button>
      </div>
    )
  }

  if (view === 'demo') {
    return (
      <ErrorBoundary onError={(err) => setRenderError(err instanceof Error ? err : new Error(String(err)))}>
        {() => (
          <DemoPage
            onBack={handleBack}
            onComplete={() => handleComplete({ caseNumber: 'CASE45678', status: 'Refund Approved' })}
          />
        )}
      </ErrorBoundary>
    )
  }

  if (view === 'completion') {
    return (
      <CompletionScreen
        caseNumber={completion?.caseNumber}
        status={completion?.status}
        onBack={handleBack}
      />
    )
  }

  if (view === 'agent' && sessionId) {
    return (
      <ErrorBoundary onError={(err) => setRenderError(err instanceof Error ? err : new Error(String(err)))}>
        {() => <AgentDashboard sessionId={sessionId} onBack={handleBack} />}
      </ErrorBoundary>
    )
  }

  if (view === 'transcription' && sessionId) {
    return <TranscriptionPage sessionId={sessionId} demoMode={demoMode} onBack={handleBack} onComplete={() => handleComplete({ caseNumber: 'CASE45678', status: 'Refund Approved' })} />
  }

  return <LandingPage onJoinSession={handleJoinSession} onStartDemo={handleStartDemo} onOpenAgent={handleOpenAgent} />
}

export default App
