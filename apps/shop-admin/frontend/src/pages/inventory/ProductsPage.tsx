import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Button, EmptyState, ErrorBox, Input, PageHeader, PageLoader, Pagination, Select, TableWrap, Td, Th, Tr } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { useDebounced, useFetch } from '../../hooks/useFetch'
import { useLookups } from '../../hooks/useLookups'
import { api } from '../../services/api'
import type { Paged } from '../../types'
import { fmtDate, money } from '../../utils/format'
import type { ProductLite } from '../../components/ProductPicker'

export interface ProductRow extends ProductLite {
  subcategory_name: string; vendor_name?: string; age_days: number; age_bucket: string; is_low_stock: boolean
  is_out_of_stock: boolean; is_old_stock: boolean; date_added: string; stock_value?: number; design_number: string
}

export function StockBadge({ p }: { p: Pick<ProductRow, 'current_quantity' | 'is_low_stock' | 'is_out_of_stock'> }) {
  if (p.is_out_of_stock) return <Badge tone="red">Out of stock</Badge>
  if (p.is_low_stock) return <Badge tone="amber">{p.current_quantity} · Low</Badge>
  return <Badge tone="green">{p.current_quantity}</Badge>
}

export function ProductsPage() {
  const { can } = useAuth()
  const nav = useNavigate()
  const { categories, vendors, locations } = useLookups()
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const [search] = useSearchParams()
  const [f, setF] = useState({ category_id: '', vendor_id: '', location_id: '', stock_status: search.get('stock_status') ?? '', sort: 'newest', added_from: '', added_to: '' })
  const [page, setPage] = useState(1)
  const { data, loading, error, reload } = useFetch(
    () => api.get<Paged<ProductRow>>('/api/products', { q: dq, ...f, page, page_size: 20 }), [dq, f, page])
  const set = (patch: Partial<typeof f>) => { setF({ ...f, ...patch }); setPage(1) }
  const showCost = data?.items.some((p) => p.purchase_rate !== undefined)

  return (
    <div>
      <PageHeader title="Products" subtitle="Your jewellery catalogue and stock."
        actions={can('inventory.add_product') && <Button onClick={() => nav('/inventory/add')}>+ Add product</Button>} />
      <div className="mb-4 grid gap-2 md:grid-cols-4 xl:grid-cols-8">
        <Input className="md:col-span-2" placeholder="Search name, SKU, barcode, design no…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
        <Select value={f.category_id} onChange={(e) => set({ category_id: e.target.value })}><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select value={f.vendor_id} onChange={(e) => set({ vendor_id: e.target.value })}><option value="">All vendors</option>{vendors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select value={f.location_id} onChange={(e) => set({ location_id: e.target.value })}><option value="">All locations</option>{locations.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select value={f.stock_status} onChange={(e) => set({ stock_status: e.target.value })}>
          <option value="">Any stock</option><option value="in_stock">In stock</option><option value="out_of_stock">Out of stock</option><option value="low_stock">Low stock</option><option value="old_stock">Old stock</option>
        </Select>
        <Select value={f.sort} onChange={(e) => set({ sort: e.target.value })}>
          <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A-Z</option><option value="price_high">Price high → low</option><option value="price_low">Price low → high</option><option value="stock_low">Stock low → high</option><option value="stock_high">Stock high → low</option>
        </Select>
        <div className="flex gap-1"><Input type="date" title="Added from" value={f.added_from} onChange={(e) => set({ added_from: e.target.value })} /><Input type="date" title="Added to" value={f.added_to} onChange={(e) => set({ added_to: e.target.value })} /></div>
      </div>
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <PageLoader /> : data && data.items.length === 0 ? (
        <EmptyState title="No products found" hint="Try clearing the filters, or add your first product." action={can('inventory.add_product') && <Button onClick={() => nav('/inventory/add')}>+ Add product</Button>} />
      ) : data && (
        <>
          <TableWrap>
            <thead><tr><Th></Th><Th>Product</Th><Th>Category</Th><Th right>Stock</Th><Th right>Price</Th>{showCost && <Th right>Cost</Th>}<Th>Added</Th><Th>Age</Th><Th right>Actions</Th></tr></thead>
            <tbody>
              {data.items.map((p) => (
                <Tr key={p.id} onClick={() => nav(`/inventory/products/${p.id}`)}>
                  <Td className="w-14">{p.image_url ? <img src={p.image_url} alt="" className="h-11 w-11 rounded-lg object-cover" /> : <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gold-100 text-gold-600">◇</div>}</Td>
                  <Td><div className="font-medium">{p.name}</div><div className="text-xs text-ink/50">{p.sku}{p.design_number ? ` · ${p.design_number}` : ''}</div></Td>
                  <Td>{p.category_name}{p.subcategory_name && <span className="text-ink/50"> / {p.subcategory_name}</span>}</Td>
                  <Td right><StockBadge p={p} /></Td>
                  <Td right>{money(p.selling_price)}</Td>
                  {showCost && <Td right>{p.purchase_rate !== undefined ? money(p.purchase_rate) : ''}</Td>}
                  <Td>{fmtDate(p.date_added)}</Td>
                  <Td>{p.is_old_stock ? <Badge tone="amber">{p.age_days} d · old</Badge> : <span className="text-ink/60">{p.age_days} d</span>}</Td>
                  <Td right onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      {can('inventory.edit_product') && <Link to={`/inventory/products/${p.id}/edit`}><Button size="sm" variant="outline">Edit</Button></Link>}
                      {can('barcode.print', 'barcode.reprint') && <Link to={`/barcode/print?product=${p.id}`}><Button size="sm" variant="ghost">Label</Button></Link>}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
          <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        </>
      )}
    </div>
  )
}
