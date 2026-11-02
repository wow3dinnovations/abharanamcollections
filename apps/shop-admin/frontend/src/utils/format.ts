// Indian rupee / date formatting helpers.

const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const inrInt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

export function money(v: number | null | undefined, symbol = '₹'): string {
  const n = Number(v ?? 0)
  return `${n < 0 ? '-' : ''}${symbol}${inr.format(Math.abs(n))}`
}

export function moneyShort(v: number | null | undefined): string {
  const n = Number(v ?? 0)
  const a = Math.abs(n)
  const s = n < 0 ? '-' : ''
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)} Cr`
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2)} L`
  if (a >= 1e3) return `${s}₹${(a / 1e3).toFixed(1)}K`
  return `${s}₹${inrInt.format(a)}`
}

export function num(v: number | null | undefined): string {
  return inrInt.format(Number(v ?? 0))
}

/** '2026-09-19' or '2026-09-19T10:30:00' -> '19/09/2026' */
export function fmtDate(v?: string | null): string {
  if (!v) return ''
  const d = v.slice(0, 10).split('-')
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : v
}

/** ISO datetime -> '19/09/2026 10:30 AM' */
export function fmtDateTime(v?: string | null): string {
  if (!v) return ''
  const dt = new Date(v)
  if (isNaN(dt.getTime())) return fmtDate(v)
  const time = dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  return `${fmtDate(v)} ${time.toUpperCase()}`
}

export function todayIso(): string {
  const d = new Date()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function monthStartIso(): string {
  return todayIso().slice(0, 8) + '01'
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1048576).toFixed(1)} MB`
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
