import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ProductPicker, type ProductLite } from '../../components/ProductPicker'
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, PageHeader, PageLoader, Select } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { useFetch } from '../../hooks/useFetch'
import { api, ApiError, fileUrl } from '../../services/api'
import type { AppSettings } from '../../types'
import { fmtDate, money } from '../../utils/format'

interface CartLine { product: ProductLite; quantity: number }
interface Customer { id: string; name: string; mobile: string; email?: string; address?: string; bill_count?: number; total_spent?: number; last_purchase?: string }
interface PastBill { id: string; invoice_number: string; date_time: string; total: number; discount_amount: number; status: string; payment_method: string; item_count: number; items: { name: string; sku: string; quantity: number; line_total: number }[] }
interface Lookup { found: boolean; mobile: string; customer?: Customer; bills?: PastBill[] }
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
  const settings = useFetch(() => api.get<AppSettings>('/api/settings'))
  const [cart, setCart] = useState<CartLine[]>([])
  const [scan, setScan] = useState('')
  const [scanMsg, setScanMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [dtype, setDtype] = useState<'percent' | 'amount'>('percent')
  const [dvalue, setDvalue] = useState('')
  const [method, setMethod] = useState('')
  const [reference, setReference] = useState('')
  const [split, setSplit] = useState(false)
  const [splitRows, setSplitRows] = useState<{ method: string; amount: string; reference: string }[]>([])
  const emptyCust = { mobile: '', name: '', email: '', address: '' }
  const [cust, setCust] = useState(emptyCust)                 // what is typed in Customer details
  const [lookup, setLookup] = useState<Lookup | null>(null)   // existing customer found by mobile number
  const [looking, setLooking] = useState(false)
  const [openBill, setOpenBill] = useState('')
  const [byName, setByName] = useState(false)
  const [custQ, setCustQ] = useState('')
  const [custResults, setCustResults] = useState<Customer[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<SaleResult | null>(null)
  const scanRef = useRef<HTMLInputElement>(null)

  const cfg = settings.data
  useEffect(() => { if (cfg && !method) setMethod(cfg.billing.default_payment_method) }, [cfg, method])
  useEffect(() => { scanRef.current?.focus() }, [done, cart.length])

  // A bill sells from all locations: available stock is the total.
  const stockHere = (p: ProductLite) => p.current_quantity
  const say = (tone: 'ok' | 'err', text: string) => { setScanMsg({ tone, text }); beep(tone === 'ok') }

  const cartRef = useRef<CartLine[]>([])
  cartRef.current = cart

  const addProduct = useCallback((p: ProductLite) => {
    if (p.status && p.status !== 'active') return say('err', `${p.name} is inactive and cannot be sold.`)
    const avail = stockHere(p)
    const cur = cartRef.current
    const ex = cur.find((l) => l.product.id === p.id)
    const want = (ex?.quantity ?? 0) + 1
    if (avail <= 0) return say('err', `${p.name} is OUT OF STOCK.`)
    if (want > avail) return say('err', `${p.name}: only ${avail} available.`)
    say('ok', ex ? `${p.name} × ${want}` : `Added ${p.name}`)
    setCart(ex ? cur.map((l) => (l.product.id === p.id ? { ...l, quantity: want } : l)) : [...cur, { product: p, quantity: 1 }])
  }, [])

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
    if (q > avail) { say('err', `Only ${avail} of ${l.product.name} available.`); return { ...l, quantity: avail } }
    return { ...l, quantity: Math.max(q, 1) }
  }))

  // Typing a mobile number looks up the customer and their past bills.
  const digits = cust.mobile.replace(/[\s\-+()]/g, '')
  useEffect(() => {
    setLookup(null); setOpenBill('')
    if (!/^\d{7,15}$/.test(digits)) { setLooking(false); return }
    setLooking(true)
    let live = true
    const t = setTimeout(() => api.get<Lookup>('/api/customers/lookup', { mobile: digits })
      .then((r) => { if (live) setLookup(r) }).catch(() => { if (live) setLookup(null) }).finally(() => { if (live) setLooking(false) }), 300)
    return () => { live = false; clearTimeout(t) }
  }, [digits])
  const customer = lookup?.found ? lookup.customer ?? null : null

  useEffect(() => {
    if (!byName || custQ.trim().length < 2) { setCustResults([]); return }
    const t = setTimeout(() => api.get<{ items: Customer[] }>('/api/customers', { q: custQ, page_size: 6 }).then((r) => setCustResults(r.items)).catch(() => setCustResults([])), 250)
    return () => clearTimeout(t)
  }, [custQ, byName])
  const pickByName = (c: Customer) => { setByName(false); setCustQ(''); setCust({ ...emptyCust, mobile: c.mobile }) }

  const reset = () => { setCart([]); setDvalue(''); setReference(''); setCust(emptyCust); setLookup(null); setByName(false); setCustQ(''); setSplit(false); setSplitRows([]); setErr(''); setScanMsg(null) }
  const newCustomer = !customer && (cust.name.trim() || digits) ? { name: cust.name.trim(), mobile: digits, email: cust.email.trim(), address: cust.address.trim() } : undefined

  const save = async () => {
    setBusy(true); setErr('')
    try {
      const payments = split ? splitRows.filter((r) => Number(r.amount) > 0).map((r) => ({ method: r.method, amount: Number(r.amount), reference: r.reference })) : undefined
      const body = {
        location_id: '', items: cart.map((l) => ({ product_id: l.product.id, quantity: l.quantity })),
        discount_type: calc.discount > 0 ? dtype : null, discount_value: calc.discount > 0 ? Number(dvalue) : 0,
        payment_method: split ? '' : method, payments: payments ?? (calc.total > 0 ? [{ method, amount: calc.total, reference }] : []),
        customer_id: customer?.id ?? '', customer: customer ? undefined : newCustomer,
      }
      const sale = await api.post<SaleResult>('/api/sales', body)
      setDone(sale); reset()
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not save the sale.') } finally { setBusy(false) }
  }

  if (settings.loading && !cfg) return <PageLoader />
  if (!cfg) return <ErrorBox message={settings.error || 'Settings could not be loaded'} />

  const todayIso = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
  const printInvoice = (id: string) => { api.post(`/api/sales/${id}/reprint`).catch(() => {}); window.open(fileUrl(`/api/sales/${id}/invoice.pdf`), '_blank') }

  return (
    <div>
      <PageHeader title="New Bill" subtitle={`Cashier: ${user?.full_name}`} />
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
                    <td className="px-3 py-2"><div className="flex items-center gap-2">{l.product.image_url ? <img src={l.product.image_url} className="h-10 w-10 rounded object-cover" alt="" /> : <div className="flex h-10 w-10 items-center justify-center rounded bg-gold-100 text-gold-600">◇</div>}<div className="font-medium">{l.product.name}</div></div></td>
                    <td className="px-3 py-2 text-xs text-ink/60">{l.product.sku}</td>
                    <td className="px-3 py-2"><div className="flex items-center justify-center gap-1">
                      <button className="h-8 w-8 rounded-lg border border-stone-300 text-lg hover:bg-stone-50" onClick={() => setQty(l.product.id, l.quantity - 1)} disabled={l.quantity <= 1}>−</button>
                      <input className="h-8 w-14 rounded-lg border border-stone-300 text-center" type="number" min={1} value={l.quantity} onChange={(e) => setQty(l.product.id, Math.floor(Number(e.target.value) || 1))} />
                      <button className="h-8 w-8 rounded-lg border border-stone-300 text-lg hover:bg-stone-50" onClick={() => setQty(l.product.id, l.quantity + 1)}>+</button></div>
                      <div className="text-center text-[11px] text-ink/40">{stockHere(l.product)} in stock</div></td>
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
            <div className="mb-2 flex items-center justify-between"><h2 className="font-display text-xl font-semibold text-maroon-800">Customer details</h2>
              {(cust.mobile || cust.name || byName) && <Button size="sm" variant="ghost" onClick={() => { setCust(emptyCust); setByName(false); setCustQ('') }}>Clear</Button>}</div>
            {byName ? (
              <div><Input placeholder="Type the customer's name…" value={custQ} onChange={(e) => setCustQ(e.target.value)} autoFocus />
                {custResults.map((c) => <button key={c.id} className="mt-1 flex w-full justify-between rounded-lg border border-stone-200 px-3 py-2 text-left text-sm hover:bg-gold-50" onClick={() => pickByName(c)}><span>{c.name}</span><span className="text-ink/50">{c.mobile || 'no mobile'}</span></button>)}
                <button className="mt-2 text-xs text-maroon-800 underline" onClick={() => { setByName(false); setCustQ('') }}>Back to mobile number</button></div>
            ) : (
              <div className="space-y-2">
                <Field label="Mobile number"><Input type="tel" inputMode="tel" placeholder="Enter mobile to find the customer" value={cust.mobile} onChange={(e) => setCust({ ...cust, mobile: e.target.value })} className="!text-lg tracking-wide" /></Field>
                {looking && <div className="text-xs text-ink/50">Looking up…</div>}
                {customer && lookup ? (
                  <div className="rounded-lg bg-gold-50 p-3 text-sm">
                    <div className="flex items-center justify-between"><b className="text-base">{customer.name}</b><Badge tone="green">Existing customer</Badge></div>
                    {(customer.email || customer.address) && <div className="mt-0.5 text-xs text-ink/60">{[customer.email, customer.address].filter(Boolean).join(' · ')}</div>}
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded bg-white px-1 py-1.5"><div className="text-ink/50">Bills</div><b>{customer.bill_count ?? 0}</b></div>
                      <div className="rounded bg-white px-1 py-1.5"><div className="text-ink/50">Spent</div><b>{money(customer.total_spent)}</b></div>
                      <div className="rounded bg-white px-1 py-1.5"><div className="text-ink/50">Last visit</div><b>{customer.last_purchase ? fmtDate(customer.last_purchase) : '—'}</b></div></div>
                    {(lookup.bills ?? []).length > 0 && <div className="mt-3"><div className="mb-1 text-xs font-medium uppercase text-maroon-800/80">Past bills</div>
                      <div className="max-h-64 space-y-1 overflow-y-auto">
                        {(lookup.bills ?? []).map((b) => (
                          <div key={b.id} className="rounded border border-stone-200 bg-white">
                            <button className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs" onClick={() => setOpenBill(openBill === b.id ? '' : b.id)}>
                              <span><b>{b.invoice_number}</b> <span className="text-ink/50">{fmtDate(b.date_time)} · {b.item_count} pcs</span></span>
                              <span className={`tabular ${b.status === 'completed' ? '' : 'text-red-700 line-through'}`}>{money(b.total)}</span></button>
                            {openBill === b.id && <div className="border-t border-stone-100 px-2 py-1.5 text-xs">
                              {b.items.map((it, k) => <div key={k} className="flex justify-between gap-2"><span>{it.name} × {it.quantity}</span><span className="tabular">{money(it.line_total)}</span></div>)}
                              {b.discount_amount > 0 && <div className="flex justify-between text-red-700"><span>Discount</span><span className="tabular">- {money(b.discount_amount)}</span></div>}
                              <div className="mt-1 text-ink/50">{b.payment_method}{b.status !== 'completed' ? ` · ${b.status}` : ''}</div>
                              {(can('billing.reprint') || (can('billing.generate') && b.date_time.slice(0, 10) === todayIso)) && <button className="mt-1 text-maroon-800 underline" onClick={() => printInvoice(b.id)}>Open invoice</button>}</div>}
                          </div>))}
                      </div></div>}
                  </div>
                ) : (
                  <>
                    {lookup && !lookup.found && <div className="rounded-lg bg-cream px-3 py-2 text-xs text-ink/70">New customer. They will be saved with this bill.</div>}
                    <Field label="Name"><Input placeholder={digits ? 'Customer name' : 'Leave blank for walk-in'} value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} /></Field>
                    {(digits || cust.name) && <div className="grid gap-2">
                      <Input placeholder="Email (optional)" value={cust.email} onChange={(e) => setCust({ ...cust, email: e.target.value })} />
                      <Input placeholder="Address / area (optional)" value={cust.address} onChange={(e) => setCust({ ...cust, address: e.target.value })} /></div>}
                    {!digits && !cust.name && <div className="text-xs text-ink/50">No details = walk-in customer. <button className="text-maroon-800 underline" onClick={() => setByName(true)}>Find by name</button></div>}
                  </>)}
              </div>)}
          </Card>

          <Card>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-ink/60">Items</span><span>{calc.pieces} pcs</span></div>
              <div className="flex justify-between"><span className="text-ink/60">Subtotal</span><span className="tabular">{money(calc.subtotal)}</span></div>
              {canDiscount ? (
                <div className="rounded-xl bg-cream p-3">
                  <div className="mb-2 text-xs font-medium uppercase text-maroon-800/80">Discount</div>
                  <div className="mb-2 grid grid-cols-2 overflow-hidden rounded-lg border border-stone-300 text-sm" role="radiogroup" aria-label="Discount type">
                    <button role="radio" aria-checked={dtype === 'percent'} className={`px-3 py-1.5 font-medium ${dtype === 'percent' ? 'bg-maroon-800 text-white' : 'bg-white hover:bg-gold-50'}`} onClick={() => setDtype('percent')}>Percentage (%)</button>
                    <button role="radio" aria-checked={dtype === 'amount'} className={`border-l border-stone-300 px-3 py-1.5 font-medium ${dtype === 'amount' ? 'bg-maroon-800 text-white' : 'bg-white hover:bg-gold-50'}`} onClick={() => setDtype('amount')}>Amount (₹)</button></div>
                  <div className="relative">
                    {dtype === 'amount' && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/60">₹</span>}
                    <Input type="number" min="0" step={dtype === 'percent' ? '0.01' : '1'} className={dtype === 'amount' ? '!pl-7' : '!pr-8'} placeholder={dtype === 'percent' ? 'e.g. 10' : 'e.g. 150'} value={dvalue} onChange={(e) => setDvalue(e.target.value)} />
                    {dtype === 'percent' && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink/60">%</span>}</div>
                  {calc.discount > 0 && calc.subtotal > 0 && <div className="mt-1 text-xs text-ink/60">{dtype === 'percent' ? `= ${money(calc.discount)} off` : `= ${r2((calc.discount * 100) / calc.subtotal)}% of the bill`}</div>}
                  {calc.invalid && <div className="mt-1 text-xs text-red-700">Discount cannot be negative or more than the bill.</div>}
                </div>) : <div className="text-xs text-ink/40">Discounts are not enabled for your login.</div>}
              {calc.discount > 0 && <div className="flex justify-between text-red-700"><span>Discount{dtype === 'percent' ? ` (${dvalue}%)` : ' (flat)'}</span><span className="tabular">- {money(calc.discount)}</span></div>}
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
