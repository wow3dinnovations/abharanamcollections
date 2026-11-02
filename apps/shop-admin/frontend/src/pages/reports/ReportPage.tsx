import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ChartCard, ColumnChart, RankedBars, type Point } from '../../components/charts'
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Notice, PageHeader, PageLoader, Select, StatCard, TableWrap, Td, Th, Tr } from '../../components/ui'
import { useLookups } from '../../hooks/useLookups'
import { api, ApiError, fileUrl } from '../../services/api'
import type { AppSettings } from '../../types'
import { fmtDate, fmtDateTime, money, MONTHS, monthStartIso, num, todayIso } from '../../utils/format'

interface Col { key: string; label: string; type: 'text' | 'int' | 'money' | 'date' | 'datetime' | 'percent' }
interface Section { title: string; columns: Col[]; rows: Record<string, string | number>[]; totals: Record<string, string | number> | null }
interface Report {
  key: string; title: string; subtitle: string; summary: { label: string; value: string | number; type: Col['type']; tone: string; hint: string }[]
  sections: Section[]; chart: { kind: 'bar' | 'pie'; title: string; data: Point[] } | null; notes: string[]
}
interface ReportMeta { key: string; title: string; inputs: string[] }

const cell = (t: Col['type'], v: string | number | undefined) => {
  if (v === undefined || v === null || v === '') return ''
  if (t === 'money') return money(Number(v))
  if (t === 'int') return num(Number(v))
  if (t === 'percent') return `${v}%`
  if (t === 'date') return fmtDate(String(v))
  if (t === 'datetime') return fmtDateTime(String(v))
  return String(v)
}

const looksLikeTime = (labels: string[]) => labels.every((l) => /^[\d\-/ ]+$|^[A-Za-z]{3} \d{2}$/.test(l))

export function ReportChart({ chart }: { chart: NonNullable<Report['chart']> }) {
  const data = chart.data
  const timeLike = chart.kind === 'bar' && data.length > 0 && looksLikeTime(data.map((d) => d.label))
  const isMoney = true
  return (
    <ChartCard title={chart.title} data={data} fmt={isMoney ? 'money' : 'int'}>
      {timeLike ? <ColumnChart data={data} /> : <RankedBars data={data.map((d) => ({ ...d, value: Math.abs(d.value) }))} />}
    </ChartCard>
  )
}

