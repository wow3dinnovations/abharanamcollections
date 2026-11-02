import { useEffect, useRef, useState } from 'react'
import { Logo } from '../../components/Logo'
import { Button, Card, Checkbox, ErrorBox, Field, Input, Notice, PageHeader, PageLoader, Select, Tabs, Textarea } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { useFetch } from '../../hooks/useFetch'
import { useToast } from '../../hooks/useToast'
import { api, ApiError } from '../../services/api'
import type { AppSettings } from '../../types'

type Tab = 'business' | 'inventory' | 'billing' | 'expenses' | 'printer'
interface Loc { id: string; name: string; active: boolean }

export function SettingsPage() {
  const { toast } = useToast()
  const { refreshBranding } = useAuth()
  const { data, loading, error, reload } = useFetch(() => api.get<AppSettings>('/api/settings'))
  const locs = useFetch(() => api.get<{ items: Loc[] }>('/api/locations').catch(() => ({ items: [] as Loc[] })))
  const [s, setS] = useState<AppSettings | null>(null)
  const [tab, setTab] = useState<Tab>('business')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [logoKey, setLogoKey] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (data) setS(structuredClone(data)) }, [data])
  if (loading && !s) return <PageLoader />
  if (!s) return <ErrorBox message={error || 'Could not load settings'} onRetry={reload} />

  const set = <K extends keyof AppSettings>(section: K, patch: Partial<AppSettings[K]>) => setS({ ...s, [section]: { ...s[section], ...patch } })

  const save = async (section: Tab) => {
    setBusy(true); setErr('')
    try {
      await api.put('/api/settings', { [section]: s[section] })
      toast('Settings saved.')
      await reload(); await refreshBranding()
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not save settings.') } finally { setBusy(false) }
  }

  const uploadLogo = async (f: File) => {
    const form = new FormData(); form.append('file', f)
    try { await api.upload('/api/settings/logo', form); toast('Logo updated.'); await refreshBranding(); setLogoKey((k) => k + 1) }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Upload failed', 'error') }
  }

  const SaveBar = ({ section }: { section: Tab }) => (
    <div className="mt-5 flex items-center gap-3"><Button loading={busy} onClick={() => save(section)}>Save {section} settings</Button><ErrorBox message={err} /></div>
  )

  return (
    <div>
      <PageHeader title="Settings" subtitle="Business details, barcode labels, billing rules and printer." />
      <Tabs<Tab> value={tab} onChange={(t) => { setTab(t); setErr('') }} tabs={[
        { id: 'business', label: 'Business' }, { id: 'inventory', label: 'Inventory & Barcode' }, { id: 'billing', label: 'Billing' },
        { id: 'expenses', label: 'Expenses' }, { id: 'printer', label: 'Printer' }]} />

      {tab === 'business' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Business name"><Input value={s.business.name} onChange={(e) => set('business', { name: e.target.value })} /></Field>
              <Field label="Tagline"><Input value={s.business.tagline} onChange={(e) => set('business', { tagline: e.target.value })} /></Field>
              <Field label="Address" className="md:col-span-2"><Textarea value={s.business.address} onChange={(e) => set('business', { address: e.target.value })} /></Field>
              <Field label="Phone"><Input value={s.business.phone} onChange={(e) => set('business', { phone: e.target.value })} /></Field>
              <Field label="Email"><Input value={s.business.email} onChange={(e) => set('business', { email: e.target.value })} /></Field>
              <Field label="GST number (optional)"><Input value={s.business.gstin} onChange={(e) => set('business', { gstin: e.target.value })} /></Field>
              <Field label="Currency"><Input value={`${s.business.currency} (${s.business.currency_symbol})`} disabled /></Field>
            </div>
            <SaveBar section="business" />
          </Card>
          <Card>
            <div className="mb-3 font-display text-xl text-maroon-900">Logo</div>
            <div key={logoKey} className="flex min-h-28 items-center justify-center rounded-xl border border-dashed border-gold-300 bg-cream p-4"><Logo size={80} /></div>
            <p className="mt-3 text-xs text-ink/60">Used on the login page, menu, invoices and barcode tags. You can also copy the file to <code>assets/logo/logo.png</code>.</p>
            <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.svg,.webp" hidden onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
            <Button className="mt-3" variant="outline" onClick={() => fileRef.current?.click()}>Upload logo…</Button>
          </Card>
        </div>
      )}

      {tab === 'inventory' && (
        <Card>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="SKU prefix" hint="e.g. ABH → ABH-EAR-000001"><Input value={s.inventory.sku_prefix} onChange={(e) => set('inventory', { sku_prefix: e.target.value.toUpperCase() })} /></Field>
            <Field label="Low-stock threshold" hint="At or below this many pieces = low stock"><Input type="number" min="0" value={s.inventory.low_stock_threshold} onChange={(e) => set('inventory', { low_stock_threshold: Number(e.target.value) })} /></Field>
            <Field label="Old stock after (days)"><Input type="number" min="1" value={s.inventory.old_stock_days} onChange={(e) => set('inventory', { old_stock_days: Number(e.target.value) })} /></Field>
            <Field label="Default location">
              <Select value={s.inventory.default_location_id} onChange={(e) => set('inventory', { default_location_id: e.target.value })}>
                <option value="">— none —</option>
                {locs.data?.items.filter((l) => l.active).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </Field>
            <Field label="Barcode type"><Input value="Code 128" disabled /></Field>
            <Field label="Barcode on the tag" hint="Short number fits tiny tags. The SKU still identifies every product.">
              <Select value={s.inventory.barcode_mode} onChange={(e) => set('inventory', { barcode_mode: e.target.value as 'short' | 'sku' })}>
                <option value="short">Short number (recommended for small tags)</option><option value="sku">The SKU itself (needs a wide tag)</option>
              </Select></Field>
            <Field label="Short barcode digits" hint="6 is enough for a million products"><Input type="number" min="6" max="12" value={s.inventory.short_barcode_digits} onChange={(e) => set('inventory', { short_barcode_digits: Number(e.target.value) })} /></Field>
            <Field label="Thinnest bar width (mm)" hint="0 = fit to the tag. Choose it on the Printer Test page."><Input type="number" min="0" max="1" step="0.001" value={s.inventory.barcode_module_mm} onChange={(e) => set('inventory', { barcode_module_mm: Number(e.target.value) })} /></Field>
            <Field label="Default label size">
              <Select value={s.inventory.label_size_id} onChange={(e) => set('inventory', { label_size_id: e.target.value })}>
                {s.inventory.label_sizes.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </Field>
          </div>
          <div className="mt-5 font-display text-lg text-maroon-800">Label sizes</div>
          <div className="mt-2 space-y-2">
            {s.inventory.label_sizes.map((l, i) => (
              <div key={i} className="grid grid-cols-2 items-end gap-2 md:grid-cols-5">
                <Field label="Id"><Input value={l.id} onChange={(e) => { const a = [...s.inventory.label_sizes]; a[i] = { ...l, id: e.target.value }; set('inventory', { label_sizes: a }) }} /></Field>
                <Field label="Name"><Input value={l.name} onChange={(e) => { const a = [...s.inventory.label_sizes]; a[i] = { ...l, name: e.target.value }; set('inventory', { label_sizes: a }) }} /></Field>
                <Field label="Width (mm)"><Input type="number" value={l.width_mm} onChange={(e) => { const a = [...s.inventory.label_sizes]; a[i] = { ...l, width_mm: Number(e.target.value) }; set('inventory', { label_sizes: a }) }} /></Field>
                <Field label="Height (mm)"><Input type="number" value={l.height_mm} onChange={(e) => { const a = [...s.inventory.label_sizes]; a[i] = { ...l, height_mm: Number(e.target.value) }; set('inventory', { label_sizes: a }) }} /></Field>
                <Button variant="ghost" size="sm" disabled={s.inventory.label_sizes.length <= 1} onClick={() => set('inventory', { label_sizes: s.inventory.label_sizes.filter((_, j) => j !== i) })}>Remove</Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => set('inventory', { label_sizes: [...s.inventory.label_sizes, { id: `${s.inventory.label_sizes.length + 1}-custom`, name: 'Custom', width_mm: 50, height_mm: 30 }] })}>+ Add label size</Button>
          </div>
          <SaveBar section="inventory" />
        </Card>
      )}

      {tab === 'billing' && (
        <Card>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Invoice prefix"><Input value={s.billing.invoice_prefix} onChange={(e) => set('billing', { invoice_prefix: e.target.value })} /></Field>
            <Field label="Starting invoice number" hint="Only applies before the first bill is made"><Input type="number" min="1" value={s.billing.starting_invoice_number} onChange={(e) => set('billing', { starting_invoice_number: Number(e.target.value) })} /></Field>
            <Field label="Default payment method">
              <Select value={s.billing.default_payment_method} onChange={(e) => set('billing', { default_payment_method: e.target.value })}>
                {s.billing.payment_methods.map((m) => <option key={m}>{m}</option>)}
              </Select>
            </Field>
            <Field label="Payment methods (one per line)" className="md:col-span-1">
              <Textarea rows={5} value={s.billing.payment_methods.join('\n')} onChange={(e) => set('billing', { payment_methods: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} />
            </Field>
            <Field label="Invoice footer message" className="md:col-span-2"><Textarea rows={5} value={s.billing.invoice_footer} onChange={(e) => set('billing', { invoice_footer: e.target.value })} /></Field>
          </div>
          <div className="mt-5 font-display text-lg text-maroon-800">Discount rules</div>
          <div className="mt-2 grid gap-3 md:grid-cols-3">
            <div className="pt-6"><Checkbox checked={s.billing.staff_can_discount} onChange={(v) => set('billing', { staff_can_discount: v })} label="Staff (with the 'Give Discount' permission) may give discounts" /></div>
            <Field label="Staff max discount %" hint="Blank = no limit"><Input type="number" min="0" max="100" value={s.billing.staff_max_discount_percent ?? ''} onChange={(e) => set('billing', { staff_max_discount_percent: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
            <Field label="Staff max discount ₹ per bill" hint="Blank = no limit"><Input type="number" min="0" value={s.billing.staff_max_discount_amount ?? ''} onChange={(e) => set('billing', { staff_max_discount_amount: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
          </div>
          <div className="mt-5 font-display text-lg text-maroon-800">GST / Tax</div>
          <Notice>Tax is <b>off</b> by default. Only switch it on after confirming with your accountant how GST applies to your business.</Notice>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <div className="pt-6"><Checkbox checked={s.billing.tax_enabled} onChange={(v) => set('billing', { tax_enabled: v })} label="Charge tax on bills" /></div>
            <Field label="Tax name"><Input value={s.billing.tax_label} onChange={(e) => set('billing', { tax_label: e.target.value })} /></Field>
            <Field label="Rate %"><Input type="number" min="0" max="100" step="0.01" value={s.billing.tax_rate} onChange={(e) => set('billing', { tax_rate: Number(e.target.value) })} /></Field>
            <Field label="Prices">
              <Select value={s.billing.tax_mode} onChange={(e) => set('billing', { tax_mode: e.target.value as 'exclusive' | 'inclusive' })}>
                <option value="exclusive">Tax is added on top</option><option value="inclusive">Tax already included in price</option>
              </Select>
            </Field>
          </div>
          <SaveBar section="billing" />
        </Card>
      )}

      {tab === 'expenses' && (
        <Card>
          <Field label="Default expense payment method" className="max-w-xs">
            <Select value={s.expenses.default_payment_method} onChange={(e) => set('expenses', { default_payment_method: e.target.value })}>
              {s.billing.payment_methods.map((m) => <option key={m}>{m}</option>)}
            </Select>
          </Field>
          <p className="mt-3 text-sm text-ink/60">Expense categories are managed in <b>Administration → Categories</b>.</p>
          <SaveBar section="expenses" />
        </Card>
      )}

      {tab === 'printer' && (
        <Card>
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Printer name"><Input value={s.printer.name} onChange={(e) => set('printer', { name: e.target.value })} /></Field>
            <Field label="Printer model"><Input value={s.printer.model} onChange={(e) => set('printer', { model: e.target.value })} /></Field>
            <Field label="Label size">
              <Select value={s.printer.label_size_id} onChange={(e) => set('printer', { label_size_id: e.target.value })}>
                {s.inventory.label_sizes.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </Field>
            <Field label="Default copies"><Input type="number" min="1" value={s.printer.copies} onChange={(e) => set('printer', { copies: Number(e.target.value) })} /></Field>
            <Field label="Connection"><Input value={s.printer.connection} onChange={(e) => set('printer', { connection: e.target.value })} placeholder="USB" /></Field>
            <div className="pt-6"><Checkbox checked={s.printer.rotate} onChange={(v) => set('printer', { rotate: v })} label="Print tags sideways (turn 90°)" /></div>
          </div>
          <Notice>Labels are printed through your browser's print window, which works with any printer installed on Windows. Direct printer commands are not used.</Notice>
          <SaveBar section="printer" />
        </Card>
      )}
    </div>
  )
}
