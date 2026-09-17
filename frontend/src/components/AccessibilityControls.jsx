import { useAccessibility } from '../hooks/useAccessibility'
import { Sun, Moon, Type, Eye, X, ZoomIn, ZoomOut, Monitor, Accessibility as A11yIcon } from 'lucide-react'

export default function AccessibilityControls({ onClose }) {
  const {
    theme, toggleTheme,
    fontSize, increaseFontSize, decreaseFontSize, currentFontSize,
    highContrast, toggleHighContrast,
    reducedMotion, setReducedMotion,
    screenReaderEnabled, setScreenReaderEnabled,
  } = useAccessibility()

  return (
    <div className="accessibility-controls">
      <div className="controls-header">
        <h3><A11yIcon size={18} color="var(--accent)" /> Accessibility</h3>
        <button className="btn-icon" onClick={onClose} aria-label="Close controls"><X size={20} /></button>
      </div>

      <div className="controls-section">
        <h4>Display</h4>
        <div className="control-row">
          <button className="control-btn" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
          <button className={`control-btn ${highContrast ? 'active' : ''}`} onClick={toggleHighContrast}>
            <Eye size={18} />
            <span>High Contrast</span>
          </button>
        </div>
      </div>

      <div className="controls-section">
        <h4>Text Size</h4>
        <div className="font-size-control">
          <button className="btn-icon control-btn" onClick={decreaseFontSize} disabled={fontSize === 'small'} aria-label="Decrease font size"><ZoomOut size={18} /></button>
          <span className="font-size-label">{fontSize.toUpperCase()} ({currentFontSize})</span>
          <button className="btn-icon control-btn" onClick={increaseFontSize} disabled={fontSize === 'xlarge'} aria-label="Increase font size"><ZoomIn size={18} /></button>
        </div>
      </div>

      <div className="controls-section">
        <h4>Motion</h4>
        <div className="control-row">
          <button className={`control-btn ${reducedMotion ? 'active' : ''}`} onClick={() => setReducedMotion(!reducedMotion)}>
            <Monitor size={18} />
            <span>{reducedMotion ? 'Motion Reduced' : 'Motion Full'}</span>
          </button>
        </div>
      </div>

      <div className="controls-section">
        <h4>Screen Reader</h4>
        <div className="control-row">
          <button className={`control-btn ${screenReaderEnabled ? 'active' : ''}`} onClick={() => setScreenReaderEnabled(!screenReaderEnabled)}>
            <A11yIcon size={18} />
            <span>{screenReaderEnabled ? 'Enabled' : 'Disabled'}</span>
          </button>
        </div>
      </div>

      <div className="controls-footer">
        <p>All text is screen-reader compatible. Use arrow keys to navigate.</p>
      </div>
    </div>
  )
}
