import { useState } from 'react'
import { Badge, Button, EmptyState, ErrorBox, Field, Input, Modal, Notice, PageHeader, PageLoader, Pagination, Select, TableWrap, Td, Textarea, Th, Tr } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { useDebounced, useFetch } from '../../hooks/useFetch'
import { useToast } from '../../hooks/useToast'
import { api, ApiError, fileUrl } from '../../services/api'
import type { AppSettings, Paged } from '../../types'
import { fmtDateTime, money, todayIso } from '../../utils/format'

interface SaleRow {
  id: string; invoice_number: string; date_time: string; customer_name: string; cashier_name: string; item_count: number; subtotal: number
  discount_amount: number; total: number; payment_method: string; status: 'completed' | 'cancelled'; cancel_reason?: string; cancelled_at?: string
}
interface SaleDetail extends SaleRow {
  items: { name: string; sku: string; quantity: number; unit_price: number; discount_amount: number; line_total: number; allocations?: { location_name: string; quantity: number }[] }[]
  payments: { method: string; amount: number; reference: string }[]; tax_amount: number; tax_label: string; discount_type: string | null; discount_value: number; customer_mobile: string
}

export function SalesPage({ cancelledOnly = false }: { cancelledOnly?: boolean }) {
  const { can } = useAuth()
  const { toast } = useToast()
  const settings = useFetch(() => api.get<AppSettings>('/api/settings'))
  const cashiers = useFetch(() => api.get<{ items: { id: string; name: string }[] }>('/api/sales/cashiers').catch(() => ({ items: [] })))
  const [f, setF] = useState({ start: cancelledOnly ? '' : todayIso(), end: cancelledOnly ? '' : todayIso(), cashier_id: '', payment_method: '', status: cancelledOnly ? 'cancelled' : '' })
  const [customer, setCustomer] = useState('')
  const [invoice, setInvoice] = useState('')
  const dc = useDebounced(customer); const di = useDebounced(invoice)
  const [page, setPage] = useState(1)
  const [view, setView] = useState<SaleDetail | null>(null)
  const [cancelFor, setCancelFor] = useState<SaleRow | null>(null)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const { data, loading, error, reload } = useFetch(() => api.get<Paged<SaleRow>>('/api/sales', { ...f, customer: dc, invoice: di, page, page_size: 20 }), [f, dc, di, page])
  const set = (p: Partial<typeof f>) => { setF({ ...f, ...p }); setPage(1) }

  const open = async (id: string) => { try { setView(await api.get<SaleDetail>(`/api/sales/${id}`)) } catch (e) { toast(e instanceof ApiError ? e.message : 'Cannot open', 'error') } }
  const printBill = (s: { id: string }, reprint: boolean) => {
    if (reprint) api.post(`/api/sales/${s.id}/reprint`).catch(() => {})
    window.open(fileUrl(`/api/sales/${s.id}/invoice.pdf`), '_blank')
  }
  const cancel = async () => {
    if (!cancelFor) return
    setBusy(true); setErr('')
    try { await api.post(`/api/sales/${cancelFor.id}/cancel`, { reason }); toast(`${cancelFor.invoice_number} cancelled and stock restored.`); setCancelFor(null); setReason(''); setView(null); reload() }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not cancel') } finally { setBusy(false) }
  }
  const totalSum = data?.items.reduce((a, s) => a + (s.status === 'completed' ? s.total : 0), 0) ?? 0

  return (
    <div>
      <PageHeader title={cancelledOnly ? 'Returns / Cancellations' : 'Sales History'} subtitle={cancelledOnly ? 'Cancelled sales. Cancelling puts the pieces back in stock; the bill is kept for your records.' : 'Every bill you have made. Sales are never deleted - only cancelled.'} />
      {cancelledOnly && <div className="mb-4"><Notice>Partial returns (taking back only some items of a bill) are <b>not available yet</b>. To take back a sale, open it in <b>Sales History</b> and press <b>Cancel</b> - the whole bill is cancelled and the stock is restored.</Notice></div>}
      <div className="mb-4 grid gap-2 md:grid-cols-4 xl:grid-cols-8">
        <Input type="date" value={f.start} onChange={(e) => set({ start: e.target.value })} title="From" />
        <Input type="date" value={f.end} onChange={(e) => set({ end: e.target.value })} title="To" />
        <Input placeholder="Invoice no." value={invoice} onChange={(e) => { setInvoice(e.target.value); setPage(1) }} />
        <Input placeholder="Customer name / mobile" value={customer} onChange={(e) => { setCustomer(e.target.value); setPage(1) }} />
        <Select value={f.cashier_id} onChange={(e) => set({ cashier_id: e.target.value })}><option value="">All staff</option>{cashiers.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select value={f.payment_method} onChange={(e) => set({ payment_method: e.target.value })}><option value="">All payments</option>{settings.data?.billing.payment_methods.map((m) => <option key={m}>{m}</option>)}</Select>
        {!cancelledOnly && <Select value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="">All</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></Select>}
        <Button variant="ghost" onClick={() => { setF({ start: '', end: '', cashier_id: '', payment_method: '', status: cancelledOnly ? 'cancelled' : '' }); setCustomer(''); setInvoice('') }}>Clear filters</Button>
      </div>
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <PageLoader /> : data && data.items.length === 0 ? <EmptyState title="No sales found" hint="Change the dates or filters." /> : data && (
        <>
          <TableWrap><thead><tr><Th>Invoice</Th><Th>Date</Th><Th>Customer</Th><Th>Cashier</Th><Th right>Items</Th><Th right>Gross</Th><Th right>Discount</Th><Th right>Net amount</Th><Th>Payment</Th><Th>Status</Th><Th right>Actions</Th></tr></thead><tbody>
            {data.items.map((s) => (
              <Tr key={s.id} onClick={() => open(s.id)} className={s.status === 'cancelled' ? 'opacity-60' : ''}>
                <Td className="font-medium">{s.invoice_number}</Td><Td>{fmtDateTime(s.date_time)}</Td><Td>{s.customer_name}</Td><Td>{s.cashier_name}</Td><Td right>{s.item_count}</Td>
                <Td right>{money(s.subtotal)}</Td><Td right>{s.discount_amount ? money(s.discount_amount) : '—'}</Td><Td right><b>{money(s.total)}</b></Td><Td>{s.payment_method}</Td>
                <Td><Badge tone={s.status === 'completed' ? 'green' : 'red'}>{s.status}</Badge></Td>
                <Td right onClick={(e) => e.stopPropagation()}><div className="flex justify-end gap-1">
                  <Button size="sm" variant="outline" onClick={() => open(s.id)}>View</Button>
                  {can('billing.generate', 'billing.reprint') && <Button size="sm" variant="ghost" onClick={() => printBill(s, true)}>Print</Button>}
                  {s.status === 'completed' && can('sales.cancel') && <Button size="sm" variant="ghost" onClick={() => { setErr(''); setReason(''); setCancelFor(s) }}>Cancel</Button>}
                </div></Td></Tr>))}
            <Tr><Td colSpan={7} right><b>Total on this page (completed)</b></Td><Td right><b>{money(totalSum)}</b></Td><Td colSpan={3}></Td></Tr>
          </tbody></TableWrap>
          <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        </>
      )}

      {view && (
        <Modal title={`Invoice ${view.invoice_number}`} size="lg" onClose={() => setView(null)}
          footer={<>{can('billing.generate', 'billing.reprint') && <Button variant="gold" onClick={() => printBill(view, true)}>Print / Reprint invoice</Button>}
            {view.status === 'completed' && can('sales.cancel') && <Button variant="danger" onClick={() => { setErr(''); setReason(''); setCancelFor(view) }}>Cancel sale</Button>}
            <Button variant="outline" onClick={() => setView(null)}>Close</Button></>}>
          <div className="mb-3 grid gap-1 text-sm md:grid-cols-2">
            <div>Date: <b>{fmtDateTime(view.date_time)}</b></div><div>Status: <Badge tone={view.status === 'completed' ? 'green' : 'red'}>{view.status}</Badge></div>
            <div>Customer: <b>{view.customer_name}</b> {view.customer_mobile}</div><div>Cashier: <b>{view.cashier_name}</b></div>
          </div>
          {view.status === 'cancelled' && <div className="mb-3"><Notice tone="error">Cancelled {fmtDateTime(view.cancelled_at)} — {view.cancel_reason}</Notice></div>}
          <TableWrap><thead><tr><Th>Product</Th><Th>SKU</Th><Th right>Qty</Th><Th right>Rate</Th><Th right>Discount</Th><Th right>Amount</Th><Th>Stock taken from</Th></tr></thead><tbody>
            {view.items.map((i, k) => <Tr key={k}><Td>{i.name}</Td><Td>{i.sku}</Td><Td right>{i.quantity}</Td><Td right>{money(i.unit_price)}</Td><Td right>{i.discount_amount ? money(i.discount_amount) : '—'}</Td><Td right>{money(i.line_total)}</Td><Td className="text-xs text-ink/60">{(i.allocations ?? []).map((a) => `${a.location_name} × ${a.quantity}`).join(', ') || '—'}</Td></Tr>)}
          </tbody></TableWrap>
          <div className="mt-3 ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{money(view.subtotal)}</span></div>
            {view.discount_amount > 0 && <div className="flex justify-between text-red-700"><span>Discount{view.discount_type === 'percent' ? ` (${view.discount_value}%)` : ''}</span><span>- {money(view.discount_amount)}</span></div>}
            {view.tax_amount > 0 && <div className="flex justify-between"><span>{view.tax_label}</span><span>{money(view.tax_amount)}</span></div>}
            <div className="flex justify-between border-t border-gold-300 pt-1 font-display text-xl font-semibold text-maroon-900"><span>Final Amount</span><span>{money(view.total)}</span></div>
            <div className="pt-1 text-xs text-ink/60">Paid by: {view.payments.map((p) => `${p.method} ${money(p.amount)}${p.reference ? ` (${p.reference})` : ''}`).join(', ')}</div>
          </div>
        </Modal>)}

      {cancelFor && (
        <Modal title={`Cancel ${cancelFor.invoice_number}?`} size="sm" onClose={() => setCancelFor(null)}
          footer={<><Button variant="outline" onClick={() => setCancelFor(null)}>Keep sale</Button><Button variant="danger" loading={busy} disabled={reason.trim().length < 3} onClick={cancel}>Cancel this sale</Button></>}>
          <p className="mb-3 text-sm text-ink/70">The pieces go back into stock and the payment is marked refunded. The bill stays in your records marked <b>cancelled</b>.</p>
          <Field label="Reason" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. customer returned the item" autoFocus /></Field>
          <div className="mt-2"><ErrorBox message={err} /></div>
        </Modal>)}
    </div>
  )
}
