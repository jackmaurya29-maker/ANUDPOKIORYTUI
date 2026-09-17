'use client'

import { memo, useEffect, useRef, useState } from 'react'
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, LineStyle, ColorType, CrosshairMode, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts'
import { CandlestickChart, Maximize2, Minimize2, RotateCcw, Activity, Layers2, Download, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Panel, StatusDot } from './panel'
import { BARS, formatPrice, type Bar, type Candle, type Setup } from '@/lib/market-types'
import { ema } from '@/lib/signal-engine'
import { cn } from '@/lib/utils'

export const PriceChart = memo(function PriceChart({ candles, bar, onBarChange, setup, live, tick, error }: { candles: Candle[]; bar: Bar; onBarChange: (bar: Bar) => void; setup: Setup | null; live: boolean; tick: number; error?: string }) {
  const container = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const price = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volume = useRef<ISeriesApi<'Histogram'> | null>(null)
  const fast = useRef<ISeriesApi<'Line'> | null>(null)
  const slow = useRef<ISeriesApi<'Line'> | null>(null)
  const lastBar = useRef('')
  const [expanded, setExpanded] = useState(false)
  const [showEMA, setShowEMA] = useState(true)
  const [showLevels, setShowLevels] = useState(true)
  const last = candles.at(-1)

  useEffect(() => {
    if (!container.current) return
    const api = createChart(container.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: '#0e141e' }, textColor: '#8490a2', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 10, attributionLogo: false },
      grid: { vertLines: { color: '#1a223080' }, horzLines: { color: '#1a223080' } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: '#657187', labelBackgroundColor: '#293243' }, horzLine: { color: '#657187', labelBackgroundColor: '#293243' } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.24 }, minimumWidth: 76 },
      timeScale: { borderColor: '#202937', timeVisible: true, secondsVisible: false, rightOffset: 7, barSpacing: 7 },
      handleScale: true, handleScroll: true,
    })
    chart.current = api
    price.current = api.addSeries(CandlestickSeries, { upColor: '#36cba2', downColor: '#f27483', borderVisible: false, wickUpColor: '#36cba2', wickDownColor: '#f27483', priceFormat: { type: 'price', precision: 1, minMove: 0.1 } })
    volume.current = api.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume', lastValueVisible: false, priceLineVisible: false })
    volume.current.priceScale().applyOptions({ scaleMargins: { top: 0.83, bottom: 0 }, borderVisible: false })
    fast.current = api.addSeries(LineSeries, { color: '#d8b66d', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
    slow.current = api.addSeries(LineSeries, { color: '#8f9cc7', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
    return () => { api.remove(); chart.current = null; price.current = null; volume.current = null; fast.current = null; slow.current = null; lastBar.current = '' }
  }, [])

  useEffect(() => {
    if (!candles.length || !price.current) return
    price.current.setData(candles.map(c => ({ time: c.time / 1000 as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })))
    volume.current?.setData(candles.map(c => ({ time: c.time / 1000 as UTCTimestamp, value: c.volume, color: c.close >= c.open ? '#36cba232' : '#f2748332' })))
    const closes = candles.map(c => c.close)
    fast.current?.setData(ema(closes, 21).map((value, i) => ({ time: candles[i].time / 1000 as UTCTimestamp, value })).slice(50))
    slow.current?.setData(ema(closes, 50).map((value, i) => ({ time: candles[i].time / 1000 as UTCTimestamp, value })).slice(50))
    if (lastBar.current !== bar) { chart.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - 90), to: candles.length + 8 }); lastBar.current = bar }
  }, [candles, bar])

  useEffect(() => { fast.current?.applyOptions({ visible: showEMA }); slow.current?.applyOptions({ visible: showEMA }) }, [showEMA])
  useEffect(() => {
    if (tick > 0) price.current?.applyOptions({ priceFormat: { type: 'price', precision: Math.max(0, -Math.floor(Math.log10(tick))), minMove: tick } })
  }, [tick])
  useEffect(() => {
    const series = price.current
    if (!series || !setup || !showLevels) return
    const lines = [
      series.createPriceLine({ price: setup.entry, color: '#d8b66d', title: 'ENTRY', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true }),
      series.createPriceLine({ price: setup.stop, color: '#f27483', title: 'SL', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true }),
      series.createPriceLine({ price: setup.target1, color: '#36cba2', title: 'TP1', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true }),
    ]
    return () => { if (price.current === series) lines.forEach(line => series.removePriceLine(line)) }
  }, [setup, showLevels])
  useEffect(() => { if (!expanded) return; const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false) }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [expanded])

  const download = () => { const canvas = chart.current?.takeScreenshot(); if (!canvas) return; const a = document.createElement('a'); a.download = `XAU-USDT-${bar}-${Date.now()}.png`; a.href = canvas.toDataURL('image/png'); a.click() }
  return <Panel title="Price action" icon={<CandlestickChart className="size-3.5" />} className={cn('chart-panel', expanded && 'chart-expanded')} action={<div className="flex items-center gap-2 text-[10px] font-normal normal-case tracking-normal"><StatusDot live={live} /><span className="text-muted-foreground">OKX perpetual</span><Button size="icon-xs" variant="ghost" onClick={() => setExpanded(v => !v)} aria-label={expanded ? 'Collapse chart' : 'Expand chart'}>{expanded ? <Minimize2 /> : <Maximize2 />}</Button></div>}>
    <div className="chart-toolbar"><div className="flex items-center gap-1" aria-label="Chart timeframe">{BARS.map(tf => <Button key={tf} size="xs" variant="ghost" aria-pressed={bar === tf} onClick={() => onBarChange(tf)} className={cn('h-7 rounded px-2.5 font-mono text-[11px]', bar === tf ? 'bg-primary/12 text-primary hover:bg-primary/20' : 'text-muted-foreground')}>{tf.toLowerCase()}</Button>)}</div><div className="flex items-center gap-1 border-l border-border pl-2"><Button size="xs" variant="ghost" aria-pressed={showEMA} onClick={() => setShowEMA(v => !v)} className={cn('text-[10px]', showEMA ? 'text-primary' : 'text-muted-foreground')}><Activity /> Indicators</Button><Button size="icon-xs" variant="ghost" aria-label="Toggle setup price levels" aria-pressed={showLevels} onClick={() => setShowLevels(v => !v)} className={showLevels ? 'text-primary' : 'text-muted-foreground'}><Layers2 /></Button></div><div className="ml-auto flex"><Button size="icon-xs" variant="ghost" aria-label="Reset chart zoom" onClick={() => chart.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - 90), to: candles.length + 8 })}><RotateCcw /></Button><Button size="icon-xs" variant="ghost" aria-label="Download chart image" onClick={download} disabled={!candles.length}><Download /></Button></div></div>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 font-mono text-[10px]"><span className="font-medium text-foreground">XAU / USDT <span className="text-muted-foreground">· {bar} · OKX</span></span>{[['O', last?.open], ['H', last?.high], ['L', last?.low], ['C', last?.close]].map(([label, value]) => <span key={label} className="text-muted-foreground">{label} <span className={last && last.close >= last.open ? 'text-positive' : 'text-negative'}>{formatPrice(value as number | undefined)}</span></span>)}</div>
    <div className="relative min-h-0 flex-1"><div ref={container} className="absolute inset-0" role="img" aria-label={`Live OKX XAU USDT ${bar} candlestick chart with volume and EMA indicators`} />{!candles.length && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card"><LoaderCircle className={cn('size-5 text-primary', !error && 'animate-spin')} /><span className="text-xs text-muted-foreground">{error ? 'Exchange candles unavailable. Retrying…' : 'Connecting to verified XAU market data…'}</span><span className="text-[10px] text-muted-foreground">No synthetic candles. No substituted assets.</span></div>}</div>
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-[10px]"><div className="flex gap-4 text-muted-foreground"><span className="flex items-center gap-1.5"><i className="h-px w-3 bg-primary" />EMA 21</span><span className="flex items-center gap-1.5"><i className="h-px w-3 bg-chart-3" />EMA 50</span><span className="flex items-center gap-1.5"><i className="size-2 bg-positive/40" />Volume · XAU</span></div><a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">TradingView Lightweight Charts™</a></div>
  </Panel>
})
