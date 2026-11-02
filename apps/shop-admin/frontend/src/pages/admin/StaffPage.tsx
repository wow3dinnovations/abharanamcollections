import { useState } from 'react'
import { PermissionPicker } from '../../components/PermissionPicker'
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Modal, PageHeader, PageLoader, TableWrap, Td, Th, Tr } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { useFetch } from '../../hooks/useFetch'
import { useToast } from '../../hooks/useToast'
import { api, ApiError } from '../../services/api'
import type { Role, User } from '../../types'
import { fmtDateTime } from '../../utils/format'

interface Form {
  id?: string
  username: string
  full_name: string
  email: string
  password: string
  role: 'admin' | 'staff'
  permissions: string[]
  max_discount_percent: string
  max_discount_amount: string
}
const blank: Form = { username: '', full_name: '', email: '', password: '', role: 'staff', permissions: [], max_discount_percent: '', max_discount_amount: '' }

export function StaffPage() {
  const { toast, confirm } = useToast()
  const { user: me } = useAuth()
  const list = useFetch(() => api.get<{ items: User[] }>('/api/users'))
  const roles = useFetch(() => api.get<{ items: Role[] }>('/api/roles'))
  const [form, setForm] = useState<Form | null>(null)
  const [resetFor, setResetFor] = useState<User | null>(null)
  const [newPw, setNewPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const edit = (u: User) => {
    setErr('')
    setForm({ id: u.id, username: u.username, full_name: u.full_name, email: u.email, password: '', role: u.role,
      permissions: u.assigned_permissions, max_discount_percent: u.max_discount_percent?.toString() ?? '', max_discount_amount: u.max_discount_amount?.toString() ?? '' })
  }

  const save = async () => {
    if (!form) return
    setBusy(true); setErr('')
    const num = (s: string) => (s.trim() === '' ? null : Number(s))
    try {
      if (form.id) {
        await api.put(`/api/users/${form.id}`, { full_name: form.full_name, email: form.email, role: form.role, permissions: form.permissions,
          max_discount_percent: num(form.max_discount_percent), max_discount_amount: num(form.max_discount_amount) })
        toast('Staff details saved. They will be asked to sign in again if permissions changed.')
      } else {
        await api.post('/api/users', { username: form.username, password: form.password, full_name: form.full_name, email: form.email, role: form.role,
          permissions: form.permissions, max_discount_percent: num(form.max_discount_percent), max_discount_amount: num(form.max_discount_amount) })
        toast('Staff member created.')
      }
      setForm(null); list.reload()
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not save.') } finally { setBusy(false) }
  }

  const toggleActive = async (u: User) => {
    const ok = await confirm({ title: u.active ? 'Disable this account?' : 'Enable this account?', danger: u.active,
      message: u.active ? `${u.full_name} will be signed out and will not be able to log in until you enable the account again.` : `${u.full_name} will be able to log in again.`,
      confirmText: u.active ? 'Disable' : 'Enable' })
    if (!ok) return
    try { await api.put(`/api/users/${u.id}`, { active: !u.active }); toast('Account updated.'); list.reload() }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Failed', 'error') }
  }

  const doReset = async () => {
    if (!resetFor) return
    setBusy(true); setErr('')
    try { await api.post(`/api/users/${resetFor.id}/reset-password`, { new_password: newPw }); toast('Password reset. Tell the staff member their new password.'); setResetFor(null); setNewPw('') }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed') } finally { setBusy(false) }
  }

  return (
    <div>
      <PageHeader title="Staff" subtitle="Create staff logins and choose exactly what each person may do."
        actions={<Button onClick={() => { setErr(''); setForm({ ...blank }) }}>+ Add staff</Button>} />
      <ErrorBox message={list.error} onRetry={list.reload} />
      {list.loading && !list.data ? <PageLoader /> : (
        <TableWrap>
          <thead><tr><Th>Name</Th><Th>Username</Th><Th>Role</Th><Th>Permissions</Th><Th>Status</Th><Th>Last login</Th><Th right>Actions</Th></tr></thead>
          <tbody>
            {list.data?.items.map((u) => (
              <Tr key={u.id}>
                <Td><div className="font-medium">{u.full_name}</div><div className="text-xs text-ink/50">{u.email}</div></Td>
                <Td>{u.username}</Td>
                <Td><Badge tone={u.role === 'admin' ? 'maroon' : 'gold'}>{u.role === 'admin' ? 'Admin' : 'Staff'}</Badge></Td>
                <Td>{u.role === 'admin' ? 'Everything' : `${u.permissions.length} allowed`}</Td>
                <Td><Badge tone={u.active ? 'green' : 'red'}>{u.active ? 'Active' : 'Disabled'}</Badge></Td>
                <Td>{u.last_login ? fmtDateTime(u.last_login) : '—'}</Td>
                <Td right>
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => edit(u)}>Edit</Button>
                    <Button size="sm" variant="outline" onClick={() => { setErr(''); setNewPw(''); setResetFor(u) }}>Reset password</Button>
                    {u.id !== me?.id && <Button size="sm" variant={u.active ? 'danger' : 'outline'} onClick={() => toggleActive(u)}>{u.active ? 'Disable' : 'Enable'}</Button>}
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      {list.data && list.data.items.length === 0 && <EmptyState title="No staff yet" />}

      {form && (
        <Modal title={form.id ? `Edit ${form.full_name}` : 'Add staff member'} size="xl" onClose={() => setForm(null)}
          footer={<><Button variant="outline" onClick={() => setForm(null)}>Cancel</Button><Button loading={busy} onClick={save}>Save</Button></>}>
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Full name" required><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
              <Field label="Username" required><Input value={form.username} disabled={!!form.id} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
              <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              {!form.id && <Field label="Password" required hint="Letters + numbers, 8+ characters"><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>}
              {me?.role === 'admin' && (
                <Field label="Type">
                  <select className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'staff' })}>
                    <option value="staff">Staff (permissions below)</option><option value="admin">Admin (full access)</option>
                  </select>
                </Field>
              )}
              <Field label="Max discount % (this person)" hint="Blank = shop default"><Input type="number" min="0" max="100" value={form.max_discount_percent} onChange={(e) => setForm({ ...form, max_discount_percent: e.target.value })} /></Field>
              <Field label="Max discount ₹ per bill" hint="Blank = no limit"><Input type="number" min="0" value={form.max_discount_amount} onChange={(e) => setForm({ ...form, max_discount_amount: e.target.value })} /></Field>
            </div>
            {form.role === 'staff' ? (
              <Card className="bg-cream/40">
                <div className="mb-3 font-display text-xl text-maroon-900">What can this person do?</div>
                <PermissionPicker value={form.permissions} onChange={(p) => setForm({ ...form, permissions: p })} roles={roles.data?.items} />
              </Card>
            ) : <div className="rounded-xl bg-gold-50 p-4 text-sm text-maroon-900">Admins can do everything, so no permissions need to be chosen.</div>}
            <ErrorBox message={err} />
          </div>
        </Modal>
      )}

      {resetFor && (
        <Modal title={`Reset password for ${resetFor.full_name}`} size="sm" onClose={() => setResetFor(null)}
          footer={<><Button variant="outline" onClick={() => setResetFor(null)}>Cancel</Button><Button loading={busy} onClick={doReset}>Reset password</Button></>}>
          <Field label="New password" hint="They will be signed out everywhere. Tell them the new password."><Input type="text" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoFocus /></Field>
          <div className="mt-2"><ErrorBox message={err} /></div>
        </Modal>
      )}
    </div>
  )
}
