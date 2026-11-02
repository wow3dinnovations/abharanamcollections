import { useMemo, useState, type ReactNode } from 'react'
import { useLookups } from '../hooks/useLookups'
import { useToast } from '../hooks/useToast'
import { api, ApiError } from '../services/api'
import { money } from '../utils/format'
import { Button, ErrorBox, Field, Input, Modal, Notice, Select, Textarea } from './ui'

export interface StockProduct {
  id: string; name: string; sku: string
  stock_by_location: { location_id: string; location_name: string; quantity: number }[]
  purchase_rate?: number      // only present when the signed-in person may see cost prices
  vendor_id?: string
}

/** Locations the person can choose: every active one, plus any inactive one that still holds this product. */
function useChoosableLocations(product: StockProduct) {
  const { locations } = useLookups()
  return useMemo(() => locations.filter((l) => l.active || product.stock_by_location.some((s) => s.location_id === l.id)), [locations, product])
}
const stockAt = (p: StockProduct, loc: string) => p.stock_by_location.find((s) => s.location_id === loc)?.quantity ?? 0
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)

function Summary({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <div className="divide-y divide-gold-200 rounded-xl border border-gold-300 bg-gold-50/60 text-sm">
      {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 px-4 py-2"><span className="text-ink/60">{k}</span><span className="text-right font-medium">{v}</span></div>)}
    </div>
  )
}

/* ---------------------------------------------------------------- ADD STOCK: increase by a number */
export function AddStockModal({ product, locationId, onClose, onDone }: { product: StockProduct; locationId?: string; onClose: () => void; onDone: () => void }) {
  const { vendors } = useLookups()
  const { toast } = useToast()
  const locs = useChoosableLocations(product)
  const canCost = product.purchase_rate !== undefined
  const [loc, setLoc] = useState(locationId || product.stock_by_location[0]?.location_id || '')
  const [qty, setQty] = useState('')
  const [kind, setKind] = useState<'PURCHASE' | 'OTHER'>('PURCHASE')
  const [rate, setRate] = useState('')
  const [vendor, setVendor] = useState(canCost ? product.vendor_id ?? '' : '')
  const [remarks, setRemarks] = useState('')
  const [step, setStep] = useState<'form' | 'confirm'>('form')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const n = Number(qty)
  const current = stockAt(product, loc)
  const locName = locs.find((l) => l.id === loc)?.name ?? ''
  const vendorName = vendors.find((v) => v.id === vendor)?.name ?? ''

  const problem = (): string => {
    if (!loc) return 'Please choose the location.'
    if (qty.trim() === '' || !Number.isFinite(n)) return 'Enter how many pieces to add.'
    if (!Number.isInteger(n)) return 'Enter a whole number of pieces.'
    if (n < 0) return 'The quantity cannot be negative.'
    if (n < 1) return 'Enter at least 1 piece to add.'
    if (kind === 'PURCHASE' && rate.trim() !== '' && (!Number.isFinite(Number(rate)) || Number(rate) < 0)) return 'The purchase rate cannot be negative.'
    if (kind === 'OTHER' && !remarks.trim()) return 'Please write in the remarks where this stock came from (found, returned, gift…).'
    return ''
  }
  const review = () => { const p = problem(); setErr(p); if (!p) setStep('confirm') }

  const save = async () => {
    setBusy(true); setErr('')
    try {
      await api.post('/api/inventory/add-stock', {
        product_id: product.id, location_id: loc, quantity: n, kind, remarks,
        purchase_rate: kind === 'PURCHASE' && canCost && rate.trim() !== '' ? Number(rate) : null,
        vendor_id: kind === 'PURCHASE' && canCost ? vendor : '',
      })
      toast(`Added ${n} × ${product.name} at ${locName}. Stock is now ${current + n}.`)
      onDone(); onClose()
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not add the stock.'); setStep('form') } finally { setBusy(false) }
  }

  return (
    <Modal title={step === 'form' ? 'Add stock' : 'Please confirm'} size="md" onClose={onClose}
      footer={step === 'form'
        ? <><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={review}>Review…</Button></>
        : <><Button variant="outline" onClick={() => setStep('form')} disabled={busy}>← Back</Button><Button variant="gold" loading={busy} onClick={save}>Confirm & save</Button></>}>
      <div className="mb-3 text-sm"><b>{product.name}</b> <span className="text-ink/50">({product.sku})</span></div>
      {step === 'form' ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Location" required>
            <Select value={loc} onChange={(e) => setLoc(e.target.value)}><option value="">Choose…</option>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}{l.active ? '' : ' (inactive)'}</option>)}</Select>
          </Field>
          <Field label="Pieces to add" required hint={loc ? `Now ${current} here → ${Number.isInteger(n) && n > 0 ? current + n : '…'} after` : undefined}>
            <Input type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
          </Field>
          <Field label="What is this?" className="md:col-span-2">
            <Select value={kind} onChange={(e) => setKind(e.target.value as 'PURCHASE' | 'OTHER')}>
              <option value="PURCHASE">New stock bought (recorded as a Purchase)</option>
              <option value="OTHER">Other - found, returned, gift… (not a purchase)</option>
            </Select>
          </Field>
          {kind === 'PURCHASE' && canCost && (<>
            <Field label="Purchase rate (₹ each)" hint={`Optional. Blank keeps the current cost (${money(product.purchase_rate ?? 0)}).`}><Input type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
            <Field label="Vendor" hint="Optional"><Select value={vendor} onChange={(e) => setVendor(e.target.value)}><option value="">—</option>{vendors.filter((v) => v.active || v.id === vendor).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
          </>)}
          <Field label="Remarks" required={kind === 'OTHER'} className="md:col-span-2" hint={kind === 'OTHER' ? 'Say where this stock came from.' : 'Optional'}>
            <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
        </div>
      ) : (
        <div className="space-y-3">
          <Summary rows={[
            ['Location', locName], ['Stock at this location', <><span className="text-ink/60">{current}</span> → <b className="text-emerald-700">{current + n}</b> ({signed(n)})</>],
            ['Type', kind === 'PURCHASE' ? 'New stock bought (Purchase)' : 'Other (not a purchase)'],
            ...(kind === 'PURCHASE' && canCost ? [['Purchase rate', rate.trim() === '' ? `Current cost kept (${money(product.purchase_rate ?? 0)})` : money(Number(rate))] as [string, ReactNode], ['Vendor', vendorName || '—'] as [string, ReactNode]] : []),
            ['Remarks', remarks.trim() || '—'],
          ]} />
          <Notice>This will add <b>{n}</b> piece{n === 1 ? '' : 's'} to the stock and be saved in the stock history{kind === 'PURCHASE' ? ' and in Purchases' : ''}. Check the numbers, then confirm.</Notice>
        </div>
      )}
      <div className="mt-3"><ErrorBox message={err} /></div>
    </Modal>
  )
}

