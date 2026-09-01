import { store, SESSION_KEY } from './db'
import { computeIntelligence } from './intelligence'
import { computePayslip, ytdFor } from './payroll'

/* ------------------------------------------------------------------ *
 * A fake-but-honest REST layer.
 * Simulates latency, auth, RBAC scoping, validation, server-side
 * pagination / sorting / filtering / faceting, and (optionally) failure
 * so the optimistic-UI rollbacks in the app are actually exercised.
 * ------------------------------------------------------------------ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export class ApiError extends Error {
  constructor(status, message, fields) {
    super(message)
    this.status = status
    this.fields = fields || null
  }
}

function latency(kind = 'read') {
  const base = store.getSettings().latency
  const jitter = base * (0.55 + Math.random() * 0.9)
  return Math.max(60, Math.round(kind === 'write' ? jitter * 1.25 : jitter))
}

function maybeChaos(kind) {
  const pct = store.getSettings().chaos
  if (kind === 'write' && pct > 0 && Math.random() * 100 < pct) {
    throw new ApiError(503, 'Upstream service unavailable. The change was not saved.')
  }
}

const uid = (p) => p + '_' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36)
const nowIso = () => new Date().toISOString()

/* ------------------------------ actor ----------------------------- */
let ACTOR = null
let IMPERSONATOR = null   // the real operator, when viewing as someone else
export function setActor(user) { ACTOR = user }
export function getActor() { return ACTOR }
export function getImpersonator() { return IMPERSONATOR }

function logAudit(action, entity, entityId, meta) {
  const rows = store.table('audit')
  rows.unshift({
    id: uid('au'),
    at: nowIso(),
    actorId: ACTOR ? ACTOR.id : 'system',
    actorName: ACTOR ? ACTOR.name : 'System',
    actorRole: ACTOR ? ACTOR.role : 'system',
    action,
    entity,
    entityId,
    severity: action === 'delete' ? 'warning' : action === 'role_change' ? 'critical' : 'info',
    ip: '10.24.8.' + (ACTOR ? (parseInt(ACTOR.id.slice(-2), 36) % 250) + 1 : 1),
    agent: 'SentinelOps Web/1.0',
    // An action taken while viewing as someone else is attributed to both.
    impersonatedBy: IMPERSONATOR ? { id: IMPERSONATOR.id, name: IMPERSONATOR.name } : null,
    meta: meta || null,
  })
  store.setTable('audit', rows)
}

/* --------------------------- resource map -------------------------- */
const RESOURCES = {
  clients:     { prefix: 'cl', search: ['name', 'code', 'industry', 'contactName', 'contactEmail', 'city'], sort: 'name', dir: 'asc', label: 'client' },
  sites:       { prefix: 'st', search: ['name', 'code', 'city', 'type', 'address'], sort: 'name', dir: 'asc', label: 'site' },
  guards:      { prefix: 'gd', search: ['name', 'employeeNo', 'email', 'rank', 'licenseNo', 'phone'], sort: 'name', dir: 'asc', label: 'officer' },
  shifts:      { prefix: 'sh', search: ['date', 'type', 'status'], sort: 'start', dir: 'desc', label: 'shift' },
  incidents:   { prefix: 'in', search: ['ref', 'title', 'type', 'description', 'policeRef'], sort: 'occurredAt', dir: 'desc', label: 'incident' },
  patrols:     { prefix: 'pt', search: ['ref', 'route'], sort: 'startedAt', dir: 'desc', label: 'patrol' },
  attendance:  { prefix: 'at', search: ['date', 'status', 'method'], sort: 'date', dir: 'desc', label: 'attendance record' },
  invoices:    { prefix: 'iv', search: ['number', 'period', 'status'], sort: 'issueDate', dir: 'desc', label: 'invoice' },
  payroll:     { prefix: 'pr', search: ['period', 'status'], sort: 'period', dir: 'desc', label: 'payslip' },
  payrollRuns: { prefix: 'prr', search: ['period', 'status', 'approvedBy'], sort: 'period', dir: 'desc', label: 'payroll run' },
  assets:      { prefix: 'as', search: ['tag', 'name', 'category', 'serial'], sort: 'tag', dir: 'asc', label: 'asset' },
  requests:    { prefix: 'rq', search: ['ref', 'subject', 'type', 'description'], sort: 'createdAt', dir: 'desc', label: 'request' },
  users:       { prefix: 'us', search: ['name', 'email', 'role', 'title'], sort: 'name', dir: 'asc', label: 'user' },
  audit:       { prefix: 'au', search: ['actorName', 'action', 'entity', 'entityId', 'ip'], sort: 'at', dir: 'desc', label: 'audit entry' },
  notifications: { prefix: 'nt', search: ['title', 'body'], sort: 'at', dir: 'desc', label: 'notification' },

  posts:       { prefix: 'po', search: ['name', 'code', 'type', 'instructions'], sort: 'code', dir: 'asc', label: 'post' },
  inspections: { prefix: 'ins', search: ['ref', 'type', 'summary'], sort: 'at', dir: 'desc', label: 'inspection' },
  leave:       { prefix: 'lv', search: ['ref', 'type', 'reason', 'status'], sort: 'startDate', dir: 'desc', label: 'leave request' },
  discipline:  { prefix: 'dp', search: ['ref', 'category', 'description', 'type'], sort: 'issuedAt', dir: 'desc', label: 'disciplinary record' },
  training:    { prefix: 'tr', search: ['course', 'provider', 'certificateNo'], sort: 'expiresAt', dir: 'asc', label: 'training record' },
  documents:   { prefix: 'dc', search: ['type', 'name'], sort: 'expiresAt', dir: 'asc', label: 'document' },
}


