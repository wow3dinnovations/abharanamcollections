import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../services/api'

/** Load data when the screen opens (and whenever `deps` change). */
export function useFetch<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [code, setCode] = useState<string>('')
  const seq = useRef(0)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const reload = useCallback(async () => {
    const id = ++seq.current
    setLoading(true)
    try {
      const d = await loaderRef.current()
      if (id === seq.current) {
        setData(d)
        setError('')
        setCode('')
      }
    } catch (e) {
      if (id === seq.current) {
        setError(e instanceof ApiError ? e.message : 'Something went wrong.')
        setCode(e instanceof ApiError ? e.code : '')
      }
    } finally {
      if (id === seq.current) setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload() }, deps)
  return { data, loading, error, code, reload, setData }
}

/** Small helper: debounce a fast-changing value (search boxes). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
