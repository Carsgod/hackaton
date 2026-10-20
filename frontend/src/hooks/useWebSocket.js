import { useState, useEffect, useRef, useCallback } from 'react'

export function useWebSocket(url, onMessage, onConnect, onDisconnect) {
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState(null)
  const wsRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const reconnectAttemptsRef = useRef(0)
  const intentionalCloseRef = useRef(false)
  const heartbeatRef = useRef(null)
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

    intentionalCloseRef.current = false

    try {
      const ws = new WebSocket(urlRef.current)
      wsRef.current = ws

      ws.onopen = () => {
        console.info('[ws] open', urlRef.current)
        setIsConnected(true)
        setError(null)
        reconnectAttemptsRef.current = 0
        onConnectRef.current?.()
        // Keep-alive: proxies (and Render's free tier) drop idle sockets.
        // A ping every 20s keeps the connection alive and lets the server
        // report who else is on this session.
        if (heartbeatRef.current) clearInterval(heartbeatRef.current)
        heartbeatRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try { ws.send(JSON.stringify({ type: 'ping' })) } catch {}
          }
        }, 20000)
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          console.info('[ws] message', data)
          onMessageRef.current?.(data)
        } catch {
          console.info('[ws] raw', event.data)
          onMessageRef.current?.({ type: 'raw', data: event.data })
        }
      }

      ws.onerror = () => {
        console.error('[ws] error', urlRef.current)
        setError('Connection error')
      }

      ws.onclose = (event) => {
        // Ignore a socket that has already been replaced (StrictMode
        // remount, language switch, ...): it must not reset the state of
        // the live connection or schedule a second reconnect.
        if (wsRef.current && wsRef.current !== ws) {
          console.info('[ws] close (stale socket ignored)', urlRef.current)
          return
        }
        console.info('[ws] close', urlRef.current, 'code=', event.code, 'reason=', event.reason)
        setIsConnected(false)
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current)
          heartbeatRef.current = null
        }
        onDisconnectRef.current?.()
        if (intentionalCloseRef.current) {
          return
        }
        // Keep retrying: the backend (Render free tier) sleeps when idle and
        // can take a while to wake up. Giving up after 5 attempts left the
        // customer permanently disconnected.
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 8000)
        reconnectAttemptsRef.current += 1
        reconnectTimeoutRef.current = setTimeout(() => {
          connect()
        }, delay)
      }
    } catch (err) {
      setError('Failed to connect')
      console.error('WebSocket connection failed:', err)
    }
  }, [])

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
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

  // A phone that was asleep or on mobile data drops the socket silently.
  // Reconnect as soon as the tab is used again.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !intentionalCloseRef.current) {
        if (wsRef.current?.readyState === WebSocket.OPEN) return
        connect()
      }
    }
    const handleOnline = () => {
      if (!intentionalCloseRef.current) connect()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('online', handleOnline)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('online', handleOnline)
    }
  }, [connect])

  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
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
