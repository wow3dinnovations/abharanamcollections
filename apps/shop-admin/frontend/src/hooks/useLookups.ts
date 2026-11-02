import { useCallback, useEffect, useState } from 'react'
import { api } from '../services/api'

export interface Category { id: string; name: string; code: string; active: boolean; description?: string }
export interface Subcategory { id: string; name: string; category_id: string; active: boolean }
export interface Vendor { id: string; name: string; active: boolean; contact_person?: string; phone?: string; email?: string; address?: string; city?: string; state?: string; gst_number?: string; notes?: string }
export interface Location { id: string; name: string; active: boolean; address?: string; notes?: string }
export interface ExpenseCategory { id: string; name: string; active: boolean; description?: string }

export interface Lookups {
  categories: Category[]
  subcategories: Subcategory[]
  vendors: Vendor[]
  locations: Location[]
  expenseCategories: ExpenseCategory[]
}

let cache: Lookups | null = null
const listeners = new Set<(l: Lookups) => void>()

async function load(): Promise<Lookups> {
  const get = <T,>(u: string) => api.get<{ items: T[] }>(u).then((r) => r.items).catch(() => [] as T[])
  const [categories, subcategories, vendors, locations, expenseCategories] = await Promise.all([
    get<Category>('/api/categories'), get<Subcategory>('/api/subcategories'), get<Vendor>('/api/vendors'),
    get<Location>('/api/locations'), get<ExpenseCategory>('/api/expense-categories'),
  ])
  cache = { categories, subcategories, vendors, locations, expenseCategories }
  listeners.forEach((fn) => fn(cache!))
  return cache
}

/** Dropdown lists (categories, vendors, locations...). Shared and cached across screens. */
export function useLookups() {
  const [data, setData] = useState<Lookups | null>(cache)
  useEffect(() => {
    listeners.add(setData)
    if (!cache) load()
    return () => { listeners.delete(setData) }
  }, [])
  const reload = useCallback(() => load(), [])
  const empty: Lookups = { categories: [], subcategories: [], vendors: [], locations: [], expenseCategories: [] }
  return { ...(data ?? empty), loaded: !!data, reload }
}

export function clearLookupCache() { cache = null }
