import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { api } from './api'
import { useToast } from '@/components/ui/Toast'

/* ------------------------------------------------------------------ *
 * Query keys
 * ------------------------------------------------------------------ */
export const qk = {
  list: (resource, params) => [resource, 'list', params],
  one: (resource, id) => [resource, 'one', id],
  lookups: () => ['lookups'],
  dashboard: () => ['dashboard'],
  reports: (range) => ['reports', range],
  intelligence: () => ['intelligence'],
  myDuty: () => ['my-duty'],
}

/* ------------------------------------------------------------------ *
 * Debounced value (search-as-you-type without hammering the API)
 * ------------------------------------------------------------------ */
export function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

/* ------------------------------------------------------------------ *
 * Table state: page / pageSize / sort / search / filters, all in one.
 * ------------------------------------------------------------------ */
export function useTableState({ sort, dir = 'desc', pageSize = 10, filters = {} } = {}) {
  const [state, setState] = useState({ page: 1, pageSize, sort, dir, q: '', filters })
  const debouncedQ = useDebounced(state.q, 320)

  const api2 = useMemo(
    () => ({
      setPage: (page) => setState((s) => ({ ...s, page })),
      setPageSize: (n) => setState((s) => ({ ...s, pageSize: n, page: 1 })),
      setQ: (q) => setState((s) => ({ ...s, q })),
      toggleSort: (key) =>
        setState((s) => ({ ...s, sort: key, dir: s.sort === key && s.dir === 'asc' ? 'desc' : 'asc', page: 1 })),
      setFilter: (k, v) => setState((s) => ({ ...s, filters: { ...s.filters, [k]: v }, page: 1 })),
      setFilters: (f) => setState((s) => ({ ...s, filters: f, page: 1 })),
      reset: () => setState((s) => ({ ...s, q: '', filters: {}, page: 1 })),
    }),
    []
  )

  const activeFilters = Object.entries(state.filters).filter(([, v]) => v && v !== 'all').length

  return {
    ...state,
    ...api2,
    activeFilters,
    params: { page: state.page, pageSize: state.pageSize, sort: state.sort, dir: state.dir, q: debouncedQ, filters: state.filters },
  }
}

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */
export function useList(resource, params, options = {}) {
  return useQuery({
    queryKey: qk.list(resource, params),
    queryFn: () => api.list(resource, params),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    ...options,
  })
}

export function useOne(resource, id, options = {}) {
  return useQuery({
    queryKey: qk.one(resource, id),
    queryFn: () => api.get(resource, id),
    enabled: !!id,
    ...options,
  })
}

export function useLookups() {
  return useQuery({ queryKey: qk.lookups(), queryFn: () => api.lookups(), staleTime: 60_000 })
}

export function useDashboard() {
  return useQuery({ queryKey: qk.dashboard(), queryFn: () => api.dashboard(), staleTime: 15_000, refetchInterval: 60_000 })
}

export function useMyDuty(options = {}) {
  return useQuery({
    queryKey: qk.myDuty(),
    queryFn: () => api.myDuty(),
    staleTime: 8_000,
    retry: false,
    ...options,
  })
}

export function useIntelligence(options = {}) {
  return useQuery({
    queryKey: qk.intelligence(),
    queryFn: () => api.intelligence(),
    staleTime: 30_000,
    ...options,
  })
}

/* ------------------------------------------------------------------ *
 * Optimistic mutations
 *
 * Every list page currently in the cache for a resource is patched
 * immediately; on error the exact snapshot is restored and the user is
 * told why. This is what makes the UI feel instant without lying.
 * ------------------------------------------------------------------ */
function patchLists(qc, resource, fn) {
  const snapshots = qc.getQueriesData({ queryKey: [resource, 'list'] })
  snapshots.forEach(([key, data]) => {
    if (!data) return
    qc.setQueryData(key, fn(data))
  })
  return snapshots
}

function restore(qc, snapshots) {
  snapshots?.forEach(([key, data]) => qc.setQueryData(key, data))
}

const tmpId = () => '__tmp_' + Math.random().toString(36).slice(2, 9)

export function useCreate(resource, { onSuccess, label } = {}) {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (body) => api.create(resource, body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: [resource, 'list'] })
      const optimistic = { ...body, id: tmpId(), createdAt: new Date().toISOString(), __optimistic: true }
      const snapshots = patchLists(qc, resource, (data) => ({
        ...data,
        rows: [optimistic, ...data.rows].slice(0, data.pageSize),
        total: data.total + 1,
      }))
      return { snapshots, optimistic }
    },
    onError: (err, _body, ctx) => {
      restore(qc, ctx?.snapshots)
      toast.error(err.status === 422 ? 'Validation failed' : 'Could not create record', {
        body: err.message,
      })
    },
    onSuccess: (row) => {
      toast.success(`${label || 'Record'} created`, { body: row.name || row.title || row.ref || row.number || undefined })
      onSuccess?.(row)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: [resource] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['lookups'] })
    },
  })
}

