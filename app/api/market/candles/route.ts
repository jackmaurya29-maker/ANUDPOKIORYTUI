import { okx } from '@/lib/okx'
import { INSTRUMENT, BARS, type Bar, type Candle } from '@/lib/market-types'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const bar = new URL(request.url).searchParams.get('bar') || '15m'
  if (!BARS.includes(bar as Bar)) return Response.json({ error: 'Unsupported candle interval' }, { status: 400 })
  try {
    const raw = await okx<string[]>(`market/candles?instId=${INSTRUMENT}&bar=${bar}&limit=300`)
    const unique = new Map<number, Candle>()
    for (const row of raw) {
      const [time, open, high, low, close, , volume] = row.map(Number)
      if (![time, open, high, low, close, volume].every(Number.isFinite) || low <= 0 || volume < 0 || high < Math.max(open, close) || low > Math.min(open, close)) throw new Error('Malformed exchange candle')
      unique.set(time, { time, open, high, low, close, volume, confirmed: row[8] === '1' })
    }
    return Response.json({ candles: [...unique.values()].sort((a, b) => a.time - b.time), bar, receivedAt: Date.now() }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Candle feed unavailable' }, { status: 503 }) }
}
