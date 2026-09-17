import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AccessibilityProvider } from './hooks/useAccessibility.jsx'
import './styles/global.css'
import './styles/components.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AccessibilityProvider>
      <App />
    </AccessibilityProvider>
  </React.StrictMode>,
)
