import type { SourceResult } from '@/lib/market-types'
export const dynamic = 'force-dynamic'
const sources = [
  { name: 'OKX', symbol: 'XAU-USDT-SWAP', url: 'https://www.okx.com/api/v5/market/ticker?instId=XAU-USDT-SWAP' },
  { name: 'Binance', symbol: 'XAUUSDT', url: 'https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=XAUUSDT' },
  { name: 'MEXC', symbol: 'XAU_USDT', url: 'https://contract.mexc.com/api/v1/contract/ticker?symbol=XAU_USDT' },
  { name: 'Gate', symbol: 'XAU_USDT', url: 'https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=XAU_USDT' },
]
export async function GET() {
  const results = await Promise.all(sources.map(async (source): Promise<SourceResult> => {
    const samples: number[] = []
    try {
      for (let i = 0; i < 3; i++) {
        const start = performance.now()
        const response = await fetch(source.url, { cache: 'no-store', signal: AbortSignal.timeout(4000) })
        if (!response.ok) throw new Error(response.status === 451 || response.status === 403 ? 'Region restricted' : `HTTP ${response.status}`)
        const json = await response.json()
        const item = source.name === 'OKX' ? json.data?.[0] : source.name === 'MEXC' ? json.data : source.name === 'Gate' ? json[0] : json
        if (!item || (item.instId || item.symbol || item.contract) !== source.symbol || !(Number(item.last || item.lastPrice) > 0)) throw new Error('Exact instrument not verified')
        samples.push(Math.round(performance.now() - start))
      }
      return { name: source.name, symbol: source.symbol, available: true, latency: [...samples].sort((a, b) => a - b)[1], status: 'Verified perpetual', samples }
    } catch (error) { return { name: source.name, symbol: source.symbol, available: false, latency: null, status: error instanceof Error ? error.message : 'Unavailable', samples } }
  }))
  return Response.json({ sources: results, testedAt: Date.now(), note: 'Median of 3 REST round trips from this deployment; not a WebSocket latency guarantee. OKX remains the selected feed. No cross-exchange price substitution.' }, { headers: { 'Cache-Control': 'no-store' } })
}
