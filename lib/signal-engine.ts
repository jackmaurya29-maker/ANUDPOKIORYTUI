import type { Analysis, Candle, Direction, Factor, Indicators, Setup, SignalEvent } from './market-types'

export const SIGNAL_INTERVAL = 15 * 60 * 1000
export const CONFIRMATION_BARS = 3
export const SETUP_LIFETIME_BARS = 8
const WARMUP = 100

export function ema(values: number[], period: number) {
  if (!values.length) return []
  const alpha = 2 / (period + 1)
  return values.reduce<number[]>((out, value, index) => { out.push(index === 0 ? value : value * alpha + out[index - 1] * (1 - alpha)); return out }, [])
}

export function tickRound(value: number, tick: number, mode: 'floor' | 'ceil' | 'round' = 'round') {
  if (!Number.isFinite(value) || !Number.isFinite(tick) || tick <= 0) throw new Error('Invalid exchange tick')
  const decimals = Math.max(0, -Math.floor(Math.log10(tick))) + 2
  return Number((Math[mode](Number((value / tick).toFixed(8))) * tick).toFixed(decimals))
}

export function indicators(candles: Candle[]): Indicators | null {
  if (candles.length < WARMUP) return null
  const bars = candles.slice(-WARMUP)
  const closes = bars.map(c => c.close)
  const last = bars[bars.length - 1]
  const ema21 = ema(closes, 21).at(-1)!
  const ema50 = ema(closes, 50).at(-1)!
  let gain = 0, loss = 0, atr = 0
  for (let i = 1; i < bars.length; i++) {
    const difference = closes[i] - closes[i - 1]
    const range = Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - closes[i - 1]), Math.abs(bars[i].low - closes[i - 1]))
    if (i <= 14) { gain += Math.max(0, difference) / 14; loss += Math.max(0, -difference) / 14; atr += range / 14 }
    else { gain = (gain * 13 + Math.max(0, difference)) / 14; loss = (loss * 13 + Math.max(0, -difference)) / 14; atr = (atr * 13 + range) / 14 }
  }
  const rsi = gain === 0 && loss === 0 ? 50 : loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  const recent = bars.slice(-50)
  const volume = recent.reduce((s, c) => s + c.volume, 0)
  if (volume <= 0 || atr <= 0) return null
  const vwap = recent.reduce((s, c) => s + ((c.high + c.low + c.close) / 3) * c.volume, 0) / volume
  const fast = ema(closes, 12), slow = ema(closes, 26)
  const macdLine = fast.map((v, i) => v - slow[i])
  const macd = macdLine.at(-1)! - ema(macdLine, 9).at(-1)!
  const preceding = bars.slice(-21, -1)
  const midpoint = (Math.max(...preceding.map(c => c.high)) + Math.min(...preceding.map(c => c.low))) / 2
  const direction = (value: number, deadband: number): Direction => value > deadband ? 'LONG' : value < -deadband ? 'SHORT' : 'NEUTRAL'
  const factors: Factor[] = [
    { name: 'Trend alignment', detail: 'EMA 21 / 50', value: ema21 - ema50, direction: direction(ema21 - ema50, atr * 0.1) },
    { name: 'Momentum', detail: 'RSI · 14 period', value: rsi, direction: direction(rsi - 50, 5) },
    { name: 'Volume-weighted price', detail: 'Rolling VWAP · 50 bars', value: vwap, direction: direction(last.close - vwap, atr * 0.1) },
    { name: 'MACD histogram', detail: '12 / 26 / 9', value: macd, direction: direction(macd, atr * 0.02) },
    { name: 'Market structure', detail: 'Previous 20-bar midpoint', value: midpoint, direction: direction(last.close - midpoint, atr * 0.1) },
  ]
  const score = factors.reduce((s, f) => s + (f.direction === 'LONG' ? 1 : f.direction === 'SHORT' ? -1 : 0), 0) * 20
  return { ema21, ema50, rsi, atr, vwap, macd, score, factors }
}

