import { useState } from 'react'
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, Notice, PageHeader, PageLoader, StatCard, TableWrap, Td, Th, Tr } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { useFetch } from '../../hooks/useFetch'
import { useToast } from '../../hooks/useToast'
import { api, ApiError } from '../../services/api'
import type { BackupInfo, DataSummary } from '../../types'
import { fmtBytes, fmtDateTime } from '../../utils/format'

const KIND: Record<string, string> = { manual: 'Manual', auto: 'Automatic', startup: 'Automatic', 'pre-restore': 'Safety (before restore)', 'pre-import': 'Safety (before import)', 'pre-demo': 'Safety (before demo)' }

export function BackupPage() {
  const { can } = useAuth()
  const { toast } = useToast()
  const summary = useFetch(() => api.get<DataSummary>('/api/data/summary'))
  const backups = useFetch(() => api.get<{ items: BackupInfo[] }>('/api/data/backups'))
  const [busy, setBusy] = useState(false)
  const [detail, setDetail] = useState<BackupInfo | null>(null)
  const [typed, setTyped] = useState('')
  const [err, setErr] = useState('')

  const reloadAll = () => { summary.reload(); backups.reload() }

  const backupNow = async () => {
    setBusy(true)
    try { const b = await api.post<BackupInfo>('/api/data/backup', {}); toast(`Backup created: ${b.name}`); reloadAll() }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Backup failed', 'error') } finally { setBusy(false) }
  }

  const openDetail = async (name: string) => {
    setErr(''); setTyped('')
    try { setDetail(await api.get<BackupInfo>(`/api/data/backups/${name}`)) } catch (e) { toast(e instanceof ApiError ? e.message : 'Cannot open', 'error') }
  }

  const restore = async () => {
    if (!detail) return
    setBusy(true); setErr('')
    try {
      const r = await api.post<{ safety_backup: string }>('/api/data/restore', { name: detail.name, confirm: true, confirm_text: typed })
      toast(`Restored. Your previous data was saved as ${r.safety_backup}.`)
      setDetail(null); reloadAll()
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Restore failed') } finally { setBusy(false) }
  }

  const openFolder = async (which: string) => {
    try { await api.post(`/api/data/open-folder/${which}`) } catch (e) { toast(e instanceof ApiError ? e.message : 'Cannot open folder', 'error') }
  }

  const s = summary.data
  return (
    <div>
      <PageHeader title="Backup & Restore" subtitle="Your business data lives in plain files on this computer. Keep safe copies here."
        actions={can('admin.backup') && <Button variant="gold" loading={busy} onClick={backupNow}>Backup Now</Button>} />
      <ErrorBox message={summary.error} onRetry={summary.reload} />
      {s?.recovery_notice && <div className="mb-4"><Notice tone="warn">{s.recovery_notice}</Notice></div>}
      {s && s.health === 'corrupted' && <div className="mb-4"><Notice tone="error"><b>{s.corrupted_files.join(', ')}</b> appears to be corrupted. Please restore a backup below.</Notice></div>}

      {!s ? <PageLoader /> : (
        <>
          <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Products" value={s.counts.products ?? '—'} />
            <StatCard label="Sales (bills)" value={s.counts.sales ?? '—'} />
            <StatCard label="Purchases" value={s.counts.purchases ?? '—'} />
            <StatCard label="Expenses" value={s.counts.expenses ?? '—'} />
            <StatCard label="Customers" value={s.counts.customers ?? '—'} />
            <StatCard label="Backups kept" value={s.backup_count} />
            <StatCard label="Last backup" value={<span className="text-xl">{s.last_backup ? fmtDateTime(s.last_backup.created_at) : 'Never'}</span>} />
            <StatCard label="Data health" tone={s.health === 'ok' ? 'good' : 'bad'} value={s.health === 'ok' ? 'Healthy' : s.health === 'warning' ? 'Warning' : 'Corrupted'} />
          </div>
          <Card className="mb-5">
            <div className="grid gap-2 text-sm md:grid-cols-2">
              <div><span className="text-ink/60">Data folder:</span> <code className="rounded bg-cream px-1.5 py-0.5">{s.data_folder}</code></div>
              <div><span className="text-ink/60">Backup folder:</span> <code className="rounded bg-cream px-1.5 py-0.5">{s.backup_folder}</code></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => openFolder('backups')}>Open backup folder</Button>
              <Button size="sm" variant="outline" onClick={() => openFolder('data')}>Open data folder</Button>
              <Button size="sm" variant="outline" onClick={() => openFolder('exports')}>Open export folder</Button>
            </div>
            <p className="mt-3 text-xs text-ink/50">To move to another computer: close the app, copy the <code>data</code> and <code>uploads</code> folders, install the app on the new computer, paste them in, start the app.</p>
          </Card>
        </>
      )}

      <h2 className="mb-2 font-display text-2xl font-semibold text-maroon-900">Backup history</h2>
      {backups.loading && !backups.data ? <PageLoader /> : (
        <TableWrap>
          <thead><tr><Th>Date & time</Th><Th>Type</Th><Th>Note</Th><Th>By</Th><Th right>Size</Th><Th right>Actions</Th></tr></thead>
          <tbody>
            {backups.data?.items.map((b) => (
              <Tr key={b.name}>
                <Td>{fmtDateTime(b.created_at)}<div className="text-xs text-ink/40">{b.name}</div></Td>
                <Td><Badge tone={b.kind === 'manual' ? 'maroon' : b.kind === 'auto' || b.kind === 'startup' ? 'gray' : 'amber'}>{KIND[b.kind] || b.kind}</Badge></Td>
                <Td>{b.reason}</Td><Td>{b.created_by || '—'}</Td><Td right>{fmtBytes(b.total_size)}</Td>
                <Td right><Button size="sm" variant="outline" onClick={() => openDetail(b.name)}>View / Restore</Button></Td>
              </Tr>
            ))}
            {backups.data?.items.length === 0 && <Tr><Td colSpan={6}>No backups yet. Press <b>Backup Now</b>.</Td></Tr>}
          </tbody>
        </TableWrap>
      )}

      {detail && (
        <Modal title="Restore this backup?" size="lg" onClose={() => setDetail(null)}
          footer={<><Button variant="outline" onClick={() => setDetail(null)}>Cancel</Button>
            {can('admin.restore') && <Button variant="danger" loading={busy} disabled={typed.trim().toUpperCase() !== 'RESTORE' || (detail.problems?.length ?? 0) > 0} onClick={restore}>Restore this backup</Button>}</>}>
          <div className="space-y-4">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div><span className="text-ink/60">Backup made:</span> <b>{fmtDateTime(detail.created_at)}</b></div>
              <div><span className="text-ink/60">Type:</span> <b>{KIND[detail.kind] || detail.kind}</b></div>
            </div>
            {detail.problems && detail.problems.length > 0 && <Notice tone="error">This backup is damaged and cannot be restored: {detail.problems.join('; ')}</Notice>}
            <div className="max-h-64 overflow-y-auto rounded-xl border border-gold-200">
              <table className="w-full text-sm"><thead className="sticky top-0 bg-cream"><tr><th className="px-3 py-2 text-left">File</th><th className="px-3 py-2 text-right">Records</th><th className="px-3 py-2 text-right">Size</th></tr></thead>
                <tbody>{detail.files.map((f) => <tr key={f.name} className="border-t border-stone-100"><td className="px-3 py-1.5">{f.name}</td><td className="px-3 py-1.5 text-right">{f.records ?? '—'}</td><td className="px-3 py-1.5 text-right">{fmtBytes(f.size)}</td></tr>)}</tbody></table>
            </div>
            {can('admin.restore') ? (
              <>
                <Notice tone="warn">Restoring <b>replaces all your current business data</b> with this backup. Anything entered after {fmtDateTime(detail.created_at)} will be gone from the app. Do not worry — a safety copy of your current data is saved automatically first.</Notice>
                <Field label="Type RESTORE to confirm"><Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="RESTORE" /></Field>
              </>
            ) : <Notice>You do not have permission to restore.</Notice>}
            <ErrorBox message={err} />
          </div>
        </Modal>
      )}
    </div>
  )
}
