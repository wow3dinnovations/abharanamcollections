import { useFetch } from '../hooks/useFetch'
import { api } from '../services/api'
import type { PermissionGroup, Role } from '../types'
import { Checkbox, PageLoader } from './ui'

export function PermissionPicker({ value, onChange, disabled, roles }: {
  value: string[]; onChange: (v: string[]) => void; disabled?: boolean; roles?: Role[]
}) {
  const { data, loading } = useFetch(() => api.get<{ groups: PermissionGroup[] }>('/api/permissions'))
  if (loading || !data) return <PageLoader />
  const set = new Set(value)
  const toggle = (k: string, on: boolean) => {
    const s = new Set(value)
    on ? s.add(k) : s.delete(k)
    onChange([...s])
  }
  const toggleGroup = (g: PermissionGroup, on: boolean) => {
    const s = new Set(value)
    g.items.forEach((i) => (on ? s.add(i.key) : s.delete(i.key)))
    onChange([...s])
  }
  return (
    <div className="space-y-4">
      {roles && roles.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink/60">Start from a ready-made set:</span>
          {roles.filter((r) => !r.is_system).map((r) => (
            <button key={r.id} type="button" disabled={disabled} onClick={() => onChange([...r.permissions])}
              className="rounded-full border border-gold-300 bg-gold-50 px-3 py-1 text-xs font-medium text-maroon-800 hover:bg-gold-100 disabled:opacity-50" title={r.description}>
              {r.name}
            </button>
          ))}
          <button type="button" disabled={disabled} onClick={() => onChange([])} className="rounded-full border border-stone-300 px-3 py-1 text-xs hover:bg-stone-50 disabled:opacity-50">Clear all</button>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {data.groups.map((g) => {
          const all = g.items.every((i) => set.has(i.key))
          return (
            <div key={g.group} className="rounded-xl border border-gold-200 bg-cream/50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-display text-lg font-semibold text-maroon-800">{g.group}</span>
                <button type="button" disabled={disabled} className="text-xs text-maroon-700 underline disabled:opacity-40" onClick={() => toggleGroup(g, !all)}>{all ? 'Untick all' : 'Tick all'}</button>
              </div>
              <div className="space-y-1.5">
                {g.items.map((i) => <Checkbox key={i.key} disabled={disabled} checked={set.has(i.key)} onChange={(v) => toggle(i.key, v)} label={i.label} />)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
