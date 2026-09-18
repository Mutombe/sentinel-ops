import { buildSeed } from './seed'
import { idb } from './idb'

const KEY = 'sentinelops.db.v10'
const SETTINGS_KEY = 'sentinelops.settings.v1'

/* Legacy localStorage payloads from before the IndexedDB move. They are what
   pushed the origin over its ~5 MB quota, so clear them out on boot. */
const LEGACY_KEYS = [
  'sentinelops.db.v1', 'sentinelops.db.v2', 'sentinelops.db.v3',
  'sentinelops.db.v4', 'sentinelops.db.v5', 'sentinelops.db.v6', 'sentinelops.db.v7', 'sentinelops.db.v8', 'sentinelops.db.v9', 'sentinelops.db.v10',
]

export const DEFAULT_SETTINGS = {
  latency: 420,          // simulated network latency, ms
  chaos: 0,              // % of write requests that fail (drives optimistic rollback)
  theme: 'dark',
  density: 'comfortable',
  pageSize: 10,
  currency: 'USD',
  orgName: 'Sentinel Ops',
  slaTargetMins: 30,
  autoAssignIncidents: true,
  emailAlerts: true,
  smsAlerts: false,
}

function readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

let db = null
let persistent = false
let settings = { ...DEFAULT_SETTINGS, ...readLocal(SETTINGS_KEY, {}) }

/* ------------------------------------------------------------------ *
 * Boot. Awaited before the app renders; everything after this point
 * reads the dataset synchronously from memory and persists in the
 * background.
 * ------------------------------------------------------------------ */
export async function initStore() {
  // Free the old localStorage payloads first - that is what was throwing.
  LEGACY_KEYS.forEach((k) => {
    try { localStorage.removeItem(k) } catch { /* ignore */ }
  })

  persistent = await idb.available()
  let saved = persistent ? await idb.get(KEY) : null

  /* A dataset laid out around the day it was generated goes stale: after a
     week the roster's current view sits past the end of the data. Rebuild it
     rather than show an empty week. */
  const STALE_DAYS = 5
  const seededAt = saved?.__seededAt ? Date.parse(saved.__seededAt) : 0
  const stale = seededAt > 0 && (Date.now() - seededAt) > STALE_DAYS * 86400000

  if (stale) {
    console.info('[db] dataset is older than %d days, regenerating against today', STALE_DAYS)
  }

  if (stale || !saved || !saved.clients || !saved.inspections) {
    saved = buildSeed()
    saved.__seededAt = new Date().toISOString()
    db = saved
    if (persistent) {
      try {
        await idb.set(KEY, db)
      } catch (e) {
        console.warn('[db] initial persist failed', e)
        persistent = false
      }
    }
  } else {
    db = saved
  }

  return { persistent }
}

let flushTimer = null
let flushing = false
function flush() {
  if (!persistent || !db) return
  clearTimeout(flushTimer)
  flushTimer = setTimeout(async () => {
    if (flushing) return
    flushing = true
    try {
      await idb.set(KEY, db)
    } catch (e) {
      console.warn('[db] persist failed', e)
    } finally {
      flushing = false
    }
  }, 250)
}

export const store = {
  ready: () => db !== null,
  isPersistent: () => persistent,

  table: (name) => (db && db[name]) || [],
  setTable: (name, rows) => { if (db) { db[name] = rows; flush() } },
  raw: () => db,
  persist: flush,

  getSettings: () => settings,
  setSettings: (patch) => {
    settings = { ...settings, ...patch }
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* ignore */ }
    return settings
  },

  reset: async () => {
    db = buildSeed()
    db.__seededAt = new Date().toISOString()
    if (persistent) {
      try { await idb.set(KEY, db) } catch (e) { console.warn('[db] reset persist failed', e) }
    }
    return db
  },

  stats: () => ({
    seededAt: db && db.__seededAt,
    persistent,
    counts: Object.fromEntries(
      Object.keys(db || {})
        .filter((k) => Array.isArray(db[k]))
        .map((k) => [k, db[k].length])
    ),
  }),

  /** Browser-reported storage footprint; nulls when the browser will not say. */
  usage: () => idb.usage(),
}

export const SESSION_KEY = 'sentinelops.session.v1'
