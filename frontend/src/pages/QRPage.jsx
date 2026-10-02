import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Printer, RefreshCw } from 'lucide-react'

const COUNTERS = [
  { id: 'counter_1', label: 'Counter 1', pin: '1234' },
  { id: 'counter_2', label: 'Counter 2', pin: '5678' },
  { id: 'counter_3', label: 'Counter 3', pin: '9012' },
]

export default function QRPage({ onBack }) {
  const [qrCodes, setQrCodes] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchQRCodes = async () => {
      setLoading(true)
      setError('')
      try {
        const results = await Promise.all(
          COUNTERS.map(async (counter) => {
            const res = await fetch(`/api/qr-base64/${counter.id}?size=12`)
            if (!res.ok) throw new Error('Failed to load QR')
            const data = await res.json()
            return { ...counter, qr: data.qr_code, url: data.url }
          })
        )
        const map = {}
        results.forEach((item) => {
          map[item.id] = item
        })
        setQrCodes(map)
      } catch (err) {
        setError('Unable to load QR codes. Please try again.')
      } finally {
        setLoading(false)
      }
    }
    fetchQRCodes()
  }, [])

  const handlePrint = () => {
    window.print()
  }

  const openJoinLink = (url) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '')
    window.history.pushState({}, '', path)
    onBack?.()
  }

  return (
    <div className="qr-page">
      <div className="qr-page-header">
        <button className="btn-icon" onClick={onBack} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="app-title">Counter QR Codes</h1>
          <p className="session-meta">Scan to join a live session</p>
        </div>
        <button className="btn-icon" onClick={handlePrint} aria-label="Print QR codes">
          <Printer size={20} />
        </button>
      </div>

      {error && (
        <div className="transcription-error-banner" role="alert">
          <span>{error}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => window.location.reload()}>
            <RefreshCw size={16} />
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="agent-loading">
          <div className="agent-loading-spinner" />
          <div style={{ marginTop: 12, color: '#374151', fontWeight: 700 }}>Loading QR codes...</div>
        </div>
      ) : (
        <div className="qr-grid">
          {COUNTERS.map((counter) => {
            const data = qrCodes[counter.id]
            return (
              <motion.div
                key={counter.id}
                className="qr-card"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="qr-card-header">
                  <h2>{counter.label}</h2>
                  <span className="agent-badge-lang">PIN: {counter.pin}</span>
                </div>
                <div className="qr-code-wrap">
                  {data?.qr ? (
                    <img src={data.qr} alt={`QR code for ${counter.label}`} className="qr-image" />
                  ) : (
                    <div className="qr-fallback">QR unavailable</div>
                  )}
                </div>
                <p className="qr-url">{data?.url || ''}</p>
                <p className="qr-hint">Customer scans this to join {counter.label}</p>
                <button className="btn btn-secondary btn-sm" style={{ width: '100%', marginTop: 8 }} onClick={() => openJoinLink(data?.url || `/${counter.id}`)}>
                  Open Join Link
                </button>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
