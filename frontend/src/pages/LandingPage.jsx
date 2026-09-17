import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Camera, Scan, Smartphone, MessageSquare, Volume2, Accessibility, Globe, Zap, Shield, Users, ArrowRight, Play, Monitor, CheckCircle2, Phone, Menu, X } from 'lucide-react'
import { useAccessibility } from '../hooks/useAccessibility'
import AccessibilityControls from '../components/AccessibilityControls'

export default function LandingPage({ onJoinSession, onStartDemo, onOpenAgent }) {
  const [sessionId, setSessionId] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [showUSSD, setShowUSSD] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showIntro, setShowIntro] = useState(true)
  const [showAccessibility, setShowAccessibility] = useState(false)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!showIntro) return
    const t = setTimeout(() => setShowIntro(false), 6000)
    return () => clearTimeout(t)
  }, [showIntro])

  const features = [
    { icon: Volume2, title: 'Live Transcription', desc: 'Agent speech converted to clear text in under 1.5 seconds', color: 'var(--accent)' },
    { icon: MessageSquare, title: 'Quick Responses', desc: 'Type or tap preset prompts to communicate instantly', color: 'var(--accent-dark)' },
    { icon: Zap, title: 'Pinned Summary Cards', desc: 'Key details like amounts and references highlighted visually', color: 'var(--green-600)' },
    { icon: Globe, title: 'Multi-Language', desc: 'English and Twi now, Ga and Ewe coming soon', color: 'var(--green-700)' },
    { icon: Smartphone, title: 'No App Needed', desc: 'Works in any smartphone browser — no download required', color: 'var(--green-800)' },
    { icon: Shield, title: 'Privacy First', desc: 'Encrypted minimal storage with informed consent', color: 'var(--green-900)' },
  ]

  const handleScanQR = async () => {
    setIsScanning(true)
    setScanResult(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      const detectInterval = setInterval(() => {
        if (!videoRef.current || !canvas) return
        canvas.width = videoRef.current.videoWidth || 640
        canvas.height = videoRef.current.videoHeight || 480
        ctx?.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)
      }, 500)
      setTimeout(() => {
        clearInterval(detectInterval)
        videoRef.current?.srcObject?.getTracks().forEach(t => t.stop())
        const mockSessionId = `MTN_${Math.random().toString(36).substr(2, 6).toUpperCase()}`
        setScanResult(mockSessionId)
        setIsScanning(false)
      }, 3000)
    } catch (err) {
      console.error('Camera error:', err)
      const mockSessionId = `MTN_${Math.random().toString(36).substr(2, 6).toUpperCase()}`
      setScanResult(mockSessionId)
      setIsScanning(false)
    }
  }

  const handleJoin = () => {
    const id = sessionId.trim() || scanResult
    if (id) onJoinSession(id)
  }

  return (
    <div className="landing-page">
      <nav className="navbar" role="navigation" aria-label="Main">
        <div className="nav-content">
          <a className="nav-brand" href="#" onClick={(e) => { e.preventDefault(); onStartDemo?.() }}>
            <Volume2 size={26} color="var(--accent)" />
            <span className="nav-logo">
              Echo<span className="nav-logo-accent">Text</span>
            </span>
            <span className="nav-badge">GH</span>
          </a>
          <button className="nav-hamburger" onClick={() => setMobileOpen(prev => !prev)} aria-label="Toggle menu">
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <div className={'nav-links' + (mobileOpen ? ' nav-links-open' : '')}>
            <a className="nav-link" href="#features" onClick={() => setMobileOpen(false)}>Features</a>
            <a className="nav-link" href="#how-it-works" onClick={() => setMobileOpen(false)}>How It Works</a>
            <button className="btn btn-primary nav-cta" onClick={() => { onStartDemo?.(); setMobileOpen(false) }}>
              <Play size={16} /> Try Demo
            </button>
            <button className="btn btn-secondary nav-cta" onClick={() => { onOpenAgent?.('MTN_COUNTER_01'); setMobileOpen(false) }}>
              Agent Dashboard
            </button>
            <button className="btn-icon nav-accessibility-btn" onClick={() => setShowAccessibility(true)} aria-label="Accessibility settings">
              <Accessibility size={20} />
            </button>
          </div>
        </div>
      </nav>

      {showIntro && (
        <motion.div
          className="intro-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setShowIntro(false)}
        >
          <motion.div
            className="intro-panel"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="intro-badge">Before → After</div>
            <h2 className="intro-title">Deaf accessibility, finally native to the service desk</h2>
            <div className="intro-compare">
              <div className="intro-col intro-before">
                <div className="intro-col-title">Before</div>
                <p>Customer misses live agent updates, depends on gestures or an interpreter, and leaves uncertain.</p>
              </div>
              <div className="intro-divider" />
              <div className="intro-col intro-after">
                <div className="intro-col-title">After</div>
                <p>Real-time captions, pinned key details, and an instant SMS confirmation—resolved independently.</p>
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowIntro(false)}>
              See it in action <ArrowRight size={16} />
            </button>
          </motion.div>
        </motion.div>
      )}

      <section className="hero">
        <div className="hero-bg">
          <div className="hero-orb hero-orb-1" />
          <div className="hero-orb hero-orb-2" />
        </div>
        <motion.div
          className="hero-content"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        >
          <div className="hero-badge">
            <Zap size={14} />
            <span>Live Accessibility Demo</span>
          </div>
          <h1 className="hero-title">
            <span className="hero-title-accent">EchoText Ghana</span>
            <br />
            <span className="hero-subtitle">Turning Spoken Support into Accessible Text</span>
          </h1>
          <p className="hero-description">
            Empowering Deaf telecommunications customers with real-time speech-to-text.
            No app download. No interpreter needed. Scan, read, and resolve your issue independently.
          </p>
          <div className="hero-actions">
            <button className="btn btn-primary btn-lg" onClick={handleScanQR}>
              <Camera size={20} />
              Scan QR Code
            </button>
            <button className="btn btn-secondary btn-lg" onClick={onStartDemo}>
              <Play size={20} />
              Watch Demo
            </button>
          </div>
          <div className="hero-stats">
            <div className="stat">
              <span className="stat-number">&lt;1.5s</span>
              <span className="stat-label">Latency</span>
            </div>
            <div className="stat-divider" />
            <div className="stat">
              <span className="stat-number">2+</span>
              <span className="stat-label">Languages</span>
            </div>
            <div className="stat-divider" />
            <div className="stat">
              <span className="stat-number">5 min</span>
              <span className="stat-label">Avg. Task Time</span>
            </div>
          </div>
        </motion.div>
      </section>

      {isScanning && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => { setIsScanning(false); setScanResult(null) }}
        >
          <motion.div
            className="modal-content scanner-modal"
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="scanner-header">
              <Scan size={22} color="var(--accent)" />
              <div>
                <h3>Scan Counter QR Code</h3>
                <p className="scanner-hint">Point your camera at the QR code on the service desk</p>
              </div>
            </div>
            <div className="scanner-viewport">
              <video ref={videoRef} autoPlay playsInline muted className="scanner-video" />
              <canvas ref={canvasRef} className="scanner-canvas" style={{ display: 'none' }} />
              <div className="scanner-overlay">
                <div className="scanner-frame" />
              </div>
              {scanResult && (
                <div className="scanner-success">
                  <CheckCircle2 size={44} color="var(--accent)" />
                  <p>Session Found: <strong>{scanResult}</strong></p>
                  <button className="btn btn-primary btn-sm" onClick={handleJoin}>
                    Join Session <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </div>
            {!scanResult && (
              <button className="btn btn-secondary btn-sm" style={{ width: '100%', marginTop: 14 }} onClick={() => { setIsScanning(false); setScanResult(null) }}>
                Cancel
              </button>
            )}
          </motion.div>
        </motion.div>
      )}

      <section id="features" className="features-section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">Built for Accessibility</h2>
            <p className="section-subtitle">Every feature designed with Deaf users at the center — clear text, high contrast, and full control.</p>
          </div>
          <div className="features-grid">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                className="feature-card"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
              >
                <div className="feature-icon" style={{ background: feature.color + '18', color: feature.color }}>
                  <feature.icon size={26} />
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="how-section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">How It Works</h2>
            <p className="section-subtitle">From scan to resolution in under five minutes — no interpreter needed.</p>
          </div>
          <div className="steps-grid">
            {[
              { num: '1', title: 'Scan QR', desc: 'Point your phone camera at the QR code on the service desk', icon: Camera },
              { num: '2', title: 'Read Live', desc: "Watch the agent's speech appear as large, clear text on your screen", icon: Monitor },
              { num: '3', title: 'Review Cards', desc: 'See key details — amounts, references, actions — pinned at the top', icon: CheckCircle2 },
              { num: '4', title: 'Confirm & Go', desc: 'Approve with a tap, get SMS confirmation, leave independently', icon: Phone },
            ].map((step, i) => (
              <motion.div
                key={step.num}
                className="step-card"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <div className="step-number">{step.num}</div>
                <div className="step-icon"><step.icon size={30} color="var(--accent)" /></div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="join-section">
        <div className="container">
          <div className="join-card">
            <h2>Join a Live Session</h2>
            <p>Enter a session ID or scan the QR code at the counter</p>
            <div className="join-form">
              <input
                type="text"
                placeholder="Enter Session ID (e.g., MTN_ABC123)"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                className="join-input"
                aria-label="Session ID"
              />
              <button className="btn btn-primary" onClick={handleJoin} disabled={!sessionId.trim() && !scanResult}>
                Join <ArrowRight size={16} />
              </button>
            </div>
            <div className="join-divider"><span>or</span></div>
            <button className="btn btn-secondary" style={{ width: '100%' }} onClick={handleScanQR}>
              <Scan size={18} /> Scan QR Code
            </button>

            <div className="ussd-section">
              <button className="ussd-toggle" onClick={() => setShowUSSD(!showUSSD)}>
                <Phone size={18} color="var(--accent)" />
                <span>Feature Phone? Use USSD: *920*88#</span>
                <ArrowRight size={16} className={`ussd-arrow ${showUSSD ? 'open' : ''}`} />
              </button>
              {showUSSD && (
                <motion.div
                  className="ussd-panel"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                >
                  Dial <strong>*920*88#</strong> on any MTN phone to report issues via USSD. Receive SMS updates with your case number and resolution status.
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-content">
          <div className="footer-brand">
            <Volume2 size={22} color="var(--accent)" />
            <span>EchoText Ghana</span>
          </div>
          <p className="footer-tagline">Turning Spoken Support into Accessible Text</p>
          <p className="footer-copy">© 2026 EchoText Ghana. Built for Deaf accessibility.</p>
          <button className="btn-icon footer-accessibility-btn" onClick={() => setShowAccessibility(true)} aria-label="Accessibility settings">
            <Accessibility size={20} />
            <span>Accessibility</span>
          </button>
        </div>
      </footer>

      {showAccessibility && (
        <motion.div
          className="controls-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setShowAccessibility(false)}
        >
          <motion.div
            className="controls-panel"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }}
            onClick={(e) => e.stopPropagation()}
          >
            <AccessibilityControls onClose={() => setShowAccessibility(false)} />
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}
