// Talks to the local Python backend. Login is kept in a secure cookie by the browser.

export class ApiError extends Error {
  status: number
  code: string
  data: Record<string, unknown>
  constructor(message: string, status: number, code = 'ERROR', data: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.code = code
    this.data = data
  }
}

let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn
}

export type Query = Record<string, string | number | boolean | null | undefined>

export function qs(params?: Query): string {
  if (!params) return ''
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

async function request<T>(method: string, url: string, body?: unknown, isForm = false): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} }
  if (body !== undefined) {
    if (isForm) init.body = body as FormData
    else {
      ;(init.headers as Record<string, string>)['Content-Type'] = 'application/json'
      init.body = JSON.stringify(body)
    }
  }
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new ApiError('Cannot reach the ABHARANAM server. Is the application still running?', 0, 'NETWORK')
  }
  if (res.status === 204) return undefined as T
  const ctype = res.headers.get('content-type') || ''
  const data = ctype.includes('application/json') ? await res.json().catch(() => ({})) : null
  if (!res.ok) {
    // 500/502/503/504 with no message from our app = the Python program is not running (the screen server or a proxy answered instead)
    if ([500, 502, 503, 504].includes(res.status) && !(data && data.detail)) {
      throw new ApiError('The ABHARANAM program is not running. Start it (double-click scripts\\start.bat), then refresh this page.', res.status, 'SERVER_DOWN')
    }
    const msg = (data && (data.detail as string)) || `Request failed (${res.status})`
    if (res.status === 401 && !url.includes('/auth/login') && !url.includes('/auth/setup')) onUnauthorized?.()
    throw new ApiError(msg, res.status, (data && (data.code as string)) || 'ERROR', data || {})
  }
  return (data ?? (await res.blob())) as T
}

export const api = {
  get: <T>(url: string, params?: Query) => request<T>('GET', url + qs(params)),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  del: <T>(url: string) => request<T>('DELETE', url),
  upload: <T>(url: string, form: FormData) => request<T>('POST', url, form, true),
}

/** Address of a file/report the browser should download or show (cookie login is sent automatically). */
export function fileUrl(path: string, params?: Query) {
  return path + qs(params)
}
