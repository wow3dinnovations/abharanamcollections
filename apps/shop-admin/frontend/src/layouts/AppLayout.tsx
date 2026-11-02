import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { Button, Field, Input, Modal } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { api, ApiError } from '../services/api'
import { NAV } from './nav'

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast()
  const [cur, setCur] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (pw !== pw2) return setErr('The two new passwords do not match.')
    setBusy(true); setErr('')
    try {
      await api.post('/api/auth/change-password', { current_password: cur, new_password: pw })
      toast('Password changed.')
      onClose()
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not change password.') } finally { setBusy(false) }
  }
  return (
    <Modal title="Change my password" size="sm" onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>Save password</Button></>}>
      <div className="space-y-3">
        <Field label="Current password"><Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoFocus /></Field>
        <Field label="New password" hint="At least 8 characters, with letters and numbers."><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Field label="Repeat new password"><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
        {err && <div className="text-sm text-red-700">{err}</div>}
      </div>
    </Modal>
  )
}

export function AppLayout() {
  const { user, logout, can, branding } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const [problem, setProblem] = useState<string[]>([])

  useEffect(() => setOpen(false), [loc.pathname])
  useEffect(() => {
    let alive = true
    const check = () => api.get<{ data_problem: string[] }>('/api/health').then((h) => alive && setProblem(h.data_problem)).catch(() => {})
    check()
    const t = setInterval(check, 60000)
    return () => { alive = false; clearInterval(t) }
  }, [loc.pathname])

  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.perms || can(...i.perms)) })).filter((g) => g.items.length)

  return (
    <div className="flex min-h-full">
      {open && <div className="no-print fixed inset-0 z-30 bg-maroon-950/50 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`no-print fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-gradient-to-b from-maroon-900 to-maroon-950 text-gold-100 transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="border-b border-gold-400/20 px-5 py-5">
          <Logo size={44} showText light />
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {groups.map((g) => (
            <div key={g.title || 'main'}>
              {g.title && <div className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-[0.18em] text-gold-400/80">{g.title}</div>}
              {g.items.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.to === '/'}
                  className={({ isActive }) => `block rounded-lg px-3 py-2 text-sm transition ${isActive ? 'bg-gold-400/15 font-medium text-gold-200 ring-1 ring-gold-400/30' : 'text-gold-100/80 hover:bg-white/5 hover:text-gold-100'}`}>
                  {i.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-gold-400/20 px-5 py-3 text-[11px] text-gold-300/60">{branding.tagline}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-72">
        <header className="no-print sticky top-0 z-20 flex items-center justify-between border-b border-gold-200/70 bg-cream/90 px-4 py-3 backdrop-blur lg:px-8">
          <button className="rounded-lg p-2 text-2xl leading-none text-maroon-800 hover:bg-maroon-50 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">☰</button>
          <div className="hidden text-sm text-ink/60 lg:block">Welcome back, <span className="font-medium text-maroon-900">{user?.full_name}</span></div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full bg-gold-100 px-3 py-1 text-xs font-medium capitalize text-gold-700 sm:inline">{user?.role}</span>
            <Button variant="ghost" size="sm" onClick={() => setPwOpen(true)}>Change password</Button>
            <Button variant="outline" size="sm" onClick={async () => { await logout(); nav('/login') }}>Log out</Button>
          </div>
        </header>
        {problem.length > 0 && (
          <div className="no-print border-b border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 lg:px-8" role="alert">
            <b>Data problem:</b> {problem.join(', ')} appears to be corrupted. Please restore a backup
            {can('admin.restore') ? <> — <NavLink to="/admin/backup" className="font-semibold underline">open Backup &amp; Restore</NavLink></> : ' (ask the administrator).'}
          </div>
        )}
        <main className="flex-1 px-4 py-6 lg:px-8"><Outlet /></main>
      </div>
      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}
    </div>
  )
}