export function analyze(candles: Candle[], tick: number, now: number): Analysis {
  const empty: Analysis = { indicators: null, setup: null, confirmations: 0, candidate: 'NEUTRAL', lastClose: null, history: [], error: null }
  const closed = candles.filter(c => c.confirmed && c.time + SIGNAL_INTERVAL <= now)
  if (closed.length < WARMUP + 3) return { ...empty, error: 'Waiting for at least 103 verified, closed 15m candles.' }
  for (let i = 0; i < closed.length; i++) {
    const c = closed[i]
    if (![c.time, c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite) || c.low <= 0 || c.volume < 0 || c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close) || (i > 0 && c.time - closed[i - 1].time !== SIGNAL_INTERVAL)) return { ...empty, error: 'Candle integrity check failed. Signals blocked.' }
  }
  const lastClose = closed.at(-1)!.time + SIGNAL_INTERVAL
  if (now - lastClose > SIGNAL_INTERVAL + 20_000) return { ...empty, lastClose, error: 'Closed-candle feed is stale. Signals blocked.' }
  if (!(tick > 0)) return { ...empty, lastClose, error: 'Exchange tick size is not verified.' }
  // Replay from a UTC-day boundary so browser refreshes do not reset intraday locks.
  const sessionStart = Math.floor(now / 86_400_000) * 86_400_000
  let setup: Setup | null = null
  let candidate: Direction = 'NEUTRAL', confirmations = 0, cooldown = 0
  const history: SignalEvent[] = []
  for (let i = WARMUP - 1; i < closed.length; i++) {
    const bar = closed[i], closeTime = bar.time + SIGNAL_INTERVAL
    if (closeTime < sessionStart) continue
    const data = indicators(closed.slice(i - WARMUP + 1, i + 1))
    if (!data) { setup = null; confirmations = 0; continue }
    if (setup) {
      const invalid = setup.direction === 'LONG' ? bar.low <= setup.stop : bar.high >= setup.stop
      const target = setup.direction === 'LONG' ? bar.high >= setup.target2 : bar.low <= setup.target2
      const expired = closeTime >= setup.expires
      if (invalid || target || expired) {
        history.push({ time: closeTime, type: invalid ? 'INVALIDATED' : expired ? 'EXPIRED' : 'TARGET REACHED', direction: setup.direction, entry: setup.entry })
        setup = null; cooldown = 3; confirmations = 0; candidate = 'NEUTRAL'
      }
      continue
    }
    if (cooldown > 0) { cooldown--; continue }
    const next: Direction = data.score >= 60 ? 'LONG' : data.score <= -60 ? 'SHORT' : 'NEUTRAL'
    confirmations = next === 'NEUTRAL' ? 0 : next === candidate ? confirmations + 1 : 1
    candidate = next
    if (confirmations < CONFIRMATION_BARS || candidate === 'NEUTRAL') continue
    const long = candidate === 'LONG'
    const entry = tickRound(data.ema21, tick, long ? 'floor' : 'ceil')
    if (Math.abs(entry - bar.close) > data.atr || (long ? entry >= bar.close : entry <= bar.close)) continue
    const structure = closed.slice(i - 4, i + 1)
    const stop = tickRound(long ? Math.min(entry - data.atr * 1.5, Math.min(...structure.map(c => c.low)) - data.atr * 0.25) : Math.max(entry + data.atr * 1.5, Math.max(...structure.map(c => c.high)) + data.atr * 0.25), tick, long ? 'floor' : 'ceil')
    const risk = Math.abs(entry - stop), sign = long ? 1 : -1
    if (risk < tick * 2 || risk > data.atr * 3) continue
    setup = { id: `${closeTime}-${candidate}`, direction: candidate, time: closeTime, expires: Math.min(closeTime + SETUP_LIFETIME_BARS * SIGNAL_INTERVAL, sessionStart + 86_400_000), entry, stop, target1: tickRound(entry + sign * risk * 1.5, tick), target2: tickRound(entry + sign * risk * 2.5, tick), zoneLow: tickRound(entry - data.atr * 0.1, tick, 'floor'), zoneHigh: tickRound(entry + data.atr * 0.1, tick, 'ceil'), strength: Math.abs(data.score) }
    history.push({ time: closeTime, type: 'CONFIRMED', direction: candidate, entry })
  }
  return { indicators: indicators(closed), setup, candidate, confirmations: Math.min(confirmations, 3), lastClose, history: history.slice(-12).reverse(), error: null }
}
