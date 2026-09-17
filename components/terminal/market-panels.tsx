'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpRight, Check, ChevronDown, CircleDot, Layers, ListFilter, Radio, Scale, SlidersHorizontal } from 'lucide-react'
import { Panel, DataRow, StatusDot } from './panel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { MarketState } from '@/hooks/use-market'
import { compact, formatPrice } from '@/lib/market-types'
import { cn } from '@/lib/utils'

export function IndicatorPanel({ market: m }: { market: MarketState }) {
  const indicators = m.analysis.indicators
  return <Panel title="Indicator engine" icon={<SlidersHorizontal className="size-3.5" />} action={<span className="font-mono text-[9px] text-muted-foreground">CLOSED · 15M</span>}>
    <div className="px-4"><div className="flex justify-between border-b border-border py-2.5 text-[9px] uppercase tracking-wider text-muted-foreground"><span>Model / parameter</span><span>Directional vote</span></div>{indicators ? indicators.factors.map(factor => <div key={factor.name} className="flex items-center justify-between gap-2 border-b border-border/60 py-3 last:border-0"><div><div className="text-[11px] font-medium">{factor.name}</div><div className="mt-1 font-mono text-[9px] text-muted-foreground">{factor.detail} <span className="text-foreground/80">· {formatPrice(factor.value)}</span></div></div><span className={cn('flex items-center gap-1 text-[9px] font-medium', factor.direction === 'LONG' ? 'text-positive' : factor.direction === 'SHORT' ? 'text-negative' : 'text-muted-foreground')}>{factor.direction === 'LONG' ? <ArrowUpRight className="size-3" /> : factor.direction === 'SHORT' ? <ArrowDown className="size-3" /> : <CircleDot className="size-2.5" />}{factor.direction === 'LONG' ? 'BULLISH' : factor.direction === 'SHORT' ? 'BEARISH' : 'NEUTRAL'}</span></div>) : <div className="flex min-h-64 items-center justify-center text-xs text-muted-foreground">Waiting for verified closed candles</div>}</div>
    <div className="mt-auto flex justify-between border-t border-border px-4 py-2.5 text-[9px] text-muted-foreground"><span>5 deterministic factors · no synthetic agents</span><span className="font-mono text-primary">{indicators ? `${Math.abs(indicators.score)}% agreement` : '—'}</span></div>
  </Panel>
}

export function OrderBook({ market: m }: { market: MarketState }) {
  const [unit, setUnit] = useState<'XAU' | 'contracts'>('XAU')
  const book = m.book
  const multiplier = unit === 'XAU' ? Number(m.instrument?.ctVal) : 1
  const bids = book?.bids.slice(0, 5) || [], asks = book?.asks.slice(0, 5) || []
  const max = Math.max(1, ...[...bids, ...asks].map(row => Number(row[1])))
  const bidTotal = bids.reduce((s, r) => s + Number(r[1]), 0), askTotal = asks.reduce((s, r) => s + Number(r[1]), 0), total = bidTotal + askTotal
  const buyRatio = total ? bidTotal / total * 100 : null
  const row = (r: string[], side: 'buy' | 'sell') => <div key={`${side}-${r[0]}`} className="relative grid grid-cols-3 gap-2 px-4 py-[3px] text-right font-mono text-[10px]"><div className={cn('pointer-events-none absolute inset-y-0 right-4', side === 'buy' ? 'bg-positive/9' : 'bg-negative/9')} style={{ width: `${Number(r[1]) / max * 88}%` }} /><span className={cn('relative text-left', side === 'buy' ? 'text-positive' : 'text-negative')}>{formatPrice(r[0], 1)}</span><span className="relative">{Number.isFinite(multiplier) ? formatPrice(Number(r[1]) * multiplier, unit === 'XAU' ? 3 : 0) : '—'}</span><span className="relative text-muted-foreground">{r[3] ?? '—'}</span></div>
  return <Panel title="Order book" icon={<Layers className="size-3.5" />} action={<Button variant="ghost" size="xs" className="h-5 px-1 font-mono text-[9px] text-muted-foreground" onClick={() => setUnit(unit === 'XAU' ? 'contracts' : 'XAU')} aria-label="Toggle order book size units">{unit}<ChevronDown className="size-2.5!" /></Button>}>
    <div className="grid grid-cols-3 gap-2 px-4 py-3 text-right text-[9px] text-muted-foreground"><span className="text-left">Price (USDT)</span><span>Size ({unit})</span><span>Orders</span></div>
    {book ? <><div>{[...asks].reverse().map(r => row(r, 'sell'))}</div><div className="my-2 flex items-center justify-between border-y border-border bg-background/40 px-4 py-2.5"><span className={cn('flex items-center gap-1.5 font-mono text-base', m.ticker && Number(m.ticker.last) >= Number(m.ticker.open24h) ? 'text-positive' : 'text-negative')}>{formatPrice(m.ticker?.last, 1)}{m.ticker && Number(m.ticker.last) >= Number(m.ticker.open24h) ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}</span><span className="text-[9px] text-muted-foreground">Spread <span className="ml-1 font-mono text-foreground">{formatPrice(m.spread, 1)}</span></span></div><div>{bids.map(r => row(r, 'buy'))}</div></> : <div className="flex min-h-56 items-center justify-center text-xs text-muted-foreground">Order book unavailable</div>}
    <div className="mt-auto px-4 pt-3 pb-2.5"><div className="mb-2 flex justify-between font-mono text-[9px]"><span className="text-positive">B {buyRatio === null ? '—' : `${buyRatio.toFixed(1)}%`}</span><span className="text-muted-foreground">Top 5 depth</span><span className="text-negative">S {buyRatio === null ? '—' : `${(100 - buyRatio).toFixed(1)}%`}</span></div><div className="flex h-1.5 gap-0.5 overflow-hidden rounded-sm bg-muted">{buyRatio !== null && <><div className="bg-positive/80" style={{ width: `${buyRatio}%` }} /><div className="flex-1 bg-negative/80" /></>}</div></div>
  </Panel>
}

