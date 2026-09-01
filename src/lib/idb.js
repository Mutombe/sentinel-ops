/* ------------------------------------------------------------------ *
 * A very small promise wrapper over IndexedDB.
 *
 * The operational dataset outgrew localStorage (a ~5 MB cap that throws
 * QuotaExceededError on write). IndexedDB has a quota in the hundreds of
 * megabytes and stores structured values without a JSON round-trip, so it
 * is the right home for the dataset. Settings and the session stay in
 * localStorage. They are tiny and wanted synchronously at boot.
 * ------------------------------------------------------------------ */

const DB_NAME = 'sentinelops'
const DB_VERSION = 1
const STORE = 'kv'

let dbPromise = null

function open() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'))
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'))
    req.onblocked = () => reject(new Error('IndexedDB blocked by another tab'))
  })
  return dbPromise
}

function tx(mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const store = t.objectStore(STORE)
        let result
        try {
          result = fn(store)
        } catch (e) {
          reject(e)
          return
        }
        t.oncomplete = () => resolve(result && result.result !== undefined ? result.result : result)
        t.onerror = () => reject(t.error)
        t.onabort = () => reject(t.error || new Error('IndexedDB transaction aborted'))
      })
  )
}

export const idb = {
  async get(key) {
    try {
      return await tx('readonly', (s) => s.get(key))
    } catch {
      return undefined
    }
  },
  async set(key, value) {
    return tx('readwrite', (s) => s.put(value, key))
  },
  async del(key) {
    try {
      return await tx('readwrite', (s) => s.delete(key))
    } catch {
      return undefined
    }
  },
  async available() {
    try {
      await open()
      return true
    } catch {
      return false
    }
  },
  /** Rough on-disk footprint, when the browser will tell us. */
  async usage() {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const { usage, quota } = await navigator.storage.estimate()
        return { usage, quota }
      }
    } catch { /* ignore */ }
    return { usage: null, quota: null }
  },
}
