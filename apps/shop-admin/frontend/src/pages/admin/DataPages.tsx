import { useState } from 'react'
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Modal, Notice, PageHeader, PageLoader, Pagination, Select, StatCard, TableWrap, Td, Th, Tr } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { useDebounced, useFetch } from '../../hooks/useFetch'
import { useToast } from '../../hooks/useToast'
import { api, ApiError, fileUrl } from '../../services/api'
import type { Paged } from '../../types'
import { fmtDateTime } from '../../utils/format'

/* ---------------------------------------------------------------- Audit logs */
interface Audit { id: string; timestamp: string; username: string; action: string; entity: string; entity_id: string; details: unknown }

export function AuditLogsPage() {
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const [f, setF] = useState({ action: '', start: '', end: '' })
  const [page, setPage] = useState(1)
  const { data, loading, error, reload } = useFetch(() => api.get<Paged<Audit> & { actions: string[] }>('/api/audit-logs', { q: dq, ...f, page, page_size: 30 }), [dq, f, page])
  const set = (p: Partial<typeof f>) => { setF({ ...f, ...p }); setPage(1) }
  const text = (d: unknown) => (typeof d === 'string' ? d : JSON.stringify(d))
  return (
    <div>
      <PageHeader title="Audit Logs" subtitle="A permanent trail of who did what and when. It cannot be edited from the software."
        actions={<Button variant="outline" onClick={() => window.open(fileUrl('/api/export/audit_logs', { start: f.start, end: f.end }), '_blank')}>Export Excel</Button>} />
      <div className="mb-4 grid gap-2 md:grid-cols-4">
        <Input placeholder="Search user, details…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
        <Select value={f.action} onChange={(e) => set({ action: e.target.value })}><option value="">All actions</option>{data?.actions.map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}</Select>
        <Input type="date" value={f.start} onChange={(e) => set({ start: e.target.value })} title="From" />
        <Input type="date" value={f.end} onChange={(e) => set({ end: e.target.value })} title="To" />
      </div>
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <PageLoader /> : data && data.items.length === 0 ? <EmptyState title="No entries found" /> : data && (
        <>
          <TableWrap><thead><tr><Th>When</Th><Th>User</Th><Th>Action</Th><Th>Record</Th><Th>Details</Th></tr></thead><tbody>
            {data.items.map((a) => <Tr key={a.id}><Td className="whitespace-nowrap">{fmtDateTime(a.timestamp)}</Td><Td>{a.username}</Td><Td><Badge tone={a.action.includes('CANCEL') || a.action.includes('FAILED') ? 'red' : a.action.includes('LOGIN') ? 'gray' : 'maroon'}>{a.action.replace(/_/g, ' ')}</Badge></Td>
              <Td>{a.entity} {a.entity_id}</Td><Td className="max-w-xl whitespace-normal text-xs text-ink/70">{text(a.details)}</Td></Tr>)}
          </tbody></TableWrap>
          <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        </>)}
    </div>
  )
}

/* ---------------------------------------------------------------- Data health */
interface Check { name: string; status: 'ok' | 'warning' | 'error'; message: string; details: string[]; more: number }
interface Health { status: 'ok' | 'warning' | 'error'; checked_at: string; checks: Check[]; files: string[] }