export function DerivativesPanel({ market: m }: { market: MarketState }) {
  const { snapshot, analysis } = m
  const freshMark = snapshot?.mark && m.now - Number(snapshot.mark.ts) < 15_000 ? snapshot.mark : null
  const freshFunding = snapshot?.funding && m.now - Number(snapshot.funding.ts) < 180_000 ? snapshot.funding : null
  const freshOI = snapshot?.interest && m.now - Number(snapshot.interest.ts) < 30_000 ? snapshot.interest : null
  return <Panel title="Market microstructure" icon={<Radio className="size-3.5" />} action={<span className="flex items-center gap-1.5 text-[9px] font-normal normal-case tracking-normal text-muted-foreground"><StatusDot live={m.fresh} />{m.fresh ? 'Verified feed' : 'Feed pending'}</span>}>
    <div className="divide-y divide-border/60 px-4 py-1"><DataRow label="Mark price">{formatPrice(freshMark?.markPx, 1)} <span className="text-[9px] text-muted-foreground">USDT</span></DataRow><DataRow label="Funding rate" className="text-primary">{freshFunding ? `${(Number(freshFunding.fundingRate) * 100).toFixed(4)}%` : '—'}</DataRow><DataRow label="Next funding (UTC)">{freshFunding ? new Date(Number(freshFunding.fundingTime)).toISOString().slice(11, 16) : '—'}</DataRow><DataRow label="Open interest">{freshOI ? `$${compact(freshOI.oiUsd)}` : '—'}</DataRow><DataRow label="ATR · 14 closed bars">{formatPrice(analysis.indicators?.atr)} <span className="text-[9px] text-muted-foreground">USDT</span></DataRow><DataRow label="Exchange price tick">{m.instrument ? `${m.instrument.tickSz} USDT` : '—'}</DataRow><DataRow label="Contract value">{m.instrument ? `${m.instrument.ctVal} ${m.instrument.ctValCcy}` : '—'}</DataRow></div>
    <div className="mx-4 mt-auto mb-3 flex items-start gap-2 rounded-md border border-primary/15 bg-primary/4 p-2.5 text-[9px] leading-relaxed text-muted-foreground"><ShieldSmall /><span>Exact XAU-USDT perpetual. Not PAXG, XAUT, spot bullion or a substituted feed.</span></div>
  </Panel>
}
function ShieldSmall() { return <Check className="mt-0.5 size-3 shrink-0 text-primary" /> }

