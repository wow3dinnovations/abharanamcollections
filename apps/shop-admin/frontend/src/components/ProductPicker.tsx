import { useEffect, useRef, useState } from 'react'
import { useDebounced } from '../hooks/useFetch'
import { api } from '../services/api'
import type { Paged } from '../types'
import { money } from '../utils/format'
import { Input } from './ui'

export interface ProductLite {
  id: string; sku: string; barcode: string; name: string; selling_price: number; purchase_rate?: number
  current_quantity: number; category_name: string; image_url: string | null
  stock_by_location: { location_id: string; location_name: string; quantity: number }[]
  status: string
}

/** Type a name / SKU / barcode / design number and pick a product. */
export function ProductPicker({ onPick, placeholder = 'Search product by name, SKU, barcode…', autoFocus, sellableOnly, clearOnPick = true }: {
  onPick: (p: ProductLite) => void; placeholder?: string; autoFocus?: boolean; sellableOnly?: boolean; clearOnPick?: boolean
}) {
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 250)
  const [items, setItems] = useState<ProductLite[]>([])
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!dq.trim()) { setItems([]); return }
    let alive = true
    api.get<Paged<ProductLite>>('/api/products', { q: dq, page_size: 8, sort: 'name', sellable_only: sellableOnly || undefined })
      .then((r) => alive && setItems(r.items)).catch(() => alive && setItems([]))
    return () => { alive = false }
  }, [dq, sellableOnly])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={box} className="relative">
      <Input value={q} autoFocus={autoFocus} placeholder={placeholder} onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} />
      {open && q.trim() && (
        <div className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-gold-300 bg-white shadow-2xl">
          {items.length === 0 && <div className="px-4 py-3 text-sm text-ink/50">No matching products.</div>}
          {items.map((p) => (
            <button key={p.id} type="button" className="flex w-full items-center gap-3 border-b border-stone-100 px-3 py-2 text-left hover:bg-gold-50"
              onClick={() => { onPick(p); if (clearOnPick) setQ(''); setOpen(false) }}>
              {p.image_url ? <img src={p.image_url} alt="" className="h-10 w-10 rounded object-cover" /> : <div className="flex h-10 w-10 items-center justify-center rounded bg-gold-100 text-gold-600">◇</div>}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{p.name}</div>
                <div className="text-xs text-ink/50">{p.sku} · {p.category_name}</div>
              </div>
              <div className="text-right text-xs">
                <div className="font-medium tabular">{money(p.selling_price)}</div>
                <div className={p.current_quantity === 0 ? 'text-red-600' : 'text-ink/50'}>{p.current_quantity} in stock</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
