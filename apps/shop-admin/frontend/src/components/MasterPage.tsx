import { useState, type ReactNode } from 'react'
import { useFetch } from '../hooks/useFetch'
import { clearLookupCache, useLookups } from '../hooks/useLookups'
import { useToast } from '../hooks/useToast'
import { api, ApiError } from '../services/api'
import { Badge, Button, EmptyState, ErrorBox, Field, Input, Modal, PageHeader, PageLoader, Select, TableWrap, Td, Textarea, Th, Tr } from './ui'

export interface MasterField {
  key: string
  label: string
  type?: 'text' | 'textarea' | 'select' | 'code'
  required?: boolean
  hint?: string
  options?: { value: string; label: string }[]
  disabledOnEdit?: boolean
}
export interface MasterColumn<T> { label: string; render: (r: T) => ReactNode }

interface Row { id: string; name: string; active: boolean; [k: string]: unknown }

/** One reusable list + add/edit/deactivate screen for every admin-managed list. */
export function MasterPage<T extends Row>({ title, subtitle, endpoint, noun, fields, columns, canEdit, embedded }: {
  title: string; subtitle?: string; endpoint: string; noun: string; fields: MasterField[]
  columns: MasterColumn<T>[]; canEdit: boolean; embedded?: boolean
}) {
  const { toast, confirm } = useToast()
  const { reload: reloadLookups } = useLookups()
  const list = useFetch(() => api.get<{ items: T[] }>(endpoint), [endpoint])
  const [form, setForm] = useState<Record<string, string> | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  const open = (row?: T) => {
    setErr('')
    setEditId(row?.id ?? null)
    setForm(Object.fromEntries(fields.map((f) => [f.key, row ? String(row[f.key] ?? '') : (f.options?.[0]?.value && f.required ? f.options[0].value : '')])))
  }
  const refresh = () => { clearLookupCache(); reloadLookups(); list.reload() }

  const save = async () => {
    if (!form) return
    setBusy(true); setErr('')
    try {
      if (editId) await api.put(`${endpoint}/${editId}`, form)
      else await api.post(endpoint, form)
      toast(`${noun} saved.`); setForm(null); refresh()
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not save.') } finally { setBusy(false) }
  }

  const toggle = async (row: T) => {
    if (row.active) {
      const ok = await confirm({ title: `Deactivate "${row.name}"?`, message: 'It will no longer appear in drop-down lists. Existing records that use it are not affected. You can activate it again later.', confirmText: 'Deactivate', danger: true })
      if (!ok) return
    }
    try { await api.put(`${endpoint}/${row.id}`, { active: !row.active }); toast(`${noun} ${row.active ? 'deactivated' : 'activated'}.`); refresh() }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Failed', 'error') }
  }

  const rows = (list.data?.items ?? []).filter((r) => showInactive || r.active)
  return (
    <div>
      {!embedded && <PageHeader title={title} subtitle={subtitle} actions={canEdit && <Button onClick={() => open()}>+ Add {noun.toLowerCase()}</Button>} />}
      {embedded && canEdit && <div className="mb-3 flex justify-end"><Button onClick={() => open()}>+ Add {noun.toLowerCase()}</Button></div>}
      <label className="mb-3 flex items-center gap-2 text-sm text-ink/70"><input type="checkbox" className="accent-maroon-800" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive</label>
      <ErrorBox message={list.error} onRetry={list.reload} />
      {list.loading && !list.data ? <PageLoader /> : rows.length === 0 ? (
        <EmptyState title={`No ${noun.toLowerCase()} yet`} hint={canEdit ? `Add your first ${noun.toLowerCase()} to get started.` : undefined} action={canEdit && <Button onClick={() => open()}>+ Add {noun.toLowerCase()}</Button>} />
      ) : (
        <TableWrap>
          <thead><tr>{columns.map((c) => <Th key={c.label}>{c.label}</Th>)}<Th>Status</Th>{canEdit && <Th right>Actions</Th>}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <Tr key={r.id}>
                {columns.map((c) => <Td key={c.label}>{c.render(r)}</Td>)}
                <Td><Badge tone={r.active ? 'green' : 'gray'}>{r.active ? 'Active' : 'Inactive'}</Badge></Td>
                {canEdit && <Td right><div className="flex justify-end gap-1"><Button size="sm" variant="outline" onClick={() => open(r)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => toggle(r)}>{r.active ? 'Deactivate' : 'Activate'}</Button></div></Td>}
              </Tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      {form && (
        <Modal title={editId ? `Edit ${noun.toLowerCase()}` : `Add ${noun.toLowerCase()}`} size="md" onClose={() => setForm(null)}
          footer={<><Button variant="outline" onClick={() => setForm(null)}>Cancel</Button><Button loading={busy} onClick={save}>Save</Button></>}>
          <div className="grid gap-3 md:grid-cols-2">
            {fields.map((f) => (
              <Field key={f.key} label={f.label} required={f.required} hint={f.hint} className={f.type === 'textarea' ? 'md:col-span-2' : ''}>
                {f.type === 'textarea' ? <Textarea value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                  : f.type === 'select' ? <Select value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>{!f.required && <option value="">—</option>}{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
                  : <Input value={form[f.key]} disabled={!!editId && f.disabledOnEdit} onChange={(e) => setForm({ ...form, [f.key]: f.type === 'code' ? e.target.value.toUpperCase() : e.target.value })} />}
              </Field>
            ))}
          </div>
          <div className="mt-3"><ErrorBox message={err} /></div>
        </Modal>
      )}
    </div>
  )
}
