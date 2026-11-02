import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, ApiError, setUnauthorizedHandler } from '../services/api'
import type { Branding, User } from '../types'

interface AuthState {
  user: User | null
  branding: Branding
  needsSetup: boolean
  serverDown: boolean
  loading: boolean
  can: (...perms: string[]) => boolean
  login: (username: string, password: string) => Promise<void>
  setup: (data: { username: string; password: string; full_name: string; email: string }) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  refreshBranding: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)
const DEFAULT_BRAND: Branding = { name: 'ABHARANAM COLLECTIONS', tagline: 'Timeless Beauty, Precious You', has_logo: false }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRAND)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [serverDown, setServerDown] = useState(false)
  const [loading, setLoading] = useState(true)

  const refreshBranding = useCallback(async () => {
    try { setBranding(await api.get<Branding>('/api/branding')) } catch { /* keep default */ }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const st = await api.get<{ needs_setup: boolean; business: Branding }>('/api/auth/setup-status')
      setServerDown(false)
      setNeedsSetup(st.needs_setup)
      setBranding(st.business)
      if (!st.needs_setup) {
        const me = await api.get<{ user: User }>('/api/auth/me')
        setUser(me.user)
      } else setUser(null)
    } catch (e) {
      setUser(null)
      setServerDown(e instanceof ApiError && (e.code === 'NETWORK' || e.code === 'SERVER_DOWN'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
    refresh()
    return () => setUnauthorizedHandler(null)
  }, [refresh])

  const value = useMemo<AuthState>(() => ({
    user, branding, needsSetup, serverDown, loading, refresh, refreshBranding,
    can: (...perms: string[]) => !!user && (user.role === 'admin' || perms.length === 0 || perms.some((p) => user.permissions.includes(p))),
    login: async (username, password) => {
      const r = await api.post<{ user: User }>('/api/auth/login', { username, password })
      setUser(r.user)
    },
    setup: async (data) => {
      const r = await api.post<{ user: User }>('/api/auth/setup', data)
      setNeedsSetup(false)
      setUser(r.user)
    },
    logout: async () => {
      try { await api.post('/api/auth/logout') } catch { /* already signed out */ }
      setUser(null)
    },
  }), [user, branding, needsSetup, serverDown, loading, refresh, refreshBranding])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside AuthProvider')
  return v
}
