import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useLocalStorage } from './useLocalStorage'

const AccessibilityContext = createContext()

export function AccessibilityProvider({ children }) {
  const [theme, setTheme] = useLocalStorage('echotext-theme', 'dark')
  const [fontSize, setFontSize] = useLocalStorage('echotext-fontsize', 'medium')
  const [highContrast, setHighContrast] = useLocalStorage('echotext-highcontrast', false)
  const [reducedMotion, setReducedMotion] = useLocalStorage('echotext-reducedmotion', false)
  const [screenReaderEnabled, setScreenReaderEnabled] = useLocalStorage('echotext-sr', true)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.setAttribute('data-high-contrast', highContrast ? 'true' : 'false')
  }, [theme, highContrast])

  useEffect(() => {
    document.documentElement.setAttribute('data-reduced-motion', reducedMotion ? 'true' : 'false')
  }, [reducedMotion])

  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (motionQuery.matches && !reducedMotion) {
      setReducedMotion(true)
    }
    const handler = (e) => {
      if (e.matches && !reducedMotion) {
        setReducedMotion(true)
      }
    }
    motionQuery.addEventListener('change', handler)
    return () => motionQuery.removeEventListener('change', handler)
  }, [reducedMotion, setReducedMotion])

  const fontSizes = { small: '14px', medium: '18px', large: '24px', xlarge: '32px' }
  const currentFontSize = fontSizes[fontSize] || '18px'

  const increaseFontSize = useCallback(() => {
    const sizes = Object.keys(fontSizes)
    const currentIndex = sizes.indexOf(fontSize)
    if (currentIndex < sizes.length - 1) {
      setFontSize(sizes[currentIndex + 1])
    }
  }, [fontSize, setFontSize])

  const decreaseFontSize = useCallback(() => {
    const sizes = Object.keys(fontSizes)
    const currentIndex = sizes.indexOf(fontSize)
    if (currentIndex > 0) {
      setFontSize(sizes[currentIndex - 1])
    }
  }, [fontSize, setFontSize])

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }, [setTheme])

  const toggleHighContrast = useCallback(() => {
    setHighContrast(prev => !prev)
  }, [setHighContrast])

  const value = {
    theme, setTheme, toggleTheme,
    fontSize, setFontSize, increaseFontSize, decreaseFontSize, currentFontSize,
    highContrast, setHighContrast, toggleHighContrast,
    reducedMotion, setReducedMotion,
    screenReaderEnabled, setScreenReaderEnabled,
  }

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  )
}

export function useAccessibility() {
  const context = useContext(AccessibilityContext)
  if (!context) {
    throw new Error('useAccessibility must be used within AccessibilityProvider')
  }
  return context
}
