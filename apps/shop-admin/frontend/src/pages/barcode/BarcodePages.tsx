import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Label, LabelSheet, printLabelSheet, type LabelData, type LabelSize } from '../../components/Label'
import { ProductPicker, type ProductLite } from '../../components/ProductPicker'
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Notice, PageHeader, PageLoader, Pagination, Select, TableWrap, Td, Th, Tr } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { useFetch } from '../../hooks/useFetch'
import { useToast } from '../../hooks/useToast'
import { api, ApiError } from '../../services/api'
import type { Paged } from '../../types'
import { fmtDateTime, money } from '../../utils/format'

/* ---------------------------------------------------------------- Barcode search (scanner friendly) */
export function BarcodeSearchPage() {
  const { can } = useAuth()
  const [code, setCode] = useState('')
  const [product, setProduct] = useState<(ProductLite & { age_days: number; age_bucket: string; vendor_name?: string; rack?: string }) | null>(null)
  const [err, setErr] = useState('')
  const [recent, setRecent] = useState<string[]>([])
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])

  const search = async (e: FormEvent) => {
    e.preventDefault()
    const c = code.trim()
    if (!c) return
    setErr('')
    try {
      const p = await api.get<typeof product>('/api/products/lookup', { code: c })
      setProduct(p); setRecent((r) => [c.toUpperCase(), ...r.filter((x) => x !== c.toUpperCase())].slice(0, 6))
    } catch (e2) { setProduct(null); setErr(e2 instanceof ApiError ? e2.message : 'Lookup failed') }
    setCode(''); ref.current?.focus()
  }

  return (
    <div>
      <PageHeader title="Barcode Search" subtitle="Scan a tag with your barcode scanner (or type the code) and press Enter." />
      <form onSubmit={search} className="mb-5 max-w-2xl">
        <div className="flex gap-2">
          <Input ref={ref} value={code} onChange={(e) => setCode(e.target.value)} placeholder="SCAN BARCODE  ▮▯▮▮▯▮" className="!py-4 !text-lg" autoComplete="off" />
          <Button type="submit" size="lg">Find</Button>
        </div>
      </form>
      {err && <div className="mb-4 max-w-2xl"><ErrorBox message={err} /></div>}
      {product ? (
        <Card className="max-w-3xl">
          <div className="flex flex-col gap-5 sm:flex-row">
            <div className="flex h-40 w-40 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-cream">{product.image_url ? <img src={product.image_url} alt="" className="h-full w-full object-cover" /> : <span className="text-4xl text-gold-400">◇</span>}</div>
            <div className="flex-1">
              <div className="font-display text-3xl font-semibold text-maroon-900">{product.name}</div>
              <div className="text-sm text-ink/60">{product.sku} · {product.category_name}</div>
              <div className="mt-2 font-sans text-4xl font-semibold text-gold-700">{money(product.selling_price)}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone={product.current_quantity === 0 ? 'red' : 'green'}>{product.current_quantity} in stock</Badge>
                <Badge tone="gray">{product.age_days} days old</Badge>
                {product.stock_by_location.map((s) => <Badge key={s.location_id} tone="gold">{s.location_name}: {s.quantity}</Badge>)}
              </div>
              <div className="mt-4 flex gap-2">
                <Link to={`/inventory/products/${product.id}`}><Button variant="outline" size="sm">View product</Button></Link>
                {can('barcode.print', 'barcode.reprint') && <Link to={`/barcode/print?product=${product.id}`}><Button variant="gold" size="sm">Print label</Button></Link>}
              </div>
            </div>
          </div>
        </Card>
      ) : !err && <EmptyState title="Ready to scan" hint="The cursor is in the box above - just scan a jewellery tag." />}
      {recent.length > 0 && <div className="mt-5 text-sm text-ink/60">Recent: {recent.map((r) => <button key={r} className="mr-2 rounded bg-gold-100 px-2 py-0.5 text-xs text-maroon-800" onClick={() => setCode(r)}>{r}</button>)}</div>}
    </div>
  )
}

/* ---------------------------------------------------------------- Print labels */
interface Line { product: ProductLite; copies: string }
interface LabelResp { labels: LabelData[]; total_labels: number; business_name: string; label_sizes: LabelSize[]; default_label_size_id: string; module_mm: number; rotate: boolean }
interface Job { id: string; items: { product_id: string; copies: number }[] }