/* ---------------------------------------------------------------- ADJUST STOCK: set the counted quantity */
const REASONS: { value: string; label: string }[] = [
  { value: 'COUNT_CORRECTION', label: 'Counting correction (after a physical count)' },
  { value: 'DAMAGE', label: 'Damaged' },
  { value: 'LOST', label: 'Lost' },
  { value: 'OTHER', label: 'Other' },
]

export function AdjustStockModal({ product, locationId, onClose, onDone }: { product: StockProduct; locationId?: string; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast()
  const locs = useChoosableLocations(product)
  const [loc, setLoc] = useState(locationId || product.stock_by_location[0]?.location_id || '')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('COUNT_CORRECTION')
  const [remarks, setRemarks] = useState('')
  const [step, setStep] = useState<'form' | 'confirm'>('form')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const n = Number(qty)
  const current = stockAt(product, loc)
  const delta = Number.isInteger(n) ? n - current : 0
  const locName = locs.find((l) => l.id === loc)?.name ?? ''
  const reasonLabel = REASONS.find((r) => r.value === reason)?.label.split(' (')[0] ?? reason

  const problem = (): string => {
    if (!loc) return 'Please choose the location.'
    if (qty.trim() === '' || !Number.isFinite(n)) return 'Enter the correct quantity (what you counted).'
    if (n < 0) return 'The quantity cannot be negative.'
    if (!Number.isInteger(n)) return 'Enter a whole number of pieces.'
    if (delta === 0) return `The quantity at ${locName} is already ${current}. There is nothing to change.`
    if ((reason === 'DAMAGE' || reason === 'LOST') && delta > 0) return 'Damaged or lost stock must lower the quantity.'
    if (reason === 'OTHER' && !remarks.trim()) return 'Please explain the reason in the remarks.'
    return ''
  }
  const review = () => { const p = problem(); setErr(p); if (!p) setStep('confirm') }

  const save = async () => {
    setBusy(true); setErr('')
    try {
      await api.post('/api/inventory/set-quantity', { product_id: product.id, location_id: loc, new_quantity: n, reason, remarks })
      toast(`Stock of ${product.name} at ${locName} is now ${n}.`)
      onDone(); onClose()
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not change the stock.'); setStep('form') } finally { setBusy(false) }
  }

  return (
    <Modal title={step === 'form' ? 'Adjust stock' : 'Please confirm'} size="md" onClose={onClose}
      footer={step === 'form'
        ? <><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={review}>Review…</Button></>
        : <><Button variant="outline" onClick={() => setStep('form')} disabled={busy}>← Back</Button><Button variant="gold" loading={busy} onClick={save}>Confirm & save</Button></>}>
      <div className="mb-3 text-sm"><b>{product.name}</b> <span className="text-ink/50">({product.sku})</span></div>
      {step === 'form' ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Location" required>
            <Select value={loc} onChange={(e) => setLoc(e.target.value)}><option value="">Choose…</option>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}{l.active ? '' : ' (inactive)'}</option>)}</Select>
          </Field>
          <div className="flex items-end pb-2 text-sm">Currently in the system: <b className="ml-1 text-lg">{loc ? current : '—'}</b></div>
          <Field label="Correct quantity (what you counted)" required hint={loc && qty !== '' && Number.isInteger(n) && n >= 0 ? `${current} → ${n} (${signed(delta)})` : 'The real number of pieces at this location'}>
            <Input type="number" min="0" step="1" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
          </Field>
          <Field label="Reason" required>
            <Select value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</Select>
          </Field>
          <Field label="Remarks" required={reason === 'OTHER'} className="md:col-span-2" hint={reason === 'OTHER' ? 'Please explain.' : 'Optional'}>
            <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
        </div>
      ) : (
        <div className="space-y-3">
          <Summary rows={[
            ['Location', locName],
            ['Quantity', <><span className="text-ink/60">{current}</span> → <b className={delta < 0 ? 'text-red-700' : 'text-emerald-700'}>{n}</b> ({signed(delta)})</>],
            ['Reason', reasonLabel], ['Remarks', remarks.trim() || '—'],
          ]} />
          <Notice tone="warn">The stock at <b>{locName}</b> will be set to <b>{n}</b>. This is saved in the stock history with your name and cannot be undone except by another adjustment. Check the numbers, then confirm.</Notice>
        </div>
      )}
      <div className="mt-3"><ErrorBox message={err} /></div>
    </Modal>
  )
}
