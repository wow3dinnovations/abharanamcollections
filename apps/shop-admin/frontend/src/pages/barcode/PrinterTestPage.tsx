import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Label, LabelSheet, printLabelSheet, svgModules, type LabelData, type LabelSize } from '../../components/Label'
import { Badge, Button, Card, ErrorBox, Field, Input, Notice, PageHeader, PageLoader, Select } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { useFetch } from '../../hooks/useFetch'
import { useToast } from '../../hooks/useToast'
import { api, ApiError } from '../../services/api'

interface Cfg {
  business: { name: string; tagline: string }
  inventory: { label_size_id: string; label_sizes: LabelSize[]; barcode_module_mm: number }
  printer: { name: string; model: string; connection: string; rotate: boolean }
}

// widths of the thinnest bar, in mm. 0.125 = 1 dot of a 203 dpi printer, 0.169 = 2 dots of a 300 dpi printer.
const WIDTHS = [0.125, 0.15, 0.169, 0.19, 0.21, 0]

export function PrinterTestPage() {
  const { can } = useAuth()
  const { toast } = useToast()
  const cfg = useFetch(() => api.get<Cfg>('/api/settings'))
  const [code, setCode] = useState('100123')
  const [sizeId, setSizeId] = useState('')
  const [sideways, setSideways] = useState<boolean | null>(null)
  const [svg, setSvg] = useState('')
  const [err, setErr] = useState('')
  const [picked, setPicked] = useState<number[]>(WIDTHS.slice(0, 5))
  const [scans, setScans] = useState<{ text: string; ok: boolean }[]>([])
  const [scan, setScan] = useState('')

  useEffect(() => { if (cfg.data && !sizeId) setSizeId(cfg.data.inventory.label_size_id) }, [cfg.data, sizeId])
  useEffect(() => {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$/.test(code)) { setSvg(''); setErr('Use 2-40 letters/digits (no spaces).'); return }
    let alive = true
    fetch(`/api/barcode/svg/${encodeURIComponent(code)}`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('cannot make barcode'))))
      .then((t) => { if (alive) { setSvg(t); setErr('') } })
      .catch(() => alive && setErr('Could not make the barcode.'))
    return () => { alive = false }
  }, [code])

  const size = cfg.data?.inventory.label_sizes.find((s) => s.id === sizeId) ?? cfg.data?.inventory.label_sizes[0]
  const rotate = sideways ?? cfg.data?.printer.rotate ?? false
  const labels: LabelData[] = useMemo(() => (svg ? [...picked].sort((a, b) => a - b).map((w) => ({
    product_id: `t${w}`, sku: code, barcode: code, name: 'TEST TAG', price: 799, copies: 1, svg, module_mm: w,
    caption: w === 0 ? `${code} auto` : `${code}  ${w.toFixed(3)}mm`,
  })) : []), [svg, picked, code])

  if (cfg.loading && !cfg.data) return <PageLoader />
  if (!cfg.data || !size) return <ErrorBox message={cfg.error || 'Settings could not be loaded'} />
  const modules = svg ? svgModules(svg) : 0
  const tagW = rotate ? size.height_mm : size.width_mm

  const save = async (w: number) => {
    try { await api.put('/api/settings', { inventory: { barcode_module_mm: w } }); toast(w === 0 ? 'Bars will stretch to fit the tag.' : `Saved: thinnest bar ${w} mm. New label prints use it.`); cfg.reload() }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Could not save', 'error') }
  }
  const onScan = (e: FormEvent) => {
    e.preventDefault()
    const t = scan.trim()
    setScan('')
    if (t) setScans((s) => [{ text: t, ok: t === code }, ...s].slice(0, 12))
  }
  const toggle = (w: number) => setPicked(picked.includes(w) ? picked.filter((x) => x !== w) : [...picked, w])

  return (
    <div>
      <PageHeader title="Printer Test & Barcode Calibration" subtitle={`${[cfg.data.printer.name, cfg.data.printer.model, cfg.data.printer.connection].filter(Boolean).join(' · ') || 'Your label printer'} — find the barcode width your printer and scanner read best.`}
        actions={<Link to="/barcode/print"><Button variant="outline">← Print Labels</Button></Link>} />

      <Notice>
        <b>Why this page?</b> A tiny tag can only hold a few bars, and every bar must be a whole number of printer dots. Your printer's dot size decides which width prints cleanly. Print the test tags, <b>scan each one</b>, and keep the thinnest width that scans <b>every time</b>.
      </Notice>

      <div className="mt-5 grid gap-5 xl:grid-cols-5">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Tag size"><Select value={sizeId} onChange={(e) => setSizeId(e.target.value)}>{cfg.data.inventory.label_sizes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
              <Field label="Test barcode number" hint="Any short number"><Input value={code} onChange={(e) => setCode(e.target.value)} /></Field>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" className="accent-maroon-800" checked={rotate} onChange={(e) => setSideways(e.target.checked)} /> Print sideways (turn the tag 90°)</label>
            <div className="mt-4 text-xs font-medium uppercase tracking-wide text-maroon-800/80">Bar widths to test</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {WIDTHS.map((w) => (
                <button key={w} onClick={() => toggle(w)} className={`rounded-full border px-3 py-1 text-xs font-medium ${picked.includes(w) ? 'border-maroon-800 bg-maroon-800 text-white' : 'border-stone-300 bg-white'}`}>{w === 0 ? 'fit to tag' : `${w} mm`}</button>))}
            </div>
            {modules > 0 && <p className="mt-3 text-xs text-ink/60">This barcode is {modules} bar-widths wide. At 0.125 mm it is {(modules * 0.125).toFixed(1)} mm; at 0.169 mm it is {(modules * 0.169).toFixed(1)} mm. The tag is {tagW} mm wide — widths that do not fit are trimmed.</p>}
            <ErrorBox message={err} />
            <Button className="mt-4 w-full" variant="gold" size="lg" disabled={labels.length === 0} onClick={printLabelSheet}>Print {labels.length} test tag{labels.length === 1 ? '' : 's'}</Button>
            <p className="mt-2 text-xs text-ink/50">Print window: your label printer, margins <b>None</b>, scale <b>100%</b>.</p>
          </Card>

          <Card>
            <div className="mb-2 font-display text-xl font-semibold text-maroon-800">Scan test</div>
            <p className="mb-2 text-sm text-ink/70">Click the box and scan a printed test tag. It shows what your scanner read.</p>
            <form onSubmit={onScan}><Input value={scan} onChange={(e) => setScan(e.target.value)} placeholder="Scan a test tag here" autoComplete="off" /></form>
            <ul className="mt-2 space-y-1 text-sm">
              {scans.map((s, i) => <li key={i} className="flex items-center gap-2"><Badge tone={s.ok ? 'green' : 'red'}>{s.ok ? '✓ read correctly' : '✕ wrong'}</Badge><code>{s.text}</code></li>)}
              {scans.length === 0 && <li className="text-ink/40">Nothing scanned yet.</li>}
            </ul>
          </Card>
        </div>

        <div className="space-y-4 xl:col-span-3">
          <Card>
            <div className="mb-3 font-display text-xl font-semibold text-maroon-800">Preview and choose</div>
            <div className="grid gap-4 sm:grid-cols-2">
              {labels.map((l) => (
                <div key={l.product_id} className="rounded-xl border border-gold-200 bg-cream/50 p-3">
                  <div className="mb-2 flex justify-center overflow-x-auto"><div className="w-max shrink-0 overflow-hidden rounded border border-dashed border-stone-400 bg-white shadow" style={{ zoom: size.width_mm < 30 ? 3.2 : 1.6 }}>
                    <Label data={l} size={size} brand={cfg.data!.business.name} tagline={cfg.data!.business.tagline} rotate={rotate} />
                  </div></div>
                  <div className="text-center text-sm font-medium">{l.module_mm === 0 ? 'Fit to tag' : `${l.module_mm} mm`}{cfg.data!.inventory.barcode_module_mm === l.module_mm && <span className="ml-1 text-emerald-700">· in use</span>}</div>
                  {can('admin.settings') && <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => save(l.module_mm ?? 0)}>Use this width</Button>}
                </div>))}
              {labels.length === 0 && <div className="col-span-full py-6 text-center text-sm text-ink/50">Choose at least one width.</div>}
            </div>
          </Card>
          <Notice tone="warn">
            <b>If nothing scans:</b> use a short test number (6–8 digits) — a longer number makes every bar thinner. Make sure the print is dark and sharp (the printer's <i>darkness</i> and <i>speed</i> settings in the Windows driver), that the tag size in the driver matches, and try “Print sideways”. Tell me what you see and I can adjust further.
          </Notice>
        </div>
      </div>
      <LabelSheet labels={labels} size={size} brand={cfg.data.business.name} tagline={cfg.data.business.tagline} active rotate={rotate} />
    </div>
  )
}
