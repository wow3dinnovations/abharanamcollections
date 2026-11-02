import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, ErrorBox, Field, Input, Notice, PageHeader, PageLoader, Select, Textarea } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { useLookups } from '../../hooks/useLookups'
import { useToast } from '../../hooks/useToast'
import { api, ApiError } from '../../services/api'
import { money, todayIso } from '../../utils/format'

interface Form {
  name: string; category_id: string; subcategory_id: string; sku: string; barcode: string; description: string
  design_number: string; size: string; colour: string; material: string; collection: string; tags: string
  vendor_id: string; purchase_location_id: string; purchase_date: string; purchase_invoice_no: string
  purchase_rate: string; selling_price: string; discount_allowed_percent: string; min_selling_price: string
  initial_quantity: string; rack: string; status: string
}
const blank: Form = {
  name: '', category_id: '', subcategory_id: '', sku: '', barcode: '', description: '', design_number: '', size: '', colour: '',
  material: '', collection: '', tags: '', vendor_id: '', purchase_location_id: '', purchase_date: todayIso(), purchase_invoice_no: '',
  purchase_rate: '', selling_price: '', discount_allowed_percent: '', min_selling_price: '', initial_quantity: '', rack: '', status: 'active',
}

export function ProductFormPage() {
  const { id } = useParams()
  const editing = !!id
  const nav = useNavigate()
  const { toast } = useToast()
  const { can } = useAuth()
  const { categories, subcategories, vendors, locations, loaded } = useLookups()
  const [f, setF] = useState<Form>(blank)
  const [loading, setLoading] = useState(editing)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [canSeeCost, setCanSeeCost] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!id) return
    api.get<Record<string, unknown>>(`/api/products/${id}`).then((p) => {
      setCanSeeCost(p.purchase_rate !== undefined)
      setF({
        ...blank, name: String(p.name), category_id: String(p.category_id), subcategory_id: String(p.subcategory_id ?? ''), sku: String(p.sku), barcode: String(p.barcode),
        description: String(p.description ?? ''), design_number: String(p.design_number ?? ''), size: String(p.size ?? ''), colour: String(p.colour ?? ''),
        material: String(p.material ?? ''), collection: String(p.collection ?? ''), tags: ((p.tags as string[]) ?? []).join(', '), vendor_id: String(p.vendor_id ?? ''),
        purchase_invoice_no: String(p.purchase_invoice_no ?? ''), purchase_rate: String(p.purchase_rate ?? ''), selling_price: String(p.selling_price),
        discount_allowed_percent: p.discount_allowed_percent == null ? '' : String(p.discount_allowed_percent), min_selling_price: p.min_selling_price == null ? '' : String(p.min_selling_price),
        rack: String(p.rack ?? ''), status: String(p.status),
      })
      setPreview((p.image_url as string) ?? null)
    }).catch((e) => setErr(e instanceof ApiError ? e.message : 'Cannot load product')).finally(() => setLoading(false))
  }, [id])

  if (loading || !loaded) return <PageLoader />
  const set = (patch: Partial<Form>) => setF({ ...f, ...patch })
  const catCode = categories.find((c) => c.id === f.category_id)?.code
  const qty = Number(f.initial_quantity) || 0
  const total = qty * (Number(f.purchase_rate) || 0)
  const subs = subcategories.filter((s) => s.category_id === f.category_id && s.active)
  const num = (s: string) => (s.trim() === '' ? null : Number(s))

  const save = async () => {
    setBusy(true); setErr('')
    try {
      const common = {
        name: f.name, category_id: f.category_id, subcategory_id: f.subcategory_id, sku: f.sku, barcode: f.barcode, description: f.description,
        design_number: f.design_number, size: f.size, colour: f.colour, material: f.material, collection: f.collection, tags: f.tags,
        vendor_id: f.vendor_id, purchase_invoice_no: f.purchase_invoice_no, selling_price: Number(f.selling_price),
        discount_allowed_percent: num(f.discount_allowed_percent), min_selling_price: num(f.min_selling_price), rack: f.rack,
      }
      let pid = id
      if (editing) {
        await api.put(`/api/products/${id}`, { ...common, ...(canSeeCost ? { purchase_rate: Number(f.purchase_rate) } : {}), status: f.status })
      } else {
        const created = await api.post<{ id: string }>('/api/products', { ...common, purchase_rate: Number(f.purchase_rate) || 0, purchase_location_id: f.purchase_location_id,
          purchase_date: f.purchase_date, initial_quantity: qty })
        pid = created.id
      }
      if (file && pid) {
        const form = new FormData(); form.append('file', file)
        try { await api.upload(`/api/products/${pid}/image`, form) } catch (e) { toast(`Product saved, but the picture failed: ${e instanceof ApiError ? e.message : ''}`, 'error') }
      }
      toast(editing ? 'Product updated.' : 'Product added.')
      nav(`/inventory/products/${pid}`)
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not save.') } finally { setBusy(false) }
  }

  return (
    <div>
      <PageHeader title={editing ? 'Edit product' : 'Add product'} subtitle={editing ? f.sku : 'Enter the product once - stock, purchase record and barcode are created for you.'} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <h2 className="mb-3 font-display text-xl font-semibold text-maroon-800">Product information</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Product name" required className="md:col-span-2"><Input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Gold Finish Jhumka" autoFocus /></Field>
              <Field label="Category" required>
                <Select value={f.category_id} onChange={(e) => set({ category_id: e.target.value, subcategory_id: '' })}>
                  <option value="">Choose…</option>{categories.filter((c) => c.active || c.id === f.category_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Sub-category"><Select value={f.subcategory_id} onChange={(e) => set({ subcategory_id: e.target.value })}><option value="">—</option>{subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
              <Field label="SKU / Product code" hint={editing ? 'Changing the SKU means labels must be re-printed.' : `Leave blank to auto-create${catCode ? ` (e.g. ABH-${catCode}-000001)` : ''}.`}><Input value={f.sku} onChange={(e) => set({ sku: e.target.value.toUpperCase() })} /></Field>
              <Field label="Barcode" hint="Leave blank to use the SKU as the barcode."><Input value={f.barcode} onChange={(e) => set({ barcode: e.target.value.toUpperCase() })} /></Field>
              <Field label="Design number"><Input value={f.design_number} onChange={(e) => set({ design_number: e.target.value })} /></Field>
              <Field label="Collection"><Input value={f.collection} onChange={(e) => set({ collection: e.target.value })} placeholder="Bridal, Festive, Daily wear…" /></Field>
              <Field label="Size"><Input value={f.size} onChange={(e) => set({ size: e.target.value })} /></Field>
              <Field label="Colour"><Input value={f.colour} onChange={(e) => set({ colour: e.target.value })} /></Field>
              <Field label="Material"><Input value={f.material} onChange={(e) => set({ material: e.target.value })} /></Field>
              <Field label="Tags" hint="Separate with commas"><Input value={f.tags} onChange={(e) => set({ tags: e.target.value })} /></Field>
              <Field label="Description" className="md:col-span-2"><Textarea value={f.description} onChange={(e) => set({ description: e.target.value })} /></Field>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 font-display text-xl font-semibold text-maroon-800">Purchase & stock</h2>
            {!canSeeCost && editing && <Notice>Purchase details are hidden for your login.</Notice>}
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Vendor"><Select value={f.vendor_id} onChange={(e) => set({ vendor_id: e.target.value })}><option value="">—</option>{vendors.filter((v) => v.active || v.id === f.vendor_id).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
              {(canSeeCost || !editing) && <Field label="Purchase rate (₹, each)"><Input type="number" min="0" step="0.01" value={f.purchase_rate} onChange={(e) => set({ purchase_rate: e.target.value })} /></Field>}
              <Field label="Purchase invoice no."><Input value={f.purchase_invoice_no} onChange={(e) => set({ purchase_invoice_no: e.target.value })} /></Field>
              {!editing && (
                <>
                  <Field label="Quantity" hint="Pieces you are adding now"><Input type="number" min="0" step="1" value={f.initial_quantity} onChange={(e) => set({ initial_quantity: e.target.value })} /></Field>
                  <Field label="Location" required={qty > 0}><Select value={f.purchase_location_id} onChange={(e) => set({ purchase_location_id: e.target.value })}><option value="">Choose…</option>{locations.filter((l) => l.active).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
                  <Field label="Purchase date"><Input type="date" value={f.purchase_date} onChange={(e) => set({ purchase_date: e.target.value })} /></Field>
                </>
              )}
              <Field label="Rack / Shelf / Bin"><Input value={f.rack} onChange={(e) => set({ rack: e.target.value })} /></Field>
            </div>
            {!editing && qty > 0 && <div className="mt-3 text-sm text-ink/70">Total purchase value: <b className="text-maroon-900">{money(total)}</b> — recorded as an <b>inventory purchase</b> (not an expense).</div>}
            {editing && <p className="mt-3 text-xs text-ink/50">To change quantity use <b>Adjust stock</b> on the product page; to add more stock use <b>Purchases</b>. This keeps a full history.</p>}
          </Card>

          <Card>
            <h2 className="mb-3 font-display text-xl font-semibold text-maroon-800">Selling</h2>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Selling price (₹)" required><Input type="number" min="0" step="0.01" value={f.selling_price} onChange={(e) => set({ selling_price: e.target.value })} /></Field>
              <Field label="Discount allowed (%)" hint="Optional maximum"><Input type="number" min="0" max="100" value={f.discount_allowed_percent} onChange={(e) => set({ discount_allowed_percent: e.target.value })} /></Field>
              {(canSeeCost || !editing) && <Field label="Minimum selling price (₹)" hint="Optional"><Input type="number" min="0" step="0.01" value={f.min_selling_price} onChange={(e) => set({ min_selling_price: e.target.value })} /></Field>}
              {editing && <Field label="Status"><Select value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive (cannot be sold)</option></Select></Field>}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <h2 className="mb-3 font-display text-xl font-semibold text-maroon-800">Picture</h2>
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-dashed border-gold-300 bg-cream">
              {preview ? <img src={preview} alt="preview" className="h-full w-full object-cover" /> : <span className="text-sm text-ink/40">No picture yet</span>}
            </div>
            <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp" hidden onChange={(e) => { const fl = e.target.files?.[0]; if (fl) { setFile(fl); setPreview(URL.createObjectURL(fl)) } }} />
            <Button className="mt-3 w-full" variant="outline" onClick={() => fileRef.current?.click()}>{preview ? 'Change picture…' : 'Choose picture…'}</Button>
            <p className="mt-2 text-xs text-ink/50">JPG, PNG or WEBP, up to 6 MB. Stored on this computer.</p>
          </Card>
          <ErrorBox message={err} />
          <div className="flex gap-2">
            <Button variant="gold" size="lg" className="flex-1" loading={busy} disabled={!can(editing ? 'inventory.edit_product' : 'inventory.add_product')} onClick={save}>{editing ? 'Save changes' : 'Save product'}</Button>
            <Button variant="outline" size="lg" onClick={() => nav(-1)}>Cancel</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