export function DataHealthPage() {
  const { data, loading, error, reload } = useFetch(() => api.get<Health>('/api/data/health'))
  const tone = { ok: 'green', warning: 'amber', error: 'red' } as const
  const icon = { ok: '✓', warning: '!', error: '✕' }
  return (
    <div>
      <PageHeader title="Data Health Check" subtitle="Looks for damaged files, duplicate codes, broken links, wrong quantities and prices." actions={<Button loading={loading} onClick={reload}>Run check again</Button>} />
      <ErrorBox message={error} />
      {loading && !data ? <PageLoader text="Checking your data…" /> : data && (
        <div className="space-y-4">
          <Notice tone={data.status === 'ok' ? 'success' : data.status === 'warning' ? 'warn' : 'error'}>
            {data.status === 'ok' ? <b>All good - your data looks healthy.</b> : data.status === 'warning' ? <b>Your data works, but a few things need a look.</b> : <b>Problems were found. Please read them below - restoring a backup may be needed.</b>}
            <span className="ml-2 text-xs opacity-70">Checked {fmtDateTime(data.checked_at)}</span>
          </Notice>
          {data.checks.map((c) => (
            <Card key={c.name}>
              <div className="flex items-start gap-3">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${c.status === 'ok' ? 'bg-emerald-100 text-emerald-800' : c.status === 'warning' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>{icon[c.status]}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{c.name}</span><Badge tone={tone[c.status]}>{c.status === 'ok' ? 'OK' : c.status === 'warning' ? 'Warning' : 'Problem'}</Badge></div>
                  <div className="text-sm text-ink/70">{c.message}</div>
                  {c.details.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-ink/70">{c.details.map((d, i) => <li key={i}>{d}</li>)}{c.more > 0 && <li>…and {c.more} more</li>}</ul>}
                </div>
              </div>
            </Card>))}
          <details className="rounded-xl border border-gold-200 bg-white p-4 text-sm"><summary className="cursor-pointer font-medium text-maroon-800">Data files ({data.files.length})</summary><ul className="mt-2 space-y-0.5 text-xs text-ink/70">{data.files.map((f) => <li key={f}>{f}</li>)}</ul></details>
        </div>)}
    </div>
  )
}

/* ---------------------------------------------------------------- Excel import */
interface Preview { import_id: string; filename: string; headers: string[]; sample_rows: string[][]; row_count: number; suggested_mapping: Record<string, string>; fields: { key: string; label: string; required: boolean; hint: string }[] }
interface Validation { valid_rows: number; error_count: number; total_rows: number; errors: { row: number; field: string; message: string }[]; preview: { row: number; sku: string; name: string; category: string; selling_price: number; quantity: number }[] }

export function ImportPage() {
  const { toast } = useToast()
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [pre, setPre] = useState<Preview | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [val, setVal] = useState<Validation | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<number | null>(null)
  const [confirm, setConfirm] = useState(false)

  const upload = async (file: File) => {
    setBusy(true); setErr('')
    try {
      const form = new FormData(); form.append('file', file)
      const p = await api.upload<Preview>('/api/import/products/preview', form)
      setPre(p); setMapping(p.suggested_mapping); setVal(null); setStep(2)
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Cannot read the file') } finally { setBusy(false) }
  }
  const validate = async () => {
    if (!pre) return
    setBusy(true); setErr('')
    try { setVal(await api.post<Validation>('/api/import/products/validate', { import_id: pre.import_id, mapping })); setStep(3) }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Validation failed') } finally { setBusy(false) }
  }
  const commit = async () => {
    if (!pre) return
    setBusy(true); setErr('')
    try { const r = await api.post<{ created: number }>('/api/import/products/commit', { import_id: pre.import_id, mapping, confirm: true }); setDone(r.created); setStep(4); setConfirm(false); toast(`${r.created} products imported.`) }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Import failed'); setConfirm(false) } finally { setBusy(false) }
  }
  const reset = () => { setStep(1); setPre(null); setVal(null); setDone(null); setErr('') }
  const errorReport = async () => {
    if (!pre) return
    const res = await fetch('/api/import/products/error-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ import_id: pre.import_id, mapping }), credentials: 'same-origin' })
    if (!res.ok) return toast('Could not create the error report', 'error')
    const url = URL.createObjectURL(await res.blob()); const a = document.createElement('a'); a.href = url; a.download = 'ABHARANAM_import_errors.xlsx'; a.click(); URL.revokeObjectURL(url)
  }
  const steps = ['Upload file', 'Match columns', 'Check', 'Done']

  return (
    <div>
      <PageHeader title="Import Products" subtitle="Bring products in from an Excel or CSV file. Nothing is saved until every row is correct." actions={<Button variant="outline" onClick={() => window.open(fileUrl('/api/import/products/template'), '_blank')}>Download template</Button>} />
      <div className="mb-5 flex flex-wrap gap-2 text-sm">{steps.map((s, i) => <span key={s} className={`rounded-full px-4 py-1.5 ${step === i + 1 ? 'bg-maroon-800 text-white' : step > i + 1 ? 'bg-gold-100 text-maroon-800' : 'bg-stone-100 text-ink/50'}`}>{i + 1}. {s}</span>)}</div>
      <ErrorBox message={err} />

      {step === 1 && (
        <Card className="mt-3">
          <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-gold-300 bg-cream/60 px-6 py-12 text-center">
            <div className="font-display text-2xl text-maroon-900">Choose your Excel or CSV file</div>
            <p className="max-w-md text-sm text-ink/60">The first row must contain column names. Category, vendor and location names must already exist in the software.</p>
            <label className="cursor-pointer"><input type="file" accept=".xlsx,.csv" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /><span className="inline-flex items-center gap-2 rounded-lg bg-maroon-800 px-6 py-3 text-white hover:bg-maroon-700">{busy ? 'Reading…' : 'Choose file…'}</span></label>
          </div>
        </Card>)}

      {step === 2 && pre && (
        <div className="space-y-4">
          <Notice>Found <b>{pre.row_count}</b> rows in <b>{pre.filename}</b>. Tell the software which column holds what. We guessed for you - please check.</Notice>
          <Card>
            <div className="grid gap-3 md:grid-cols-3">
              {pre.fields.map((f) => (
                <Field key={f.key} label={f.label} required={f.required} hint={f.hint}>
                  <Select value={mapping[f.key] ?? ''} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}><option value="">— not in my file —</option>{pre.headers.map((h) => <option key={h} value={h}>{h}</option>)}</Select>
                </Field>))}
            </div>
          </Card>
          <div><div className="mb-1 text-sm font-medium">Preview of your file</div>
            <TableWrap><thead><tr>{pre.headers.map((h) => <Th key={h}>{h}</Th>)}</tr></thead><tbody>{pre.sample_rows.map((r, i) => <Tr key={i}>{r.map((c, j) => <Td key={j}>{c}</Td>)}</Tr>)}</tbody></TableWrap></div>
          <div className="flex gap-2"><Button variant="outline" onClick={reset}>Start over</Button><Button loading={busy} onClick={validate}>Check my file</Button></div>
        </div>)}

      {step === 3 && val && pre && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3"><StatCard label="Rows in file" value={val.total_rows} /><StatCard label="Ready to import" value={val.valid_rows} tone="good" /><StatCard label="Problems" value={val.error_count} tone={val.error_count ? 'bad' : 'good'} /></div>
          {val.error_count > 0 ? (
            <>
              <Notice tone="error"><b>{val.error_count} problem(s) found - nothing has been imported.</b> Fix them in your file and upload it again.</Notice>
              <TableWrap><thead><tr><Th>Row in file</Th><Th>Field</Th><Th>Problem</Th></tr></thead><tbody>{val.errors.slice(0, 200).map((e, i) => <Tr key={i}><Td>{e.row}</Td><Td>{e.field}</Td><Td>{e.message}</Td></Tr>)}</tbody></TableWrap>
              <div className="flex gap-2"><Button variant="outline" onClick={errorReport}>Download error report (Excel)</Button><Button variant="outline" onClick={() => setStep(2)}>Change column matching</Button><Button onClick={reset}>Upload a corrected file</Button></div>
            </>
          ) : (
            <>
              <Notice tone="success"><b>Every row is valid.</b> Here is a sample of what will be created:</Notice>
              <TableWrap><thead><tr><Th>Row</Th><Th>SKU</Th><Th>Product</Th><Th>Category</Th><Th right>Price</Th><Th right>Qty</Th></tr></thead><tbody>{val.preview.map((p) => <Tr key={p.row}><Td>{p.row}</Td><Td>{p.sku}</Td><Td>{p.name}</Td><Td>{p.category}</Td><Td right>{p.selling_price}</Td><Td right>{p.quantity}</Td></Tr>)}</tbody></TableWrap>
              <div className="flex gap-2"><Button variant="outline" onClick={() => setStep(2)}>Back</Button><Button variant="gold" size="lg" onClick={() => setConfirm(true)}>Import {val.valid_rows} products…</Button></div>
            </>)}
        </div>)}

      {step === 4 && <Card><EmptyState title={`${done} products imported`} hint="Stock, purchase records and barcodes were created. A safety backup was made first." action={<Button onClick={reset}>Import another file</Button>} /></Card>}

      {confirm && val && (
        <Modal title="Import these products?" size="sm" onClose={() => setConfirm(false)} footer={<><Button variant="outline" onClick={() => setConfirm(false)}>Cancel</Button><Button variant="gold" loading={busy} onClick={commit}>Yes, import</Button></>}>
          <p className="text-sm">{val.valid_rows} products will be added, with their opening stock recorded as a purchase. A backup of your data is made automatically first.</p>
        </Modal>)}
    </div>
  )
}

/* ---------------------------------------------------------------- Export centre + demo data */
const EXPORTS: { key: string; label: string; perm: string; range?: boolean; hint: string }[] = [
  { key: 'products', label: 'Products', perm: 'inventory.view', hint: 'All products with stock and prices' },
  { key: 'inventory_transactions', label: 'Inventory history', perm: 'inventory.view', range: true, hint: 'Every stock movement' },
  { key: 'purchases', label: 'Purchases', perm: 'purchases.view', range: true, hint: 'Purchase lines' },
  { key: 'sales', label: 'Sales', perm: 'sales.view', range: true, hint: 'Bills and bill items' },
  { key: 'expenses', label: 'Expenses', perm: 'expenses.view', range: true, hint: 'All expenses incl. cancelled' },
  { key: 'customers', label: 'Customers', perm: 'customers.view', hint: 'Customer list with totals' },
  { key: 'vendors', label: 'Vendors', perm: 'purchases.view', hint: 'Vendor list' },
  { key: 'audit_logs', label: 'Audit log', perm: 'admin.audit_logs', range: true, hint: 'Who did what' },
]

export function ExportPage() {
  const { can } = useAuth()
  const { toast, confirm } = useToast()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const demo = useFetch(() => (can('admin.settings') ? api.get<{ loaded: boolean; products: number; sales: number; expenses: number }>('/api/data/demo').catch(() => null) : Promise.resolve(null)))
  const { user } = useAuth()

  const loadDemo = async () => {
    const ok = await confirm({ title: 'Load demo data?', message: 'This adds sample categories, products, purchases, sales and expenses so you can try the software. Demo records are marked and can be removed later. A backup is made first.', confirmText: 'Load demo data' })
    if (!ok) return
    setBusy(true)
    try { const r = await api.post<{ products: number; sales: number; expenses: number }>('/api/data/demo/load'); toast(`Demo data loaded: ${r.products} products, ${r.sales} sales, ${r.expenses} expenses.`); demo.reload() }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Failed', 'error') } finally { setBusy(false) }
  }
  const removeDemo = async () => {
    setBusy(true)
    try { await api.post('/api/data/demo/remove', { confirm_text: typed }); toast('Demo data removed.'); setTyped(''); demo.reload() }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Failed', 'error') } finally { setBusy(false) }
  }
  const exportAll = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/data/export-all', { method: 'POST', credentials: 'same-origin' })
      if (!res.ok) throw new Error()
      const url = URL.createObjectURL(await res.blob()); const a = document.createElement('a'); a.href = url; a.download = 'ABHARANAM_all_data.zip'; a.click(); URL.revokeObjectURL(url)
      toast('All data exported.')
    } catch { toast('Export failed', 'error') } finally { setBusy(false) }
  }

  return (
    <div>
      <PageHeader title="Export Data" subtitle="Download your information as Excel files you can open in Microsoft Excel." />
      <Card className="mb-5">
        <div className="mb-3 grid gap-3 md:grid-cols-4"><Field label="From date (optional)"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field><Field label="To date (optional)"><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {EXPORTS.filter((x) => can(x.perm) && can('data.export')).map((x) => (
            <div key={x.key} className="rounded-xl border border-gold-200 bg-cream/50 p-4"><div className="font-display text-xl text-maroon-900">{x.label}</div><div className="mb-3 text-xs text-ink/60">{x.hint}</div>
              <Button size="sm" variant="outline" onClick={() => window.open(fileUrl(`/api/export/${x.key}`, x.range ? { start, end } : {}), '_blank')}>Download Excel</Button></div>))}
        </div>
        <p className="mt-3 text-xs text-ink/50">Reports (sales, inventory, profit…) have their own Export Excel / PDF buttons on each report page. Copies of exported files are also kept in the <code>exports</code> folder.</p>
      </Card>

      {can('admin.backup') && (
        <Card className="mb-5"><h2 className="font-display text-xl font-semibold text-maroon-800">Move to another computer</h2>
          <p className="mb-3 text-sm text-ink/70">Download everything (all data files, product pictures, receipts and logo) as one zip. Unzip it into the application folder on the other computer while the app is closed.</p>
          <Button variant="outline" loading={busy} onClick={exportAll}>Export all data (zip)</Button></Card>)}

      {user?.role === 'admin' && demo.data && (
        <Card><h2 className="font-display text-xl font-semibold text-maroon-800">Demo data</h2>
          <p className="mb-3 text-sm text-ink/70">Sample products, sales and expenses to practise with. They are clearly marked as demo and never mix with your real records.</p>
          {!demo.data.loaded ? <Button variant="outline" loading={busy} onClick={loadDemo}>Load demo data</Button> : (
            <div className="space-y-2"><Notice tone="warn">Demo data is loaded: {demo.data.products} products, {demo.data.sales} sales, {demo.data.expenses} expenses. Remove it before you start real business.</Notice>
              <div className="flex max-w-md gap-2"><Input placeholder="Type REMOVE DEMO" value={typed} onChange={(e) => setTyped(e.target.value)} /><Button variant="danger" loading={busy} disabled={typed.trim().toUpperCase() !== 'REMOVE DEMO'} onClick={removeDemo}>Remove demo data</Button></div></div>)}
        </Card>)}
    </div>
  )
}
