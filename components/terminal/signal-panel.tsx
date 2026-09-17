'use client'

import { ArrowDownRight, ArrowUpRight, Check, ChevronRight, Crosshair, Info, LockKeyhole, Minus, ShieldCheck, Timer, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Panel, DataRow } from './panel'
import type { MarketState } from '@/hooks/use-market'
import { formatPrice } from '@/lib/market-types'
import { cn } from '@/lib/utils'

export function SignalPanel({ market: m, onMethodology }: { market: MarketState; onMethodology: () => void }) {
  const { analysis, actionable } = m
  const setup = actionable ? analysis.setup : null
  const long = setup?.direction === 'LONG'
  const score = analysis.indicators?.score
  const strength = setup?.strength ?? (score === undefined ? null : Math.abs(score))
  const color = setup ? long ? 'text-positive' : 'text-negative' : 'text-primary'
  const status = !m.verified ? 'VERIFYING' : !m.fresh || m.candlesStale ? 'DATA HOLD' : m.invalidated ? 'INVALIDATED' : m.targetTouched ? 'TARGET TOUCHED' : m.expired ? 'EXPIRED' : setup ? setup.direction : 'WAIT FOR SETUP'
  const description = setup ? 'Confirmed on 3 closed candles' : m.invalidated ? 'Stop level breached. No reversal issued.' : m.targetTouched ? 'Target level touched. No fill is assumed.' : !m.fresh ? 'Waiting for a fresh, verified feed' : analysis.error || (m.candlesStale ? 'Candle feed is delayed. Entries blocked.' : !m.spreadSafe ? 'Spread filter is blocking new entries.' : 'Confirmation or entry filters not yet met')
  const gates = [
    { name: 'Verified market data', pass: m.fresh },
    { name: '3 closed-candle confirmation', pass: !!analysis.setup || analysis.confirmations >= 3 },
    { name: 'Spread & candle integrity', pass: m.spreadSafe && !m.candlesStale && !analysis.error },
    { name: 'Active, valid price levels', pass: !!setup },
  ]
  return <Panel title="Signal intelligence" icon={<Crosshair className="size-3.5" />} className="signal-panel" action={<Badge variant="outline" className="h-5 rounded border-primary/25 bg-primary/5 px-1.5 font-mono text-[9px] text-primary">15M ENGINE</Badge>}>
    <div className="flex flex-col gap-4 p-4">
      <div className={cn('signal-status', setup ? long ? 'signal-long' : 'signal-short' : '')}>
        <div className="flex items-start justify-between"><span className="text-[9px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Market direction</span><span className={cn('flex items-center gap-1 text-[9px]', color)}><LockKeyhole className="size-2.5" />{setup ? 'LEVELS LOCKED' : 'GUARDED'}</span></div>
        <div className={cn('mt-3 flex items-center gap-2 text-[25px] leading-none font-semibold tracking-tight', color)}>{setup ? long ? <ArrowUpRight className="size-7" /> : <ArrowDownRight className="size-7" /> : <Timer className="size-6" />}{status}</div>
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{description}</p>
        <div className="mt-4 flex items-center justify-between text-[10px]"><span className="text-muted-foreground">{setup ? 'At-confirmation factor agreement' : 'Current factor agreement'}</span><span className={cn('font-mono font-medium', color)}>{strength === null ? '—' : `${strength}%`}</span></div>
        <div className="mt-2 flex gap-1" aria-label={strength === null ? 'Factor data unavailable' : `${strength} percent factor agreement`}>{Array.from({ length: 20 }, (_, i) => <span key={i} className={cn('h-1 flex-1 rounded-sm', strength !== null && i < strength / 5 ? setup ? long ? 'bg-positive' : 'bg-negative' : 'bg-primary/65' : 'bg-muted')} />)}</div>
        <p className="mt-2 text-[9px] text-muted-foreground">Indicator agreement, not probability of profit.</p>
      </div>
      <div className="entry-box"><div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-[10px] font-medium text-primary"><Crosshair className="size-3" /> CALCULATED ENTRY</span><span className="font-mono text-[9px] text-muted-foreground">USDT</span></div><div className="mt-2 font-mono text-3xl font-medium tracking-tight text-primary">{formatPrice(setup?.entry, 1)}</div><div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>Pullback zone</span><span className="font-mono">{setup ? `${formatPrice(setup.zoneLow, 1)} — ${formatPrice(setup.zoneHigh, 1)}` : 'Awaiting a valid setup'}</span></div></div>
      <div className="-my-1 divide-y divide-border/60"><DataRow label="Stop loss / invalidation" className="text-negative">{formatPrice(setup?.stop, 1)}</DataRow><DataRow label="Take profit 1" className="text-positive">{formatPrice(setup?.target1, 1)} <span className="ml-1 text-[9px] text-muted-foreground">1.5R</span></DataRow><DataRow label="Take profit 2" className="text-positive">{formatPrice(setup?.target2, 1)} <span className="ml-1 text-[9px] text-muted-foreground">2.5R</span></DataRow></div>
      <div className="rounded-md border border-border bg-background/40 px-3 py-2.5"><div className="mb-2 flex justify-between text-[9px] font-medium uppercase tracking-wider"><span className="flex items-center gap-1.5 text-muted-foreground"><ShieldCheck className="size-3" />Safety gates</span><span className="text-primary">{gates.filter(g => g.pass).length} / 4 PASSED</span></div><div className="grid grid-cols-1 gap-2">{gates.map(gate => <div key={gate.name} className="flex items-center gap-2 text-[10px] text-muted-foreground">{gate.pass ? <Check className="size-3 text-positive" /> : <Minus className="size-3 text-muted-foreground" />}{gate.name}</div>)}</div></div>
      <Button variant="outline" className="h-8 w-full justify-between rounded-md border-border bg-transparent text-[10px] text-muted-foreground" onClick={onMethodology}><span className="flex items-center gap-2"><Info className="size-3!" />How this signal is calculated</span><ChevronRight className="size-3!" /></Button>
    </div>
    <div className="mt-auto flex items-start gap-2 border-t border-border px-4 py-2.5 text-[9px] leading-relaxed text-muted-foreground"><TriangleAlert className="mt-0.5 size-3 shrink-0 text-primary" /><span>No guaranteed entry or direction. Fees, slippage and market risk apply. This terminal does not place trades.</span></div>
  </Panel>
}
