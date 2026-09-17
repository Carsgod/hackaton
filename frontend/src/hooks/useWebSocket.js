import { useState, useEffect, useRef, useCallback } from 'react'

export function useWebSocket(url, onMessage, onConnect, onDisconnect) {
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState(null)
  const wsRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const reconnectAttemptsRef = useRef(0)
  const urlRef = useRef(url)
  const onMessageRef = useRef(onMessage)
  const onConnectRef = useRef(onConnect)
  const onDisconnectRef = useRef(onDisconnect)

  useEffect(() => { urlRef.current = url }, [url])
  useEffect(() => { onMessageRef.current = onMessage }, [onMessage])
  useEffect(() => { onConnectRef.current = onConnect }, [onConnect])
  useEffect(() => { onDisconnectRef.current = onDisconnect }, [onDisconnect])

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return
    }

    try {
      const ws = new WebSocket(urlRef.current)
      wsRef.current = ws

      ws.onopen = () => {
        setIsConnected(true)
        setError(null)
        reconnectAttemptsRef.current = 0
        onConnectRef.current?.()
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          onMessageRef.current?.(data)
        } catch {
          onMessageRef.current?.({ type: 'raw', data: event.data })
        }
      }

      ws.onerror = () => {
        setError('Connection error')
      }

      ws.onclose = () => {
        setIsConnected(false)
        onDisconnectRef.current?.()
        const maxRetries = 5
        if (reconnectAttemptsRef.current < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 5000)
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current += 1
            connect()
          }, delay)
        }
      }
    } catch (err) {
      setError('Failed to connect')
      console.error('WebSocket connection failed:', err)
    }
  }, [])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    if (wsRef.current) {
      try { wsRef.current.close(1000, 'Client disconnecting') } catch {}
      wsRef.current = null
    }
    setIsConnected(false)
  }, [])

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
      return true
    }
    return false
  }, [])

  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      if (wsRef.current) {
        try { wsRef.current.close() } catch {}
      }
    }
  }, [])

  return { isConnected, error, connect, disconnect, send, wsRef }
}

export function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch (error) {
      console.error('Error reading localStorage:', error)
      return initialValue
    }
  })

  const setValue = useCallback((value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value
      setStoredValue(valueToStore)
      window.localStorage.setItem(key, JSON.stringify(valueToStore))
    } catch (error) {
      console.error('Error setting localStorage:', error)
    }
  }, [key, storedValue])

  return [storedValue, setValue]
}