export function ReportPage({ fixedKey }: { fixedKey?: string }) {
  const params = useParams()
  const key = fixedKey ?? params.key ?? 'daily_sales'
  const { categories, vendors, locations, expenseCategories } = useLookups()
  const [meta, setMeta] = useState<ReportMeta | null>(null)
  const [p, setP] = useState<Record<string, string>>({})
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [methods, setMethods] = useState<string[]>([])
  const now = new Date()

  useEffect(() => {
    setReport(null); setErr(''); setLoading(true)
    const t = todayIso()
    const defaults: Record<string, string> = { date: t, year: String(now.getFullYear()), month: String(now.getMonth() + 1), start: monthStartIso(), end: t, days: '90' }
    api.get<{ items: ReportMeta[] }>('/api/reports').then((r) => {
      const m = r.items.find((x) => x.key === key) ?? null
      setMeta(m)
      if (!m) { setErr('You do not have access to this report.'); setLoading(false) }
    }).catch((e) => { setErr(e instanceof ApiError ? e.message : 'Cannot load'); setLoading(false) })
    api.get<AppSettings>('/api/settings').then((s) => { setMethods(s.billing.payment_methods); setP((cur) => ({ ...defaults, days: String(s.inventory.old_stock_days), ...cur })) }).catch(() => setP((cur) => ({ ...defaults, ...cur })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const query = useMemo(() => {
    if (!meta) return {}
    const wanted: Record<string, string[]> = {
      date: ['date'], year_month: ['year', 'month'], range: ['start', 'end'], category: ['category_id'], vendor: ['vendor_id'], location: ['location_id'],
      stock_status: ['stock_status'], q: ['q'], days: ['days'], payment_method: ['payment_method'], payee: ['payee'],
    }
    const out: Record<string, string> = {}
    meta.inputs.forEach((i) => (wanted[i] ?? []).forEach((k) => { if (p[k]) out[k] = p[k] }))
    return out
  }, [meta, p])

  const run = async () => {
    setLoading(true); setErr('')
    try { setReport(await api.get<Report>(`/api/reports/${key}`, query)) }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not build the report') } finally { setLoading(false) }
  }
  useEffect(() => { if (meta && Object.keys(p).length) run() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [meta, JSON.stringify(query)])

  const set = (patch: Record<string, string>) => setP({ ...p, ...patch })
  const download = (format: 'xlsx' | 'pdf') => window.open(fileUrl(`/api/reports/${key}/export`, { ...query, format }), '_blank')
  const preset = (name: string) => {
    const t = new Date(); const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (name === 'today') set({ start: todayIso(), end: todayIso() })
    if (name === 'month') set({ start: monthStartIso(), end: todayIso() })
    if (name === 'last') { const a = new Date(t.getFullYear(), t.getMonth() - 1, 1); const b = new Date(t.getFullYear(), t.getMonth(), 0); set({ start: iso(a), end: iso(b) }) }
    if (name === '30') { const a = new Date(t); a.setDate(a.getDate() - 29); set({ start: iso(a), end: todayIso() }) }
    if (name === 'year') set({ start: `${t.getFullYear()}-01-01`, end: todayIso() })
  }
  const has = (i: string) => meta?.inputs.includes(i)

  return (
    <div>
      <PageHeader title={report?.title ?? meta?.title ?? 'Report'} subtitle={report?.subtitle}
        actions={<><Button variant="outline" onClick={() => download('xlsx')} disabled={!report}>Export Excel</Button><Button variant="outline" onClick={() => download('pdf')} disabled={!report}>Export PDF</Button></>} />

      {meta && (
        <Card className="no-print mb-5">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {has('date') && <Field label="Date"><Input type="date" value={p.date ?? ''} onChange={(e) => set({ date: e.target.value })} /></Field>}
            {has('year_month') && (<>
              <Field label="Month"><Select value={p.month} onChange={(e) => set({ month: e.target.value })}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</Select></Field>
              <Field label="Year"><Input type="number" min="2000" max="2200" value={p.year ?? ''} onChange={(e) => set({ year: e.target.value })} /></Field></>)}
            {has('range') && (<><Field label="From"><Input type="date" value={p.start ?? ''} onChange={(e) => set({ start: e.target.value })} /></Field><Field label="To"><Input type="date" value={p.end ?? ''} onChange={(e) => set({ end: e.target.value })} /></Field></>)}
            {has('category') && <Field label="Category"><Select value={p.category_id ?? ''} onChange={(e) => set({ category_id: e.target.value })}><option value="">All</option>{(key === 'expenses' ? expenseCategories : categories).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>}
            {has('vendor') && <Field label="Vendor"><Select value={p.vendor_id ?? ''} onChange={(e) => set({ vendor_id: e.target.value })}><option value="">All</option>{vendors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>}
            {has('location') && <Field label="Location"><Select value={p.location_id ?? ''} onChange={(e) => set({ location_id: e.target.value })}><option value="">All</option>{locations.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>}
            {has('stock_status') && <Field label="Stock"><Select value={p.stock_status ?? ''} onChange={(e) => set({ stock_status: e.target.value })}><option value="">Any</option><option value="in_stock">In stock</option><option value="out_of_stock">Out of stock</option><option value="low_stock">Low stock</option><option value="old_stock">Old stock</option></Select></Field>}
            {has('q') && <Field label="Search"><Input value={p.q ?? ''} onChange={(e) => set({ q: e.target.value })} placeholder="name, SKU…" /></Field>}
            {has('days') && <Field label="Older than"><Select value={p.days ?? '90'} onChange={(e) => set({ days: e.target.value })}>{['30', '60', '90', '180', '365'].map((d) => <option key={d} value={d}>{d} days</option>)}</Select></Field>}
            {has('payment_method') && <Field label="Payment"><Select value={p.payment_method ?? ''} onChange={(e) => set({ payment_method: e.target.value })}><option value="">All</option>{methods.map((m) => <option key={m}>{m}</option>)}</Select></Field>}
            {has('payee') && <Field label="Vendor / Payee"><Input value={p.payee ?? ''} onChange={(e) => set({ payee: e.target.value })} /></Field>}
          </div>
          {has('range') && <div className="mt-3 flex flex-wrap gap-2 text-xs">{[['today', 'Today'], ['month', 'This month'], ['last', 'Last month'], ['30', 'Last 30 days'], ['year', 'This year']].map(([k, l]) => <button key={k} onClick={() => preset(k)} className="rounded-full border border-gold-300 bg-gold-50 px-3 py-1 font-medium text-maroon-800 hover:bg-gold-100">{l}</button>)}</div>}
        </Card>
      )}

      <ErrorBox message={err} onRetry={run} />
      {loading && !report ? <PageLoader text="Building report…" /> : report && (
        <div className="space-y-6">
          {report.summary.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {report.summary.map((s) => <StatCard key={s.label} label={s.label} value={s.type === 'text' ? String(s.value) : cell(s.type, s.value)} sub={s.hint || undefined}
                tone={s.tone === 'good' ? 'good' : s.tone === 'bad' ? 'bad' : 'default'} />)}
            </div>
          )}
          {report.chart && <ReportChart chart={report.chart} />}
          {report.sections.map((sec) => (
            <div key={sec.title}>
              <h2 className="mb-2 font-display text-2xl font-semibold text-maroon-900">{sec.title} <Badge tone="gray">{sec.rows.length}</Badge></h2>
              {sec.rows.length === 0 ? <EmptyState title="No data" hint="Nothing matches the selected period or filters." /> : (
                <TableWrap>
                  <thead><tr>{sec.columns.map((c) => <Th key={c.key} right={['money', 'int', 'percent'].includes(c.type)}>{c.label}</Th>)}</tr></thead>
                  <tbody>
                    {sec.rows.map((r, i) => <Tr key={i}>{sec.columns.map((c) => <Td key={c.key} right={['money', 'int', 'percent'].includes(c.type)}>{cell(c.type, r[c.key])}</Td>)}</Tr>)}
                    {sec.totals && <tr className="bg-gold-100/70 font-semibold">{sec.columns.map((c) => <Td key={c.key} right={['money', 'int', 'percent'].includes(c.type)}>{sec.totals![c.key] !== undefined ? cell(c.type, sec.totals![c.key]) : ''}</Td>)}</tr>}
                  </tbody>
                </TableWrap>)}
            </div>
          ))}
          {report.notes.map((n) => <Notice key={n}>{n}</Notice>)}
        </div>
      )}
      {!loading && !report && !err && <EmptyState title="Choose the filters above" />}
    </div>
  )
}
