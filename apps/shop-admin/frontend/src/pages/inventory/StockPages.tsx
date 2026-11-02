import { useState } from 'react'
import { AddStockModal, AdjustStockModal, type StockProduct } from '../../components/StockModals'
import { ProductPicker, type ProductLite } from '../../components/ProductPicker'
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, PageHeader, PageLoader, Pagination, Select, TableWrap, Td, Th, Tr } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { useDebounced, useFetch } from '../../hooks/useFetch'
import { useLookups } from '../../hooks/useLookups'
import { useToast } from '../../hooks/useToast'
import { api, ApiError } from '../../services/api'
import type { Paged } from '../../types'
import { fmtDateTime, money } from '../../utils/format'

/* ---------------------------------------------------------------- Stock by location */
interface StockRow {
  product_id: string; sku: string; name: string; category_name: string; location_id: string; location_name: string; quantity: number
  total_quantity: number; selling_price: number; purchase_rate?: number; stock_value: number | null; age_days: number
  is_low_stock: boolean; is_out_of_stock: boolean; image_url: string | null
}

export function StockPage() {
  const { can } = useAuth()
  const { toast } = useToast()
  const { categories, locations } = useLookups()
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const [f, setF] = useState({ category_id: '', location_id: '', stock_status: '' })
  const [page, setPage] = useState(1)
  const [op, setOp] = useState<{ kind: 'add' | 'adjust'; product: StockProduct; locationId: string } | null>(null)
  const { data, loading, error, reload } = useFetch(() => api.get<Paged<StockRow>>('/api/inventory/stock', { q: dq, ...f, page, page_size: 25 }), [dq, f, page])
  const showCost = data?.items.some((r) => r.stock_value !== null)

  const start = async (kind: 'add' | 'adjust', r: StockRow) => {
    try {
      const p = await api.get<StockProduct>(`/api/products/${r.product_id}`)     // fresh stock + (if allowed) cost
      setOp({ kind, product: p, locationId: r.location_id })
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Could not open the product', 'error') }
  }

  return (
    <div>
      <PageHeader title="Stock" subtitle="What you have, and where it is kept." />
      <div className="mb-4 grid gap-2 md:grid-cols-4">
        <Input placeholder="Search product or SKU…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
        <Select value={f.category_id} onChange={(e) => { setF({ ...f, category_id: e.target.value }); setPage(1) }}><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select value={f.location_id} onChange={(e) => { setF({ ...f, location_id: e.target.value }); setPage(1) }}><option value="">All locations</option>{locations.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select value={f.stock_status} onChange={(e) => { setF({ ...f, stock_status: e.target.value }); setPage(1) }}><option value="">Any stock level</option><option value="in_stock">In stock</option><option value="low_stock">Low stock</option><option value="out_of_stock">Out of stock</option><option value="old_stock">Old stock</option></Select>
      </div>
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <PageLoader /> : data && data.items.length === 0 ? <EmptyState title="No stock found" /> : data && (
        <>
          <TableWrap>
            <thead><tr><Th>Product</Th><Th>Category</Th><Th>Location</Th><Th right>At location</Th><Th right>Total</Th><Th right>Price</Th>{showCost && <Th right>Value (cost)</Th>}<Th></Th></tr></thead>
            <tbody>
              {data.items.map((r, i) => (
                <Tr key={`${r.product_id}-${r.location_id}-${i}`}>
                  <Td><div className="font-medium">{r.name}</div><div className="text-xs text-ink/50">{r.sku}</div></Td>
                  <Td>{r.category_name}</Td><Td>{r.location_name}</Td>
                  <Td right>{r.is_out_of_stock ? <Badge tone="red">Out</Badge> : r.is_low_stock ? <Badge tone="amber">{r.quantity} · Low</Badge> : r.quantity}</Td>
                  <Td right>{r.total_quantity}</Td><Td right>{money(r.selling_price)}</Td>
                  {showCost && <Td right>{r.stock_value !== null ? money(r.stock_value) : ''}</Td>}
                  <Td right>{can('inventory.adjust_stock') && <div className="flex justify-end gap-1"><Button size="sm" variant="outline" onClick={() => start('add', r)}>Add stock</Button><Button size="sm" variant="ghost" onClick={() => start('adjust', r)}>Adjust</Button></div>}</Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
          <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        </>
      )}
      {op?.kind === 'add' && <AddStockModal product={op.product} locationId={op.locationId} onClose={() => setOp(null)} onDone={reload} />}
      {op?.kind === 'adjust' && <AdjustStockModal product={op.product} locationId={op.locationId} onClose={() => setOp(null)} onDone={reload} />}
    </div>
  )
}

/* ---------------------------------------------------------------- Stock transfer */
interface TLine { product: ProductLite; quantity: string }
interface Transfer { id: string; date_time: string; from_location_name: string; to_location_name: string; items: { sku: string; name: string; quantity: number }[]; username: string; remarks: string }

export function TransferPage() {
  const { can } = useAuth()
  const { toast } = useToast()
  const { locations } = useLookups()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [lines, setLines] = useState<TLine[]>([])
  const [remarks, setRemarks] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState(1)
  const history = useFetch(() => api.get<Paged<Transfer>>('/api/inventory/transfers', { page, page_size: 10 }), [page])

  const addProduct = (p: ProductLite) => {
    if (lines.some((l) => l.product.id === p.id)) return toast('That product is already in the list.', 'info')
    setLines([...lines, { product: p, quantity: '1' }])
  }
  const availableAt = (p: ProductLite) => p.stock_by_location.find((s) => s.location_id === from)?.quantity ?? 0

  const submit = async () => {
    setBusy(true); setErr('')
    try {
      await api.post('/api/inventory/transfers', { from_location_id: from, to_location_id: to, remarks, items: lines.map((l) => ({ product_id: l.product.id, quantity: Number(l.quantity) })) })
      toast('Stock transferred.'); setLines([]); setRemarks(''); history.reload()
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Transfer failed') } finally { setBusy(false) }
  }

  return (
    <div>
      <PageHeader title="Stock Transfer" subtitle="Move pieces from one location to another. Every transfer is kept in the history." />
      {can('inventory.transfer_stock') && (
        <Card className="mb-6">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="From location" required><Select value={from} onChange={(e) => { setFrom(e.target.value); setLines([]) }}><option value="">Choose…</option>{locations.filter((l) => l.active).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
            <Field label="To location" required><Select value={to} onChange={(e) => setTo(e.target.value)}><option value="">Choose…</option>{locations.filter((l) => l.active && l.id !== from).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
            <Field label="Remarks"><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
          </div>
          {from && <div className="mt-4"><ProductPicker onPick={addProduct} placeholder="Search a product to transfer…" /></div>}
          {lines.length > 0 && (
            <div className="mt-4"><TableWrap><thead><tr><Th>Product</Th><Th right>Available here</Th><Th right>Transfer qty</Th><Th></Th></tr></thead><tbody>
              {lines.map((l, i) => (
                <Tr key={l.product.id}><Td><b>{l.product.name}</b><div className="text-xs text-ink/50">{l.product.sku}</div></Td><Td right>{availableAt(l.product)}</Td>
                  <Td right><Input type="number" min="1" className="w-24 text-right" value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} /></Td>
                  <Td right><Button size="sm" variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove</Button></Td></Tr>))}
            </tbody></TableWrap></div>
          )}
          <div className="mt-3"><ErrorBox message={err} /></div>
          <div className="mt-4"><Button loading={busy} disabled={!from || !to || lines.length === 0} onClick={submit}>Transfer stock</Button></div>
        </Card>
      )}
      <h2 className="mb-2 font-display text-2xl font-semibold text-maroon-900">Transfer history</h2>
      {history.loading && !history.data ? <PageLoader /> : (
        <>
          <TableWrap><thead><tr><Th>Date</Th><Th>From</Th><Th>To</Th><Th>Items</Th><Th>By</Th><Th>Remarks</Th></tr></thead><tbody>
            {history.data?.items.map((t) => <Tr key={t.id}><Td>{fmtDateTime(t.date_time)}<div className="text-xs text-ink/40">{t.id}</div></Td><Td>{t.from_location_name}</Td><Td>{t.to_location_name}</Td>
              <Td>{t.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')}</Td><Td>{t.username}</Td><Td>{t.remarks}</Td></Tr>)}
            {history.data?.items.length === 0 && <Tr><Td colSpan={6}>No transfers yet.</Td></Tr>}
          </tbody></TableWrap>
          {history.data && <Pagination page={history.data.page} pages={history.data.pages} total={history.data.total} onPage={setPage} />}
        </>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- Inventory history */
interface Txn { id: string; date_time: string; sku: string; product_name: string; location_name: string; type: string; quantity: number; previous_stock: number; new_stock: number; reference_type: string; reference_id: string; username: string; remarks: string }
const TYPES = ['PURCHASE', 'SALE', 'SALE_CANCELLED', 'SALE_RETURN', 'STOCK_ADJUSTMENT', 'STOCK_TRANSFER', 'DAMAGE', 'LOST', 'OTHER']

export function InventoryHistoryPage() {
  const { locations } = useLookups()
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const [f, setF] = useState({ type: '', location_id: '', start: '', end: '' })
  const [page, setPage] = useState(1)
  const { data, loading, error, reload } = useFetch(() => api.get<Paged<Txn>>('/api/inventory/transactions', { q: dq, ...f, page, page_size: 30 }), [dq, f, page])
  const set = (p: Partial<typeof f>) => { setF({ ...f, ...p }); setPage(1) }
  return (
    <div>
      <PageHeader title="Inventory History" subtitle="Every stock movement: purchases, sales, adjustments and transfers." />
      <div className="mb-4 grid gap-2 md:grid-cols-5">
        <Input placeholder="Search product, SKU, reference…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
        <Select value={f.type} onChange={(e) => set({ type: e.target.value })}><option value="">All types</option>{TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}</Select>
        <Select value={f.location_id} onChange={(e) => set({ location_id: e.target.value })}><option value="">All locations</option>{locations.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Input type="date" value={f.start} onChange={(e) => set({ start: e.target.value })} title="From" />
        <Input type="date" value={f.end} onChange={(e) => set({ end: e.target.value })} title="To" />
      </div>
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <PageLoader /> : data && data.items.length === 0 ? <EmptyState title="No movements found" /> : data && (
        <>
          <TableWrap><thead><tr><Th>Date</Th><Th>Product</Th><Th>Type</Th><Th>Location</Th><Th right>Change</Th><Th right>Before → After</Th><Th>Reference</Th><Th>By</Th><Th>Remarks</Th></tr></thead><tbody>
            {data.items.map((t) => (
              <Tr key={t.id}><Td>{fmtDateTime(t.date_time)}</Td><Td><div className="font-medium">{t.product_name}</div><div className="text-xs text-ink/50">{t.sku}</div></Td>
                <Td><Badge tone={t.quantity > 0 ? 'green' : 'red'}>{t.type.replace('_', ' ')}</Badge></Td><Td>{t.location_name}</Td>
                <Td right>{t.quantity > 0 ? `+${t.quantity}` : t.quantity}</Td><Td right>{t.previous_stock} → {t.new_stock}</Td><Td>{t.reference_id}</Td><Td>{t.username}</Td><Td>{t.remarks}</Td></Tr>))}
          </tbody></TableWrap>
          <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        </>
      )}
    </div>
  )
}

