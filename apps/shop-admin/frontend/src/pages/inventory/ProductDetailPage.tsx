import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AddStockModal, AdjustStockModal } from '../../components/StockModals'
import { Badge, Button, Card, DetailRow, ErrorBox, PageHeader, PageLoader, TableWrap, Tabs, Td, Th, Tr } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { useFetch } from '../../hooks/useFetch'
import { useToast } from '../../hooks/useToast'
import { api, ApiError } from '../../services/api'
import { fmtDate, fmtDateTime, money } from '../../utils/format'
import { StockBadge, type ProductRow } from './ProductsPage'

interface Detail extends ProductRow {
  description: string; size: string; colour: string; material: string; collection: string; tags: string[]; rack: string
  initial_quantity: number; sold_quantity: number; status: string; min_selling_price?: number | null; discount_allowed_percent: number | null
  purchase_invoice_no?: string; purchase_date?: string; retail_value: number; total_purchase_value?: number; age_months: number
  inventory_history: { id: string; date_time: string; type: string; quantity: number; previous_stock: number; new_stock: number; location_name: string; username: string; remarks: string; reference_id: string }[]
  sales_history: { sale_id: string; invoice_number: string; date_time: string; status: string; quantity: number; unit_price: number; line_total: number; cashier_name: string }[]
  purchase_history?: { purchase_id: string; purchase_date: string; vendor_name: string; invoice_number: string; quantity: number; rate: number; total: number }[]
  stock_by_location: { location_id: string; location_name: string; quantity: number }[]
}
type Tab = 'sales' | 'inventory' | 'purchases'

