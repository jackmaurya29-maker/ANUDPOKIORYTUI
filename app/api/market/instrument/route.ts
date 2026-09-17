import { getInstrument } from '@/lib/okx'
export const dynamic = 'force-dynamic'
export async function GET() {
  try { return Response.json(await getInstrument(), { headers: { 'Cache-Control': 'no-store' } }) }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Instrument not verified' }, { status: 503 }) }
}
