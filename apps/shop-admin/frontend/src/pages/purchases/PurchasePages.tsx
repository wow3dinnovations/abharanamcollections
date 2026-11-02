import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ProductPicker, type ProductLite } from '../../components/ProductPicker'
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Modal, Notice, PageHeader, PageLoader, Pagination, Select, TableWrap, Td, Textarea, Th, Tr } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { useDebounced, useFetch } from '../../hooks/useFetch'
import { useLookups } from '../../hooks/useLookups'
import { useToast } from '../../hooks/useToast'
import { api, ApiError } from '../../services/api'
import type { Paged } from '../../types'
import { fmtDate, money, todayIso } from '../../utils/format'

interface PItem { product_id: string; sku: string; name: string; quantity: number; rate: number; total: number }
interface Purchase {
  id: string; vendor_id: string; vendor_name: string; location_id: string; location_name: string; purchase_date: string; invoice_number: string
  notes: string; items: PItem[]; total: number; created_by_name: string; source: string; item_count: number; total_quantity: number
}

/* ---------------------------------------------------------------- list */
export function PurchasesPage() {
  const { can } = useAuth()
  const nav = useNavigate()
  const { vendors, locations } = useLookups()
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const [f, setF] = useState({ vendor_id: '', location_id: '', start: '', end: '' })
  const [page, setPage] = useState(1)
  const [view, setView] = useState<Purchase | null>(null)
  const { data, loading, error, reload } = useFetch(() => api.get<Paged<Purchase>>('/api/purchases', { q: dq, ...f, page, page_size: 20 }), [dq, f, page])
  const set = (p: Partial<typeof f>) => { setF({ ...f, ...p }); setPage(1) }
  return (
    <div>
      <PageHeader title="Purchases" subtitle="Jewellery bought from vendors for resale. (Running costs like rent and bags go under Expenses.)"
        actions={can('purchases.add') && <Button onClick={() => nav('/purchases/add')}>+ Add purchase</Button>} />
      <div className="mb-4 grid gap-2 md:grid-cols-5">
        <Input placeholder="Search invoice, vendor, product…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
        <Select value={f.vendor_id} onChange={(e) => set({ vendor_id: e.target.value })}><option value="">All vendors</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>
        <Select value={f.location_id} onChange={(e) => set({ location_id: e.target.value })}><option value="">All locations</option>{locations.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>
        <Input type="date" value={f.start} onChange={(e) => set({ start: e.target.value })} title="From" />
        <Input type="date" value={f.end} onChange={(e) => set({ end: e.target.value })} title="To" />
      </div>
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <PageLoader /> : data && data.items.length === 0 ? <EmptyState title="No purchases found" hint="Purchases appear here when you add stock." /> : data && (
        <>
          <TableWrap><thead><tr><Th>Purchase</Th><Th>Date</Th><Th>Vendor</Th><Th>Invoice</Th><Th>Location</Th><Th right>Pieces</Th><Th right>Total</Th><Th></Th></tr></thead><tbody>
            {data.items.map((p) => (
              <Tr key={p.id} onClick={() => setView(p)}><Td>{p.id}{p.source === 'product_entry' && <div><Badge tone="gray">with product</Badge></div>}{p.source === 'stock_add' && <div><Badge tone="gray">Add Stock</Badge></div>}</Td><Td>{fmtDate(p.purchase_date)}</Td><Td>{p.vendor_name || '—'}</Td>
                <Td>{p.invoice_number}</Td><Td>{p.location_name}</Td><Td right>{p.total_quantity}</Td><Td right>{money(p.total)}</Td>
                <Td right onClick={(e) => e.stopPropagation()}>{can('purchases.edit') && <Button size="sm" variant="outline" onClick={() => nav(`/purchases/${p.id}/edit`)}>Edit</Button>}</Td></Tr>))}
          </tbody></TableWrap>
          <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        </>
      )}
      {view && (
        <Modal title={`Purchase ${view.id}`} size="lg" onClose={() => setView(null)} footer={<Button variant="outline" onClick={() => setView(null)}>Close</Button>}>
          <div className="mb-3 grid gap-1 text-sm md:grid-cols-2">
            <div>Vendor: <b>{view.vendor_name || '—'}</b></div><div>Date: <b>{fmtDate(view.purchase_date)}</b></div>
            <div>Invoice no.: <b>{view.invoice_number || '—'}</b></div><div>Location: <b>{view.location_name}</b></div>
            <div>Entered by: <b>{view.created_by_name}</b></div>{view.notes && <div className="md:col-span-2">Notes: {view.notes}</div>}
          </div>
          <TableWrap><thead><tr><Th>Product</Th><Th right>Qty</Th><Th right>Rate</Th><Th right>Total</Th></tr></thead><tbody>
            {view.items.map((i, k) => <Tr key={k}><Td>{i.name}<div className="text-xs text-ink/50">{i.sku}</div></Td><Td right>{i.quantity}</Td><Td right>{money(i.rate)}</Td><Td right>{money(i.total)}</Td></Tr>)}
            <Tr><Td colSpan={3} right><b>Total</b></Td><Td right><b>{money(view.total)}</b></Td></Tr>
          </tbody></TableWrap>
        </Modal>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- add / edit */
interface Line { product_id: string; sku: string; name: string; current: number; quantity: string; rate: string }

export function PurchaseFormPage() {
  const { id } = useParams()
  const editing = !!id
  const nav = useNavigate()
  const { toast } = useToast()
  const { vendors, locations, loaded } = useLookups()
  const [vendorId, setVendorId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [date, setDate] = useState(todayIso())
  const [invoice, setInvoice] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(editing)

  useEffect(() => {
    if (!id) return
    api.get<Purchase>(`/api/purchases/${id}`).then((p) => {
      setVendorId(p.vendor_id); setLocationId(p.location_id); setDate(p.purchase_date); setInvoice(p.invoice_number); setNotes(p.notes)
      setLines(p.items.map((i) => ({ product_id: i.product_id, sku: i.sku, name: i.name, current: 0, quantity: String(i.quantity), rate: String(i.rate) })))
    }).catch((e) => setErr(e instanceof ApiError ? e.message : 'Cannot load purchase')).finally(() => setLoading(false))
  }, [id])

  if (loading || !loaded) return <PageLoader />
  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.rate) || 0), 0)
  const add = (p: ProductLite) => {
    if (lines.some((l) => l.product_id === p.id)) return toast('That product is already on this purchase.', 'info')
    setLines([...lines, { product_id: p.id, sku: p.sku, name: p.name, current: p.current_quantity, quantity: '1', rate: String(p.purchase_rate ?? '') }])
  }
  const upd = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  const save = async () => {
    setBusy(true); setErr('')
    const body = { vendor_id: vendorId, location_id: locationId, purchase_date: date, invoice_number: invoice, notes,
      items: lines.map((l) => ({ product_id: l.product_id, quantity: Number(l.quantity), rate: Number(l.rate) })) }
    try {
      if (editing) await api.put(`/api/purchases/${id}`, body); else await api.post('/api/purchases', body)
      toast(editing ? 'Purchase updated.' : 'Purchase saved and stock increased.')
      nav('/purchases')
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not save.') } finally { setBusy(false) }
  }

  return (
    <div>
      <PageHeader title={editing ? `Edit purchase ${id}` : 'Add purchase'} subtitle="Saving increases stock and records every piece in the inventory history." />
      <Card className="mb-5">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Vendor"><Select value={vendorId} onChange={(e) => setVendorId(e.target.value)}><option value="">—</option>{vendors.filter((v) => v.active || v.id === vendorId).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
          <Field label="Received at location" required><Select value={locationId} disabled={editing} onChange={(e) => setLocationId(e.target.value)}><option value="">Choose…</option>{locations.filter((l) => l.active || l.id === locationId).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
          <Field label="Purchase date" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Invoice number"><Input value={invoice} onChange={(e) => setInvoice(e.target.value)} /></Field>
          <Field label="Notes" className="md:col-span-4"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
      </Card>
      <Card>
        <h2 className="mb-3 font-display text-xl font-semibold text-maroon-800">Items</h2>
        <ProductPicker onPick={add} placeholder="Search the product you bought (add new products from Inventory → Add Product)" />
        {lines.length === 0 ? <div className="py-8 text-center text-sm text-ink/50">No items yet. Search and pick a product above.</div> : (
          <div className="mt-4"><TableWrap><thead><tr><Th>Product</Th><Th right>Quantity</Th><Th right>Rate (₹)</Th><Th right>Total</Th><Th></Th></tr></thead><tbody>
            {lines.map((l, i) => (
              <Tr key={l.product_id}><Td><b>{l.name}</b><div className="text-xs text-ink/50">{l.sku}{!editing && ` · ${l.current} in stock`}</div></Td>
                <Td right><Input type="number" min="1" step="1" className="w-24 text-right" value={l.quantity} onChange={(e) => upd(i, { quantity: e.target.value })} /></Td>
                <Td right><Input type="number" min="0" step="0.01" className="w-28 text-right" value={l.rate} onChange={(e) => upd(i, { rate: e.target.value })} /></Td>
                <Td right>{money((Number(l.quantity) || 0) * (Number(l.rate) || 0))}</Td>
                <Td right><Button size="sm" variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove</Button></Td></Tr>))}
            <Tr><Td colSpan={3} right><b>Purchase total</b></Td><Td right><b className="text-lg text-maroon-900">{money(total)}</b></Td><Td></Td></Tr>
          </tbody></TableWrap></div>
        )}
        {editing && <div className="mt-3"><Notice tone="warn">Changing quantities changes the stock at this location. You cannot reduce a quantity below what has already been sold or moved.</Notice></div>}
        <div className="mt-3"><ErrorBox message={err} /></div>
        <div className="mt-4 flex gap-2"><Button variant="gold" size="lg" loading={busy} disabled={lines.length === 0 || !locationId} onClick={save}>{editing ? 'Save changes' : 'Save purchase'}</Button><Button variant="outline" size="lg" onClick={() => nav('/purchases')}>Cancel</Button></div>
      </Card>
    </div>
  )
}