export function useUpdate(resource, { onSuccess, label, silent } = {}) {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: ({ id, patch }) => api.update(resource, id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: [resource] })
      const snapshots = patchLists(qc, resource, (data) => ({
        ...data,
        rows: data.rows.map((r) => (r.id === id ? { ...r, ...patch, __optimistic: true } : r)),
      }))
      const oneKey = qk.one(resource, id)
      const prevOne = qc.getQueryData(oneKey)
      if (prevOne) qc.setQueryData(oneKey, { ...prevOne, ...patch })
      return { snapshots, prevOne, oneKey }
    },
    onError: (err, _v, ctx) => {
      restore(qc, ctx?.snapshots)
      if (ctx?.prevOne) qc.setQueryData(ctx.oneKey, ctx.prevOne)
      toast.error('Change reverted', { body: err.message })
    },
    onSuccess: (row) => {
      if (!silent) toast.success(`${label || 'Changes'} saved`)
      onSuccess?.(row)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: [resource] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useDelete(resource, { onSuccess, label } = {}) {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (id) => api.remove(resource, id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: [resource, 'list'] })
      const snapshots = patchLists(qc, resource, (data) => ({
        ...data,
        rows: data.rows.filter((r) => r.id !== id),
        total: Math.max(0, data.total - 1),
      }))
      return { snapshots }
    },
    onError: (err, _id, ctx) => {
      restore(qc, ctx?.snapshots)
      toast.error('Delete failed', { body: err.message })
    },
    onSuccess: () => {
      toast.success(`${label || 'Record'} deleted`)
      onSuccess?.()
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: [resource] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['lookups'] })
    },
  })
}

export function useBulk(resource) {
  const qc = useQueryClient()
  const toast = useToast()

  const update = useMutation({
    mutationFn: ({ ids, patch }) => api.bulkUpdate(resource, ids, patch),
    onMutate: async ({ ids, patch }) => {
      await qc.cancelQueries({ queryKey: [resource, 'list'] })
      const set = new Set(ids)
      const snapshots = patchLists(qc, resource, (data) => ({
        ...data,
        rows: data.rows.map((r) => (set.has(r.id) ? { ...r, ...patch, __optimistic: true } : r)),
      }))
      return { snapshots }
    },
    onError: (err, _v, ctx) => { restore(qc, ctx?.snapshots); toast.error('Bulk update failed', { body: err.message }) },
    onSuccess: (r) => toast.success(`${r.count} record${r.count === 1 ? '' : 's'} updated`),
    onSettled: () => { qc.invalidateQueries({ queryKey: [resource] }); qc.invalidateQueries({ queryKey: ['dashboard'] }) },
  })

  const remove = useMutation({
    mutationFn: (ids) => api.bulkRemove(resource, ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: [resource, 'list'] })
      const set = new Set(ids)
      const snapshots = patchLists(qc, resource, (data) => ({
        ...data,
        rows: data.rows.filter((r) => !set.has(r.id)),
        total: Math.max(0, data.total - ids.length),
      }))
      return { snapshots }
    },
    onError: (err, _v, ctx) => { restore(qc, ctx?.snapshots); toast.error('Bulk delete failed', { body: err.message }) },
    onSuccess: (r) => toast.success(`${r.count} record${r.count === 1 ? '' : 's'} deleted`),
    onSettled: () => { qc.invalidateQueries({ queryKey: [resource] }); qc.invalidateQueries({ queryKey: ['dashboard'] }) },
  })

  return { update, remove }
}

/* ------------------------------------------------------------------ *
 * Keyboard shortcut helper
 * ------------------------------------------------------------------ */
export function useHotkey(combo, handler, deps = []) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const parts = combo.toLowerCase().split('+')
    const key = parts[parts.length - 1]
    const needMod = parts.includes('mod')
    const needShift = parts.includes('shift')
    const fn = (e) => {
      const tag = e.target?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable
      if (typing && key !== 'escape' && !needMod) return
      if (needMod && !(e.metaKey || e.ctrlKey)) return
      if (needShift && !e.shiftKey) return
      if (e.key.toLowerCase() !== key) return
      e.preventDefault()
      ref.current(e)
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combo, ...deps])
}

/* ------------------------------------------------------------------ *
 * Form state with server-side field errors
 * ------------------------------------------------------------------ */
export function useForm(initial) {
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState({})
  const [dirty, setDirty] = useState(false)

  const set = useCallback((k, v) => {
    setValues((s) => ({ ...s, [k]: v }))
    setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e))
    setDirty(true)
  }, [])

  const bind = useCallback(
    (k) => ({
      value: values[k] ?? '',
      onChange: (e) => set(k, e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e),
      error: errors[k],
    }),
    [values, errors, set]
  )

  const reset = useCallback((next) => {
    setValues(next ?? initial)
    setErrors({})
    setDirty(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyServerError = useCallback((err) => {
    if (err?.fields) setErrors(err.fields)
  }, [])

  return { values, setValues, errors, setErrors, set, bind, reset, dirty, applyServerError }
}
