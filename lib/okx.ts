import 'server-only'
import { INSTRUMENT, type Instrument } from './market-types'

export async function okx<T>(path: string): Promise<T[]> {
  const response = await fetch(`https://www.okx.com/api/v5/${path}`, { cache: 'no-store', signal: AbortSignal.timeout(7000), headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`OKX HTTP ${response.status}`)
  const payload = await response.json()
  if (payload.code !== '0' || !Array.isArray(payload.data) || payload.data.length === 0) throw new Error(payload.msg || 'No verified exchange data')
  return payload.data as T[]
}

export async function getInstrument() {
  const [instrument] = await okx<Instrument>(`public/instruments?instType=SWAP&instId=${INSTRUMENT}`)
  if (instrument.instId !== INSTRUMENT || instrument.state !== 'live' || instrument.ctValCcy !== 'XAU' || !(Number(instrument.tickSz) > 0)) throw new Error('Exact XAU-USDT perpetual instrument is unavailable')
  return instrument
}
