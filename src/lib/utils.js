export const cn = (...a) => a.flat().filter(Boolean).join(' ')

/* ------------------------------ formatting ------------------------------ */
export const money = (n, cur = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n || 0)

export const money2 = (n, cur = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: 2 }).format(n || 0)

export const num = (n) => new Intl.NumberFormat('en-US').format(n || 0)

export const compact = (n) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0)

export const pct = (n, dp = 0) => `${(n || 0).toFixed(dp)}%`

const D = (v) => (v instanceof Date ? v : new Date(v))

export const fmtDate = (v) =>
  !v ? '' : D(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

export const fmtDateShort = (v) =>
  !v ? '' : D(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })

export const fmtTime = (v) =>
  !v ? '' : D(v).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

export const fmtDateTime = (v) => (!v ? '' : `${fmtDate(v)} · ${fmtTime(v)}`)

export const timeAgo = (v) => {
  if (!v) return ''
  const s = (Date.now() - D(v).getTime()) / 1000
  if (s < 0) {
    const f = Math.abs(s)
    if (f < 3600) return `in ${Math.round(f / 60)}m`
    if (f < 86400) return `in ${Math.round(f / 3600)}h`
    return `in ${Math.round(f / 86400)}d`
  }
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`
  if (s < 31536000) return `${Math.floor(s / 2592000)}mo ago`
  return `${Math.floor(s / 31536000)}y ago`
}

export const duration = (mins) => {
  if (mins == null) return ''
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  return h ? `${h}h ${m}m` : `${m}m`
}

export const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

export const titleCase = (s = '') =>
  String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export const hueFor = (str = '') => {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360
  return h
}

/* -------------------------- status / severity ---------------------------- */
const T = (fg, bg, bd) => ({ fg, bg, bd })

export const TONES = {
  ok:       T('text-ok', 'bg-ok/10', 'border-ok/25'),
  info:     T('text-accent', 'bg-accent/10', 'border-accent/25'),
  violet:   T('text-accent2', 'bg-accent2/10', 'border-accent2/25'),
  warn:     T('text-warn', 'bg-warn/10', 'border-warn/25'),
  danger:   T('text-danger', 'bg-danger/10', 'border-danger/25'),
  critical: T('text-critical', 'bg-critical/10', 'border-critical/30'),
  neutral:  T('text-muted', 'bg-muted/10', 'border-line'),
}

const MAP = {
  // generic lifecycle
  active: 'ok', inactive: 'neutral', pending: 'warn', onboarding: 'info', suspended: 'danger',
  churned: 'neutral', disabled: 'neutral', training: 'violet', on_leave: 'warn',
  // incidents
  open: 'critical', investigating: 'warn', resolved: 'ok', closed: 'neutral',
  // severity / risk
  low: 'info', medium: 'warn', high: 'danger', critical: 'critical',
  // shifts
  scheduled: 'info', confirmed: 'violet', in_progress: 'ok', completed: 'neutral',
  no_show: 'critical', cancelled: 'neutral', swapped: 'warn',
  // attendance
  present: 'ok', late: 'warn', absent: 'critical', on_duty: 'info',
  // invoices / payroll
  draft: 'neutral', sent: 'info', paid: 'ok', overdue: 'critical', void: 'neutral',
  approved: 'violet',
  // patrols
  complete: 'ok', exceptions: 'warn',
  // assets
  in_service: 'ok', in_store: 'info', maintenance: 'warn', lost: 'critical', retired: 'neutral',
  excellent: 'ok', good: 'info', fair: 'warn', poor: 'danger',
  // requests
  awaiting_client: 'violet', urgent: 'critical', normal: 'info',
  // tiers
  platinum: 'violet', gold: 'warn', silver: 'neutral', bronze: 'danger',
  // audit
  warning: 'warn',
}

export const toneFor = (v) => TONES[MAP[v] || 'neutral']

/* ------------------------------- export ---------------------------------- */
export function toCSV(rows, columns) {
  const cols = columns || Object.keys(rows[0] || {}).filter((k) => !k.startsWith('_'))
  const esc = (v) => {
    if (v == null) return ''
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const head = cols.map((c) => (typeof c === 'string' ? c : c.key)).join(',')
  const body = rows
    .map((r) => cols.map((c) => esc(typeof c === 'string' ? r[c] : c.get ? c.get(r) : r[c.key])).join(','))
    .join('\n')
  return head + '\n' + body
}

export function download(filename, content, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export const ROLE_LABEL = {
  admin: 'Administrator',
  ops_manager: 'Operations Manager',
  supervisor: 'Supervisor',
  finance: 'Finance',
  client: 'Client',
  guard: 'Officer',
}
