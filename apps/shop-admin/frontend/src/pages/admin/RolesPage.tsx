import { useState } from 'react'
import { PermissionPicker } from '../../components/PermissionPicker'
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, PageHeader, PageLoader } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { useFetch } from '../../hooks/useFetch'
import { useToast } from '../../hooks/useToast'
import { api, ApiError } from '../../services/api'
import type { Role } from '../../types'

export function RolesPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const list = useFetch(() => api.get<{ items: Role[] }>('/api/roles'))
  const [edit, setEdit] = useState<Partial<Role> | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const isAdmin = user?.role === 'admin'

  const save = async () => {
    if (!edit) return
    setBusy(true); setErr('')
    try {
      const body = { name: edit.name || '', description: edit.description || '', permissions: edit.permissions || [] }
      if (edit.id) await api.put(`/api/roles/${edit.id}`, body); else await api.post('/api/roles', body)
      toast('Permission set saved.'); setEdit(null); list.reload()
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not save.') } finally { setBusy(false) }
  }

  return (
    <div>
      <PageHeader title="Roles & Permissions" subtitle="Ready-made permission sets you can apply when adding staff. Each staff member can still be adjusted individually."
        actions={isAdmin && <Button onClick={() => { setErr(''); setEdit({ name: '', description: '', permissions: [] }) }}>+ New permission set</Button>} />
      <ErrorBox message={list.error} />
      {list.loading && !list.data ? <PageLoader /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.data?.items.map((r) => (
            <Card key={r.id}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-display text-2xl font-semibold text-maroon-900">{r.name}</div>
                  <div className="mt-1 text-sm text-ink/60">{r.description}</div>
                </div>
                {r.is_system ? <Badge tone="maroon">Built in</Badge> : <Badge tone="gold">{r.permissions.length} permissions</Badge>}
              </div>
              {!r.is_system && isAdmin && <Button className="mt-4" size="sm" variant="outline" onClick={() => { setErr(''); setEdit(r) }}>View / Edit</Button>}
              {r.is_system && <div className="mt-4 text-xs text-ink/50">Full access to everything. Cannot be changed.</div>}
            </Card>
          ))}
        </div>
      )}
      {edit && (
        <Modal title={edit.id ? `Edit "${edit.name}"` : 'New permission set'} size="xl" onClose={() => setEdit(null)}
          footer={<><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button loading={busy} onClick={save}>Save</Button></>}>
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Name" required><Input value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="Description"><Input value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            </div>
            <PermissionPicker value={edit.permissions || []} onChange={(p) => setEdit({ ...edit, permissions: p })} />
            <ErrorBox message={err} />
          </div>
        </Modal>
      )}
    </div>
  )
}
