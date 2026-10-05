import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  User, Users, CheckCircle2, AlertTriangle,
  ArrowLeft, Search, Settings, HelpCircle, MessageSquare, Smartphone, Send, RotateCcw, Mic, X,
  Activity, PanelLeftClose, Menu, Copy, Clock, Loader2, XCircle, Info,
} from 'lucide-react'
import { useWebSocket } from '../hooks/useWebSocket'
import { useAccessibility } from '../hooks/useAccessibility'
import { extractCards, DEMO_TREE_EN, DEMO_TREE_TWI } from '../data/conversationTree'

const AUTO_CUSTOMER_RESPONSES = [
  'I sent money to my sister',
  'I have an account issue',
  'I need help with a transaction',
  '0595759917',
  'I don\'t have the number right now',
  'What should I do?',
  'Will the money come back?',
  'Yes, please reverse it',
  'I want a refund',
  'Thank you',
  'Thank you so much',
  'My balance is incorrect',
  'I can\'t access my account',
  'There is an unauthorized charge',
  'A MoMo transfer',
  'A bank deposit',
  'A bill payment',
]

export default function AgentDashboard({ sessionId, demoMode, onBack, agentLogin }) {
  const [language, setLanguage] = useState('en')
  const [transcripts, setTranscripts] = useState([])
  const [cards, setCards] = useState([])
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [smsSent, setSmsSent] = useState(false)
  const [caseNumber, setCaseNumber] = useState('')
  const [agentInput, setAgentInput] = useState('')
  const [networkStatus, setNetworkStatus] = useState('online')
  const [ready, setReady] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [asrStatus, setAsrStatus] = useState('idle')
  const [customerLanguage, setCustomerLanguage] = useState('en')
  const [activeTab, setActiveTab] = useState('transcript')
  const [dualLanguage, setDualLanguage] = useState(false)
  const [speakingId, setSpeakingId] = useState(null)
  const [showSignIn, setShowSignIn] = useState(false)
  const [agentName, setAgentName] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [agentId, setAgentId] = useState('')
  const [agentRole] = useState('Counter Support')
  const [signInName, setSignInName] = useState('')
  const [signInId, setSignInId] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [agentPin, setAgentPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [isPinSubmitting, setIsPinSubmitting] = useState(false)
  const [asrError, setAsrError] = useState('')
  const [pendingVoiceMessage, setPendingVoiceMessage] = useState('')
  const [lastRecordingUrl, setLastRecordingUrl] = useState('')
  const [restoringConversation, setRestoringConversation] = useState(false)
  const [caseSummary, setCaseSummary] = useState({})
  const [offlineQueue, setOfflineQueue] = useState([])
  const [showCustomerTyping, setShowCustomerTyping] = useState(false)
  const [metrics, setMetrics] = useState({})
  const [showMetrics, setShowMetrics] = useState(false)
  const [agentSuggestions, setAgentSuggestions] = useState([])
  const transcriptsContainerRef = useRef(null)
  const localTranscriptRef = useRef('')
  const isNearBottomRef = useRef(true)
  const speechRecognitionRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioPreviewRef = useRef(null)
  const { currentFontSize } = useAccessibility()
  const getBackendBaseUrl = () => {
    const raw = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'
    if (raw.startsWith('ws://') || raw.startsWith('wss://')) return raw
    if (raw.startsWith('https://')) return raw.replace(/^https:\/\//, 'wss://')
    return raw.replace(/^http:\/\//, 'ws://')
  }
  const getHttpBaseUrl = () => {
    const raw = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'
    if (raw.startsWith('ws://')) return raw.replace(/^ws:\/\//, 'http://')
    if (raw.startsWith('wss://')) return raw.replace(/^wss:\/\//, 'https://')
    return raw
  }
  const safeSessionId = encodeURIComponent(sessionId || '')
  const wsUrl = `${getBackendBaseUrl()}/ws/${safeSessionId}?language=${language}&role=agent&pin=${encodeURIComponent(agentPin)}`

  useEffect(() => {
    if (!agentLogin) return
    setAgentName(agentLogin.agentName || '')
    setAgentId(agentLogin.counterId || '')
    setAgentPin(agentLogin.pin || '')
  }, [agentLogin])

  const checkNearBottom = useCallback(() => {
    const el = transcriptsContainerRef.current
    if (!el) return true
    const threshold = 80
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  }, [])

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    const el = transcriptsContainerRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  const handleTabClick = useCallback((tab) => {
    setActiveTab(prev => prev === tab ? 'transcript' : tab)
  }, [])

  const addAgentMessage = (text, pending = false) => {
    setTranscripts(prev => [...prev, { speaker: 'agent', text, timestamp: Date.now(), pending }])
    if (!pending) {
      const nextCards = extractCards(text)
      setCards(prev => {
        const merged = [...prev]
        nextCards.forEach(card => { if (!merged.find(c => c.value === card.value)) merged.push(card) })
        return merged
      })
    }
  }

  const getTranslation = (nodeId, speaker) => {
    if (!dualLanguage) return null
    const otherLang = language === 'en' ? DEMO_TREE_TWI : DEMO_TREE_EN
    const otherNode = otherLang[nodeId]
    if (!otherNode) return null
    return speaker === 'agent' ? otherNode?.agent : null
  }

  const speakText = (text, id) => {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = language === 'tw' ? 'tw-GH' : 'en-GH'
    utterance.rate = 1
    utterance.pitch = 1
    utterance.volume = 1
    utterance.onstart = () => setSpeakingId(id)
    utterance.onend = () => setSpeakingId(null)
    utterance.onerror = () => setSpeakingId(null)
    window.speechSynthesis.speak(utterance)
  }

  const copyToClipboard = async (text) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // clipboard API not available
    }
  }

  const extractPhoneFromTranscripts = () => {
    const phoneRegex = /(?:\+?233|0)(?:20|24|25|26|27|28|30|31|32|33|34|35|36|37|38|39|50|51|52|53|54|55|56|57|59)\d{7}/g
    for (let i = transcripts.length - 1; i >= 0; i--) {
      const match = transcripts[i].text.match(phoneRegex)
      if (match) return match[0]
    }
    return null
  }

  const extractCustomerProfile = () => {
    const profile = {
      name: caseSummary?.customer_name || null,
      phone: caseSummary?.phone || extractPhoneFromTranscripts() || null,
      national_id: caseSummary?.national_id || null,
      network: caseSummary?.account_type || 'MTN Ghana',
    }
    return profile
  }

  const extractSessionHistory = () => {
    const customerMsgs = transcripts.filter(t => t.speaker === 'customer').map(t => t.text.trim().toLowerCase())
    const topics = []
    const topicKeywords = {
      'MoMo Refund': ['refund', 'money back', 'reverse', 'returned'],
      'Balance Inquiry': ['balance', 'account balance', 'how much'],
      'Transfer Issue': ['transfer', 'sent money', 'mom transfer', 'bank deposit'],
      'Account Access': ['access', 'login', 'password', 'locked', 'blocked'],
      'Unauthorized Charge': ['unauthorized', 'unknown charge', 'strange transaction'],
      'Bill Payment': ['bill', 'payment', 'pay'],
    }
    const seen = new Set()
    for (const text of customerMsgs) {
      for (const [topic, keywords] of Object.entries(topicKeywords)) {
        if (keywords.some(k => text.includes(k)) && !seen.has(topic)) {
          seen.add(topic)
          topics.push({
            title: topic,
            meta: `Today • ${language.toUpperCase()}`,
            status: 'Active',
          })
        }
      }
    }
    if (topics.length === 0) {
      const lastCustomerMsg = customerMsgs[customerMsgs.length - 1]
      if (lastCustomerMsg) {
        topics.push({
          title: lastCustomerMsg.slice(0, 40) + (lastCustomerMsg.length > 40 ? '...' : ''),
          meta: `Today • ${language.toUpperCase()}`,
          status: 'Active',
        })
      }
    }
    return topics.slice(0, 5)
  }

  const simulateCustomerResponse = () => {
    if (!demoMode) return
    const responses = AUTO_CUSTOMER_RESPONSES
    const randomResponse = responses[Math.floor(Math.random() * responses.length)]
    const delay = 1500 + Math.random() * 2000

    setTimeout(() => {
      setTranscripts(prev => [...prev, { speaker: 'customer', text: randomResponse, timestamp: Date.now() }])
    }, delay)
  }

  const sendAgentMessage = (text) => {
    if (!text.trim()) return
    if (demoMode) {
      addAgentMessage(text.trim())
      setAgentInput('')
      setPendingVoiceMessage('')
      setLastRecordingUrl('')
      setAsrError('')
      setAgentSuggestions([])
      simulateCustomerResponse()
    } else {
      const trimmed = text.trim()
      addAgentMessage(trimmed)
      setAgentInput('')
      setPendingVoiceMessage('')
      setLastRecordingUrl('')
      setAsrError('')
      setAgentSuggestions([])
      console.info('[agent] send response', { text: trimmed, sessionId })
      send({ type: 'response', data: { text: trimmed, speaker: 'agent', timestamp: Date.now() } })
    }
  }

  const handleMessage = useCallback((data) => {
    console.info('[agent] message', data)
    console.info('[agent] current connectionStatus before update:', connectionStatus)
    switch (data.type) {
      case 'transcript':
        if (data.is_final) {
          setTranscripts(prev => {
            const exists = prev.find(t => t.timestamp === data.timestamp)
            if (exists) return prev.map(t => t.timestamp === data.timestamp ? { ...t, ...data } : t)
            return [...prev, { ...data, translation: null }]
          })
        }
        if (data.cards) {
          setCards(prev => {
            const next = [...prev]
            data.cards.forEach(card => {
              if (!next.find(c => c.value === card.value)) next.push(card)
            })
            return next
          })
        }
        if (Array.isArray(data.suggested_replies)) {
          setAgentSuggestions(data.suggested_replies.slice(0, 3))
        }
        if (data.case_summary) {
          setCaseSummary(data.case_summary)
        }
        break
      case 'connected':
        setConnectionStatus('connected')
        setPinError('')
        console.info('[agent] set connectionStatus to connected')
        if (data.customer_language) {
          setCustomerLanguage(data.customer_language)
        }
        break
      case 'customer_language':
        setCustomerLanguage(data.language)
        break
      case 'status':
        setConnectionStatus(data.status === 'ended' ? 'ended' : data.status)
        break
      case 'sms':
        setSmsSent(true)
        setCaseNumber(data.data?.case_number || '')
        if (data.case_summary) setCaseSummary(data.case_summary)
        break
      case 'case_summary':
        if (data.case_summary) setCaseSummary(data.case_summary)
        break
      case 'post_call_summary':
        if (data.data?.summary) {
          setCaseSummary(data.data.summary)
        }
        break
      case 'ack':
        setAgentInput('')
        break
      case 'typing':
        if (data.role === 'customer') {
          setShowCustomerTyping(true)
          setTimeout(() => setShowCustomerTyping(false), 2000)
        }
        break
      case 'error':
        setPinError(data.message || 'Connection error')
        break
      default:
        break
    }
  }, [demoMode, connectionStatus])

  const restoreConversation = async () => {
    if (!sessionId) return
    setRestoringConversation(true)
    setPinError('')
    try {
      const baseUrl = getHttpBaseUrl()
      const response = await fetch(`${baseUrl}/api/session/${encodeURIComponent(sessionId)}/transcripts`)
      if (!response.ok) {
        throw new Error(`Failed to restore conversation: ${response.status}`)
      }
      const result = await response.json()
      if (Array.isArray(result.transcripts)) {
        setTranscripts(prev => {
          const existing = new Set(prev.map(t => t.timestamp))
          const merged = [...prev]
          result.transcripts.forEach(t => {
            if (!existing.has(t.timestamp)) {
              merged.push(t)
            }
          })
          return merged.sort((a, b) => a.timestamp - b.timestamp)
        })
      }
      if (Array.isArray(result.cards)) {
        setCards(prev => {
          const existing = new Set(prev.map(c => c.value))
          const merged = [...prev]
          result.cards.forEach(card => {
            if (!existing.has(card.value)) {
              merged.push(card)
            }
          })
          return merged
        })
      }
      if (result.language) {
        setCustomerLanguage(result.language)
      }
      if (result.case_summary) {
        setCaseSummary(result.case_summary)
      }
      setConnectionStatus('connected')
    } catch (error) {
      console.error('[agent] restore conversation failed:', error)
      setPinError(error.message || 'Failed to restore conversation')
    } finally {
      setRestoringConversation(false)
    }
  }

  const onConnect = useCallback(() => {
    setConnectionStatus('connected')
    setPinError('')
  }, [sessionId])
  const onDisconnect = useCallback(() => setConnectionStatus('disconnected'), [])

  const audioBufferToWav = (buffer, targetSampleRate = 16000) => {
    const numChannels = 1
    const sampleRate = targetSampleRate
    const bitsPerSample = 16
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8
    const blockAlign = (numChannels * bitsPerSample) / 8
    const dataLength = buffer.length * blockAlign
    const bufferLength = 44 + dataLength
    const arrayBuffer = new ArrayBuffer(bufferLength)
    const view = new DataView(arrayBuffer)
    const channelData = buffer.getChannelData(0)
    const downsampled = new Float32Array(buffer.length)
    const ratio = buffer.sampleRate / sampleRate
    for (let i = 0; i < buffer.length; i++) {
      downsampled[i] = channelData[Math.floor(i * ratio)] || 0
    }
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i))
      }
    }
    writeString(0, 'RIFF')
    view.setUint32(4, bufferLength - 8, true)
    writeString(8, 'WAVE')
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, numChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, byteRate, true)
    view.setUint16(32, blockAlign, true)
    view.setUint16(34, bitsPerSample, true)
    writeString(36, 'data')
    view.setUint32(40, dataLength, true)
    let offset = 44
    for (let i = 0; i < downsampled.length; i++) {
      const sample = Math.max(-1, Math.min(1, downsampled[i]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true)
      offset += 2
    }
    return new Blob([arrayBuffer], { type: 'audio/wav' })
  }

  const startRecording = async () => {
    console.info('[asr] startRecording', { isRecording, asrStatus })
    localTranscriptRef.current = ''
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
            ? 'audio/ogg;codecs=opus'
            : 'audio/webm'
      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mediaRecorder
      const chunks = []
      mediaRecorder.ondataavailable = (event) => {
        console.info('[asr] dataavailable', { size: event.data.size })
        if (event.data.size > 0) chunks.push(event.data)
      }
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: mimeType })
        const recordingUrl = URL.createObjectURL(audioBlob)
        setLastRecordingUrl(recordingUrl)
        stream.getTracks().forEach(track => track.stop())
        setIsRecording(false)
        setAsrStatus('uploading')
        setAsrError('')
        try {
          const arrayBuffer = await audioBlob.arrayBuffer()
          console.info('[asr] arrayBuffer', { byteLength: arrayBuffer.byteLength })
          const audioContext = new (window.AudioContext || window.webkitAudioContext)()
          let audioBuffer
          try {
            audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0))
            console.info('[asr] decodedAudio', { duration: audioBuffer.duration, sampleRate: audioBuffer.sampleRate, channels: audioBuffer.numberOfChannels })
          } catch (decodeError) {
            console.error('[asr] decodeAudioData failed:', decodeError)
            throw new Error('Microphone audio could not be decoded. Please try again.')
          }
          const wavBlob = audioBufferToWav(audioBuffer, 16000)
          console.info('[asr] wavBlob', { size: wavBlob.size, type: wavBlob.type })
          const filename = `agent-audio-${Date.now()}.wav`
          let result
          let remoteFailed = false
          try {
            result = await retryAsr(wavBlob, filename)
          } catch (wavError) {
            remoteFailed = true
            console.warn('[asr] wav upload failed, falling back to original blob', wavError)
            setAsrError(wavError.message || 'WAV upload failed, retrying original audio...')
            const originalFilename = `agent-audio-${Date.now()}.${mimeType.includes('ogg') ? 'ogg' : 'webm'}`
            try {
              result = await uploadOriginalBlob(audioBlob, originalFilename)
              remoteFailed = false
            } catch (originalError) {
              console.warn('[asr] original blob upload failed, using local recognition if available', originalError)
              setAsrError(originalError.message || 'Remote ASR failed. Using local recognition if available...')
            }
          }
          if (remoteFailed || !(result?.transcript?.trim())) {
            const localTranscript = localTranscriptRef.current.trim()
            if (localTranscript) {
              result = { transcript: localTranscript, raw: result?.raw || {} }
              setAsrError('')
            } else if (!result?.transcript?.trim()) {
              setAsrError('No transcript was returned from speech recognition.')
            }
          }
          console.info('[asr] result', result)
          const transcript = result?.transcript?.trim() || ''
          applyTranscript(transcript)
        } catch (error) {
          console.error('[asr] upload failed:', error)
          setAsrStatus('idle')
          setAsrError(error.message || 'Speech recognition failed. Please type your message.')
        }
      }
      startLocalSpeechRecognitionInBackground()
      mediaRecorder.start()
      setIsRecording(true)
      setAsrStatus('recording')
    } catch (error) {

      setIsRecording(false)
      setAsrStatus('idle')
      setAsrError(error.message || 'Could not access microphone. Please check permissions.')
    }
  }

  const stopRecording = () => {
    console.info('[asr] stopRecording', { mediaState: mediaRecorderRef.current?.state, speechState: speechRecognitionRef.current })
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop() } catch {}
    }
    setIsRecording(false)
  }

  const retryAsr = async (wavBlob, filename) => {
    setAsrError('')
    const baseUrl = getHttpBaseUrl()
    const uploadUrl = `${baseUrl}/asr/agent-speech`
    const normalizedLanguage = language === 'tw' ? 'tw-GH' : 'en-GH'
    const formData = new FormData()
    formData.append('file', wavBlob, filename)
    formData.append('language', normalizedLanguage)

    const response = await fetch(uploadUrl, { method: 'POST', body: formData })
    const responseText = await response.text().catch(() => '')
    if (!response.ok) {
      let detail = `ASR failed: ${response.status}`
      try {
        const parsed = JSON.parse(responseText)
        detail = parsed.error?.message || parsed.detail || detail
      } catch {
        if (responseText) detail = `${detail} ${responseText}`
      }
      throw new Error(detail)
    }
    let result
    try {
      result = JSON.parse(responseText)
    } catch {
      result = { raw: responseText }
    }
    return result
  }

  const uploadOriginalBlob = async (audioBlob, filename) => {
    const baseUrl = getHttpBaseUrl()
    const uploadUrl = `${baseUrl}/asr/agent-speech`
    const normalizedLanguage = language === 'tw' ? 'tw-GH' : 'en-GH'
    const formData = new FormData()
    formData.append('file', audioBlob, filename)
    formData.append('language', normalizedLanguage)

    const response = await fetch(uploadUrl, { method: 'POST', body: formData })
    const responseText = await response.text().catch(() => '')
    if (!response.ok) {
      let detail = `ASR failed: ${response.status}`
      try {
        const parsed = JSON.parse(responseText)
        detail = parsed.error?.message || parsed.detail || detail
      } catch {
        if (responseText) detail = `${detail} ${responseText}`
      }
      throw new Error(detail)
    }
    let result
    try {
      result = JSON.parse(responseText)
    } catch {
      result = { raw: responseText }
    }
    return result
  }

  const startLocalSpeechRecognitionInBackground = () => {
    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      if (!SpeechRecognition) {
        console.warn('[asr] local recognition not supported')
        return
      }
      const recognition = new SpeechRecognition()
      recognition.lang = language === 'tw' ? 'tw-GH' : 'en-GH'
      recognition.interimResults = false
      recognition.maxAlternatives = 1
      recognition.continuous = true
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript
        console.info('[asr] local transcript', transcript)
        localTranscriptRef.current = transcript
      }
      recognition.onerror = (event) => {
        console.warn('[asr] local recognition error', event.error)
      }
      recognition.onend = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          try { recognition.start() } catch {}
        }
      }
      speechRecognitionRef.current = recognition
      recognition.start()
    } catch (error) {
      console.warn('[asr] local recognition failed to start', error)
    }
  }

  const applyTranscript = (transcript) => {
    const trimmed = (transcript || '').trim()
    setAsrStatus('idle')
    setAsrError('')
    if (trimmed) {
      setPendingVoiceMessage(trimmed)
      setAgentInput(trimmed)
    } else {
      setPendingVoiceMessage('')
      setAsrError('No transcript was returned from speech recognition.')
    }
  }

  const sendPendingVoiceMessage = () => {
    const text = pendingVoiceMessage || agentInput
    if (!text.trim()) return
    sendAgentMessage(text.trim())
    setPendingVoiceMessage('')
    setLastRecordingUrl('')
  }

  const discardPendingVoiceMessage = () => {
    setPendingVoiceMessage('')
    setLastRecordingUrl('')
    setAgentInput('')
    setAsrError('')
  }

  const { isConnected, error, connect, disconnect, send } = useWebSocket(
    wsUrl,
    handleMessage,
    onConnect,
    onDisconnect
  )

  useEffect(() => {
    if (!sessionId || !agentPin) return
    connect()
    return () => disconnect()
  }, [sessionId, wsUrl, connect, disconnect, agentPin])

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      if (speechRecognitionRef.current) {
        try { speechRecognitionRef.current.stop() } catch {}
      }
    }
  }, [])

  useEffect(() => {
    const el = transcriptsContainerRef.current
    if (!el) return
    const handleScroll = () => {
      isNearBottomRef.current = checkNearBottom()
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [checkNearBottom])

  useEffect(() => {
    if (isNearBottomRef.current) {
      scrollToBottom('smooth')
    }
  }, [transcripts, scrollToBottom])

  useEffect(() => {
    const onOnline = () => { setNetworkStatus('online'); setOfflineQueue(0) }
    const onOffline = () => setNetworkStatus('offline')
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 50)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!ready) return
    setTranscripts([])
    setCards([])
    setSmsSent(false)
    setCaseNumber('')
    setAgentInput('')
    setPendingVoiceMessage('')
    setAsrError('')
  }, [language, ready])

  useEffect(() => {
    return () => {
      if (lastRecordingUrl) URL.revokeObjectURL(lastRecordingUrl)
    }
  }, [lastRecordingUrl])

  useEffect(() => {
    if (!sessionId || connectionStatus !== 'connected') return
    const baseUrl = getBackendBaseUrl().replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://')
    fetch(`${baseUrl}/api/session/${encodeURIComponent(sessionId)}/case-summary`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.case_summary) setCaseSummary(data.case_summary)
      })
      .catch(() => {})
  }, [sessionId, connectionStatus])

  useEffect(() => {
    if (!sessionId || connectionStatus !== 'connected') return
    const baseUrl = getBackendBaseUrl().replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://')
    fetch(`${baseUrl}/api/session/${encodeURIComponent(sessionId)}/metrics`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.metrics) setMetrics(data.metrics)
      })
      .catch(() => {})
  }, [sessionId, connectionStatus])

  useEffect(() => {
    if (connectionStatus !== 'connected' || offlineQueue.length === 0) return
    const queue = [...offlineQueue]
    let sent = 0
    for (const message of queue) {
      const ok = send(message)
      if (ok) {
        sent += 1
      }
    }
    if (sent > 0) {
      setOfflineQueue(prev => prev.slice(sent))
    }
  }, [connectionStatus, offlineQueue.length, send])

  useEffect(() => {
    if (connectionStatus !== 'ended' || smsSent) return
    const timer = setTimeout(() => {
      const cn = `CASE${Date.now().toString().slice(-6)}`
      setCaseNumber(cn)
      setSmsSent(true)
    }, 1200)
    return () => clearTimeout(timer)
  }, [connectionStatus, smsSent])

  useEffect(() => {
    if (connectionStatus !== 'connected' || !agentInput.trim()) return
    const timer = setTimeout(() => {
      send({ type: 'typing', data: {} })
    }, 300)
    return () => clearTimeout(timer)
  }, [agentInput, connectionStatus, send])

  const sendAgentResponse = (text) => {
    if (!text.trim()) return
    const message = { type: 'response', data: { text: text.trim(), speaker: 'agent', timestamp: Date.now() } }
    if (connectionStatus !== 'connected') {
      setOfflineQueue(prev => [...prev, message])
      addAgentMessage(text.trim(), true)
    } else {
      send(message)
      addAgentMessage(text.trim())
    }
    setAgentInput('')
    simulateCustomerResponse()
  }

  const resolveCase = () => {
    const cn = caseNumber || `CASE${Date.now().toString().slice(-6)}`
    setCaseNumber(cn)
    const customerProfile = extractCustomerProfile()
    const problemSummary = caseSummary?.problem_type || 'general inquiry'
    const payload = {
      type: 'request_sms',
      case_number: cn,
      problem_summary: problemSummary,
      customer_name: customerProfile.name,
      phone_number: customerProfile.phone,
      customer_profile: customerProfile,
      session_history: extractSessionHistory(),
    }
    send(payload)
    setSmsSent(true)
  }

  const escalateCase = () => {
    send({ type: 'escalate' })
  }

  const endSession = () => {
    send({ type: 'end' })
  }

  const handleSignIn = () => {
    if (!signInName.trim() || !signInId.trim() || !agentPin.trim()) {
      alert('Please enter Agent Name, Counter ID, and PIN')
      return
    }
    setAgentName(signInName.trim())
    setAgentId(signInId.trim())
    setShowSignIn(false)
    setSignInName('')
    setSignInId('')
  }

  const handlePinSubmit = () => {
    if (!agentPin.trim()) {
      setPinError('Please enter your PIN')
      return
    }
    setIsPinSubmitting(true)
    setPinError('')
  }

  const statusColor = connectionStatus === 'connected' ? '#10b981' : connectionStatus === 'connecting' ? '#f59e0b' : '#ef4444'
  const statusLabel = connectionStatus === 'connected' ? 'LIVE' : connectionStatus === 'connecting' ? 'CONNECTING' : connectionStatus === 'ended' ? 'ENDED' : 'OFFLINE'
  const customerLangLabel = customerLanguage === 'tw' ? 'Twi' : customerLanguage === 'en' ? 'English' : customerLanguage

  if (!ready) {
    return (
      <div className="agent-loading">
        <div className="agent-loading-spinner" />
        <div style={{ marginTop: 12, color: '#374151', fontWeight: 700 }}>Loading agent dashboard...</div>
      </div>
    )
  }

  return (
    <div className="agent-dashboard">
      <a href="#agent-main" className="skip-link">Skip to main content</a>

      <aside className={'agent-sidebar' + (sidebarCollapsed ? ' agent-sidebar-collapsed' : '')}>
        <div className="agent-sidebar-header">
          <div className="agent-logo">
            <img src={`/logo1.jpg?t=${Date.now()}`} alt="EchoText" className="agent-logo-img" />
          </div>
          <button className="agent-sidebar-toggle" onClick={() => setSidebarCollapsed(prev => !prev)} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {sidebarCollapsed ? <Menu size={18} /> : <PanelLeftClose size={18} />}
          </button>
          {!sidebarCollapsed && (
            agentName ? (
              <span className="agent-badge-signed-in">Signed in</span>
            ) : (
              <button className="agent-sign-in-btn" onClick={() => setShowSignIn(true)}>
                Sign In
              </button>
            )
          )}
        </div>

        <nav className="agent-nav">
          <button className={'agent-nav-item active'} onClick={() => handleTabClick('transcript')} title="Transcript">
            <MessageSquare size={18} />
            <span>Transcript</span>
          </button>
          <button className={'agent-nav-item'} onClick={() => handleTabClick('customer')} title="Customer">
            <User size={18} />
            <span>Customer</span>
          </button>
          <button className={'agent-nav-item'} onClick={() => handleTabClick('case')} title="Case">
            <CheckCircle2 size={18} />
            <span>Case</span>
          </button>
          <button className={'agent-nav-item'} onClick={() => handleTabClick('settings')} title="Settings">
            <Settings size={18} />
            <span>Settings</span>
          </button>
        </nav>

        <div className="agent-sidebar-footer">
          <div className="agent-avatar">
            <User size={20} />
          </div>
          {!sidebarCollapsed && (
            <div className="agent-user-info">
              <div className="agent-user-name">{agentName || 'Agent'}</div>
              <div className="agent-user-role">{agentRole}</div>
              <div className="agent-user-role">Session: {sessionId}</div>
            </div>
          )}
        </div>
      </aside>

      <div className="agent-body">
        <header className="agent-topbar">
          <div className="agent-topbar-left">
            <button className="btn-icon" onClick={onBack} aria-label="Back">
              <ArrowLeft size={20} />
            </button>
            <div className="agent-topbar-brand">
                  <div>
                    <h1 className="agent-topbar-title">Session {sessionId}</h1>
                <div className="agent-topbar-meta">
                  <span className="agent-status-dot" style={{ background: statusColor }} />
                  {statusLabel} • MTN Service Center • Customer: {customerLangLabel}
                  {offlineQueue.length > 0 && (
                    <span style={{ marginLeft: 8, color: '#f59e0b', fontWeight: 700 }}>
                      {offlineQueue.length} pending
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="agent-topbar-right">
            <div className="agent-lang-toggle">
              <button className={'lang-btn' + (language === 'en' ? ' active' : '')} onClick={() => setLanguage('en')}>EN</button>
              <button className={'lang-btn' + (language === 'tw' ? ' active' : '')} onClick={() => setLanguage('tw')}>TW</button>
            </div>
            <div className="agent-search-icon" onClick={() => setShowSearch(prev => !prev)}>
              <Search size={18} />
            </div>
            <div className="agent-metrics-icon" onClick={() => setShowMetrics(prev => !prev)} title="Session metrics">
              <Activity size={18} />
            </div>
            <input
              id="agent-search-input"
              className={'agent-search-input' + (showSearch ? ' open' : '')}
              type="text"
              placeholder="Search session..."
            />
            <button className="btn-icon" onClick={() => setShowHelp(true)} aria-label="Help">
              <HelpCircle size={20} />
            </button>
            <button className="btn-icon" onClick={() => handleTabClick('settings')} aria-label="Settings">
              <Settings size={20} />
            </button>
          </div>
        </header>

        <AnimatePresence>
          {showHelp && (
            <div className="agent-modal-overlay" onClick={() => setShowHelp(false)}>
              <motion.div
                className="agent-modal"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="agent-modal-title">Help & Support</h2>
                <p className="agent-modal-subtitle">Quick guide for using the agent dashboard</p>
                <div className="agent-help-list">
                  <div className="agent-help-item">
                    <strong>Transcript</strong>
                    <p>View live captions, toggle languages, and read aloud messages.</p>
                  </div>
                  <div className="agent-help-item">
                    <strong>Customer</strong>
                    <p>See customer details, phone number, and session history.</p>
                  </div>
                  <div className="agent-help-item">
                    <strong>Case</strong>
                    <p>Manage cases, send SMS confirmations, and escalate issues.</p>
                  </div>
                  <div className="agent-help-item">
                    <strong>Settings</strong>
                    <p>Switch language, enable dual subtitles, and view session info.</p>
                  </div>
                </div>
                <div className="agent-modal-actions">
                  <button className="btn btn-primary" onClick={() => setShowHelp(false)}>Got it</button>
                </div>
              </motion.div>
            </div>
          )}
          {showMetrics && (
            <div className="agent-modal-overlay" onClick={() => setShowMetrics(false)}>
              <motion.div
                className="agent-modal"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="agent-modal-title">Session Metrics</h2>
                <p className="agent-modal-subtitle">Live performance indicators for this session</p>
                <div className="agent-metrics-grid">
                  <div className="agent-metric-card">
                    <div className="agent-metric-value">{(metrics.turns || 0) + transcripts.length}</div>
                    <div className="agent-metric-label">Total Turns</div>
                  </div>
                  <div className="agent-metric-card">
                    <div className="agent-metric-value">{metrics.agent_turns || transcripts.filter(t => t.speaker === 'agent').length}</div>
                    <div className="agent-metric-label">Agent Turns</div>
                  </div>
                  <div className="agent-metric-card">
                    <div className="agent-metric-value">{metrics.customer_turns || transcripts.filter(t => t.speaker === 'customer').length}</div>
                    <div className="agent-metric-label">Customer Turns</div>
                  </div>
                  <div className="agent-metric-card">
                    <div className="agent-metric-value">{metrics.escalations || 0}</div>
                    <div className="agent-metric-label">Escalations</div>
                  </div>
                  <div className="agent-metric-card">
                    <div className="agent-metric-value">{metrics.resolutions || 0}</div>
                    <div className="agent-metric-label">Resolutions</div>
                  </div>
                </div>
                <div className="agent-modal-actions">
                  <button className="btn btn-primary" onClick={() => setShowMetrics(false)}>Close</button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <main id="agent-main" className="agent-content">
          {activeTab === 'transcript' && (
            <div className="agent-layout">
              <div className="agent-main-panel">
                <div className="agent-card agent-transcript-card">
                  <div className="agent-card-header">
                    <h2>Live Transcript</h2>
                    <div className="agent-badges">
                      <span className="agent-badge-live">
                        LIVE
                        <span className="agent-live-wave">
                          <span></span>
                          <span></span>
                          <span></span>
                          <span></span>
                        </span>
                      </span>
                      <span className="agent-badge-lang">EN / TW</span>
                    </div>
                  </div>
                  <div className="agent-transcripts" ref={transcriptsContainerRef}>
                    <AnimatePresence>
                      {pendingVoiceMessage && (
                        <motion.div
                          className="agent-chat-bubble agent pending-voice"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <div className="agent-chat-text-wrap">
                            <p className="agent-chat-text" style={{ fontSize: currentFontSize, direction: 'ltr' }}>{pendingVoiceMessage}</p>
                          </div>
                          <div className="agent-voice-actions">
                            <button className="btn btn-secondary btn-sm" onClick={discardPendingVoiceMessage} aria-label="Discard voice draft">
                              <X size={14} />
                              Discard
                            </button>
                            <button className="btn btn-primary btn-sm" onClick={sendPendingVoiceMessage} aria-label="Send voice draft">
                              <Send size={14} />
                              Send
                            </button>
                          </div>
                        </motion.div>
                      )}
                      {transcripts.map((transcript, index) => (
                        <motion.div
                          key={transcript.timestamp || index}
                          className={'agent-chat-bubble ' + transcript.speaker}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <div className="agent-chat-text-wrap">
                            <p className="agent-chat-text" style={{ fontSize: currentFontSize, direction: 'ltr' }}>{transcript.text}</p>
                            {dualLanguage && transcript.translation && (
                              <p className="agent-chat-text agent-chat-text-secondary" style={{ fontSize: currentFontSize, direction: 'ltr' }}>{transcript.translation}</p>
                            )}
                          </div>
                          <button className="agent-chat-tts" onClick={() => speakText(transcript.text, transcript.timestamp)} aria-label="Read aloud">
                            {speakingId === transcript.timestamp ? '🔊' : '🔈'}
                          </button>
                        </motion.div>
                      ))}
                      {showCustomerTyping && (
                        <div className="typing-indicator" aria-live="polite">
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                          <span className="typing-label">Customer is typing</span>
                        </div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
              <div className="agent-side-panel">
                <div className="agent-card">
                  <div className="agent-card-header">
                    <h2>Case Summary</h2>
                  </div>
                  <div className="agent-case-summary">
                    {Object.keys(caseSummary).length === 0 && (
                      <div className="agent-card-summary">Analyzing conversation...</div>
                    )}
                    {caseSummary.problem_label && (
                      <div className="agent-summary-chip">
                        <span className="agent-summary-icon">📌</span>
                        <span className="agent-summary-label">Issue</span>
                        <span className="agent-summary-value">{caseSummary.problem_label}</span>
                      </div>
                    )}
                     {caseSummary.amount && (
                       <div className="agent-summary-chip">
                         <span className="agent-summary-icon">💳</span>
                         <span className="agent-summary-label">Amount</span>
                         <span className="agent-summary-value">{caseSummary.amount}</span>
                         <button className="agent-summary-copy" onClick={() => copyToClipboard(caseSummary.amount)} aria-label="Copy amount">
                           <Copy size={14} />
                         </button>
                       </div>
                     )}
                     {caseSummary.reference && (
                       <div className="agent-summary-chip">
                         <span className="agent-summary-icon">🔢</span>
                         <span className="agent-summary-label">Reference</span>
                         <span className="agent-summary-value">{caseSummary.reference}</span>
                         <button className="agent-summary-copy" onClick={() => copyToClipboard(caseSummary.reference)} aria-label="Copy reference">
                           <Copy size={14} />
                         </button>
                       </div>
                     )}
                     {caseSummary.case_number && (
                       <div className="agent-summary-chip">
                         <span className="agent-summary-icon">📋</span>
                         <span className="agent-summary-label">Case</span>
                         <span className="agent-summary-value">{caseSummary.case_number}</span>
                         <button className="agent-summary-copy" onClick={() => copyToClipboard(caseSummary.case_number)} aria-label="Copy case number">
                           <Copy size={14} />
                         </button>
                       </div>
                     )}
                     {caseSummary.phone && (
                       <div className="agent-summary-chip">
                         <span className="agent-summary-icon">📱</span>
                         <span className="agent-summary-label">Phone</span>
                         <span className="agent-summary-value">{caseSummary.phone}</span>
                         <button className="agent-summary-copy" onClick={() => copyToClipboard(caseSummary.phone)} aria-label="Copy phone">
                           <Copy size={14} />
                         </button>
                       </div>
                     )}
                    {caseSummary.recipient && (
                      <div className="agent-summary-chip">
                        <span className="agent-summary-icon">👤</span>
                        <span className="agent-summary-label">Recipient</span>
                        <span className="agent-summary-value">{caseSummary.recipient}</span>
                      </div>
                    )}
                    {caseSummary.customer_name && (
                      <div className="agent-summary-chip">
                        <span className="agent-summary-icon">🪪</span>
                        <span className="agent-summary-label">Name</span>
                        <span className="agent-summary-value">{caseSummary.customer_name}</span>
                      </div>
                    )}
                    {caseSummary.national_id && (
                      <div className="agent-summary-chip">
                        <span className="agent-summary-icon">🆔</span>
                        <span className="agent-summary-label">ID</span>
                        <span className="agent-summary-value">{caseSummary.national_id}</span>
                      </div>
                    )}
                    {caseSummary.transaction_date && (
                      <div className="agent-summary-chip">
                        <span className="agent-summary-icon">📅</span>
                        <span className="agent-summary-label">Date</span>
                        <span className="agent-summary-value">{caseSummary.transaction_date}</span>
                      </div>
                    )}
                    {caseSummary.transaction_time && (
                      <div className="agent-summary-chip">
                        <span className="agent-summary-icon">⏰</span>
                        <span className="agent-summary-label">Time</span>
                        <span className="agent-summary-value">{caseSummary.transaction_time}</span>
                      </div>
                    )}
                    {caseSummary.account_type && (
                      <div className="agent-summary-chip">
                        <span className="agent-summary-icon">📶</span>
                        <span className="agent-summary-label">Account</span>
                        <span className="agent-summary-value">{caseSummary.account_type}</span>
                      </div>
                    )}
                    {caseSummary.subscription && (
                      <div className="agent-summary-chip">
                        <span className="agent-summary-icon">🔄</span>
                        <span className="agent-summary-label">Subscription</span>
                        <span className="agent-summary-value">{caseSummary.subscription}</span>
                      </div>
                    )}
                    {caseSummary.bonus && (
                      <div className="agent-summary-chip">
                        <span className="agent-summary-icon">🎁</span>
                        <span className="agent-summary-label">Bonus</span>
                        <span className="agent-summary-value">{caseSummary.bonus}</span>
                      </div>
                    )}
                    {caseSummary.escalation_ref && (
                      <div className="agent-summary-chip">
                        <span className="agent-summary-icon">⬆️</span>
                        <span className="agent-summary-label">Escalation</span>
                        <span className="agent-summary-value">{caseSummary.escalation_ref}</span>
                      </div>
                    )}
                    {caseSummary.actions && caseSummary.actions.length > 0 && (
                      <div className="agent-summary-chip">
                        <span className="agent-summary-icon">✅</span>
                        <span className="agent-summary-label">Actions</span>
                        <span className="agent-summary-value">{caseSummary.actions.join(', ')}</span>
                      </div>
                    )}
                    {caseSummary.resolution && (
                      <div className="agent-summary-chip">
                        <span className="agent-summary-icon">🏁</span>
                        <span className="agent-summary-label">Resolution</span>
                        <span className="agent-summary-value">{caseSummary.resolution}</span>
                      </div>
                    )}
                    <div className="agent-summary-chip">
                      <span className="agent-summary-icon agent-status-icon">
                        {caseSummary.status === 'resolved' ? <CheckCircle2 size={16} color="#10b981" /> :
                         caseSummary.status === 'escalated' ? <AlertTriangle size={16} color="#f59e0b" /> :
                         caseSummary.status === 'closed' || caseSummary.status === 'cancelled' ? <XCircle size={16} color="#ef4444" /> :
                         <Loader2 size={16} color="#3b82f6" />}
                      </span>
                      <span className="agent-summary-label">Status</span>
                      <span className="agent-summary-value" style={{ textTransform: 'capitalize' }}>{(caseSummary.status || 'open').replace(/_/g, ' ')}</span>
                    </div>
                    <div className="agent-summary-chip">
                      <span className="agent-summary-icon agent-status-icon">
                        {caseSummary.urgency === 'high' ? <AlertTriangle size={16} color="#ef4444" /> :
                         caseSummary.urgency === 'medium' ? <AlertTriangle size={16} color="#f59e0b" /> :
                         <Info size={16} color="#6b7280" />}
                      </span>
                      <span className="agent-summary-label">Urgency</span>
                      <span className="agent-summary-value" style={{ textTransform: 'capitalize' }}>{caseSummary.urgency || 'normal'}</span>
                    </div>
                    {caseSummary.sms_sent && (
                      <div className="agent-summary-chip">
                        <span className="agent-summary-icon">📨</span>
                        <span className="agent-summary-label">SMS</span>
                        <span className="agent-summary-value">Sent</span>
                      </div>
                    )}
                    {caseSummary.verified && (
                      <div className="agent-summary-chip">
                        <span className="agent-summary-icon">🔐</span>
                        <span className="agent-summary-label">Verified</span>
                        <span className="agent-summary-value">Yes</span>
                      </div>
                    )}
                    {caseSummary.fraud_risk && caseSummary.fraud_risk !== 'low' && (
                      <div className="agent-summary-chip">
                        <span className="agent-summary-icon">{caseSummary.fraud_risk === 'high' ? '🚨' : '⚠️'}</span>
                        <span className="agent-summary-label">Fraud Risk</span>
                        <span className="agent-summary-value" style={{ textTransform: 'capitalize' }}>{caseSummary.fraud_risk}</span>
                      </div>
                    )}
                    {caseSummary.fraud_indicators && caseSummary.fraud_indicators.length > 0 && (
                      <div className="agent-summary-chip">
                        <span className="agent-summary-icon">🔍</span>
                        <span className="agent-summary-label">Fraud Signals</span>
                        <span className="agent-summary-value">{caseSummary.fraud_indicators.slice(0, 3).join(', ')}</span>
                      </div>
                    )}
                    {caseSummary.recommended_actions && caseSummary.recommended_actions.length > 0 && (
                      <div className="agent-summary-chip">
                        <span className="agent-summary-icon">🎯</span>
                        <span className="agent-summary-label">Next Actions</span>
                        <span className="agent-summary-value">{caseSummary.recommended_actions[0]}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'customer' && (
            <div className="agent-customer-view">
              <div className="agent-card">
                <h2 className="agent-card-title">Customer Profile</h2>
                <div className="agent-customer-details">
                  <div className="agent-detail-item">
                    <span className="agent-detail-icon">👤</span>
                    <div className="agent-detail-content">
                      <span className="agent-detail-label">Name</span>
                      <span className="agent-detail-value">{extractCustomerProfile().name || 'Not yet identified'}</span>
                    </div>
                  </div>
                  <div className="agent-detail-item">
                    <span className="agent-detail-icon">📱</span>
                    <div className="agent-detail-content">
                      <span className="agent-detail-label">Phone</span>
                      <span className="agent-detail-value">{extractCustomerProfile().phone || 'Not yet identified'}</span>
                    </div>
                  </div>
                  <div className="agent-detail-item">
                    <span className="agent-detail-icon">🆔</span>
                    <div className="agent-detail-content">
                      <span className="agent-detail-label">National ID</span>
                      <span className="agent-detail-value">{extractCustomerProfile().national_id || 'Not yet identified'}</span>
                    </div>
                  </div>
                  <div className="agent-detail-item">
                    <span className="agent-detail-icon">📶</span>
                    <div className="agent-detail-content">
                      <span className="agent-detail-label">Network</span>
                      <span className="agent-detail-value">{extractCustomerProfile().network}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="agent-card">
                <h2 className="agent-card-title">Session History</h2>
                <div className="agent-session-list">
                  {extractSessionHistory().length > 0 ? (
                    extractSessionHistory().map((session, idx) => (
                      <div key={idx} className="agent-session-item">
                        <div>
                          <div className="agent-session-title">{session.title}</div>
                          <div className="agent-session-meta">{session.meta}</div>
                        </div>
                        <span className={'agent-session-status' + (session.status === 'Resolved' ? ' agent-session-resolved' : '')}>{session.status}</span>
                      </div>
                    ))
                  ) : (
                    <div className="agent-session-item">
                      <div>
                        <div className="agent-session-title">No prior sessions found</div>
                        <div className="agent-session-meta">This is the first interaction</div>
                      </div>
                      <span className="agent-session-status">New</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'transcript' && (
            <div className="agent-input-bar">
              {agentSuggestions.length > 0 && (
                <div className="agent-suggestions" role="region" aria-label="Suggested replies">
                  {agentSuggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      className="agent-suggestion-chip"
                      onClick={() => setAgentInput(suggestion)}
                      aria-label={`Suggestion ${index + 1}: ${suggestion}`}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
              <div className="agent-input-row">
                <input
                  id="agent-message-input"
                  type="text"
                  value={agentInput}
                  onChange={(e) => setAgentInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendAgentMessage(agentInput)}
                  placeholder="Type your message or use voice..."
                  aria-label="Agent message"
                  style={{ fontSize: currentFontSize }}
                />
                <button
                  className={'agent-mic-btn' + (isRecording ? ' recording' : '')}
                  onClick={isRecording ? stopRecording : startRecording}
                  aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
                  title={
                    asrStatus === 'recording' ? 'Recording... click to stop' :
                    asrStatus === 'uploading' ? 'Uploading audio...' :
                    'Start voice input'
                  }
                >
                  <Mic size={18} />
                  {asrStatus !== 'idle' && <span className="agent-mic-status">{asrStatus}</span>}
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => sendAgentMessage(agentInput)} disabled={!agentInput.trim()} aria-label="Send message">
                  <Send size={16} />
                </button>
              </div>
            </div>
          )}

          {activeTab === 'case' && (
              <div className="agent-case-view">
                <div className="agent-card">
                  <h2 className="agent-card-title">Current Case</h2>
                  <div className="agent-case-header">
                    <div>
                      <div className="agent-case-number">{caseNumber || caseSummary?.case_number || 'CASE-...'}</div>
                      <div className="agent-case-meta">Opened today • MTN Service Center</div>
                    </div>
                    <span className={'agent-case-status ' + (smsSent ? 'resolved' : 'open')}>
                      {smsSent ? 'Resolved' : 'Open'}
                    </span>
                  </div>
                  <div className="agent-case-actions">
                    <button className="btn btn-primary btn-sm" onClick={resolveCase} disabled={smsSent}>
                      <Smartphone size={16} />
                      {smsSent ? 'SMS Sent' : 'Resolve & SMS'}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={endSession}>
                      <X size={16} />
                      End Session
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={escalateCase}>
                      <AlertTriangle size={16} />
                      Escalate
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setTranscripts([]); setCards([]); setCaseNumber(''); setSmsSent(false); setCaseSummary({}); }}>
                      <RotateCcw size={16} />
                      New Case
                    </button>
                  </div>
                </div>

                <div className="agent-card">
                  <h2 className="agent-card-title">Case Notes</h2>
                  <div className="agent-case-notes">
                    {transcripts.filter(t => t.speaker === 'customer').slice(-3).map((t, idx) => (
                      <div key={idx} className="agent-case-note">
                        <div className="agent-case-note-header">
                          <span className="agent-case-note-time">{new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          <span className="agent-case-note-author">Customer</span>
                        </div>
                        <p>{t.text}</p>
                      </div>
                    ))}
                    {caseSummary?.resolution && (
                      <div className="agent-case-note">
                        <div className="agent-case-note-header">
                          <span className="agent-case-note-time">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          <span className="agent-case-note-author">System</span>
                        </div>
                        <p>Resolution: {caseSummary.resolution}</p>
                      </div>
                    )}
                    {smsSent && (
                      <div className="agent-case-note">
                        <div className="agent-case-note-header">
                          <span className="agent-case-note-time">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          <span className="agent-case-note-author">System</span>
                        </div>
                        <p>Refund approved. SMS confirmation sent to customer.</p>
                      </div>
                    )}
                    {caseSummary?.recommended_actions && caseSummary.recommended_actions.length > 0 && (
                      <div className="agent-case-note">
                        <div className="agent-case-note-header">
                          <span className="agent-case-note-time">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          <span className="agent-case-note-author">Recommended</span>
                        </div>
                        {caseSummary.recommended_actions.map((action, idx) => (
                          <p key={idx}>• {action}</p>
                        ))}
                      </div>
                    )}
                    {caseSummary?.fraud_indicators && caseSummary.fraud_indicators.length > 0 && (
                      <div className="agent-case-note" style={{ borderLeftColor: '#ef4444' }}>
                        <div className="agent-case-note-header">
                          <span className="agent-case-note-time">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          <span className="agent-case-note-author" style={{ color: '#ef4444' }}>Fraud Alert</span>
                        </div>
                        {caseSummary.fraud_indicators.slice(0, 3).map((indicator, idx) => (
                          <p key={idx} style={{ color: '#ef4444' }}>⚠️ {indicator}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

          {activeTab === 'settings' && (
            <div className="agent-settings-view">
              <div className="agent-card">
                <h2 className="agent-card-title">Agent Settings</h2>
                <div className="agent-settings-list">
                  <div className="agent-setting-item">
                    <div>
                      <div className="agent-setting-label">Language</div>
                      <div className="agent-setting-desc">Default transcript language</div>
                    </div>
                    <div className="agent-lang-toggle">
                      <button className={'lang-btn' + (language === 'en' ? ' active' : '')} onClick={() => setLanguage('en')}>EN</button>
                      <button className={'lang-btn' + (language === 'tw' ? ' active' : '')} onClick={() => setLanguage('tw')}>TW</button>
                    </div>
                  </div>
                  <div className="agent-setting-item">
                    <div>
                      <div className="agent-setting-label">Dual-Language Subtitles</div>
                      <div className="agent-setting-desc">Show EN + TW simultaneously</div>
                    </div>
                    <button className={'lang-btn' + (dualLanguage ? ' active' : '')} onClick={() => setDualLanguage(prev => !prev)}>
                      {dualLanguage ? 'On' : 'Off'}
                    </button>
                  </div>
                  <div className="agent-setting-item">
                    <div>
                      <div className="agent-setting-label">Session</div>
                      <div className="agent-setting-desc">Current session ID</div>
                    </div>
                    <span className="agent-setting-value">{sessionId}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {showSignIn && (
        <div className="agent-modal-overlay" onClick={() => setShowSignIn(false)}>
          <div className="agent-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Agent sign in">
            <h2 className="agent-modal-title">Agent Sign In</h2>
            <p className="agent-modal-subtitle">Enter your details to access the dashboard</p>
            <div className="agent-form-group">
              <label className="agent-label" htmlFor="agent-signin-name">Agent Name</label>
              <input
                id="agent-signin-name"
                className="agent-input"
                type="text"
                placeholder="e.g. Augustine Nana"
                value={signInName}
                onChange={(e) => setSignInName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
                autoComplete="off"
              />
              </div>
              <div className="agent-form-group">
              <label className="agent-label" htmlFor="agent-signin-id">Counter ID</label>
              <input
                id="agent-signin-id"
                className="agent-input"
                type="text"
                placeholder="e.g. counter_1"
                value={signInId}
                onChange={(e) => setSignInId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
                autoComplete="off"
              />
              </div>
              <div className="agent-form-group">
              <label className="agent-label" htmlFor="agent-signin-pin">PIN</label>
              <input
                id="agent-signin-pin"
                className="agent-input"
                type="password"
                placeholder="Enter counter PIN"
                value={agentPin}
                onChange={(e) => setAgentPin(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
                autoComplete="off"
              />
            </div>
            <div className="agent-modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowSignIn(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSignIn}>Sign In</button>
            </div>
          </div>
        </div>
      )}

      <nav className="agent-mobile-bottom-nav" aria-label="Mobile navigation">
        <button className={'agent-mobile-nav-item' + (activeTab === 'transcript' ? ' active' : '')} onClick={() => handleTabClick('transcript')} aria-label="Transcript">
          <MessageSquare size={20} />
          <span>Transcript</span>
        </button>
        <button className={'agent-mobile-nav-item' + (activeTab === 'customer' ? ' active' : '')} onClick={() => handleTabClick('customer')} aria-label="Customer">
          <User size={20} />
          <span>Customer</span>
        </button>
        <button className={'agent-mobile-nav-item' + (activeTab === 'case' ? ' active' : '')} onClick={() => handleTabClick('case')} aria-label="Case">
          <CheckCircle2 size={20} />
          <span>Case</span>
        </button>
        <button className={'agent-mobile-nav-item' + (activeTab === 'settings' ? ' active' : '')} onClick={() => handleTabClick('settings')} aria-label="Settings">
          <Settings size={20} />
          <span>Settings</span>
        </button>
      </nav>
    </div>
  )
}
