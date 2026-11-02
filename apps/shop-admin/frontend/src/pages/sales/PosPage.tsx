import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ProductPicker, type ProductLite } from '../../components/ProductPicker'
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, PageHeader, PageLoader, Select, Tabs } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { useFetch } from '../../hooks/useFetch'
import { useLookups } from '../../hooks/useLookups'
import { api, ApiError, fileUrl } from '../../services/api'
import type { AppSettings } from '../../types'
import { money } from '../../utils/format'

interface CartLine { product: ProductLite; quantity: number }
interface Customer { id: string; name: string; mobile: string }
interface SaleResult { id: string; invoice_number: string; total: number; payment_method: string; discount_amount: number; item_count: number }

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

function beep(ok: boolean) {
  try {
    const ctxA = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const o = ctxA.createOscillator(); const g = ctxA.createGain()
    o.frequency.value = ok ? 1100 : 220; o.type = ok ? 'sine' : 'square'; g.gain.value = 0.06
    o.connect(g); g.connect(ctxA.destination); o.start(); o.stop(ctxA.currentTime + (ok ? 0.08 : 0.28))
  } catch { /* sound is optional */ }
}

export function PosPage() {
  const { can, user } = useAuth()
  const { locations } = useLookups()
  const settings = useFetch(() => api.get<AppSettings>('/api/settings'))
  const [locationId, setLocationId] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [scan, setScan] = useState('')
  const [scanMsg, setScanMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [dtype, setDtype] = useState<'percent' | 'amount'>('percent')
  const [dvalue, setDvalue] = useState('')
  const [method, setMethod] = useState('')
  const [reference, setReference] = useState('')
  const [split, setSplit] = useState(false)
  const [splitRows, setSplitRows] = useState<{ method: string; amount: string; reference: string }[]>([])
  const [custTab, setCustTab] = useState<'walkin' | 'find' | 'new'>('walkin')
  const [custQ, setCustQ] = useState('')
  const [custResults, setCustResults] = useState<Customer[]>([])
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [newCust, setNewCust] = useState({ name: '', mobile: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<SaleResult | null>(null)
  const scanRef = useRef<HTMLInputElement>(null)

  const cfg = settings.data
  const activeLocs = locations.filter((l) => l.active)
  useEffect(() => { if (cfg && !method) setMethod(cfg.billing.default_payment_method) }, [cfg, method])
  useEffect(() => { scanRef.current?.focus() }, [done, cart.length])

  // '' = All locations: stock is the total. A chosen location narrows it to that place only.
  const availIn = (p: ProductLite, loc: string) => (loc ? p.stock_by_location.find((s) => s.location_id === loc)?.quantity ?? 0 : p.current_quantity)
  const stockHere = useCallback((p: ProductLite) => availIn(p, locationId), [locationId])
  const whereText = locationId ? 'at this location' : 'in total'
  // Same rule the server uses: take from the location with the MOST stock first, then the next (ties: by name).
  const takesFrom = (p: ProductLite, qty: number, loc = locationId): string => {
    const rows = p.stock_by_location.filter((s) => s.quantity > 0 && (!loc || s.location_id === loc))
      .sort((a, b) => b.quantity - a.quantity || a.location_name.localeCompare(b.location_name))
    const out: string[] = []
    let need = qty
    for (const r of rows) { if (need <= 0) break; const t = Math.min(r.quantity, need); out.push(`${r.location_name} ${t}`); need -= t }
    return out.join(' · ')
  }

  const changeLocation = (next: string) => {
    setLocationId(next)
    if (!next) return                                         // All locations: every line stays valid
    // narrowing to one location: keep what is available there, drop what is not
    let changed = false
    const kept = cartRef.current.flatMap((l) => {
      const avail = availIn(l.product, next)
      if (avail <= 0) { changed = true; return [] }
      if (l.quantity > avail) { changed = true; return [{ ...l, quantity: avail }] }
      return [l]
    })
    setCart(kept)
    if (changed) say('err', 'Some items are not available at that location, so the bill was adjusted.')
  }

  const say = (tone: 'ok' | 'err', text: string) => { setScanMsg({ tone, text }); beep(tone === 'ok') }

  const cartRef = useRef<CartLine[]>([])
  cartRef.current = cart

  const addProduct = useCallback((p: ProductLite) => {
    if (p.status && p.status !== 'active') return say('err', `${p.name} is inactive and cannot be sold.`)
    const avail = stockHere(p)
    const cur = cartRef.current
    const ex = cur.find((l) => l.product.id === p.id)
    const want = (ex?.quantity ?? 0) + 1
    if (avail <= 0) return say('err', locationId && p.current_quantity > 0 ? `${p.name}: none at this location (${p.current_quantity} at other locations).` : `${p.name} is OUT OF STOCK.`)
    if (want > avail) return say('err', `${p.name}: only ${avail} available ${whereText}.`)
    say('ok', ex ? `${p.name} × ${want}` : `Added ${p.name}`)
    setCart(ex ? cur.map((l) => (l.product.id === p.id ? { ...l, quantity: want } : l)) : [...cur, { product: p, quantity: 1 }])
  }, [stockHere])

  const onScan = async (e: FormEvent) => {
    e.preventDefault()
    const code = scan.trim()
    setScan('')
    if (!code) return
    try { addProduct(await api.get<ProductLite>('/api/products/lookup', { code })) }
    catch (x) { say('err', x instanceof ApiError ? x.message : 'Lookup failed') }
    scanRef.current?.focus()
  }

  // ---- totals (server recalculates everything; this is only the live preview)
  const calc = useMemo(() => {
    const gross = cart.map((l) => r2(l.product.selling_price * l.quantity))
    const subtotal = r2(gross.reduce((a, b) => a + b, 0))
    const v = Number(dvalue) || 0
    let discount = dtype === 'percent' ? r2((subtotal * v) / 100) : r2(v)
    const invalid = v < 0 || (dtype === 'percent' && v > 100) || discount > subtotal
    if (invalid) discount = 0
    const shares: number[] = []
    let run = 0
    gross.forEach((g, i) => { const s = i === gross.length - 1 ? r2(discount - run) : r2((discount * g) / (subtotal || 1)); shares.push(s); run = r2(run + s) })
    const net = r2(subtotal - discount)
    const rate = cfg?.billing.tax_enabled ? cfg.billing.tax_rate : 0
    let tax = 0; let total = net
    if (rate > 0) { if (cfg?.billing.tax_mode === 'inclusive') tax = r2((net * rate) / (100 + rate)); else { tax = r2((net * rate) / 100); total = r2(net + tax) } }
    return { gross, shares, subtotal, discount, net, tax, total, invalid, pieces: cart.reduce((a, l) => a + l.quantity, 0) }
  }, [cart, dtype, dvalue, cfg])

  const canDiscount = can('sales.discount')
  const paid = split ? r2(splitRows.reduce((a, r) => a + (Number(r.amount) || 0), 0)) : calc.total
  const setQty = (id: string, q: number) => setCart((c) => c.map((l) => {
    if (l.product.id !== id) return l
    const avail = stockHere(l.product)
    if (q > avail) { say('err', `Only ${avail} of ${l.product.name} available ${whereText}.`); return { ...l, quantity: avail } }
    return { ...l, quantity: Math.max(q, 1) }
  }))

  useEffect(() => {
    if (custTab !== 'find' || custQ.trim().length < 2) { setCustResults([]); return }
    const t = setTimeout(() => api.get<{ items: Customer[] }>('/api/customers', { q: custQ, page_size: 6 }).then((r) => setCustResults(r.items)).catch(() => setCustResults([])), 250)
    return () => clearTimeout(t)
  }, [custQ, custTab])

  const reset = () => { setCart([]); setDvalue(''); setReference(''); setCustomer(null); setCustTab('walkin'); setNewCust({ name: '', mobile: '' }); setSplit(false); setSplitRows([]); setErr(''); setScanMsg(null) }

  const save = async () => {
    setBusy(true); setErr('')
    try {
      const payments = split ? splitRows.filter((r) => Number(r.amount) > 0).map((r) => ({ method: r.method, amount: Number(r.amount), reference: r.reference })) : undefined
      const body = {
        location_id: locationId, items: cart.map((l) => ({ product_id: l.product.id, quantity: l.quantity })),
        discount_type: calc.discount > 0 ? dtype : null, discount_value: calc.discount > 0 ? Number(dvalue) : 0,
        payment_method: split ? '' : method, payments: payments ?? (calc.total > 0 ? [{ method, amount: calc.total, reference }] : []),
        customer_id: customer?.id ?? '', customer: custTab === 'new' && (newCust.name || newCust.mobile) ? newCust : undefined,
      }
      const sale = await api.post<SaleResult>('/api/sales', body)
      setDone(sale); reset()
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not save the sale.') } finally { setBusy(false) }
  }

  if (settings.loading && !cfg) return <PageLoader />
  if (!cfg) return <ErrorBox message={settings.error || 'Settings could not be loaded'} />

  const printInvoice = (id: string) => { api.post(`/api/sales/${id}/reprint`).catch(() => {}); window.open(fileUrl(`/api/sales/${id}/invoice.pdf`), '_blank') }

  return (
    <div>
      <PageHeader title="New Bill" subtitle={`Cashier: ${user?.full_name}`}
        actions={<div className="flex items-center gap-2"><span className="text-sm text-ink/60">Location filter</span>
          <Select className="!w-52" value={locationId} onChange={(e) => changeLocation(e.target.value)}>
            <option value="">All locations</option>{activeLocs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></div>} />
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card className="border-2 !border-gold-400">
            <form onSubmit={onScan}>
              <label className="mb-1 block font-display text-lg font-semibold text-maroon-900">SCAN BARCODE</label>
              <div className="flex gap-2">
                <Input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)} placeholder="Scan the tag now  ▮▯▮▮▯▮▯▮" autoComplete="off" autoFocus className="!py-4 !text-xl tracking-wider" />
                <Button type="submit" size="lg">Add</Button>
              </div>
            </form>
            {scanMsg && <div className={`mt-2 rounded-lg px-3 py-2 text-sm font-medium ${scanMsg.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`} role="status">{scanMsg.text}</div>}
            <div className="mt-3"><ProductPicker sellableOnly onPick={addProduct} placeholder="…or search by name / design number and pick" clearOnPick /></div>
          </Card>

          <div className="overflow-x-auto rounded-xl border border-gold-200/70 bg-white shadow-luxe">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead><tr className="bg-maroon-900 text-xs uppercase tracking-wider text-gold-100"><th className="px-3 py-3">Product</th><th className="px-3 py-3">SKU</th><th className="px-3 py-3 text-center">Qty</th><th className="px-3 py-3 text-right">Rate</th><th className="px-3 py-3 text-right">Discount</th><th className="px-3 py-3 text-right">Amount</th><th /></tr></thead>
              <tbody>
                {cart.length === 0 && <tr><td colSpan={7} className="px-4 py-14 text-center text-ink/50">The bill is empty. Scan a barcode to begin.</td></tr>}
                {cart.map((l, i) => (
                  <tr key={l.product.id} className="border-b border-stone-100">
                    <td className="px-3 py-2"><div className="flex items-center gap-2">{l.product.image_url ? <img src={l.product.image_url} className="h-10 w-10 rounded object-cover" alt="" /> : <div className="flex h-10 w-10 items-center justify-center rounded bg-gold-100 text-gold-600">◇</div>}<div><div className="font-medium">{l.product.name}</div><div className="text-[11px] text-ink/50">From: {takesFrom(l.product, l.quantity)}</div></div></div></td>
                    <td className="px-3 py-2 text-xs text-ink/60">{l.product.sku}</td>
                    <td className="px-3 py-2"><div className="flex items-center justify-center gap-1">
                      <button className="h-8 w-8 rounded-lg border border-stone-300 text-lg hover:bg-stone-50" onClick={() => setQty(l.product.id, l.quantity - 1)} disabled={l.quantity <= 1}>−</button>
                      <input className="h-8 w-14 rounded-lg border border-stone-300 text-center" type="number" min={1} value={l.quantity} onChange={(e) => setQty(l.product.id, Math.floor(Number(e.target.value) || 1))} />
                      <button className="h-8 w-8 rounded-lg border border-stone-300 text-lg hover:bg-stone-50" onClick={() => setQty(l.product.id, l.quantity + 1)}>+</button></div>
                      <div className="text-center text-[11px] text-ink/40">{stockHere(l.product)} {locationId ? 'at this location' : 'in stock'}</div></td>
                    <td className="px-3 py-2 text-right tabular">{money(l.product.selling_price)}</td>
                    <td className="px-3 py-2 text-right tabular text-red-700">{calc.shares[i] ? `-${money(calc.shares[i])}` : '—'}</td>
                    <td className="px-3 py-2 text-right font-medium tabular">{money(r2(calc.gross[i] - (calc.shares[i] || 0)))}</td>
                    <td className="px-3 py-2 text-right"><button className="text-xl text-red-600" title="Remove" onClick={() => setCart(cart.filter((x) => x.product.id !== l.product.id))}>×</button></td>
                  </tr>))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <div className="mb-2 flex items-center justify-between"><h2 className="font-display text-xl font-semibold text-maroon-800">Customer</h2>{customer && <Button size="sm" variant="ghost" onClick={() => setCustomer(null)}>Clear</Button>}</div>
            {customer ? <div className="rounded-lg bg-gold-50 px-3 py-2 text-sm"><b>{customer.name}</b> <span className="text-ink/60">{customer.mobile}</span></div> : (
              <>
                <Tabs<'walkin' | 'find' | 'new'> value={custTab} onChange={setCustTab} tabs={[{ id: 'walkin', label: 'Walk-in' }, { id: 'find', label: 'Find' }, { id: 'new', label: 'New' }]} />
                {custTab === 'walkin' && <div className="text-sm text-ink/60">Walk-in customer (no details needed).</div>}
                {custTab === 'find' && (<div><Input placeholder="Name or mobile…" value={custQ} onChange={(e) => setCustQ(e.target.value)} />
                  {custResults.map((c) => <button key={c.id} className="mt-1 flex w-full justify-between rounded-lg border border-stone-200 px-3 py-2 text-left text-sm hover:bg-gold-50" onClick={() => { setCustomer(c); setCustTab('walkin') }}><span>{c.name}</span><span className="text-ink/50">{c.mobile}</span></button>)}</div>)}
                {custTab === 'new' && <div className="grid gap-2"><Input placeholder="Customer name" value={newCust.name} onChange={(e) => setNewCust({ ...newCust, name: e.target.value })} /><Input placeholder="Mobile (optional)" value={newCust.mobile} onChange={(e) => setNewCust({ ...newCust, mobile: e.target.value })} /></div>}
              </>)}
          </Card>

          <Card>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-ink/60">Items</span><span>{calc.pieces} pcs</span></div>
              <div className="flex justify-between"><span className="text-ink/60">Subtotal</span><span className="tabular">{money(calc.subtotal)}</span></div>
              {canDiscount ? (
                <div className="rounded-xl bg-cream p-3">
                  <div className="mb-2 flex items-center gap-2"><span className="text-xs font-medium uppercase text-maroon-800/80">Discount</span>
                    <div className="ml-auto flex overflow-hidden rounded-lg border border-stone-300 text-xs">
                      <button className={`px-3 py-1 ${dtype === 'percent' ? 'bg-maroon-800 text-white' : 'bg-white'}`} onClick={() => setDtype('percent')}>%</button>
                      <button className={`px-3 py-1 ${dtype === 'amount' ? 'bg-maroon-800 text-white' : 'bg-white'}`} onClick={() => setDtype('amount')}>₹</button></div></div>
                  <Input type="number" min="0" placeholder={dtype === 'percent' ? 'e.g. 10' : 'e.g. 150'} value={dvalue} onChange={(e) => setDvalue(e.target.value)} />
                  {calc.invalid && <div className="mt-1 text-xs text-red-700">Discount cannot be negative or more than the bill.</div>}
                </div>) : <div className="text-xs text-ink/40">Discounts are not enabled for your login.</div>}
              {calc.discount > 0 && <div className="flex justify-between text-red-700"><span>Discount{dtype === 'percent' ? ` (${dvalue}%)` : ''}</span><span className="tabular">- {money(calc.discount)}</span></div>}
              {calc.tax > 0 && <div className="flex justify-between"><span className="text-ink/60">{cfg.billing.tax_label} {cfg.billing.tax_mode === 'inclusive' ? '(included)' : ''}</span><span className="tabular">{money(calc.tax)}</span></div>}
              <div className="gold-rule my-1" />
              <div className="flex items-end justify-between"><span className="font-display text-xl text-maroon-900">Final Amount</span><span className="font-sans text-4xl font-bold text-maroon-900 tabular">{money(calc.total)}</span></div>
            </div>
          </Card>

          <Card>
            <div className="mb-2 flex items-center justify-between"><h2 className="font-display text-xl font-semibold text-maroon-800">Payment</h2>
              <label className="flex items-center gap-1.5 text-xs text-ink/70"><input type="checkbox" className="accent-maroon-800" checked={split} onChange={(e) => { setSplit(e.target.checked); setSplitRows([{ method: cfg.billing.payment_methods[0], amount: String(calc.total), reference: '' }]) }} /> Split payment</label></div>
            {!split ? (
              <>
                <div className="flex flex-wrap gap-2">{cfg.billing.payment_methods.map((m) => <button key={m} onClick={() => setMethod(m)} className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${method === m ? 'border-maroon-800 bg-maroon-800 text-white' : 'border-stone-300 bg-white hover:bg-gold-50'}`}>{m}</button>)}</div>
                {method !== 'Cash' && <div className="mt-3"><Field label="Reference (optional)"><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UPI / card ref" /></Field></div>}
              </>
            ) : (
              <div className="space-y-2">
                {splitRows.map((r, i) => (
                  <div key={i} className="grid grid-cols-5 gap-1"><Select className="col-span-2" value={r.method} onChange={(e) => setSplitRows(splitRows.map((x, j) => j === i ? { ...x, method: e.target.value } : x))}>{cfg.billing.payment_methods.map((m) => <option key={m}>{m}</option>)}</Select>
                    <Input className="col-span-2" type="number" min="0" value={r.amount} onChange={(e) => setSplitRows(splitRows.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
                    <Button variant="ghost" size="sm" onClick={() => setSplitRows(splitRows.filter((_, j) => j !== i))}>×</Button></div>))}
                <Button size="sm" variant="outline" onClick={() => setSplitRows([...splitRows, { method: cfg.billing.payment_methods[0], amount: String(r2(Math.max(calc.total - paid, 0))), reference: '' }])}>+ Add payment</Button>
                <div className={`text-sm ${paid === calc.total ? 'text-emerald-700' : 'text-red-700'}`}>Paid {money(paid)} of {money(calc.total)}</div>
              </div>)}
          </Card>

          <ErrorBox message={err} />
          <Button variant="gold" size="lg" className="w-full !py-4 !text-lg" loading={busy} disabled={cart.length === 0 || calc.invalid || (split && paid !== calc.total) || !can('sales.create')} onClick={save}>
            Save Sale &amp; Generate Bill — {money(calc.total)}
          </Button>
          {cart.length > 0 && <Button variant="ghost" className="w-full" onClick={reset}>Clear bill</Button>}
        </div>
      </div>

      {done && (
        <Modal title="Sale completed" size="sm" onClose={() => setDone(null)}
          footer={<><Button variant="outline" onClick={() => setDone(null)}>New bill</Button>{can('billing.generate', 'billing.reprint') && <Button variant="gold" onClick={() => printInvoice(done.id)}>Print invoice</Button>}</>}>
          <div className="text-center"><div className="text-5xl text-emerald-600">✓</div>
            <div className="mt-2 font-display text-3xl font-semibold text-maroon-900">{money(done.total)}</div>
            <div className="mt-1 text-sm text-ink/60">Invoice <b>{done.invoice_number}</b> · {done.item_count} pieces · <Badge tone="gold">{done.payment_method}</Badge></div>
            <div className="mt-2 text-xs text-ink/50">Stock has been reduced and the bill is saved.</div></div>
        </Modal>)}
    </div>
  )
}
