import { useState, type ReactNode } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { money, moneyShort, num } from '../utils/format'

// Chart rules used everywhere: one axis, thin marks (bars <= 24px, 4px rounded end, 2px lines),
// hairline solid gridlines, text in ink colours (never the series colour), tooltip on hover, and a table view.
export const CHART = {
  sales: '#7d1d34',      // maroon - money in
  expense: '#a37f2e',    // gold - money out
  stock: '#5a1024',
  grid: '#eadfc6',
  axis: '#a89b86',
  ink: '#2b1a1f',
  ink2: '#5b4a4f',
  surface: '#ffffff',
}

export interface Point { label: string; value: number; [k: string]: string | number }
type Fmt = 'money' | 'int'
const fmtVal = (v: number, f: Fmt) => (f === 'money' ? money(v) : num(v))

function TooltipBox({ active, payload, label, fmt, name }: { active?: boolean; payload?: { value: number }[]; label?: string; fmt: Fmt; name: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-gold-300 bg-white px-3 py-2 text-xs shadow-luxe">
      <div className="mb-0.5 text-ink/60">{label}</div>
      <div className="flex items-center gap-2 font-medium text-ink"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CHART.sales }} />{name}: <span className="tabular">{fmtVal(payload[0].value, fmt)}</span></div>
    </div>
  )
}

/** Card with a title, a Chart/Table switch (the table is the accessible alternative) and an empty state. */
export function ChartCard({ title, subtitle, data, fmt = 'money', valueLabel = 'Amount', children, className }: {
  title: string; subtitle?: string; data: Point[]; fmt?: Fmt; valueLabel?: string; children: ReactNode; className?: string
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const empty = data.length === 0 || data.every((d) => !d.value)
  return (
    <div className={`rounded-2xl border border-gold-200/70 bg-white p-5 shadow-luxe ${className ?? ''}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-xl font-semibold text-maroon-900">{title}</h3>
          {subtitle && <p className="text-xs text-ink/50">{subtitle}</p>}
        </div>
        {!empty && (
          <div className="no-print flex shrink-0 overflow-hidden rounded-lg border border-stone-200 text-[11px]">
            {(['chart', 'table'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`px-2.5 py-1 capitalize ${view === v ? 'bg-maroon-800 text-white' : 'bg-white text-ink/60 hover:bg-cream'}`}>{v}</button>
            ))}
          </div>
        )}
      </div>
      {empty ? (
        <div className="flex h-40 items-center justify-center text-sm text-ink/40">No data for this period yet.</div>
      ) : view === 'chart' ? children : (
        <div className="max-h-64 overflow-auto rounded-lg border border-stone-100">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-cream"><tr><th className="px-3 py-1.5 text-left font-medium">Item</th><th className="px-3 py-1.5 text-right font-medium">{valueLabel}</th></tr></thead>
            <tbody>{data.map((d) => <tr key={d.label} className="border-t border-stone-100"><td className="px-3 py-1">{d.label}</td><td className="px-3 py-1 text-right tabular">{fmtVal(d.value, fmt)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const axisProps = { tick: { fill: CHART.ink2, fontSize: 11 }, axisLine: { stroke: CHART.axis }, tickLine: false as const }

/** Columns: for values over time (days, months). */
export function ColumnChart({ data, fmt = 'money', color = CHART.sales, name = 'Amount', height = 220 }: { data: Point[]; fmt?: Fmt; color?: string; name?: string; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label={`${name} chart`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={14} />
          <YAxis {...axisProps} axisLine={false} width={52} tickFormatter={(v: number) => (fmt === 'money' ? moneyShort(v) : num(v))} />
          <Tooltip cursor={{ fill: 'rgba(125,29,52,0.06)' }} content={<TooltipBox fmt={fmt} name={name} />} />
          <Bar dataKey="value" fill={color} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** A 2px line with a light wash: for a running series (daily sales). */
export function TrendChart({ data, fmt = 'money', color = CHART.sales, name = 'Amount', height = 220 }: { data: Point[]; fmt?: Fmt; color?: string; name?: string; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label={`${name} trend chart`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
          <YAxis {...axisProps} axisLine={false} width={52} tickFormatter={(v: number) => (fmt === 'money' ? moneyShort(v) : num(v))} />
          <Tooltip cursor={{ stroke: CHART.axis, strokeWidth: 1 }} content={<TooltipBox fmt={fmt} name={name} />} />
          <Area type="linear" dataKey="value" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill={color} fillOpacity={0.1}
            dot={false} activeDot={{ r: 5, fill: color, stroke: CHART.surface, strokeWidth: 2 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Ranked horizontal bars: for "share of total" by category, payment method, vendor... Value shown at the bar tip. */
export function RankedBars({ data, fmt = 'money', color = CHART.sales, limit = 8, showShare = true }: { data: Point[]; fmt?: Fmt; color?: string; limit?: number; showShare?: boolean }) {
  const rows = [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value)
  const shown = rows.slice(0, limit)
  const rest = rows.slice(limit).reduce((s, r) => s + r.value, 0)
  if (rest > 0) shown.push({ label: 'Other', value: rest })
  const total = rows.reduce((s, r) => s + r.value, 0) || 1
  const max = Math.max(...shown.map((r) => r.value), 1)
  return (
    <ul className="space-y-2.5" aria-label="Ranked values">
      {shown.map((r) => (
        <li key={r.label} className="group" title={`${r.label}: ${fmtVal(r.value, fmt)} (${((r.value / total) * 100).toFixed(1)}%)`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate text-ink">{r.label}</span>
            <span className="shrink-0 tabular text-ink2 text-ink/70">{fmtVal(r.value, fmt)}{showShare && <span className="ml-1.5 text-ink/40">{((r.value / total) * 100).toFixed(0)}%</span>}</span>
          </div>
          <div className="h-3 w-full rounded-r-[4px] bg-cream-dark/70">
            <div className="h-3 rounded-r-[4px] transition-all group-hover:opacity-80" style={{ width: `${Math.max((r.value / max) * 100, 1.5)}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
