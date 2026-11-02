import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { Button, ErrorBox, Field, Input, Notice, PageLoader } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { ApiError } from '../services/api'

export function LoginPage() {
  const { user, loading, needsSetup, serverDown, login, setup, branding, refresh } = useAuth()
  const nav = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  if (loading) return <PageLoader />
  if (user) return <Navigate to="/" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr('')
    if (needsSetup && password !== password2) return setErr('The two passwords do not match.')
    setBusy(true)
    try {
      if (needsSetup) await setup({ username, password, full_name: fullName, email })
      else await login(username, password)
      nav('/', { replace: true })
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Could not sign in.')
    } finally { setBusy(false) }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-maroon-950 via-maroon-900 to-maroon-800 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          {branding.has_logo ? (
            <>
              <div className="drop-shadow-[0_10px_30px_rgba(0,0,0,0.45)]"><Logo size={190} /></div>
              <h1 className="sr-only">{branding.name}</h1>
            </>
          ) : (
            <>
              <div className="rounded-full bg-cream/95 p-3 shadow-2xl ring-2 ring-gold-400/60"><Logo size={72} /></div>
              <h1 className="mt-5 font-display text-4xl font-bold tracking-[0.14em] text-gold-200">{branding.name}</h1>
              <p className="mt-1 font-display text-lg italic text-gold-300/90">{branding.tagline}</p>
              <div className="gold-rule mt-4 w-56" />
            </>
          )}
        </div>
        {serverDown ? (
          <div className="space-y-4 rounded-2xl border border-gold-300/40 bg-cream p-7 shadow-2xl" role="alert">
            <h2 className="font-display text-2xl font-semibold text-maroon-900">The program is not running</h2>
            <p className="text-sm text-ink/80">This page opened, but the ABHARANAM program that holds your data is switched off, so nobody can log in yet.</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-ink/80">
              <li>Close any old black windows from earlier attempts.</li>
              <li>Double-click <b>scripts\start.bat</b> (or in Git Bash run <code>bash scripts/start.sh</code>).</li>
              <li>Keep the black window open, then press the button below.</li>
            </ol>
            <Button variant="gold" size="lg" className="w-full" onClick={() => refresh()}>I started it - try again</Button>
          </div>
        ) : (
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-gold-300/40 bg-cream p-7 shadow-2xl">
          <h2 className="font-display text-2xl font-semibold text-maroon-900">{needsSetup ? 'Welcome — create your Admin account' : 'Sign in'}</h2>
          {needsSetup && <Notice>This is the first time the application is opened. Choose your own username and password — you will be the Admin. Nothing is pre-set.</Notice>}
          {needsSetup && <Field label="Your name"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Owner name" /></Field>}
          <Field label={needsSetup ? 'Username' : 'Username or email'}>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" required />
          </Field>
          {needsSetup && <Field label="Email (optional)"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>}
          <Field label="Password" hint={needsSetup ? 'At least 8 characters, with letters and numbers.' : undefined}>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={needsSetup ? 'new-password' : 'current-password'} required />
          </Field>
          {needsSetup && <Field label="Repeat password"><Input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} required /></Field>}
          <ErrorBox message={err} />
          <Button type="submit" variant="gold" size="lg" className="w-full" loading={busy}>{needsSetup ? 'Create Admin & Start' : 'Sign in'}</Button>
        </form>
        )}
        <p className="mt-4 text-center text-xs text-gold-300/60">Your business data stays on this computer.</p>
      </div>
    </div>
  )
}
