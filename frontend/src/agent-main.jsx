import React from 'react'
import ReactDOM from 'react-dom/client'
import AgentApp from './AgentApp.jsx'
import { AccessibilityProvider } from './hooks/useAccessibility.jsx'
import './styles/global.css'
import './styles/components.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AccessibilityProvider>
      <AgentApp />
    </AccessibilityProvider>
  </React.StrictMode>,
)
