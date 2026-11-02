import { useState } from 'react'
import { Badge, Button, EmptyState, ErrorBox, Field, Input, Modal, PageHeader, PageLoader, Pagination, TableWrap, Td, Textarea, Th, Tr } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { useDebounced, useFetch } from '../../hooks/useFetch'
import { useToast } from '../../hooks/useToast'
import { api, ApiError } from '../../services/api'
import type { Paged } from '../../types'
import { fmtDate, fmtDateTime, money } from '../../utils/format'

interface Cust { id: string; name: string; mobile: string; email: string; address: string; notes: string; active: boolean; bill_count: number; total_spent: number; last_purchase: string }
interface CustDetail extends Cust { sales: { id: string; invoice_number: string; date_time: string; total: number; status: string; payment_method: string }[] }

export function CustomersPage() {
  const { can } = useAuth()
  const { toast } = useToast()
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const [page, setPage] = useState(1)
  const [form, setForm] = useState<Partial<Cust> | null>(null)
  const [detail, setDetail] = useState<CustDetail | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const { data, loading, error, reload } = useFetch(() => api.get<Paged<Cust>>('/api/customers', { q: dq, page, page_size: 25 }), [dq, page])

  const save = async () => {
    if (!form) return
    setBusy(true); setErr('')
    try {
      const body = { name: form.name, mobile: form.mobile, email: form.email, address: form.address, notes: form.notes }
      if (form.id) await api.put(`/api/customers/${form.id}`, body); else await api.post('/api/customers', body)
      toast('Customer saved.'); setForm(null); reload()
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not save') } finally { setBusy(false) }
  }
  const open = async (id: string) => { try { setDetail(await api.get<CustDetail>(`/api/customers/${id}`)) } catch (e) { toast(e instanceof ApiError ? e.message : 'Cannot open', 'error') } }

  return (
    <div>
      <PageHeader title="Customers" subtitle="Optional - walk-in customers need no record. Customers appear here when you add them at billing."
        actions={can('customers.manage') && <Button onClick={() => { setErr(''); setForm({ name: '', mobile: '', email: '', address: '', notes: '' }) }}>+ Add customer</Button>} />
      <div className="mb-4 max-w-md"><Input placeholder="Search name, mobile, email…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} /></div>
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <PageLoader /> : data && data.items.length === 0 ? <EmptyState title="No customers yet" /> : data && (
        <>
          <TableWrap><thead><tr><Th>Name</Th><Th>Mobile</Th><Th>Email</Th><Th right>Bills</Th><Th right>Total spent</Th><Th>Last purchase</Th><Th>Status</Th><Th right>Actions</Th></tr></thead><tbody>
            {data.items.map((c) => (
              <Tr key={c.id} onClick={() => open(c.id)}><Td className="font-medium">{c.name}</Td><Td>{c.mobile}</Td><Td>{c.email}</Td><Td right>{c.bill_count}</Td><Td right>{money(c.total_spent)}</Td>
                <Td>{c.last_purchase ? fmtDate(c.last_purchase) : '—'}</Td><Td><Badge tone={c.active ? 'green' : 'gray'}>{c.active ? 'Active' : 'Inactive'}</Badge></Td>
                <Td right onClick={(e) => e.stopPropagation()}>{can('customers.manage') && <Button size="sm" variant="outline" onClick={() => { setErr(''); setForm(c) }}>Edit</Button>}</Td></Tr>))}
          </tbody></TableWrap>
          <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        </>)}
      {form && (
        <Modal title={form.id ? 'Edit customer' : 'Add customer'} onClose={() => setForm(null)} footer={<><Button variant="outline" onClick={() => setForm(null)}>Cancel</Button><Button loading={busy} onClick={save}>Save</Button></>}>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Name" required><Input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
            <Field label="Mobile"><Input value={form.mobile ?? ''} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></Field>
            <Field label="Email"><Input value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Address"><Input value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <Field label="Notes" className="md:col-span-2"><Textarea value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          </div>
          <div className="mt-3"><ErrorBox message={err} /></div>
        </Modal>)}
      {detail && (
        <Modal title={detail.name} size="lg" onClose={() => setDetail(null)} footer={<Button variant="outline" onClick={() => setDetail(null)}>Close</Button>}>
          <div className="mb-3 grid gap-1 text-sm md:grid-cols-2"><div>Mobile: <b>{detail.mobile || '—'}</b></div><div>Email: <b>{detail.email || '—'}</b></div><div>Bills: <b>{detail.bill_count}</b></div><div>Total spent: <b>{money(detail.total_spent)}</b></div>{detail.address && <div className="md:col-span-2">Address: {detail.address}</div>}</div>
          <TableWrap><thead><tr><Th>Invoice</Th><Th>Date</Th><Th>Payment</Th><Th right>Amount</Th><Th>Status</Th></tr></thead><tbody>
            {detail.sales.map((s) => <Tr key={s.id}><Td>{s.invoice_number}</Td><Td>{fmtDateTime(s.date_time)}</Td><Td>{s.payment_method}</Td><Td right>{money(s.total)}</Td><Td><Badge tone={s.status === 'completed' ? 'green' : 'red'}>{s.status}</Badge></Td></Tr>)}
            {detail.sales.length === 0 && <Tr><Td colSpan={5}>No purchases yet.</Td></Tr>}
          </tbody></TableWrap>
        </Modal>)}
    </div>
  )
}
