import { CheckCircle2, ArrowLeft, MessageSquare } from 'lucide-react'

export default function CompletionScreen({ caseNumber, status, onBack }) {
  return (
    <div className="completion-screen">
      <div className="completion-card">
        <div className="completion-icon">
          <CheckCircle2 size={28} />
        </div>
        <h2>Support Complete</h2>
        <p>The agent has updated your case. You can safely leave the counter.</p>

        <div className="completion-meta">
          <div className="completion-meta-row">
            <span className="completion-meta-label">Case</span>
            <span className="completion-meta-value">{caseNumber || '—'}</span>
          </div>
          <div className="completion-meta-row">
            <span className="completion-meta-label">Status</span>
            <span className="completion-meta-value">{status || 'Refund Approved'}</span>
          </div>
          <div className="completion-meta-row">
            <span className="completion-meta-label">SMS</span>
            <span className="completion-meta-value">Confirmation sent</span>
          </div>
        </div>

        <div className="completion-progress">
          <span className="completion-progress-dot" />
          <span className="completion-progress-text">Resolution completed successfully</span>
        </div>

        <div className="completion-actions">
          <button className="btn btn-primary" onClick={onBack}>
            <ArrowLeft size={16} /> Back to Home
          </button>
          <button className="btn btn-secondary" onClick={() => window.print?.()}>
            <MessageSquare size={16} /> Save / Share
          </button>
        </div>
      </div>
    </div>
  )
}
