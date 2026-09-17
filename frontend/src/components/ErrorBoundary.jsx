import { Component } from 'react'

const ErrorBoundary = class extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    this.props.onError(error)
  }

  render() {
    if (this.state.error) {
      return this.props.fallback || (
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
          <p style={{ color: 'var(--text-secondary)', maxWidth: '420px', wordBreak: 'break-word' }}>{this.state.error?.message || 'Unknown error'}</p>
        </div>
      )
    }

    return this.props.children({ onError: (err) => this.props.onError(err) })
  }
}

export default ErrorBoundary