export function SignalHistory({ market: m }: { market: MarketState }) {
  const [onlyConfirmed, setOnlyConfirmed] = useState(false)
  const events = m.analysis.history.filter(event => !onlyConfirmed || event.type === 'CONFIRMED')
  return <Panel title="Signal activity" icon={<ListFilter className="size-3.5" />} action={<div className="flex items-center gap-3"><span className="hidden text-[9px] font-normal normal-case tracking-normal text-muted-foreground sm:inline">UTC session · rule-based replay</span><Button variant="ghost" size="xs" className="h-5 text-[9px] text-muted-foreground" onClick={() => setOnlyConfirmed(v => !v)}>{onlyConfirmed ? 'Confirmed only' : 'All events'}<ChevronDown className="size-2.5!" /></Button></div>}>
    <div className="overflow-x-auto"><table className="w-full min-w-130 text-left text-[10px]"><thead><tr className="border-b border-border text-[9px] font-normal uppercase tracking-wider text-muted-foreground">{['Time (UTC)', 'Event', 'Direction', 'Fixed entry', 'Source'].map(label => <th key={label} className="px-4 py-3 font-normal">{label}</th>)}</tr></thead><tbody>{events.length ? events.slice(0, 4).map((event, index) => <tr key={`${event.time}-${index}`} className="border-b border-border/60 last:border-0"><td className="px-4 py-3 font-mono text-muted-foreground">{new Date(event.time).toISOString().slice(11, 19)}</td><td className="px-4 py-3"><Badge variant="outline" className={cn('h-5 rounded px-1.5 text-[8px]', event.type === 'CONFIRMED' ? 'border-positive/25 text-positive' : 'border-border text-muted-foreground')}>{event.type}</Badge></td><td className={cn('px-4 py-3 font-medium', event.direction === 'LONG' ? 'text-positive' : 'text-negative')}>{event.direction}</td><td className="px-4 py-3 font-mono">{formatPrice(event.entry, 1)}</td><td className="px-4 py-3 text-muted-foreground">OKX · closed 15m</td></tr>) : <tr><td colSpan={5} className="px-4 py-7 text-center text-muted-foreground">{m.analysis.error || 'No matching signal events in the current UTC session.'}</td></tr>}</tbody></table></div>
  </Panel>
}

export function RiskSizer({ market: m }: { market: MarketState }) {
  const [equity, setEquity] = useState('10000'), [riskPct, setRiskPct] = useState('0.5')
  const setup = m.actionable ? m.analysis.setup : null
  const valid = Number(equity) > 0 && Number(riskPct) > 0 && Number(riskPct) <= 2 && Number(equity) <= 1_000_000_000
  const risk = valid ? Number(equity) * Number(riskPct) / 100 : null
  const ctVal = Number(m.instrument?.ctVal), lot = Number(m.instrument?.lotSz)
  const rawContracts = setup && risk !== null && ctVal > 0 ? risk / Math.abs(setup.entry - setup.stop) / ctVal : null
  const contracts = rawContracts !== null && lot > 0 && setup ? Math.floor(Math.min(rawContracts, Number(equity) * 3 / setup.entry / ctVal) / lot) * lot : null
  const actualRisk = contracts !== null && setup ? contracts * ctVal * Math.abs(setup.entry - setup.stop) : null
  return <Panel title="Position calculator" icon={<Scale className="size-3.5" />} action={<span className="text-[9px] text-muted-foreground">NOT AN ORDER</span>}><div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4"><label className="text-[10px] text-muted-foreground">Account equity · USDT<input type="number" min="1" max="1000000000" value={equity} onChange={e => setEquity(e.target.value)} className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-primary" /></label><label className="text-[10px] text-muted-foreground">Risk per setup · %<input type="number" min="0.01" max="2" step="0.1" value={riskPct} onChange={e => setRiskPct(e.target.value)} className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-primary" /></label><div><div className="text-[10px] text-muted-foreground">Calculated size</div><div className="mt-3 font-mono text-lg text-primary">{formatPrice(contracts, 0)} <span className="text-[10px] text-muted-foreground">contracts</span></div></div><div><div className="text-[10px] text-muted-foreground">Planned price risk</div><div className="mt-3 font-mono text-lg">{formatPrice(actualRisk)} <span className="text-[10px] text-muted-foreground">USDT</span></div></div></div><p className="border-t border-border px-4 py-3 text-[10px] text-muted-foreground">{!valid ? 'Enter positive equity and risk between 0.01% and 2%.' : 'Size rounds down to the verified contract lot. Notional capped at 3× equity. Fees, funding, gaps and slippage are excluded; actual losses can exceed this estimate. Inputs are not saved.'}</p></Panel>
}