export function PrintLabelsPage() {
  const [params] = useSearchParams()
  const { toast } = useToast()
  const { can } = useAuth()
  const [lines, setLines] = useState<Line[]>([])
  const [sizeId, setSizeId] = useState('')
  const [data, setData] = useState<LabelResp | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sideways, setSideways] = useState<boolean | null>(null)
  const settings = useFetch(() => api.get<{ inventory: { label_size_id: string; label_sizes: LabelSize[] }; business: { name: string; tagline: string }; printer: { copies: number } }>('/api/settings'))
  const reprintOf = params.get('job') || ''

  useEffect(() => {
    if (settings.data && !sizeId) setSizeId(settings.data.inventory.label_size_id)
  }, [settings.data, sizeId])

  useEffect(() => {
    const pid = params.get('product'); const jobId = params.get('job')
    if (pid) api.get<ProductLite>(`/api/products/${pid}`).then((p) => setLines([{ product: p, copies: String(Math.max(p.current_quantity, 1)) }])).catch(() => {})
    if (jobId) api.get<Job>(`/api/barcode/print-jobs/${jobId}`).then(async (j) => {
      const ps = await Promise.all(j.items.map((i) => api.get<ProductLite>(`/api/products/${i.product_id}`).then((p) => ({ product: p, copies: String(i.copies) })).catch(() => null)))
      setLines(ps.filter(Boolean) as Line[])
    }).catch(() => {})
  }, [params])

  const sizes = settings.data?.inventory.label_sizes ?? []
  const size = sizes.find((s) => s.id === sizeId) ?? sizes[0]

  // refresh label data (barcode pictures) whenever the list changes
  useEffect(() => {
    if (lines.length === 0) { setData(null); return }
    const items = lines.map((l) => ({ product_id: l.product.id, copies: Math.min(Math.max(Number(l.copies) || 1, 1), 500) }))
    api.post<LabelResp>('/api/barcode/labels', { items }).then((r) => { setData(r); setErr('') }).catch((e) => setErr(e instanceof ApiError ? e.message : 'Cannot prepare labels'))
  }, [lines])

  if (settings.loading && !settings.data) return <PageLoader />
  if (!size) return <ErrorBox message={settings.error || 'Label sizes are not configured.'} />
  const total = lines.reduce((s, l) => s + (Math.min(Math.max(Number(l.copies) || 1, 1), 500)), 0)

  const add = (p: ProductLite) => {
    if (lines.some((l) => l.product.id === p.id)) return toast('Already in the list.', 'info')
    setLines([...lines, { product: p, copies: String(Math.max(p.current_quantity, 1)) }])
  }

  const print = async () => {
    if (!data) return
    setBusy(true)
    try {
      await api.post('/api/barcode/print-jobs', { items: data.labels.map((l) => ({ product_id: l.product_id, copies: l.copies })), label_size_id: size.id, reprint_of: reprintOf })
      printLabelSheet()
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Could not start printing', 'error') } finally { setBusy(false) }
  }

  const brand = data?.business_name ?? settings.data?.business.name ?? ''
  const rotate = sideways ?? data?.rotate ?? false
  const moduleMm = data?.module_mm ?? 0
  return (
    <div>
      <PageHeader title="Print Labels" subtitle="Choose products and how many tags to print. Labels print at the real size through your printer." />
      <div className="grid gap-5 xl:grid-cols-5">
        <div className="space-y-4 xl:col-span-3">
          <Card>
            <div className="mb-3 grid gap-3 md:grid-cols-2">
              <Field label="Label size"><Select value={size.id} onChange={(e) => setSizeId(e.target.value)}>{sizes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
              <div className="flex flex-col justify-end gap-1 text-sm text-ink/60"><span>Size: {size.width_mm} × {size.height_mm} mm (change sizes in Settings)</span>
                <label className="flex items-center gap-2 text-ink"><input type="checkbox" className="accent-maroon-800" checked={rotate} onChange={(e) => setSideways(e.target.checked)} /> Print sideways (turn the tag 90°)</label>
                <Link to="/barcode/test" className="font-medium text-maroon-800 underline">Printer test &amp; barcode calibration →</Link></div>
            </div>
            <ProductPicker onPick={add} placeholder="Search product to add…" />
          </Card>
          {lines.length === 0 ? <EmptyState title="No products chosen" hint="Search above, or open a product and press “Print label”." /> : (
            <TableWrap><thead><tr><Th>Product</Th><Th right>Price</Th><Th right>In stock</Th><Th right>Labels</Th><Th></Th></tr></thead><tbody>
              {lines.map((l, i) => (
                <Tr key={l.product.id}><Td><b>{l.product.name}</b><div className="text-xs text-ink/50">{l.product.sku}</div></Td><Td right>{money(l.product.selling_price)}</Td><Td right>{l.product.current_quantity}</Td>
                  <Td right><Input type="number" min="1" max="500" className="w-24 text-right" value={l.copies} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, copies: e.target.value } : x))} /></Td>
                  <Td right><Button size="sm" variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove</Button></Td></Tr>))}
              <Tr><Td colSpan={3} right><b>Total labels</b></Td><Td right><b>{total}</b></Td><Td></Td></Tr>
            </tbody></TableWrap>
          )}
          <ErrorBox message={err} />
          {(can('barcode.print') || (reprintOf && can('barcode.reprint'))) && (
            <div className="flex items-center gap-3"><Button variant="gold" size="lg" loading={busy} disabled={!data || lines.length === 0} onClick={print}>Print {total} label{total === 1 ? '' : 's'}</Button>
              <span className="text-xs text-ink/50">In the print window choose your label printer and set margins to “None”.</span></div>
          )}
        </div>
        <div className="xl:col-span-2">
          <Card>
            <div className="mb-3 font-display text-xl font-semibold text-maroon-800">Preview</div>
            {data && data.labels.length > 0 ? (
              <div className="space-y-4">
                {data.labels.map((l) => (
                  <div key={l.product_id}>
                    <div className="mb-1 text-xs text-ink/50">{l.copies} × {l.name}</div>
                    <div className="inline-block overflow-hidden rounded-md border border-dashed border-stone-400 bg-white shadow-md" style={{ zoom: 1.7 }}>
                      <Label data={l} size={size} brand={brand} tagline={settings.data?.business.tagline} rotate={rotate} moduleMm={moduleMm} />
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="py-8 text-center text-sm text-ink/50">The label preview appears here.</div>}
          </Card>
          <div className="mt-3"><Notice>Tail tags and printers differ. If the print position is off, tell your developer the printer model and tag size - direct printer settings can be added.</Notice></div>
        </div>
      </div>
      {data && <LabelSheet labels={data.labels} size={size} brand={brand} tagline={settings.data?.business.tagline} active rotate={rotate} moduleMm={moduleMm} />}
    </div>
  )
}

/* ---------------------------------------------------------------- Print history */
interface PJob { id: string; date_time: string; label_size: string; total_labels: number; username: string; reprint_of: string; items: { name: string; sku: string; copies: number }[] }

export function PrintHistoryPage() {
  const { can } = useAuth()
  const nav = useNavigate()
  const [page, setPage] = useState(1)
  const { data, loading, error, reload } = useFetch(() => api.get<Paged<PJob>>('/api/barcode/print-jobs', { page, page_size: 20 }), [page])
  return (
    <div>
      <PageHeader title="Print History" subtitle="Every label print request. Use Reprint to print the same tags again." />
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <PageLoader /> : data && data.items.length === 0 ? <EmptyState title="No labels printed yet" /> : data && (
        <>
          <TableWrap><thead><tr><Th>Date</Th><Th>Job</Th><Th>Products</Th><Th right>Labels</Th><Th>Size</Th><Th>By</Th><Th></Th></tr></thead><tbody>
            {data.items.map((j) => (
              <Tr key={j.id}><Td>{fmtDateTime(j.date_time)}</Td><Td>{j.id}{j.reprint_of && <div className="text-xs text-ink/50">reprint of {j.reprint_of}</div>}</Td>
                <Td>{j.items.map((i) => `${i.name} × ${i.copies}`).join(', ')}</Td><Td right>{j.total_labels}</Td><Td>{j.label_size}</Td><Td>{j.username}</Td>
                <Td right>{can('barcode.reprint') && <Button size="sm" variant="outline" onClick={() => nav(`/barcode/print?job=${j.id}`)}>Reprint</Button>}</Td></Tr>))}
          </tbody></TableWrap>
          <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        </>
      )}
    </div>
  )
}
