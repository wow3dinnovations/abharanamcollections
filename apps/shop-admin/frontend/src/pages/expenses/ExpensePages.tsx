import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Modal, Notice, PageHeader, PageLoader, Pagination, Select, TableWrap, Td, Textarea, Th, Tr } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { useDebounced, useFetch } from '../../hooks/useFetch'
import { useLookups } from '../../hooks/useLookups'
import { useToast } from '../../hooks/useToast'
import { api, ApiError } from '../../services/api'
import type { AppSettings, Paged } from '../../types'
import { fmtDate, fmtDateTime, money, todayIso } from '../../utils/format'

interface Expense {
  id: string; expense_date: string; category_id: string; category_name: string; description: string; amount: number; payee: string
  payment_method: string; reference_no: string; notes: string; receipt_url: string | null; receipt_name: string; status: 'active' | 'cancelled'
  created_by_name: string; created_at: string; cancel_reason?: string; cancelled_at?: string
}

/* ---------------------------------------------------------------- Add / edit */
export function ExpenseFormPage() {
  const { id } = useParams()
  const editing = !!id
  const nav = useNavigate()
  const { toast } = useToast()
  const { expenseCategories, loaded } = useLookups()
  const settings = useFetch(() => api.get<AppSettings>('/api/settings'))
  const [f, setF] = useState({ expense_date: todayIso(), category_id: '', description: '', amount: '', payee: '', payment_method: '', reference_no: '', notes: '' })
  const [file, setFile] = useState<File | null>(null)
  const [receipt, setReceipt] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(editing)
  const fileRef = useRef<HTMLInputElement>(null)
  const cfg = settings.data

  useEffect(() => { if (cfg && !f.payment_method && !editing) setF((x) => ({ ...x, payment_method: cfg.expenses.default_payment_method })) }, [cfg, editing, f.payment_method])
  useEffect(() => {
    if (!id) return
    api.get<Expense>(`/api/expenses/${id}`).then((e) => {
      setF({ expense_date: e.expense_date, category_id: e.category_id, description: e.description, amount: String(e.amount), payee: e.payee, payment_method: e.payment_method, reference_no: e.reference_no, notes: e.notes })
      setReceipt(e.receipt_url)
    }).catch((x) => setErr(x instanceof ApiError ? x.message : 'Cannot load')).finally(() => setLoading(false))
  }, [id])

  if (loading || !loaded || !cfg) return <PageLoader />
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch })

  const save = async () => {
    setBusy(true); setErr('')
    try {
      const body = { ...f, amount: Number(f.amount) }
      const saved = editing ? await api.put<Expense>(`/api/expenses/${id}`, body) : await api.post<Expense>('/api/expenses', body)
      if (file) {
        const form = new FormData(); form.append('file', file)
        try { await api.upload(`/api/expenses/${saved.id}/receipt`, form) } catch (e) { toast(`Expense saved, but the receipt failed: ${e instanceof ApiError ? e.message : ''}`, 'error') }
      }
      toast(editing ? 'Expense updated.' : `Expense saved: ${money(saved.amount)}`)
      nav('/expenses/history')
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not save') } finally { setBusy(false) }
  }

  return (
    <div>
      <PageHeader title={editing ? `Edit expense ${id}` : 'Add expense'} subtitle="Running costs of the shop: rent, electricity, bags, marketing… (Jewellery bought for resale goes under Purchases, not here.)" />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Date" required><Input type="date" value={f.expense_date} onChange={(e) => set({ expense_date: e.target.value })} /></Field>
            <Field label="Category" required>
              <Select value={f.category_id} onChange={(e) => set({ category_id: e.target.value })}><option value="">Choose…</option>{expenseCategories.filter((c) => c.active || c.id === f.category_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            </Field>
            <Field label="Description" required className="md:col-span-2"><Input value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="e.g. Shopping bags" autoFocus /></Field>
            <Field label="Amount (₹)" required><Input type="number" min="0" step="0.01" value={f.amount} onChange={(e) => set({ amount: e.target.value })} /></Field>
            <Field label="Vendor / Payee"><Input value={f.payee} onChange={(e) => set({ payee: e.target.value })} placeholder="e.g. ABC Packaging" /></Field>
            <Field label="Payment method"><Select value={f.payment_method} onChange={(e) => set({ payment_method: e.target.value })}>{cfg.billing.payment_methods.map((m) => <option key={m}>{m}</option>)}</Select></Field>
            <Field label="Reference number"><Input value={f.reference_no} onChange={(e) => set({ reference_no: e.target.value })} placeholder="UPI / cheque / bill no." /></Field>
            <Field label="Notes" className="md:col-span-2"><Textarea value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
          </div>
        </Card>
        <div className="space-y-4">
          <Card>
            <h2 className="mb-2 font-display text-xl font-semibold text-maroon-800">Receipt / bill</h2>
            {receipt && !file && <a href={receipt} target="_blank" rel="noreferrer" className="mb-2 block text-sm font-medium text-maroon-800 underline">View current receipt</a>}
            {file && <div className="mb-2 rounded-lg bg-gold-50 px-3 py-2 text-sm">{file.name}</div>}
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>{receipt || file ? 'Replace receipt…' : 'Attach receipt…'}</Button>
            <p className="mt-2 text-xs text-ink/50">PDF, JPG or PNG, up to 8 MB. Stored on this computer only.</p>
          </Card>
          <ErrorBox message={err} />
          <div className="flex gap-2"><Button variant="gold" size="lg" className="flex-1" loading={busy} disabled={!f.category_id || !f.description.trim() || !(Number(f.amount) > 0)} onClick={save}>{editing ? 'Save changes' : 'Save expense'}</Button><Button variant="outline" size="lg" onClick={() => nav(-1)}>Cancel</Button></div>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- History */
export function ExpenseHistoryPage() {
  const { can } = useAuth()
  const nav = useNavigate()
  const { toast } = useToast()
  const { expenseCategories } = useLookups()
  const settings = useFetch(() => api.get<AppSettings>('/api/settings'))
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const [f, setF] = useState({ start: '', end: '', category_id: '', payment_method: '', status: '' })
  const [page, setPage] = useState(1)
  const [view, setView] = useState<Expense | null>(null)
  const [cancelFor, setCancelFor] = useState<Expense | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const { data, loading, error, reload } = useFetch(() => api.get<Paged<Expense> & { total_amount: number }>('/api/expenses', { q: dq, ...f, page, page_size: 20 }), [dq, f, page])
  const set = (p: Partial<typeof f>) => { setF({ ...f, ...p }); setPage(1) }

  const cancel = async () => {
    if (!cancelFor) return
    setBusy(true); setErr('')
    try { await api.post(`/api/expenses/${cancelFor.id}/cancel`, { reason }); toast('Expense cancelled. It stays in your records but is not counted.'); setCancelFor(null); setReason(''); setView(null); reload() }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not cancel') } finally { setBusy(false) }
  }

  return (
    <div>
      <PageHeader title="Expense History" subtitle="Every business expense. Records are never deleted - a wrong entry can be edited or cancelled."
        actions={can('expenses.add') && <Button onClick={() => nav('/expenses/add')}>+ Add expense</Button>} />
      <div className="mb-4 grid gap-2 md:grid-cols-4 xl:grid-cols-7">
        <Input placeholder="Search description, payee…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} className="xl:col-span-2" />
        <Input type="date" value={f.start} onChange={(e) => set({ start: e.target.value })} title="From" />
        <Input type="date" value={f.end} onChange={(e) => set({ end: e.target.value })} title="To" />
        <Select value={f.category_id} onChange={(e) => set({ category_id: e.target.value })}><option value="">All categories</option>{expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select value={f.payment_method} onChange={(e) => set({ payment_method: e.target.value })}><option value="">All payments</option>{settings.data?.billing.payment_methods.map((m) => <option key={m}>{m}</option>)}</Select>
        <Select value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="">Active + cancelled</option><option value="active">Active</option><option value="cancelled">Cancelled</option></Select>
      </div>
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <PageLoader /> : data && data.items.length === 0 ? <EmptyState title="No expenses found" hint="Add an expense, or change the filters." /> : data && (
        <>
          <TableWrap><thead><tr><Th>Date</Th><Th>Category</Th><Th>Description</Th><Th>Vendor / Payee</Th><Th right>Amount</Th><Th>Payment</Th><Th>Added by</Th><Th right>Actions</Th></tr></thead><tbody>
            {data.items.map((e) => (
              <Tr key={e.id} onClick={() => setView(e)} className={e.status === 'cancelled' ? 'opacity-50' : ''}>
                <Td>{fmtDate(e.expense_date)}</Td><Td>{e.category_name}</Td><Td>{e.description}{e.status === 'cancelled' && <> <Badge tone="red">cancelled</Badge></>}</Td><Td>{e.payee}</Td>
                <Td right className={e.status === 'cancelled' ? 'line-through' : ''}>{money(e.amount)}</Td><Td>{e.payment_method}</Td><Td>{e.created_by_name}</Td>
                <Td right onClick={(ev) => ev.stopPropagation()}><div className="flex justify-end gap-1">
                  {e.receipt_url && <a href={e.receipt_url} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost">Receipt</Button></a>}
                  {e.status === 'active' && can('expenses.edit') && <Button size="sm" variant="outline" onClick={() => nav(`/expenses/${e.id}/edit`)}>Edit</Button>}
                  {e.status === 'active' && can('expenses.cancel') && <Button size="sm" variant="ghost" onClick={() => { setErr(''); setReason(''); setCancelFor(e) }}>Cancel</Button>}
                </div></Td></Tr>))}
            <tr className="bg-gold-100/70 font-semibold"><Td colSpan={4} right>Total of active expenses (all pages)</Td><Td right>{money(data.total_amount)}</Td><Td colSpan={3}></Td></tr>
          </tbody></TableWrap>
          <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        </>)}

      {view && (
        <Modal title={`Expense ${view.id}`} size="sm" onClose={() => setView(null)} footer={<Button variant="outline" onClick={() => setView(null)}>Close</Button>}>
          <dl className="space-y-1.5 text-sm">
            {([['Date', fmtDate(view.expense_date)], ['Category', view.category_name], ['Description', view.description], ['Amount', money(view.amount)], ['Vendor / Payee', view.payee || '—'],
              ['Payment', view.payment_method], ['Reference', view.reference_no || '—'], ['Notes', view.notes || '—'], ['Added by', `${view.created_by_name} · ${fmtDateTime(view.created_at)}`]] as const).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-stone-100 pb-1"><dt className="text-ink/60">{k}</dt><dd className="text-right font-medium">{v}</dd></div>))}
          </dl>
          {view.receipt_url && <a className="mt-3 block text-sm font-medium text-maroon-800 underline" href={view.receipt_url} target="_blank" rel="noreferrer">View receipt ({view.receipt_name})</a>}
          {view.status === 'cancelled' && <div className="mt-3"><Notice tone="error">Cancelled {fmtDateTime(view.cancelled_at)} — {view.cancel_reason}</Notice></div>}
        </Modal>)}
      {cancelFor && (
        <Modal title={`Cancel ${cancelFor.description}?`} size="sm" onClose={() => setCancelFor(null)}
          footer={<><Button variant="outline" onClick={() => setCancelFor(null)}>Keep</Button><Button variant="danger" loading={busy} disabled={reason.trim().length < 3} onClick={cancel}>Cancel expense</Button></>}>
          <p className="mb-3 text-sm text-ink/70">The expense stays in your records marked <b>cancelled</b> and is no longer counted in totals, reports or the dashboard.</p>
          <Field label="Reason" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>
          <div className="mt-2"><ErrorBox message={err} /></div>
        </Modal>)}
    </div>
  )
}