function titleCaseSafe(v) {
  return String(v || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function hashCode(str) {
  let h = 0
  for (let i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) | 0
  return h
}

/** Keep a run's headline totals in step with its payslips after an edit. */
function recomputeRunTotals(runId) {
  if (!runId) return
  const slips = store.table('payroll').filter((s) => s.runId === runId)
  if (!slips.length) return
  const sum = (k) => +slips.reduce((a, x) => a + (x[k] || 0), 0).toFixed(2)
  const runs = store.table('payrollRuns').map((r) =>
    r.id !== runId ? r : {
      ...r,
      headcount: slips.length,
      gross: sum('gross'),
      paye: sum('paye'),
      aidsLevy: sum('aidsLevy'),
      nssa: sum('nssa'),
      deductionsTotal: sum('deductionsTotal'),
      net: sum('net'),
      employerTotal: sum('employerTotal'),
      costToCompany: sum('costToCompany'),
      baseHours: slips.reduce((a, x) => a + (x.baseHours || 0), 0),
      otHours: slips.reduce((a, x) => a + (x.otHours || 0), 0),
    }
  )
  store.setTable('payrollRuns', runs)
}

/* ------------------------- relation expansion ---------------------- */
function indexBy(name) {
  const m = new Map()
  store.table(name).forEach((r) => m.set(r.id, r))
  return m
}

function expand(resource, rows) {
  if (!rows.length) return rows
  const needsClient = ['sites', 'incidents', 'shifts', 'invoices', 'requests', 'patrols', 'attendance', 'posts', 'inspections'].includes(resource)
  const needsSite = ['incidents', 'shifts', 'patrols', 'attendance', 'assets', 'guards', 'requests', 'posts', 'inspections'].includes(resource)
  const needsGuard = ['shifts', 'incidents', 'patrols', 'attendance', 'payroll', 'assets', 'inspections', 'leave', 'discipline', 'training', 'documents'].includes(resource)
  const C = needsClient ? indexBy('clients') : null
  const S = needsSite ? indexBy('sites') : null
  const G = needsGuard ? indexBy('guards') : null

  return rows.map((r) => {
    const o = { ...r }
    if (C && r.clientId) {
      const c = C.get(r.clientId)
      o._client = c ? { id: c.id, name: c.name, tier: c.tier, code: c.code } : null
    }
    if (S && r.siteId) {
      const s = S.get(r.siteId)
      o._site = s ? { id: s.id, name: s.name, code: s.code, riskLevel: s.riskLevel, city: s.city, clientId: s.clientId } : null
      if (C && !r.clientId && s) o._client = (() => { const c = C.get(s.clientId); return c ? { id: c.id, name: c.name, tier: c.tier, code: c.code } : null })()
    }
    if (G) {
      const gid = r.guardId || r.assignedTo || r.reportedBy || r.assignedTo
      if (r.guardId) { const g = G.get(r.guardId); o._guard = g ? { id: g.id, name: g.name, rank: g.rank, employeeNo: g.employeeNo } : null }
      if (r.reportedBy) { const g = G.get(r.reportedBy); o._reporter = g ? { id: g.id, name: g.name, rank: g.rank } : null }
      if (r.assignedTo && String(r.assignedTo).startsWith('gd_')) { const g = G.get(r.assignedTo); o._assignee = g ? { id: g.id, name: g.name, rank: g.rank } : null }
      if (r.supervisorId) { const g = G.get(r.supervisorId); o._supervisor = g ? { id: g.id, name: g.name, rank: g.rank } : null }
      if (r.coveredBy) { const g = G.get(r.coveredBy); o._cover = g ? { id: g.id, name: g.name } : null }
      void gid
    }
    return o
  })
}

/* ------------------------------ scoping ---------------------------- */
function scopeFilter(resource, rows, actor) {
  if (!actor) return rows
  if (actor.role === 'client') {
    const cid = actor.clientId
    const mySites = new Set(store.table('sites').filter((s) => s.clientId === cid).map((s) => s.id))
    switch (resource) {
      case 'clients': return rows.filter((r) => r.id === cid)
      case 'sites': return rows.filter((r) => r.clientId === cid)
      case 'incidents': return rows.filter((r) => r.clientId === cid && r.visibleToClient !== false)
      case 'invoices':
      case 'requests':
      case 'patrols':
      case 'shifts':
      case 'attendance': return rows.filter((r) => r.clientId === cid || mySites.has(r.siteId))
      case 'guards': return rows.filter((r) => mySites.has(r.siteId))
      case 'users': return rows.filter((r) => r.clientId === cid)
      case 'posts': return rows.filter((r) => r.clientId === cid || mySites.has(r.siteId))
      case 'inspections': return rows.filter((r) => (r.clientId === cid || mySites.has(r.siteId)) && r.clientVisible !== false)
      case 'payroll':
      case 'payrollRuns':
      case 'audit':
      case 'leave':
      case 'discipline':
      case 'training':
      case 'documents':
      case 'assets': return []
      default: return rows
    }
  }
  if (actor.role === 'guard') {
    const gid = actor.guardId
    switch (resource) {
      case 'payroll':
      case 'leave':
      case 'discipline':
      case 'training':
      case 'documents': return rows.filter((r) => r.guardId === gid)
      case 'payrollRuns': return []
      case 'inspections': return rows.filter((r) => r.supervisorId === gid || (r.guardsChecked || []).some((c) => c.guardId === gid))
      case 'users': return rows.filter((r) => r.id === actor.id)
      case 'audit': return []
      default: return rows
    }
  }
  return rows
}

/* ---------------------------- permissions -------------------------- */
export const PERMISSIONS = {
  admin: ['*'],
  ops_manager: [
    'clients:*', 'sites:*', 'guards:*', 'shifts:*', 'incidents:*', 'patrols:*', 'attendance:*',
    'assets:*', 'requests:*', 'posts:*', 'inspections:*', 'leave:*', 'discipline:*',
    'training:*', 'documents:*', 'invoices:read', 'payroll:read', 'payrollRuns:read', 'users:read', 'audit:read',
    'reports:read', 'intelligence:read',
  ],
  supervisor: [
    'guards:read', 'sites:read', 'clients:read', 'shifts:*', 'incidents:*', 'patrols:*',
    'attendance:*', 'assets:read', 'requests:read', 'posts:read', 'inspections:*',
    'leave:read', 'leave:create', 'discipline:read', 'discipline:create',
    'training:read', 'documents:read', 'reports:read', 'intelligence:read',
  ],
  finance: ['invoices:*', 'payroll:*', 'payrollRuns:*', 'clients:read', 'sites:read', 'guards:read', 'leave:read', 'reports:read', 'audit:read'],
  client: ['incidents:read', 'sites:read', 'invoices:read', 'requests:*', 'patrols:read', 'posts:read', 'inspections:read', 'reports:read'],
  guard: ['shifts:read', 'incidents:create', 'incidents:read', 'patrols:read', 'attendance:read', 'payroll:read', 'leave:read', 'leave:create', 'training:read', 'documents:read', 'discipline:read', 'inspections:read'],
}

export function can(actor, resource, action = 'read') {
  if (!actor) return false
  const perms = PERMISSIONS[actor.role] || []
  if (perms.includes('*')) return true
  return perms.includes(resource + ':*') || perms.includes(resource + ':' + action)
}

function assertCan(resource, action) {
  if (!ACTOR) throw new ApiError(401, 'Your session has expired. Please sign in again.')
  if (!can(ACTOR, resource, action)) {
    throw new ApiError(403, `Your role (${ACTOR.role.replace('_', ' ')}) is not permitted to ${action} ${resource}.`)
  }
}

/* ---------------------------- validation --------------------------- */
const REQUIRED = {
  clients: ['name', 'industry', 'contactName', 'contactEmail'],
  sites: ['name', 'clientId', 'type'],
  guards: ['firstName', 'lastName', 'email', 'rank'],
  incidents: ['title', 'type', 'severity', 'siteId'],
  shifts: ['guardId', 'siteId', 'date'],
  assets: ['name', 'category'],
  requests: ['subject', 'type', 'clientId'],
  users: ['name', 'email', 'role'],
  invoices: ['clientId'],
  posts: ['name', 'siteId'],
  inspections: ['siteId', 'type'],
  leave: ['guardId', 'type', 'startDate', 'endDate'],
  discipline: ['guardId', 'type', 'category'],
  training: ['guardId', 'course'],
  documents: ['guardId', 'type'],
}

function validate(resource, body, isCreate) {
  const fields = {}
  const req = REQUIRED[resource] || []
  if (isCreate) {
    req.forEach((f) => {
      const v = body[f]
      if (v === undefined || v === null || String(v).trim() === '') fields[f] = 'Required'
    })
  } else {
    req.forEach((f) => {
      if (f in body && String(body[f] ?? '').trim() === '') fields[f] = 'Required'
    })
  }
  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(body.email)) fields.email = 'Enter a valid email address'
  if (body.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(body.contactEmail)) fields.contactEmail = 'Enter a valid email address'
  if (body.hourlyRate !== undefined && (isNaN(+body.hourlyRate) || +body.hourlyRate < 0)) fields.hourlyRate = 'Must be a positive number'
  if (Object.keys(fields).length) throw new ApiError(422, 'Please correct the highlighted fields.', fields)
}

/* --------------------------- derived fields ------------------------ */
function derive(resource, row) {
  if (resource === 'guards') {
    row.name = `${row.firstName || ''} ${row.lastName || ''}`.trim()
  }
  if (resource === 'invoices' && Array.isArray(row.lineItems)) {
    row.lineItems = row.lineItems.map((li) => ({ ...li, amount: +(+li.qty * +li.rate).toFixed(2) }))
    row.subtotal = +row.lineItems.reduce((a, li) => a + li.amount, 0).toFixed(2)
    row.tax = +(row.subtotal * 0.15).toFixed(2)
    row.total = +(row.subtotal + row.tax).toFixed(2)
  }
  return row
}

/* ------------------------------ helpers ---------------------------- */
function getPath(obj, path) {
  return path.split('.').reduce((a, k) => (a == null ? a : a[k]), obj)
}

function compare(a, b) {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

function applyFilters(rows, filters) {
  if (!filters) return rows
  return rows.filter((r) =>
    Object.entries(filters).every(([k, v]) => {
      if (v === undefined || v === null || v === '' || v === 'all') return true
      if (Array.isArray(v)) return v.length === 0 || v.includes(getPath(r, k))
      if (typeof v === 'object' && (v.from || v.to)) {
        const val = getPath(r, k)
        if (!val) return false
        if (v.from && String(val) < v.from) return false
        if (v.to && String(val) > v.to + '￿') return false
        return true
      }
      if (typeof v === 'boolean') return !!getPath(r, k) === v
      return String(getPath(r, k) ?? '') === String(v)
    })
  )
}

/* -------------------------------- API ------------------------------ */
export const api = {
  /* ---------- auth ---------- */
  // Step 1: verify credentials and report whether a second factor is required.
  async preAuth({ email, password }) {
    await sleep(latency('write'))
    const user = store.table('users').find((u) => u.email.toLowerCase() === String(email).trim().toLowerCase())
    if (!user || user.password !== password) {
      logAudit('failed_login', 'auth', String(email).slice(0, 40))
      throw new ApiError(401, 'Invalid email or password.')
    }
    if (user.status !== 'active') throw new ApiError(403, 'This account has been disabled. Contact your administrator.')
    return { mfaRequired: !!user.mfa, name: user.name, role: user.role, hint: user.mfa ? '000000' : null }
  },

  async login({ email, password, code }) {
    await sleep(latency('write'))
    const user = store.table('users').find((u) => u.email.toLowerCase() === String(email).trim().toLowerCase())
    if (!user || user.password !== password) throw new ApiError(401, 'Invalid email or password.')
    if (user.status !== 'active') throw new ApiError(403, 'This account has been disabled. Contact your administrator.')
    if (user.mfa) {
      if (!code || !/^\d{6}$/.test(code)) throw new ApiError(422, 'Enter the 6-digit code from your authenticator.', { code: 'Six digits required' })
      if (code !== '000000') throw new ApiError(401, 'That verification code is not valid or has expired.', { code: 'Invalid code' })
    }

    const users = store.table('users').map((u) => (u.id === user.id ? { ...u, lastLogin: nowIso() } : u))
    store.setTable('users', users)

    const session = {
      token: 'sop.' + btoa(user.id + ':' + Date.now()).replace(/=/g, ''),
      user: { ...user, password: undefined },
      issuedAt: nowIso(),
      expiresAt: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    setActor(session.user)
    logAudit('login', 'auth', user.id)
    return session
  },

  async logout() {
    await sleep(120)
    if (ACTOR) logAudit('logout', 'auth', ACTOR.id)
    localStorage.removeItem(SESSION_KEY)
    setActor(null)
    IMPERSONATOR = null
    return { ok: true }
  },

  /* ---------- view-as / impersonation ---------- */
  async impersonate(userId) {
    await sleep(latency('write'))
    if (!ACTOR) throw new ApiError(401, 'Your session has expired.')
    const operator = IMPERSONATOR || ACTOR
    if (!can(operator, 'users', 'update')) {
      throw new ApiError(403, 'Only administrators and operations managers can view the platform as another user.')
    }
    const target = store.table('users').find((u) => u.id === userId)
    if (!target) throw new ApiError(404, 'That user account no longer exists.')
    if (target.id === operator.id) throw new ApiError(409, 'You are already signed in as this account.')

    const user = { ...target, password: undefined }
    IMPERSONATOR = operator
    setActor(user)

    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') || {}
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, user, impersonator: operator }))
    logAudit('impersonate_start', 'user', target.id, { as: target.name, role: target.role })
    return { user, impersonator: operator }
  },

  async stopImpersonating() {
    await sleep(Math.min(240, latency('read')))
    if (!IMPERSONATOR) throw new ApiError(409, 'You are not viewing as another user.')
    const operator = IMPERSONATOR
    logAudit('impersonate_end', 'user', ACTOR ? ACTOR.id : 'unknown')
    const fresh = store.table('users').find((u) => u.id === operator.id)
    const user = fresh ? { ...fresh, password: undefined } : operator
    IMPERSONATOR = null
    setActor(user)
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') || {}
    delete s.impersonator
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, user }))
    return { user }
  },

  /** The login account linked to a client or officer record, if there is one. */
  async linkedUser({ clientId, guardId }) {
    await sleep(Math.min(160, latency('read')))
    const u = store.table('users').find((x) =>
      x.status === 'active' && ((clientId && x.clientId === clientId) || (guardId && x.guardId === guardId))
    )
    return u ? { id: u.id, name: u.name, role: u.role, email: u.email } : null
  },

  /** Accounts an operator may view the platform as. */
  async impersonationTargets() {
    await sleep(Math.min(200, latency('read')))
    const operator = IMPERSONATOR || ACTOR
    if (!can(operator, 'users', 'update')) return []
    const clients = new Map(store.table('clients').map((c) => [c.id, c]))
    const guards = new Map(store.table('guards').map((g) => [g.id, g]))
    return store
      .table('users')
      .filter((u) => u.status === 'active' && u.id !== operator.id)
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        title: u.title,
        avatarHue: u.avatarHue,
        context:
          u.role === 'client' ? clients.get(u.clientId)?.name || 'Client account'
            : u.role === 'guard' ? guards.get(u.guardId)?.rank || 'Officer'
            : u.title,
      }))
      .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name))
  },

  restoreSession() {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
      if (!s) return null
      if (new Date(s.expiresAt).getTime() < Date.now()) {
        localStorage.removeItem(SESSION_KEY)
        return null
      }
      const fresh = store.table('users').find((u) => u.id === s.user.id)
      const user = fresh ? { ...fresh, password: undefined } : s.user
      setActor(user)
      IMPERSONATOR = s.impersonator || null
      return { ...s, user }
    } catch {
      return null
    }
  },

  async updateProfile(patch) {
    await sleep(latency('write'))
    maybeChaos('write')
    const users = store.table('users')
    const i = users.findIndex((u) => u.id === ACTOR.id)
    if (i < 0) throw new ApiError(404, 'User not found.')
    users[i] = { ...users[i], ...patch }
    store.setTable('users', users)
    const user = { ...users[i], password: undefined }
    setActor(user)
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, user }))
    logAudit('update', 'profile', user.id)
    return user
  },

  async changePassword({ current, next }) {
    await sleep(latency('write'))
    const users = store.table('users')
    const i = users.findIndex((u) => u.id === ACTOR.id)
    if (users[i].password !== current) throw new ApiError(422, 'Current password is incorrect.', { current: 'Incorrect password' })
    if (!next || next.length < 6) throw new ApiError(422, 'Password must be at least 6 characters.', { next: 'Minimum 6 characters' })
    users[i] = { ...users[i], password: next }
    store.setTable('users', users)
    logAudit('password_change', 'auth', users[i].id)
    return { ok: true }
  },

  /* ---------- collection read ---------- */
  async list(resource, params = {}) {
    await sleep(latency('read'))
    const cfg = RESOURCES[resource]
    if (!cfg) throw new ApiError(404, `Unknown resource "${resource}".`)
    assertCan(resource, 'read')

    let rows = scopeFilter(resource, store.table(resource), ACTOR)

    const q = (params.q || '').trim().toLowerCase()
    if (q) {
      rows = rows.filter((r) =>
        cfg.search.some((f) => String(getPath(r, f) ?? '').toLowerCase().includes(q))
      )
    }

    rows = applyFilters(rows, params.filters)

    // facet counts are computed on the filtered-but-unpaginated set
    let facets = null
    if (params.facet) {
      facets = {}
      const base = params.facetIgnoresFilter
        ? applyFilters(scopeFilter(resource, store.table(resource), ACTOR), null)
        : rows
      base.forEach((r) => {
        const k = String(getPath(r, params.facet) ?? 'Unspecified')
        facets[k] = (facets[k] || 0) + 1
      })
    }

    const sort = params.sort || cfg.sort
    const dir = params.dir || cfg.dir
    rows = [...rows].sort((a, b) => (dir === 'desc' ? -1 : 1) * compare(getPath(a, sort), getPath(b, sort)))

    const total = rows.length
    const pageSize = params.pageSize ?? store.getSettings().pageSize
    const pageCount = Math.max(1, Math.ceil(total / pageSize))
    const page = Math.min(Math.max(1, params.page || 1), pageCount)
    const start = (page - 1) * pageSize
    const slice = params.all ? rows : rows.slice(start, start + pageSize)

    return {
      rows: expand(resource, slice),
      total,
      page,
      pageSize,
      pageCount,
      from: total === 0 ? 0 : start + 1,
      to: Math.min(start + pageSize, total),
      facets,
      sort,
      dir,
    }
  },

  async get(resource, id) {
    await sleep(latency('read'))
    assertCan(resource, 'read')
    const rows = scopeFilter(resource, store.table(resource), ACTOR)
    const row = rows.find((r) => r.id === id)
    if (!row) throw new ApiError(404, `That ${RESOURCES[resource]?.label || 'record'} could not be found, or you do not have access to it.`)
    return expand(resource, [row])[0]
  },

  /* ---------- mutations ---------- */
  async create(resource, body) {
    await sleep(latency('write'))
    maybeChaos('write')
    const cfg = RESOURCES[resource]
    if (!cfg) throw new ApiError(404, `Unknown resource "${resource}".`)
    assertCan(resource, 'create')
    validate(resource, body, true)

    if (resource === 'users' && store.table('users').some((u) => u.email.toLowerCase() === String(body.email).toLowerCase())) {
      throw new ApiError(409, 'A user with that email already exists.', { email: 'Already in use' })
    }

    const rows = store.table(resource)
    const row = derive(resource, {
      id: uid(cfg.prefix),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      ...body,
    })
    rows.unshift(row)
    store.setTable(resource, rows)
    logAudit('create', cfg.label, row.id, { name: row.name || row.title || row.ref || row.number })
    return expand(resource, [row])[0]
  },

  async update(resource, id, patch) {
    await sleep(latency('write'))
    maybeChaos('write')
    const cfg = RESOURCES[resource]
    assertCan(resource, 'update')
    validate(resource, patch, false)

    const rows = store.table(resource)
    const i = rows.findIndex((r) => r.id === id)
    if (i < 0) throw new ApiError(404, 'Record not found. It may have been deleted by someone else.')
    rows[i] = derive(resource, { ...rows[i], ...patch, updatedAt: nowIso() })
    store.setTable(resource, rows)
    logAudit('update', cfg.label, id, patch)
    return expand(resource, [rows[i]])[0]
  },

  async remove(resource, id) {
    await sleep(latency('write'))
    maybeChaos('write')
    const cfg = RESOURCES[resource]
    assertCan(resource, 'delete')
    const rows = store.table(resource)
    const row = rows.find((r) => r.id === id)
    if (!row) throw new ApiError(404, 'Record not found.')

    // referential integrity, the way a real API would answer
    if (resource === 'clients') {
      const n = store.table('sites').filter((s) => s.clientId === id).length
      if (n) throw new ApiError(409, `Cannot delete: ${n} site${n > 1 ? 's are' : ' is'} still linked to this client.`)
    }
    if (resource === 'sites') {
      const n = store.table('shifts').filter((s) => s.siteId === id && ['scheduled', 'confirmed', 'in_progress'].includes(s.status)).length
      if (n) throw new ApiError(409, `Cannot delete: ${n} upcoming shift${n > 1 ? 's are' : ' is'} rostered at this site.`)
    }

    store.setTable(resource, rows.filter((r) => r.id !== id))
    logAudit('delete', cfg.label, id, { name: row.name || row.title || row.ref || row.number })
    return { ok: true, id }
  },

  async bulkUpdate(resource, ids, patch) {
    await sleep(latency('write'))
    maybeChaos('write')
    assertCan(resource, 'update')
    const set = new Set(ids)
    const rows = store.table(resource).map((r) => (set.has(r.id) ? derive(resource, { ...r, ...patch, updatedAt: nowIso() }) : r))
    store.setTable(resource, rows)
    logAudit('bulk_update', RESOURCES[resource].label, ids.join(','), patch)
    return { ok: true, count: ids.length }
  },

  async bulkRemove(resource, ids) {
    await sleep(latency('write'))
    maybeChaos('write')
    assertCan(resource, 'delete')
    const set = new Set(ids)
    store.setTable(resource, store.table(resource).filter((r) => !set.has(r.id)))
    logAudit('bulk_delete', RESOURCES[resource].label, ids.join(','))
    return { ok: true, count: ids.length }
  },

  /* ---------- domain actions ---------- */
  async addIncidentNote(id, { action, note }) {
    await sleep(latency('write'))
    maybeChaos('write')
    assertCan('incidents', 'update')
    const rows = store.table('incidents')
    const i = rows.findIndex((r) => r.id === id)
    if (i < 0) throw new ApiError(404, 'Incident not found.')
    rows[i] = {
      ...rows[i],
      timeline: [...rows[i].timeline, { at: nowIso(), actor: ACTOR.name, action, note }],
      updatedAt: nowIso(),
    }
    store.setTable('incidents', rows)
    logAudit('note', 'incident', id)
    return expand('incidents', [rows[i]])[0]
  },

  async addRequestComment(id, body) {
    await sleep(latency('write'))
    maybeChaos('write')
    assertCan('requests', 'update')
    const rows = store.table('requests')
    const i = rows.findIndex((r) => r.id === id)
    if (i < 0) throw new ApiError(404, 'Request not found.')
    rows[i] = {
      ...rows[i],
      comments: [...(rows[i].comments || []), { id: uid('cm'), at: nowIso(), author: ACTOR.name, body }],
      updatedAt: nowIso(),
    }
    store.setTable('requests', rows)
    return rows[i]
  },

  async markNotification(id, read) {
    await sleep(90)
    store.setTable('notifications', store.table('notifications').map((n) => (n.id === id ? { ...n, read } : n)))
    return { ok: true }
  },

  async markAllNotifications() {
    await sleep(140)
    store.setTable('notifications', store.table('notifications').map((n) => ({ ...n, read: true })))
    return { ok: true }
  },

  async decideLeave(id, { status, notes, coveredBy }) {
    await sleep(latency('write'))
    maybeChaos('write')
    assertCan('leave', 'update')
    const rows = store.table('leave')
    const i = rows.findIndex((r) => r.id === id)
    if (i < 0) throw new ApiError(404, 'Leave request not found.')
    if (status === 'approved') {
      const req = rows[i]
      const clash = store.table('shifts').filter(
        (sh) => sh.guardId === req.guardId && sh.date >= req.startDate && sh.date <= req.endDate &&
          (sh.status === 'scheduled' || sh.status === 'confirmed')
      )
      if (clash.length && !coveredBy) {
        throw new ApiError(409, `This officer is rostered for ${clash.length} shift${clash.length > 1 ? 's' : ''} in that period. Nominate a cover officer to approve.`)
      }
    }
    rows[i] = {
      ...rows[i],
      status,
      notes: notes ?? rows[i].notes,
      coveredBy: coveredBy ?? rows[i].coveredBy,
      approvedBy: ACTOR.name,
      decidedAt: nowIso(),
    }
    store.setTable('leave', rows)
    logAudit(status === 'approved' ? 'approve' : 'reject', 'leave request', id)
    return expand('leave', [rows[i]])[0]
  },

  async addEvidence(incidentId, file) {
    await sleep(latency('write'))
    maybeChaos('write')
    assertCan('incidents', 'update')
    const rows = store.table('incidents')
    const i = rows.findIndex((r) => r.id === incidentId)
    if (i < 0) throw new ApiError(404, 'Incident not found.')
    const item = {
      id: uid('ev'),
      type: file.type || 'document',
      name: file.name,
      mime: file.mime || 'application/octet-stream',
      sizeKb: file.sizeKb || 0,
      url: file.url || null,          // data URL from a real device upload, or a served path
      capturedAt: nowIso(),
      capturedBy: ACTOR.name,
      source: file.source || 'Manual upload',
      hash: 'sha256:' + Math.random().toString(16).slice(2, 14),
    }
    rows[i] = { ...rows[i], evidence: [...(rows[i].evidence || []), item], updatedAt: nowIso() }
    store.setTable('incidents', rows)
    logAudit('evidence_added', 'incident', incidentId, { name: item.name })
    return expand('incidents', [rows[i]])[0]
  },

  async removeEvidence(incidentId, evidenceId) {
    await sleep(latency('write'))
    maybeChaos('write')
    assertCan('incidents', 'update')
    const rows = store.table('incidents')
    const i = rows.findIndex((r) => r.id === incidentId)
    if (i < 0) throw new ApiError(404, 'Incident not found.')
    rows[i] = { ...rows[i], evidence: (rows[i].evidence || []).filter((e) => e.id !== evidenceId) }
    store.setTable('incidents', rows)
    logAudit('evidence_removed', 'incident', incidentId)
    return expand('incidents', [rows[i]])[0]
  },

  async addCorrectiveAction(incidentId, action) {
    await sleep(latency('write'))
    maybeChaos('write')
    assertCan('incidents', 'update')
    if (!action.description || !action.description.trim()) {
      throw new ApiError(422, 'Describe the corrective action.', { description: 'Required' })
    }
    const rows = store.table('incidents')
    const i = rows.findIndex((r) => r.id === incidentId)
    if (i < 0) throw new ApiError(404, 'Incident not found.')
    const item = {
      id: uid('ca'),
      description: action.description.trim(),
      owner: action.owner || 'Operations Manager',
      priority: action.priority || 'normal',
      dueAt: action.dueAt ? new Date(action.dueAt).toISOString() : new Date(Date.now() + 7 * 86400000).toISOString(),
      status: 'open',
      completedAt: null,
      createdAt: nowIso(),
    }
    rows[i] = { ...rows[i], actions: [...(rows[i].actions || []), item], updatedAt: nowIso() }
    store.setTable('incidents', rows)
    logAudit('action_added', 'incident', incidentId, { description: item.description })
    return expand('incidents', [rows[i]])[0]
  },

  async setActionStatus(incidentId, actionId, status) {
    await sleep(latency('write'))
    maybeChaos('write')
    assertCan('incidents', 'update')
    const rows = store.table('incidents')
    const i = rows.findIndex((r) => r.id === incidentId)
    if (i < 0) throw new ApiError(404, 'Incident not found.')
    rows[i] = {
      ...rows[i],
      actions: (rows[i].actions || []).map((a) =>
        a.id === actionId ? { ...a, status, completedAt: status === 'done' ? nowIso() : null } : a
      ),
    }
    store.setTable('incidents', rows)
    logAudit('action_updated', 'incident', incidentId, { actionId, status })
    return expand('incidents', [rows[i]])[0]
  },

  async setInspectionActionStatus(inspectionId, actionId, status) {
    await sleep(latency('write'))
    maybeChaos('write')
    assertCan('inspections', 'update')
    const rows = store.table('inspections')
    const i = rows.findIndex((r) => r.id === inspectionId)
    if (i < 0) throw new ApiError(404, 'Inspection not found.')
    const actions = (rows[i].actionsRequired || []).map((a) => (a.id === actionId ? { ...a, status } : a))
    rows[i] = {
      ...rows[i],
      actionsRequired: actions,
      status: actions.length && actions.every((a) => a.status === 'done') ? 'closed' : rows[i].status,
    }
    store.setTable('inspections', rows)
    logAudit('action_updated', 'inspection', inspectionId, { actionId, status })
    return expand('inspections', [rows[i]])[0]
  },

  /* ---------- officer duty (the guard portal) ---------- */
  async myDuty() {
    await sleep(latency('read'))
    if (!ACTOR) throw new ApiError(401, 'Your session has expired.')
    const gid = ACTOR.guardId
    if (!gid) throw new ApiError(403, 'This account is not linked to an officer record.')

    const guard = store.table('guards').find((g) => g.id === gid) || null
    const today = new Date().toISOString().slice(0, 10)
    const now = Date.now()

    const myShifts = store.table('shifts').filter((s2) => s2.guardId === gid)
    const todayShift =
      myShifts.find((s2) => s2.date === today && s2.status === 'in_progress') ||
      myShifts.find((s2) => s2.date === today) ||
      null
    const upcoming = myShifts
      .filter((s2) => new Date(s2.start).getTime() > now && s2.status !== 'cancelled')
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, 5)

    const attendanceToday = store
      .table('attendance')
      .find((a) => a.guardId === gid && a.date === today) || null

    const site = todayShift ? store.table('sites').find((s2) => s2.id === todayShift.siteId) : null
    const posts = site ? store.table('posts').filter((p) => p.siteId === site.id && p.status === 'active') : []

    const myPatrols = store
      .table('patrols')
      .filter((p) => p.guardId === gid)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    const livePatrol = myPatrols.find((p) => p.status === 'in_progress') || null

    const myIncidents = store
      .table('incidents')
      .filter((i) => i.reportedBy === gid || i.assignedTo === gid)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))

    const leave = store.table('leave').filter((l) => l.guardId === gid)
    const training = store.table('training').filter((t2) => t2.guardId === gid)
    const documents = store.table('documents').filter((d) => d.guardId === gid)

    const licDays = guard && guard.licenseExpiry
      ? Math.round((new Date(guard.licenseExpiry).getTime() - now) / 86400000)
      : null

    return {
      guard,
      site: site ? expand('sites', [site])[0] : null,
      posts,
      shift: todayShift ? expand('shifts', [todayShift])[0] : null,
      attendance: attendanceToday,
      upcoming: expand('shifts', upcoming),
      livePatrol: livePatrol ? expand('patrols', [livePatrol])[0] : null,
      recentPatrols: expand('patrols', myPatrols.slice(0, 5)),
      myIncidents: expand('incidents', myIncidents.slice(0, 6)),
      counts: {
        openIncidents: myIncidents.filter((i) => i.status === 'open' || i.status === 'investigating').length,
        incidentsReported: myIncidents.length,
        shiftsThisMonth: myShifts.filter((s2) => s2.date.slice(0, 7) === today.slice(0, 7)).length,
        hoursThisMonth: myShifts
          .filter((s2) => s2.date.slice(0, 7) === today.slice(0, 7) && s2.status === 'completed')
          .reduce((a, s2) => a + s2.hours + (s2.overtime || 0), 0),
        pendingLeave: leave.filter((l) => l.status === 'pending').length,
        leaveApproved: leave.filter((l) => l.status === 'approved').length,
        trainingExpired: training.filter((t2) => t2.status === 'expired').length,
        docsMissing: documents.filter((d) => d.mandatory && (d.status === 'missing' || d.status === 'expired')).length,
        licenceDays: licDays,
        patrolsCompleted: myPatrols.filter((p) => p.status === 'complete').length,
      },
    }
  },

  async clockIn(shiftId) {
    await sleep(latency('write'))
    maybeChaos('write')
    if (!ACTOR || !ACTOR.guardId) throw new ApiError(403, 'This account is not linked to an officer record.')
    const shift = store.table('shifts').find((s2) => s2.id === shiftId)
    if (!shift) throw new ApiError(404, 'Shift not found.')
    if (shift.guardId !== ACTOR.guardId) throw new ApiError(403, 'That shift belongs to another officer.')

    const rows = store.table('attendance')
    const today = new Date().toISOString().slice(0, 10)
    if (rows.some((a) => a.guardId === ACTOR.guardId && a.date === today && a.clockIn)) {
      throw new ApiError(409, 'You are already clocked in for today.')
    }

    const planned = new Date(shift.start).getTime()
    const lateMins = Math.max(0, Math.round((Date.now() - planned) / 60000))
    const row = {
      id: uid('at'),
      shiftId: shift.id,
      guardId: ACTOR.guardId,
      siteId: shift.siteId,
      clientId: shift.clientId,
      date: today,
      clockIn: nowIso(),
      clockOut: null,
      hours: 0,
      status: lateMins > 10 ? 'late' : 'on_duty',
      lateMins: lateMins > 10 ? lateMins : 0,
      geoVerified: true,
      method: 'biometric',
    }
    rows.unshift(row)
    store.setTable('attendance', rows)

    const shifts = store.table('shifts').map((s2) => (s2.id === shiftId ? { ...s2, status: 'in_progress' } : s2))
    store.setTable('shifts', shifts)

    logAudit('clock_in', 'attendance', row.id, { site: shift.siteId, late: row.lateMins })
    return row
  },

  async clockOut(attendanceId) {
    await sleep(latency('write'))
    maybeChaos('write')
    const rows = store.table('attendance')
    const i = rows.findIndex((a) => a.id === attendanceId)
    if (i < 0) throw new ApiError(404, 'No open attendance record found.')
    if (rows[i].guardId !== ACTOR.guardId) throw new ApiError(403, 'That record belongs to another officer.')
    if (rows[i].clockOut) throw new ApiError(409, 'You have already clocked out for this shift.')

    const out = Date.now()
    const hours = +((out - new Date(rows[i].clockIn).getTime()) / 3600000).toFixed(2)
    rows[i] = { ...rows[i], clockOut: nowIso(), hours, status: rows[i].lateMins ? 'late' : 'present' }
    store.setTable('attendance', rows)

    const shifts = store.table('shifts').map((s2) => (s2.id === rows[i].shiftId ? { ...s2, status: 'completed' } : s2))
    store.setTable('shifts', shifts)

    logAudit('clock_out', 'attendance', rows[i].id, { hours })
    return rows[i]
  },

  async startPatrol({ siteId, route }) {
    await sleep(latency('write'))
    maybeChaos('write')
    if (!ACTOR || !ACTOR.guardId) throw new ApiError(403, 'This account is not linked to an officer record.')
    const site = store.table('sites').find((s2) => s2.id === siteId)
    if (!site) throw new ApiError(404, 'Site not found.')
    const rows = store.table('patrols')
    if (rows.some((p) => p.guardId === ACTOR.guardId && p.status === 'in_progress')) {
      throw new ApiError(409, 'You already have a patrol in progress. Close it before starting another.')
    }
    const row = {
      id: uid('pt'),
      ref: 'PTR-' + Math.floor(1000 + Math.random() * 8999),
      siteId, clientId: site.clientId, guardId: ACTOR.guardId,
      startedAt: nowIso(),
      completedAt: null,
      checkpointsTotal: site.checkpoints,
      checkpointsScanned: 0,
      status: 'in_progress',
      exceptions: 0,
      route: route || 'Perimeter Loop',
      durationMins: null,
    }
    rows.unshift(row)
    store.setTable('patrols', rows)
    logAudit('patrol_start', 'patrol', row.id, { site: site.name })
    return expand('patrols', [row])[0]
  },

  async scanCheckpoint(patrolId) {
    await sleep(Math.min(320, latency('write')))
    maybeChaos('write')
    const rows = store.table('patrols')
    const i = rows.findIndex((p) => p.id === patrolId)
    if (i < 0) throw new ApiError(404, 'Patrol not found.')
    if (rows[i].guardId !== ACTOR.guardId) throw new ApiError(403, 'That patrol belongs to another officer.')
    if (rows[i].status !== 'in_progress') throw new ApiError(409, 'This patrol has already been closed.')
    if (rows[i].checkpointsScanned >= rows[i].checkpointsTotal) {
      throw new ApiError(409, 'Every checkpoint on this route has already been scanned.')
    }
    rows[i] = { ...rows[i], checkpointsScanned: rows[i].checkpointsScanned + 1 }
    store.setTable('patrols', rows)
    return expand('patrols', [rows[i]])[0]
  },

  async completePatrol(patrolId) {
    await sleep(latency('write'))
    maybeChaos('write')
    const rows = store.table('patrols')
    const i = rows.findIndex((p) => p.id === patrolId)
    if (i < 0) throw new ApiError(404, 'Patrol not found.')
    if (rows[i].guardId !== ACTOR.guardId) throw new ApiError(403, 'That patrol belongs to another officer.')
    const started = new Date(rows[i].startedAt).getTime()
    const scanned = rows[i].checkpointsScanned
    const total = rows[i].checkpointsTotal
    rows[i] = {
      ...rows[i],
      completedAt: nowIso(),
      durationMins: Math.max(1, Math.round((Date.now() - started) / 60000)),
      exceptions: total - scanned,
      status: scanned >= total ? 'complete' : 'exceptions',
    }
    store.setTable('patrols', rows)
    logAudit('patrol_complete', 'patrol', rows[i].id, { scanned, total })
    return expand('patrols', [rows[i]])[0]
  },

  /* ---------- shift detail ---------- */
  async shiftDetail(id) {
    await sleep(latency('read'))
    assertCan('shifts', 'read')
    const rows = scopeFilter('shifts', store.table('shifts'), ACTOR)
    const shift = rows.find((r) => r.id === id)
    if (!shift) throw new ApiError(404, 'That shift could not be found, or you do not have access to it.')

    const from = new Date(shift.start).getTime()
    const to = new Date(shift.end).getTime()
    const within = (iso2) => {
      if (!iso2) return false
      const t = new Date(iso2).getTime()
      return t >= from - 30 * 60000 && t <= to + 60 * 60000
    }

    const attendance = store.table('attendance').find((a) => a.shiftId === shift.id) || null
    const patrols = store.table('patrols').filter((p) => p.guardId === shift.guardId && p.siteId === shift.siteId && within(p.startedAt))
    const incidents = store.table('incidents').filter((i) => i.siteId === shift.siteId && within(i.occurredAt))
    const inspections = store.table('inspections').filter((i) => i.siteId === shift.siteId && within(i.at))
    const posts = store.table('posts').filter((p) => p.siteId === shift.siteId && p.status === 'active')
    const guard = store.table('guards').find((g) => g.id === shift.guardId) || null

    /* One merged timeline is what a supervisor actually wants to read: the
       roster, the clock, the rounds and anything that happened, in order. */
    const timeline = []
    timeline.push({ at: shift.start, kind: 'shift', title: 'Shift scheduled to start', note: `${titleCaseSafe(shift.type)} shift, ${shift.hours} hours` })
    if (attendance?.clockIn) {
      timeline.push({
        at: attendance.clockIn,
        kind: attendance.lateMins ? 'late' : 'clock',
        title: attendance.lateMins ? `Clocked in ${attendance.lateMins} minutes late` : 'Clocked in',
        note: `${attendance.method} verification${attendance.geoVerified ? ', inside the site geofence' : ', outside the geofence'}`,
      })
    }
    if (shift.status === 'no_show') {
      timeline.push({ at: shift.start, kind: 'noshow', title: 'No show recorded', note: 'Officer did not book on and could not be raised' })
    }
    ;(shift.occurrenceBook || []).forEach((e) => {
      timeline.push({ at: e.at, kind: 'book', title: 'Occurrence book entry', note: e.note, author: e.author, entryKind: e.kind })
    })
    patrols.forEach((p) => {
      timeline.push({
        at: p.startedAt, kind: 'patrol', title: `Patrol started, ${p.route}`,
        note: `${p.checkpointsScanned} of ${p.checkpointsTotal} checkpoints scanned`, ref: p.ref, link: '/patrols',
      })
      if (p.completedAt) {
        timeline.push({
          at: p.completedAt,
          kind: p.status === 'complete' ? 'patrolDone' : 'exception',
          title: p.status === 'complete' ? 'Patrol closed, all checkpoints scanned' : `Patrol closed with ${p.exceptions} missed checkpoints`,
          note: p.route, ref: p.ref, link: '/patrols',
        })
      }
    })
    incidents.forEach((i) => {
      timeline.push({ at: i.occurredAt, kind: 'incident', title: `${i.type} reported`, note: i.title, ref: i.ref, link: '/incidents/' + i.id, severity: i.severity })
    })
    inspections.forEach((i) => {
      timeline.push({ at: i.at, kind: 'inspection', title: `Supervisor visit, scored ${i.score}%`, note: i.summary, ref: i.ref, link: '/inspections' })
    })
    if (attendance?.clockOut) {
      timeline.push({ at: attendance.clockOut, kind: 'clock', title: 'Clocked out', note: `${attendance.hours} hours recorded` })
    }
    timeline.sort((a, b) => String(a.at).localeCompare(String(b.at)))

    return {
      shift: expand('shifts', [shift])[0],
      guard,
      attendance,
      posts,
      patrols: expand('patrols', patrols),
      incidents: expand('incidents', incidents),
      inspections: expand('inspections', inspections),
      timeline,
      stats: {
        checkpointsScanned: patrols.reduce((a, p) => a + p.checkpointsScanned, 0),
        checkpointsTotal: patrols.reduce((a, p) => a + p.checkpointsTotal, 0),
        exceptions: patrols.reduce((a, p) => a + (p.exceptions || 0), 0),
        incidents: incidents.length,
        entries: (shift.occurrenceBook || []).length,
        hoursWorked: attendance?.hours || 0,
      },
    }
  },

  async addShiftLog(id, { kind, note }) {
    await sleep(latency('write'))
    maybeChaos('write')
    assertCan('shifts', 'update')
    if (!note || !note.trim()) throw new ApiError(422, 'Write the occurrence book entry.', { note: 'Required' })
    const rows = store.table('shifts')
    const i = rows.findIndex((r) => r.id === id)
    if (i < 0) throw new ApiError(404, 'Shift not found.')
    const entry = {
      id: uid('ob'),
      at: nowIso(),
      author: ACTOR.name,
      kind: kind || 'observation',
      note: note.trim(),
    }
    rows[i] = { ...rows[i], occurrenceBook: [...(rows[i].occurrenceBook || []), entry] }
    store.setTable('shifts', rows)
    logAudit('note', 'shift', id, { kind: entry.kind })
    return entry
  },

  /* ---------- payroll ---------- */
  async payrollRun(period) {
    await sleep(latency('read'))
    assertCan('payroll', 'read')
    const runs = store.table('payrollRuns')
    const run = runs.find((r) => r.period === period) || null
    if (!run) throw new ApiError(404, 'No payroll run exists for that period.')

    const slips = scopeFilter('payroll', store.table('payroll'), ACTOR).filter((s2) => s2.period === period)
    const prior = runs
      .filter((r) => r.period < period)
      .sort((a, b) => b.period.localeCompare(a.period))[0] || null

    const guards = indexBy('guards')
    const byCost = [...slips]
      .sort((a, b) => b.costToCompany - a.costToCompany)
      .slice(0, 8)
      .map((s2) => ({ id: s2.id, name: guards.get(s2.guardId)?.name || '', value: Math.round(s2.costToCompany) }))

    const delta = (k) => (prior && prior[k] ? Math.round(((run[k] - prior[k]) / prior[k]) * 100) : 0)

    return {
      run,
      prior,
      slips: expand('payroll', slips),
      variance: {
        gross: delta('gross'),
        net: delta('net'),
        headcount: prior ? run.headcount - prior.headcount : 0,
        otHours: delta('otHours'),
        costToCompany: delta('costToCompany'),
      },
      byCost,
      history: runs
        .slice()
        .sort((a, b) => a.period.localeCompare(b.period))
        .map((r) => ({ period: r.period, gross: Math.round(r.gross), net: Math.round(r.net), employer: Math.round(r.employerTotal) })),
    }
  },

  async payslipDetail(id) {
    await sleep(latency('read'))
    assertCan('payroll', 'read')
    const all = scopeFilter('payroll', store.table('payroll'), ACTOR)
    const slip = all.find((r) => r.id === id)
    if (!slip) throw new ApiError(404, 'That payslip could not be found, or you do not have access to it.')
    const guard = store.table('guards').find((g) => g.id === slip.guardId) || null
    const mine = all.filter((r) => r.guardId === slip.guardId)
    return {
      slip: expand('payroll', [slip])[0],
      guard,
      run: store.table('payrollRuns').find((r) => r.id === slip.runId) || null,
      ytd: ytdFor(mine, slip.period),
      history: mine
        .slice()
        .sort((a, b) => a.period.localeCompare(b.period))
        .map((r) => ({ period: r.period, gross: Math.round(r.gross), net: Math.round(r.net), deductions: Math.round(r.deductionsTotal) })),
    }
  },

  /** Recalculate one payslip from its inputs, so an edit is always consistent. */
  async recalculatePayslip(id, patch) {
    await sleep(latency('write'))
    maybeChaos('write')
    assertCan('payroll', 'update')
    const rows = store.table('payroll')
    const i = rows.findIndex((r) => r.id === id)
    if (i < 0) throw new ApiError(404, 'Payslip not found.')
    if (rows[i].status === 'paid') throw new ApiError(409, 'This payslip has already been paid and cannot be changed.')

    const merged = { ...rows[i], ...patch }
    const calc = computePayslip({
      hourlyRate: merged.hourlyRate,
      baseHours: +merged.baseHours || 0,
      otHours: +merged.otHours || 0,
      holidayHours: +merged.holidayHours || 0,
      nightShifts: +merged.nightShifts || 0,
      standbyDays: +merged.standbyDays || 0,
      advances: +merged.advances || 0,
      unionMember: merged.union > 0 || merged.unionMember !== false,
      uniformDeduction: +merged.uniformDeduction || 0,
      otherDeduction: +merged.otherDeduction || 0,
    })
    rows[i] = { ...merged, ...calc, deductions: calc.deductionsTotal, updatedAt: nowIso() }
    store.setTable('payroll', rows)
    recomputeRunTotals(rows[i].runId)
    logAudit('update', 'payslip', id, patch)
    return expand('payroll', [rows[i]])[0]
  },

  async setPayrollRunStatus(runId, status) {
    await sleep(latency('write'))
    maybeChaos('write')
    assertCan('payroll', 'update')
    const runs = store.table('payrollRuns')
    const i = runs.findIndex((r) => r.id === runId)
    if (i < 0) throw new ApiError(404, 'Payroll run not found.')
    if (status === 'approved' && runs[i].status === 'draft') {
      throw new ApiError(409, 'Calculate the run before approving it.')
    }
    const now = nowIso()
    runs[i] = {
      ...runs[i],
      status,
      calculatedAt: status === 'calculated' ? now : runs[i].calculatedAt,
      approvedBy: status === 'approved' ? ACTOR.name : runs[i].approvedBy,
      approvedAt: status === 'approved' ? now : runs[i].approvedAt,
      paidAt: status === 'paid' ? now : runs[i].paidAt,
    }
    store.setTable('payrollRuns', runs)

    const slipStatus = { calculated: 'pending', approved: 'approved', paid: 'paid' }[status]
    if (slipStatus) {
      const slips = store.table('payroll').map((s2) =>
        s2.runId === runId
          ? { ...s2, status: slipStatus, paidAt: status === 'paid' ? now : s2.paidAt, paymentMethod: status === 'paid' ? (s2.paymentMethod || 'EFT') : s2.paymentMethod }
          : s2
      )
      store.setTable('payroll', slips)
    }
    logAudit(status === 'approved' ? 'approve' : 'update', 'payroll run', runId, { status })
    return runs[i]
  },

  /** Bank transfer file for a run, as a real payment instruction would be. */
  async bankFile(period) {
    await sleep(latency('read'))
    assertCan('payroll', 'read')
    const guards = indexBy('guards')
    return store
      .table('payroll')
      .filter((s2) => s2.period === period)
      .map((s2) => {
        const g = guards.get(s2.guardId)
        return {
          employeeNo: g ? g.employeeNo : '',
          name: g ? g.name : '',
          bank: 'CBZ Bank',
          accountNo: '0113' + String(Math.abs(hashCode(s2.guardId))).padStart(9, '0').slice(0, 9),
          reference: `SAL/${period}/${g ? g.employeeNo : ''}`,
          amount: s2.net.toFixed(2),
          currency: 'USD',
        }
      })
  },

  /* ---------- operations intelligence ---------- */
  async intelligence() {
    await sleep(latency('read'))
    assertCan('intelligence', 'read')
    const A = ACTOR
    const scoped = (n) => scopeFilter(n, store.table(n), A)
    return computeIntelligence(
      {
        sites: scoped('sites'),
        guards: scoped('guards'),
        incidents: scoped('incidents'),
        patrols: scoped('patrols'),
        attendance: scoped('attendance'),
        shifts: scoped('shifts'),
        inspections: scoped('inspections'),
        posts: scoped('posts'),
        leave: scoped('leave'),
        training: scoped('training'),
        documents: scoped('documents'),
      },
      { slaTargetMins: store.getSettings().slaTargetMins }
    )
  },

  /* ---------- lookups (small, used to populate selects) ---------- */
  async lookups() {
    await sleep(Math.min(160, latency('read')))
    const scoped = (name) => scopeFilter(name, store.table(name), ACTOR)
    return {
      clients: scoped('clients').map((c) => ({ id: c.id, name: c.name, code: c.code, status: c.status })).sort((a, b) => a.name.localeCompare(b.name)),
      sites: scoped('sites').map((s) => ({ id: s.id, name: s.name, clientId: s.clientId, code: s.code, riskLevel: s.riskLevel })).sort((a, b) => a.name.localeCompare(b.name)),
      guards: scoped('guards').map((g) => ({ id: g.id, name: g.name, rank: g.rank, status: g.status, employeeNo: g.employeeNo, siteId: g.siteId })).sort((a, b) => a.name.localeCompare(b.name)),
    }
  },

  /* ---------- analytics ---------- */
  async dashboard() {
    await sleep(latency('read'))
    const A = ACTOR
    const guards = scopeFilter('guards', store.table('guards'), A)
    const sites = scopeFilter('sites', store.table('sites'), A)
    const clients = scopeFilter('clients', store.table('clients'), A)
    const incidents = scopeFilter('incidents', store.table('incidents'), A)
    const shifts = scopeFilter('shifts', store.table('shifts'), A)
    const invoices = scopeFilter('invoices', store.table('invoices'), A)
    const patrols = scopeFilter('patrols', store.table('patrols'), A)
    const attendance = scopeFilter('attendance', store.table('attendance'), A)

    const now = Date.now()
    const DAY = 86400000
    const today = new Date().toISOString().slice(0, 10)
    const in30 = now + 30 * DAY

    const openIncidents = incidents.filter((i) => i.status === 'open' || i.status === 'investigating')
    const last30 = incidents.filter((i) => now - new Date(i.occurredAt).getTime() < 30 * DAY)
    const prev30 = incidents.filter((i) => {
      const d = now - new Date(i.occurredAt).getTime()
      return d >= 30 * DAY && d < 60 * DAY
    })

    const resolved = incidents.filter((i) => i.resolvedAt)
    const mttrHrs = resolved.length
      ? resolved.reduce((a, i) => a + (new Date(i.resolvedAt) - new Date(i.reportedAt)) / 3600000, 0) / resolved.length
      : 0

    const onDuty = shifts.filter((s) => s.status === 'in_progress')
    const todayShifts = shifts.filter((s) => s.date === today)
    const attToday = attendance.filter((a) => a.date === today)
    const presentToday = attToday.filter((a) => a.status !== 'absent').length
    const coverage = todayShifts.length ? Math.round((presentToday / todayShifts.length) * 100) : 100

    const paid = invoices.filter((i) => i.status === 'paid')
    const outstanding = invoices.filter((i) => i.status === 'sent' || i.status === 'overdue')
    const overdue = invoices.filter((i) => i.status === 'overdue')

    // 14-day incident trend
    const trend = []
    for (let d = 13; d >= 0; d--) {
      const day = new Date(now - d * DAY).toISOString().slice(0, 10)
      const dayInc = incidents.filter((i) => i.occurredAt.slice(0, 10) === day)
      trend.push({
        day: day.slice(5),
        total: dayInc.length,
        critical: dayInc.filter((i) => i.severity === 'critical').length,
        high: dayInc.filter((i) => i.severity === 'high').length,
        resolved: dayInc.filter((i) => i.status === 'resolved' || i.status === 'closed').length,
      })
    }

    // 6-month revenue
    const byPeriod = {}
    invoices.forEach((i) => {
      byPeriod[i.period] = byPeriod[i.period] || { period: i.period, billed: 0, collected: 0 }
      byPeriod[i.period].billed += i.total
      if (i.status === 'paid') byPeriod[i.period].collected += i.total
    })
    const revenue = Object.values(byPeriod)
      .sort((a, b) => a.period.localeCompare(b.period))
      .slice(-6)
      .map((r) => ({ ...r, billed: Math.round(r.billed), collected: Math.round(r.collected) }))

    const bySeverity = ['critical', 'high', 'medium', 'low'].map((k) => ({
      name: k,
      value: incidents.filter((i) => i.severity === k).length,
    }))

    const byType = Object.entries(
      incidents.reduce((a, i) => { a[i.type] = (a[i.type] || 0) + 1; return a }, {})
    ).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8)

    const siteRisk = sites
      .map((s) => ({
        id: s.id,
        name: s.name,
        riskLevel: s.riskLevel,
        incidents: incidents.filter((i) => i.siteId === s.id && now - new Date(i.occurredAt).getTime() < 90 * DAY).length,
        guards: guards.filter((g) => g.siteId === s.id).length,
        required: s.guardsRequired,
      }))
      .sort((a, b) => b.incidents - a.incidents)
      .slice(0, 8)

    const patrolCompliance = patrols.length
      ? Math.round((patrols.filter((p) => p.status === 'complete').length / patrols.filter((p) => p.status !== 'in_progress').length || 0) * 100)
      : 0

    // Post coverage for today, and a critical-signal count for the sidebar badge.
    const posts = scopeFilter('posts', store.table('posts'), A).filter((p) => p.status === 'active')
    const rosteredToday = new Set(shifts.filter((sh) => sh.date === today && sh.status !== 'cancelled').map((sh) => sh.siteId))
    const uncoveredPosts = posts.filter((p) => p.coverage !== 'Weekend Only' && !rosteredToday.has(p.siteId))
    const uncoveredSites = sites.filter((s) => s.status === 'active' && !rosteredToday.has(s.id))

    let criticalSignals = 0
    let openInspectionActions = 0
    if (can(A, 'intelligence', 'read')) {
      try {
        criticalSignals = computeIntelligence(
          {
            sites, guards, incidents, patrols, attendance, shifts,
            inspections: scopeFilter('inspections', store.table('inspections'), A),
            posts,
            leave: scopeFilter('leave', store.table('leave'), A),
            training: scopeFilter('training', store.table('training'), A),
            documents: scopeFilter('documents', store.table('documents'), A),
          },
          { slaTargetMins: store.getSettings().slaTargetMins }
        ).headline.criticalSignals
      } catch { criticalSignals = 0 }
    }
    if (can(A, 'inspections', 'read')) {
      openInspectionActions = scopeFilter('inspections', store.table('inspections'), A)
        .flatMap((i) => i.actionsRequired || [])
        .filter((a) => a.status === 'open').length
    }

    return {
      kpis: {
        openIncidents: openIncidents.length,
        criticalOpen: openIncidents.filter((i) => i.severity === 'critical').length,
        incidents30: last30.length,
        incidentsDelta: prev30.length ? Math.round(((last30.length - prev30.length) / prev30.length) * 100) : 0,
        mttrHrs: +mttrHrs.toFixed(1),
        onDuty: onDuty.length,
        activeGuards: guards.filter((g) => g.status === 'active').length,
        totalGuards: guards.length,
        activeSites: sites.filter((s) => s.status === 'active').length,
        totalSites: sites.length,
        activeClients: clients.filter((c) => c.status === 'active').length,
        coverage,
        patrolCompliance: isNaN(patrolCompliance) ? 0 : patrolCompliance,
        revenueCollected: Math.round(paid.reduce((a, i) => a + i.total, 0)),
        outstanding: Math.round(outstanding.reduce((a, i) => a + i.total, 0)),
        overdueCount: overdue.length,
        contractValue: clients.filter((c) => c.status === 'active').reduce((a, c) => a + c.contractValue, 0),
        licenceExpiring: guards.filter((g) => new Date(g.licenseExpiry).getTime() < in30 && new Date(g.licenseExpiry).getTime() > now).length,
        licenceExpired: guards.filter((g) => new Date(g.licenseExpiry).getTime() <= now).length,
        noShows: shifts.filter((s) => s.status === 'no_show' && now - new Date(s.start).getTime() < 7 * DAY).length,
        lateArrivals: attendance.filter((a) => a.status === 'late' && now - new Date(a.date).getTime() < 7 * DAY).length,
        openRequests: scopeFilter('requests', store.table('requests'), A).filter((r) => r.status === 'open' || r.status === 'in_progress').length,
        uncoveredPosts: uncoveredPosts.length,
        uncoveredSites: uncoveredSites.length,
        totalPosts: posts.length,
        criticalSignals,
        openInspectionActions,
      },
      trend,
      revenue,
      bySeverity,
      byType,
      siteRisk,
      uncovered: expand('sites', uncoveredSites.slice(0, 6)).map((st) => ({
        ...st,
        posts: uncoveredPosts.filter((p) => p.siteId === st.id).length,
      })),
      liveBoard: expand('shifts', onDuty.slice(0, 8)),
      recentIncidents: expand('incidents', [...incidents].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 6)),
      activePatrols: expand('patrols', patrols.filter((p) => p.status === 'in_progress').slice(0, 5)),
    }
  },

  async reportData(range = 90) {
    await sleep(latency('read'))
    const A = ACTOR
    const incidents = scopeFilter('incidents', store.table('incidents'), A)
    const attendance = scopeFilter('attendance', store.table('attendance'), A)
    const guards = scopeFilter('guards', store.table('guards'), A)
    const sites = scopeFilter('sites', store.table('sites'), A)
    const clients = scopeFilter('clients', store.table('clients'), A)
    const invoices = scopeFilter('invoices', store.table('invoices'), A)
    const now = Date.now()
    const DAY = 86400000
    const cutoff = now - range * DAY

    const inRange = incidents.filter((i) => new Date(i.occurredAt).getTime() >= cutoff)

    const weeks = {}
    inRange.forEach((i) => {
      const d = new Date(i.occurredAt)
      const wk = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY).toISOString().slice(5, 10)
      weeks[wk] = weeks[wk] || { week: wk, incidents: 0, resolved: 0, loss: 0 }
      weeks[wk].incidents++
      if (i.resolvedAt) weeks[wk].resolved++
      weeks[wk].loss += i.lossValue || 0
    })

    const byClient = clients.map((c) => {
      const cInc = inRange.filter((i) => i.clientId === c.id)
      const cInv = invoices.filter((i) => i.clientId === c.id)
      return {
        id: c.id,
        name: c.name,
        tier: c.tier,
        incidents: cInc.length,
        critical: cInc.filter((i) => i.severity === 'critical').length,
        sites: sites.filter((s) => s.clientId === c.id).length,
        billed: Math.round(cInv.reduce((a, i) => a + i.total, 0)),
        satisfaction: c.satisfaction,
      }
    }).sort((a, b) => b.billed - a.billed)

    const attStats = ['present', 'late', 'absent', 'on_duty'].map((k) => ({
      name: k,
      value: attendance.filter((a) => a.status === k).length,
    }))

    const topOfficers = [...guards]
      .filter((g) => g.status === 'active')
      .sort((a, b) => b.rating - a.rating || b.incidentsHandled - a.incidentsHandled)
      .slice(0, 10)
      .map((g) => ({ id: g.id, name: g.name, rank: g.rank, rating: g.rating, incidents: g.incidentsHandled, shifts: g.shiftsCompleted }))

    const responseBuckets = [
      { name: '< 15m', value: 0 }, { name: '15 to 30m', value: 0 }, { name: '30 to 60m', value: 0 }, { name: '1 to 4h', value: 0 }, { name: '> 4h', value: 0 },
    ]
    inRange.forEach((i) => {
      const mins = (new Date(i.reportedAt) - new Date(i.occurredAt)) / 60000
      const b = mins < 15 ? 0 : mins < 30 ? 1 : mins < 60 ? 2 : mins < 240 ? 3 : 4
      responseBuckets[b].value++
    })

    return {
      weekly: Object.values(weeks).sort((a, b) => a.week.localeCompare(b.week)),
      byClient,
      attStats,
      topOfficers,
      responseBuckets,
      totals: {
        incidents: inRange.length,
        loss: inRange.reduce((a, i) => a + (i.lossValue || 0), 0),
        injuries: inRange.reduce((a, i) => a + (i.injuries || 0), 0),
        slaBreaches: inRange.filter((i) => (new Date(i.reportedAt) - new Date(i.occurredAt)) / 60000 > store.getSettings().slaTargetMins).length,
      },
    }
  },

  async globalSearch(q) {
    await sleep(Math.min(200, latency('read')))
    const term = q.trim().toLowerCase()
    if (term.length < 2) return []
    const out = []
    const push = (type, id, title, subtitle, to) => out.push({ type, id, title, subtitle, to })

    const scoped = (n) => scopeFilter(n, store.table(n), ACTOR)
    scoped('clients').filter((c) => c.name.toLowerCase().includes(term) || c.code.toLowerCase().includes(term)).slice(0, 5)
      .forEach((c) => push('Client', c.id, c.name, c.industry + ' · ' + c.city, '/clients/' + c.id))
    scoped('sites').filter((s) => s.name.toLowerCase().includes(term) || s.code.toLowerCase().includes(term)).slice(0, 5)
      .forEach((s) => push('Site', s.id, s.name, s.type + ' · ' + s.city, '/sites/' + s.id))
    scoped('guards').filter((g) => g.name.toLowerCase().includes(term) || g.employeeNo.toLowerCase().includes(term)).slice(0, 5)
      .forEach((g) => push('Officer', g.id, g.name, g.rank + ' · ' + g.employeeNo, '/guards/' + g.id))
    scoped('incidents').filter((i) => i.title.toLowerCase().includes(term) || i.ref.toLowerCase().includes(term)).slice(0, 5)
      .forEach((i) => push('Incident', i.id, i.ref + ': ' + i.type, i.severity + ' · ' + i.status, '/incidents/' + i.id))
    scoped('invoices').filter((i) => i.number.toLowerCase().includes(term)).slice(0, 4)
      .forEach((i) => push('Invoice', i.id, i.number, i.status + ' · $' + i.total.toLocaleString(), '/invoices'))
    return out.slice(0, 18)
  },
}

export { RESOURCES }
