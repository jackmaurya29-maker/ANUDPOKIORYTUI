import { okx } from '@/lib/okx'
import { INSTRUMENT, type Snapshot, type Ticker, type Book } from '@/lib/market-types'
export const dynamic = 'force-dynamic'

export async function GET() {
  const start = performance.now()
  const tasks = await Promise.allSettled([
    okx<Ticker>(`market/ticker?instId=${INSTRUMENT}`),
    okx<Book>(`market/books?instId=${INSTRUMENT}&sz=5`),
    okx<NonNullable<Snapshot['mark']>>(`public/mark-price?instType=SWAP&instId=${INSTRUMENT}`),
    okx<NonNullable<Snapshot['funding']>>(`public/funding-rate?instId=${INSTRUMENT}`),
    okx<NonNullable<Snapshot['interest']>>(`public/open-interest?instType=SWAP&instId=${INSTRUMENT}`),
  ] as const)
  const [ticker, book, mark, funding, interest] = tasks
  const body: Snapshot = {
    ticker: ticker.status === 'fulfilled' ? ticker.value[0] : null,
    book: book.status === 'fulfilled' ? book.value[0] : null,
    mark: mark.status === 'fulfilled' ? mark.value[0] : null,
    funding: funding.status === 'fulfilled' ? funding.value[0] : null,
    interest: interest.status === 'fulfilled' ? interest.value[0] : null,
    receivedAt: Date.now(), latency: Math.round(performance.now() - start),
    errors: tasks.flatMap((result, i) => result.status === 'rejected' ? [`${['Ticker', 'Order book', 'Mark price', 'Funding', 'Open interest'][i]}: ${result.reason instanceof Error ? result.reason.message : 'Unavailable'}`] : []),
  }
  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } })
}
