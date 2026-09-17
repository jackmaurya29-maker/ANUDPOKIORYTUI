'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { analyze, SIGNAL_INTERVAL } from '@/lib/signal-engine'
import { INSTRUMENT, type Bar, type Book, type Candle, type CandleResponse, type Instrument, type Snapshot, type Ticker } from '@/lib/market-types'

export async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || `Data request failed (${response.status})`)
  return data as T
}

export function useMarket(bar: Bar) {
  const { mutate } = useSWRConfig()
  const [now, setNow] = useState(0)
  const [stream, setStream] = useState<{ ticker?: Ticker; book?: Book }>({})
  const [connected, setConnected] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const market = useSWR<Snapshot>('/api/market', fetcher, { refreshInterval: 3000, dedupingInterval: 1500, errorRetryInterval: 5000 })
  const instrument = useSWR<Instrument>('/api/market/instrument', fetcher, { refreshInterval: 300_000, dedupingInterval: 60_000 })
  const signalCandles = useSWR<CandleResponse>('/api/market/candles?bar=15m', fetcher, { refreshInterval: 10_000, dedupingInterval: 3000 })
  const chartCandles = useSWR<CandleResponse>(`/api/market/candles?bar=${bar}`, fetcher, { refreshInterval: 10_000, dedupingInterval: 3000 })
  const candleBuffer = useRef(new Map<string, Candle>())

  useEffect(() => { setNow(Date.now()); const interval = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(interval) }, [])

  useEffect(() => {
    let stopped = false, socket: WebSocket | null = null, retry: ReturnType<typeof setTimeout> | undefined
    let buffer: { ticker?: Ticker; book?: Book } = {}, lastMessage = Date.now(), failures = 0
    const connect = () => {
      if (stopped) return
      socket = new WebSocket('wss://ws.okx.com:8443/ws/v5/public')
      socket.onopen = () => { failures = 0; lastMessage = Date.now(); socket?.send(JSON.stringify({ op: 'subscribe', args: ['tickers', 'books5'].map(channel => ({ channel, instId: INSTRUMENT })) })) }
      socket.onmessage = event => {
        lastMessage = Date.now()
        if (event.data === 'pong') return
        try {
          const message = JSON.parse(event.data)
          if (message.arg?.instId !== INSTRUMENT || !message.data?.length) return
          const value = message.data[0]
          if (message.arg.channel === 'tickers' && Number(value.last) > 0 && Number(value.ts) > 0) buffer.ticker = value
          if (message.arg.channel === 'books5' && value.asks?.length && value.bids?.length && Number(value.ts) > 0) buffer.book = value
          setConnected(true)
        } catch { /* Invalid exchange messages must not enter the feed. */ }
      }
      socket.onerror = () => socket?.close()
      socket.onclose = () => { setConnected(false); if (!stopped) retry = setTimeout(connect, Math.min(30_000, 2000 * 2 ** failures++)) }
    }
    connect()
    const flush = setInterval(() => { if (buffer.ticker || buffer.book) { const next = buffer; buffer = {}; setStream(previous => ({ ...previous, ...next })) } }, 200)
    const heartbeat = setInterval(() => {
      if (Date.now() - lastMessage > 30_000) socket?.close()
      else if (socket?.readyState === WebSocket.OPEN) socket.send('ping')
    }, 15_000)
    return () => { stopped = true; clearTimeout(retry); clearInterval(flush); clearInterval(heartbeat); socket?.close() }
  }, [retryKey])

  useEffect(() => {
    let stopped = false, socket: WebSocket | null = null, retry: ReturnType<typeof setTimeout> | undefined
    let lastMessage = Date.now()
    const channels = [...new Set(['15m', bar])]
    const connect = () => {
      if (stopped) return
      socket = new WebSocket('wss://ws.okx.com:8443/ws/v5/business')
      socket.onopen = () => { lastMessage = Date.now(); socket?.send(JSON.stringify({ op: 'subscribe', args: channels.map(tf => ({ channel: `candle${tf}`, instId: INSTRUMENT })) })) }
      socket.onmessage = event => {
        lastMessage = Date.now()
        if (event.data === 'pong') return
        try {
          const message = JSON.parse(event.data)
          if (message.arg?.instId !== INSTRUMENT || !message.data?.length) return
          const tf = message.arg.channel?.replace('candle', '')
          if (!channels.includes(tf)) return
          for (const row of message.data) {
            const [time, open, high, low, close, , volume] = row.map(Number)
            if (![time, open, high, low, close, volume].every(Number.isFinite) || low <= 0 || volume < 0 || high < Math.max(open, close) || low > Math.min(open, close)) continue
            candleBuffer.current.set(tf, { time, open, high, low, close, volume, confirmed: row[8] === '1' })
          }
        } catch { /* Malformed updates are discarded; REST remains the recovery source. */ }
      }
      socket.onerror = () => socket?.close()
      socket.onclose = () => { if (!stopped) retry = setTimeout(connect, 5000) }
    }
    connect()
    const flush = setInterval(() => {
      for (const [tf, candle] of candleBuffer.current) {
        void mutate<CandleResponse>(`/api/market/candles?bar=${tf}`, previous => {
          if (!previous || candle.time < previous.candles.at(-1)!.time - SIGNAL_INTERVAL) return previous
          const bars = new Map(previous.candles.map(c => [c.time, c]))
          if (bars.get(candle.time)?.confirmed && !candle.confirmed) return previous
          bars.set(candle.time, candle)
          return { ...previous, candles: [...bars.values()].sort((a, b) => a.time - b.time).slice(-300), receivedAt: Date.now() }
        }, { revalidate: false })
      }
      candleBuffer.current.clear()
    }, 500)
    const heartbeat = setInterval(() => { if (Date.now() - lastMessage > 30_000) socket?.close(); else if (socket?.readyState === WebSocket.OPEN) socket.send('ping') }, 15_000)
    return () => { stopped = true; clearTimeout(retry); clearInterval(flush); clearInterval(heartbeat); candleBuffer.current.clear(); socket?.close() }
  }, [bar, mutate, retryKey])

  const restTicker = market.data?.ticker, restBook = market.data?.book
  const ticker = Number(stream.ticker?.ts || 0) > Number(restTicker?.ts || 0) ? stream.ticker : restTicker
  const book = Number(stream.book?.ts || 0) > Number(restBook?.ts || 0) ? stream.book : restBook
  const quoteAge = now && ticker ? Math.max(0, now - Number(ticker.ts)) : null
  const bookAge = now && book ? Math.max(0, now - Number(book.ts)) : null
  const verified = instrument.data?.instId === INSTRUMENT && instrument.data.state === 'live'
  const fresh = !!verified && quoteAge !== null && quoteAge < 10_000 && bookAge !== null && bookAge < 10_000 && Number(ticker?.last) > 0 && Number(book?.asks[0]?.[0]) >= Number(book?.bids[0]?.[0]) && Number(book?.bids[0]?.[0]) > 0
  const closedKey = signalCandles.data?.candles.filter(c => c.confirmed).at(-1)?.time
  const day = now ? Math.floor(now / 86_400_000) : 0
  const analysis = useMemo(() => analyze(signalCandles.data?.candles || [], Number(instrument.data?.tickSz), Date.now()), [closedKey, day, instrument.data?.tickSz, signalCandles.data?.candles.length])
  const candlesStale = !signalCandles.data || !now || now - signalCandles.data.receivedAt > 30_000 || !analysis.lastClose || now - analysis.lastClose > SIGNAL_INTERVAL + 20_000
  const setup = analysis.setup
  const current = signalCandles.data?.candles.at(-1)
  const invalidated = !!setup && ((ticker && (setup.direction === 'LONG' ? Number(ticker.last) <= setup.stop : Number(ticker.last) >= setup.stop)) || (current && current.time >= setup.time && (setup.direction === 'LONG' ? current.low <= setup.stop : current.high >= setup.stop)))
  const targetTouched = !!setup && !!current && current.time >= setup.time && (setup.direction === 'LONG' ? current.high >= setup.target2 : current.low <= setup.target2)
  const expired = !!setup && now >= setup.expires
  const spread = book ? Number(book.asks[0]?.[0]) - Number(book.bids[0]?.[0]) : null
  const spreadSafe = spread !== null && spread >= 0 && !!analysis.indicators && spread <= analysis.indicators.atr * 0.05
  const actionable = fresh && !candlesStale && !analysis.error && !invalidated && !expired && !targetTouched && spreadSafe
  const refresh = () => { void market.mutate(); void instrument.mutate(); void signalCandles.mutate(); void chartCandles.mutate(); setRetryKey(k => k + 1) }
  return { now, ticker, book, snapshot: market.data, instrument: instrument.data, candles: chartCandles.data?.candles || [], signalCandles: signalCandles.data?.candles || [], analysis, quoteAge, bookAge, connected, fresh, verified, candlesStale, invalidated, targetTouched, expired, spread, spreadSafe, actionable, refresh, loading: market.isLoading, error: market.error?.message || instrument.error?.message || signalCandles.error?.message, chartError: chartCandles.error?.message }
}

export type MarketState = ReturnType<typeof useMarket>