export function ProductDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { can } = useAuth()
  const { toast, confirm } = useToast()
  const { data: p, loading, error, reload } = useFetch(() => api.get<Detail>(`/api/products/${id}`), [id])
  const [tab, setTab] = useState<Tab>('inventory')
  const [op, setOp] = useState<{ kind: 'add' | 'adjust'; locationId: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  if (loading && !p) return <PageLoader />
  if (!p) return <ErrorBox message={error || 'Product not found'} />

  const del = async () => {
    const ok = await confirm({ title: 'Delete this product?', danger: true, confirmText: 'Delete', message: 'The product disappears from lists. Its history (sales, purchases, stock movements) is kept. This only works when stock is zero.' })
    if (!ok) return
    try { await api.del(`/api/products/${p.id}`); toast('Product deleted.'); nav('/inventory/products') } catch (e) { toast(e instanceof ApiError ? e.message : 'Failed', 'error') }
  }
  const upload = async (file: File) => {
    const form = new FormData(); form.append('file', file)
    try { await api.upload(`/api/products/${p.id}/image`, form); toast('Picture updated.'); reload() } catch (e) { toast(e instanceof ApiError ? e.message : 'Upload failed', 'error') }
  }

  return (
    <div>
      <PageHeader title={p.name} subtitle={`${p.sku} · ${p.category_name}${p.subcategory_name ? ' / ' + p.subcategory_name : ''}`}
        actions={<>
          {can('inventory.edit_product') && <Link to={`/inventory/products/${p.id}/edit`}><Button variant="outline">Edit</Button></Link>}
          {can('inventory.adjust_stock') && <Button variant="outline" onClick={() => setOp({ kind: 'add', locationId: '' })}>Add stock</Button>}
          {can('inventory.adjust_stock') && <Button variant="outline" onClick={() => setOp({ kind: 'adjust', locationId: '' })}>Adjust stock</Button>}
          {can('barcode.print', 'barcode.reprint') && <Link to={`/barcode/print?product=${p.id}`}><Button variant="gold">Print label</Button></Link>}
          {can('inventory.delete_product') && <Button variant="ghost" onClick={del}>Delete</Button>}
        </>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="space-y-3">
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-cream">
            {p.image_url ? <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" /> : <span className="text-5xl text-gold-400">◇</span>}
          </div>
          {can('inventory.edit_product') && (<>
            <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => fileRef.current?.click()}>{p.image_url ? 'Change picture' : 'Add picture'}</Button>
              {p.image_url && <Button size="sm" variant="ghost" onClick={async () => { await api.del(`/api/products/${p.id}/image`); reload() }}>Remove</Button>}
            </div>
          </>)}
          <div className="flex flex-wrap gap-1.5">
            <StockBadge p={p} />{p.status !== 'active' && <Badge tone="gray">{p.status}</Badge>}{p.is_old_stock && <Badge tone="amber">Old stock</Badge>}
          </div>
        </Card>

        <Card>
          <h2 className="mb-2 font-display text-xl font-semibold text-maroon-800">Details</h2>
          <DetailRow label="SKU">{p.sku}</DetailRow>
          <DetailRow label="Barcode">{p.barcode}</DetailRow>
          <DetailRow label="Selling price">{money(p.selling_price)}</DetailRow>
          {p.purchase_rate !== undefined && <DetailRow label="Purchase rate (avg)">{money(p.purchase_rate)}</DetailRow>}
          {p.purchase_rate !== undefined && p.stock_value !== undefined && <DetailRow label="Stock value (at cost)">{money(p.stock_value)}</DetailRow>}
          <DetailRow label="Stock value (at selling price)">{money(p.retail_value)}</DetailRow>
          {p.vendor_name !== undefined && <DetailRow label="Vendor">{p.vendor_name || '—'}</DetailRow>}
          {p.discount_allowed_percent != null && <DetailRow label="Discount allowed">{p.discount_allowed_percent}%</DetailRow>}
          {p.min_selling_price != null && <DetailRow label="Minimum price">{money(p.min_selling_price)}</DetailRow>}
          <DetailRow label="Design no.">{p.design_number || '—'}</DetailRow>
          <DetailRow label="Collection">{p.collection || '—'}</DetailRow>
          <DetailRow label="Size / Colour / Material">{[p.size, p.colour, p.material].filter(Boolean).join(' / ') || '—'}</DetailRow>
          <DetailRow label="Rack / Shelf">{p.rack || '—'}</DetailRow>
          {p.tags.length > 0 && <DetailRow label="Tags">{p.tags.join(', ')}</DetailRow>}
          {p.description && <p className="mt-3 text-sm text-ink/70">{p.description}</p>}
        </Card>

        <div className="space-y-5">
          <Card>
            <h2 className="mb-2 font-display text-xl font-semibold text-maroon-800">Stock</h2>
            <DetailRow label="Initial quantity">{p.initial_quantity}</DetailRow>
            <DetailRow label="Sold quantity">{p.sold_quantity}</DetailRow>
            <DetailRow label="Current quantity"><b className="text-lg text-maroon-900">{p.current_quantity}</b></DetailRow>
            <div className="mt-2 text-xs font-medium uppercase tracking-wide text-ink/50">By location</div>
            {p.stock_by_location.length === 0 && <div className="py-2 text-sm text-ink/50">No stock in any location.</div>}
            {p.stock_by_location.map((s) => (
              <DetailRow key={s.location_id} label={s.location_name}>
                <span className="inline-flex items-center gap-2">{s.quantity}
                  {can('inventory.adjust_stock') && <><button className="text-xs font-medium text-maroon-800 underline" onClick={() => setOp({ kind: 'add', locationId: s.location_id })}>Add</button>
                    <button className="text-xs font-medium text-maroon-800 underline" onClick={() => setOp({ kind: 'adjust', locationId: s.location_id })}>Adjust</button></>}
                </span>
              </DetailRow>))}
          </Card>
          <Card>
            <h2 className="mb-2 font-display text-xl font-semibold text-maroon-800">Age</h2>
            <DetailRow label="Added on">{fmtDate(p.date_added)}</DetailRow>
            <DetailRow label="Age">{p.age_days} days ({p.age_months} months)</DetailRow>
            <DetailRow label="Age group"><Badge tone={p.is_old_stock ? 'amber' : 'gold'}>{p.age_bucket}</Badge></DetailRow>
          </Card>
        </div>
      </div>

      <div className="mt-6">
        <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'inventory', label: `Inventory history (${p.inventory_history.length})` }, { id: 'sales', label: `Sales history (${p.sales_history.length})` }, ...(p.purchase_history ? [{ id: 'purchases' as Tab, label: `Purchases (${p.purchase_history.length})` }] : [])]} />
        {tab === 'inventory' && (
          <TableWrap><thead><tr><Th>Date</Th><Th>Type</Th><Th>Location</Th><Th right>Change</Th><Th right>Before → After</Th><Th>By</Th><Th>Remarks</Th></tr></thead>
            <tbody>{p.inventory_history.map((t) => (
              <Tr key={t.id}><Td>{fmtDateTime(t.date_time)}</Td><Td><Badge tone={t.quantity > 0 ? 'green' : 'red'}>{t.type.replace('_', ' ')}</Badge></Td><Td>{t.location_name}</Td>
                <Td right>{t.quantity > 0 ? `+${t.quantity}` : t.quantity}</Td><Td right>{t.previous_stock} → {t.new_stock}</Td><Td>{t.username}</Td><Td>{t.remarks}</Td></Tr>))}
              {p.inventory_history.length === 0 && <Tr><Td colSpan={7}>No stock movements yet.</Td></Tr>}</tbody></TableWrap>
        )}
        {tab === 'sales' && (
          <TableWrap><thead><tr><Th>Invoice</Th><Th>Date</Th><Th right>Qty</Th><Th right>Price</Th><Th right>Amount</Th><Th>Cashier</Th><Th>Status</Th></tr></thead>
            <tbody>{p.sales_history.map((s, i) => (
              <Tr key={i}><Td>{s.invoice_number}</Td><Td>{fmtDateTime(s.date_time)}</Td><Td right>{s.quantity}</Td><Td right>{money(s.unit_price)}</Td><Td right>{money(s.line_total)}</Td><Td>{s.cashier_name}</Td>
                <Td><Badge tone={s.status === 'cancelled' ? 'red' : 'green'}>{s.status}</Badge></Td></Tr>))}
              {p.sales_history.length === 0 && <Tr><Td colSpan={7}>This product has not been sold yet.</Td></Tr>}</tbody></TableWrap>
        )}
        {tab === 'purchases' && p.purchase_history && (
          <TableWrap><thead><tr><Th>Purchase</Th><Th>Date</Th><Th>Vendor</Th><Th>Invoice</Th><Th right>Qty</Th><Th right>Rate</Th><Th right>Total</Th></tr></thead>
            <tbody>{p.purchase_history.map((s, i) => (
              <Tr key={i}><Td>{s.purchase_id}</Td><Td>{fmtDate(s.purchase_date)}</Td><Td>{s.vendor_name}</Td><Td>{s.invoice_number}</Td><Td right>{s.quantity}</Td><Td right>{money(s.rate)}</Td><Td right>{money(s.total)}</Td></Tr>))}
              <Tr><Td colSpan={6} right><b>Total purchase value</b></Td><Td right><b>{money(p.total_purchase_value)}</b></Td></Tr></tbody></TableWrap>
        )}
      </div>
      {op?.kind === 'add' && <AddStockModal product={p} locationId={op.locationId} onClose={() => setOp(null)} onDone={reload} />}
      {op?.kind === 'adjust' && <AdjustStockModal product={p} locationId={op.locationId} onClose={() => setOp(null)} onDone={reload} />}
    </div>
  )
}
