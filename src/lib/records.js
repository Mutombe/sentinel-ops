import {
  Fingerprint, Route as RouteIcon, PalmtreeIcon, Gavel, GraduationCap, FolderOpen,
  Package, Inbox, Receipt, UserCog, ScrollText, Shield, ClipboardCheck, Wallet,
  ShieldAlert, Users, Building2, MapPin, CalendarRange,
} from 'lucide-react'
import { fmtDate, fmtDateTime, fmtTime, money2, titleCase, duration } from './utils'

/* ------------------------------------------------------------------ *
 * Record registry.
 *
 * One description per resource of how a single record should be named,
 * summarised and cross linked. The universal detail page reads this, so
 * every row in the system can be opened, and every reference on it is a
 * link to another record.
 * ------------------------------------------------------------------ */

/** Resources that own a purpose built page. Everything else uses /records. */
const DEDICATED = {
  incidents: (id) => `/incidents/${id}`,
  guards: (id) => `/guards/${id}`,
  clients: (id) => `/clients/${id}`,
  sites: (id) => `/sites/${id}`,
  shifts: (id) => `/shifts/${id}`,
  payroll: (id) => `/payroll/${id}`,
}

export function hrefFor(resource, id) {
  if (!resource || !id) return null
  const d = DEDICATED[resource]
  return d ? d(id) : `/records/${resource}/${id}`
}

const yesNo = (v) => (v ? 'Yes' : 'No')

/* Common field formatters, keyed by the shape of the value. */
export const FMT = {
  date: fmtDate,
  datetime: fmtDateTime,
  time: fmtTime,
  money: (v) => money2(v || 0),
  pct: (v) => (v == null ? '' : `${v}%`),
  hours: (v) => (v == null ? '' : `${v} h`),
  mins: duration,
  bool: yesNo,
  title: titleCase,
  text: (v) => (v == null || v === '' ? '' : String(v)),
  count: (v) => (v == null ? '' : String(v)),
}

const guardLink = (r) => (r.guardId ? { type: 'Officer', resource: 'guards', id: r.guardId, name: r._guard?.name, meta: r._guard?.employeeNo, icon: Users } : null)
const siteLink = (r) => (r.siteId ? { type: 'Site', resource: 'sites', id: r.siteId, name: r._site?.name, meta: r._site?.city, icon: MapPin } : null)
const clientLink = (r) => (r.clientId ? { type: 'Client', resource: 'clients', id: r.clientId, name: r._client?.name, meta: r._client?.code, icon: Building2 } : null)
const shiftLink = (r) => (r.shiftId ? { type: 'Shift', resource: 'shifts', id: r.shiftId, name: 'Shift record', meta: r.date ? fmtDate(r.date) : '', icon: CalendarRange } : null)

export const RECORDS = {
  attendance: {
    label: 'Attendance record',
    plural: 'Attendance',
    icon: Fingerprint,
    listPath: '/attendance',
    title: (r) => `${r._guard?.name || 'Officer'} on ${fmtDate(r.date)}`,
    subtitle: (r) => r._site?.name,
    badges: (r) => [{ value: r.status }, r.geoVerified ? { value: 'active', label: 'Geofence verified' } : { value: 'pending', label: 'Manual verification' }],
    statusField: 'status',
    statusOptions: ['present', 'late', 'absent', 'on_duty'],
    facts: [
      ['date', 'Date', 'date'],
      ['clockIn', 'Clocked in', 'time'],
      ['clockOut', 'Clocked out', 'time'],
      ['hours', 'Hours recorded', 'hours'],
      ['lateMins', 'Late by (minutes)', 'count'],
      ['method', 'Verified by', 'title'],
      ['geoVerified', 'Inside the geofence', 'bool'],
      ['status', 'Status', 'title'],
    ],
    related: (r) => [guardLink(r), siteLink(r), clientLink(r), shiftLink(r)].filter(Boolean),
  },

  patrols: {
    label: 'Patrol tour',
    plural: 'Patrol tours',
    icon: RouteIcon,
    listPath: '/patrols',
    title: (r) => `${r.route} at ${r._site?.name || 'site'}`,
    subtitle: (r) => r.ref,
    badges: (r) => [{ value: r.status }, r.exceptions ? { value: 'critical', label: `${r.exceptions} missed` } : { value: 'active', label: 'All checkpoints scanned' }],
    facts: [
      ['ref', 'Reference', 'text'],
      ['route', 'Route', 'text'],
      ['startedAt', 'Started', 'datetime'],
      ['completedAt', 'Closed', 'datetime'],
      ['durationMins', 'Duration', 'mins'],
      ['checkpointsScanned', 'Checkpoints scanned', 'count'],
      ['checkpointsTotal', 'Checkpoints on route', 'count'],
      ['exceptions', 'Exceptions', 'count'],
    ],
    related: (r) => [guardLink(r), siteLink(r), clientLink(r)].filter(Boolean),
  },

  leave: {
    label: 'Leave request',
    plural: 'Leave',
    icon: PalmtreeIcon,
    listPath: '/leave',
    title: (r) => `${titleCase(r.type)} leave for ${r._guard?.name || 'officer'}`,
    subtitle: (r) => `${r.ref} · ${fmtDate(r.startDate)} to ${fmtDate(r.endDate)}`,
    badges: (r) => [{ value: r.status }, { value: 'info', label: `${r.days} days`, tone: 'accent' }],
    statusField: 'status',
    statusOptions: ['pending', 'approved', 'rejected', 'cancelled'],
    facts: [
      ['ref', 'Reference', 'text'],
      ['type', 'Leave type', 'title'],
      ['startDate', 'First day', 'date'],
      ['endDate', 'Last day', 'date'],
      ['days', 'Calendar days', 'count'],
      ['requestedAt', 'Requested', 'datetime'],
      ['approvedBy', 'Decided by', 'text'],
      ['decidedAt', 'Decided', 'datetime'],
      ['balanceBefore', 'Balance before', 'count'],
    ],
    prose: [['reason', 'Reason given'], ['notes', 'Decision note']],
    related: (r) => [guardLink(r), r.coveredBy ? { type: 'Cover officer', resource: 'guards', id: r.coveredBy, name: r._cover?.name, icon: Users } : null].filter(Boolean),
  },

  discipline: {
    label: 'Personnel record',
    plural: 'Discipline and recognition',
    icon: Gavel,
    listPath: '/discipline',
    title: (r) => `${titleCase(r.type)}: ${r.category}`,
    subtitle: (r) => `${r.ref} · ${r._guard?.name || ''}`,
    badges: (r) => [{ value: r.status }, r.acknowledged ? { value: 'active', label: 'Signed by officer' } : { value: 'pending', label: 'Not signed' }],
    facts: [
      ['ref', 'Reference', 'text'],
      ['type', 'Record type', 'title'],
      ['category', 'Category', 'text'],
      ['issuedBy', 'Issued by', 'text'],
      ['issuedAt', 'Issued', 'date'],
      ['expiresAt', 'Held on file until', 'date'],
      ['sanction', 'Sanction', 'text'],
      ['acknowledged', 'Acknowledged', 'bool'],
    ],
    prose: [['description', 'Account of events']],
    related: (r) => [guardLink(r), r.incidentId ? { type: 'Incident', resource: 'incidents', id: r.incidentId, name: 'Linked incident', icon: ShieldAlert } : null].filter(Boolean),
  },

  training: {
    label: 'Training record',
    plural: 'Training',
    icon: GraduationCap,
    listPath: '/compliance',
    title: (r) => r.course,
    subtitle: (r) => `${r.provider} · ${r._guard?.name || ''}`,
    badges: (r) => [{ value: r.status }, r.mandatory ? { value: 'info', label: 'Mandatory', tone: 'accent' } : null].filter(Boolean),
    facts: [
      ['course', 'Course', 'text'],
      ['provider', 'Provider', 'text'],
      ['completedAt', 'Completed', 'date'],
      ['scheduledFor', 'Scheduled for', 'date'],
      ['expiresAt', 'Expires', 'date'],
      ['score', 'Score', 'pct'],
      ['hours', 'Course hours', 'count'],
      ['certificateNo', 'Certificate number', 'text'],
      ['mandatory', 'Mandatory', 'bool'],
    ],
    related: (r) => [guardLink(r)].filter(Boolean),
  },

  documents: {
    label: 'Personnel document',
    plural: 'Documents',
    icon: FolderOpen,
    listPath: '/compliance',
    title: (r) => r.type,
    subtitle: (r) => r._guard?.name,
    badges: (r) => [{ value: r.status }, r.mandatory ? { value: 'info', label: 'Mandatory', tone: 'accent' } : null].filter(Boolean),
    facts: [
      ['type', 'Document type', 'text'],
      ['name', 'File', 'text'],
      ['uploadedAt', 'Uploaded', 'date'],
      ['expiresAt', 'Expires', 'date'],
      ['sizeKb', 'Size (KB)', 'count'],
      ['mime', 'Format', 'text'],
      ['verifiedBy', 'Verified by', 'text'],
      ['mandatory', 'Mandatory', 'bool'],
    ],
    related: (r) => [guardLink(r)].filter(Boolean),
  },

  assets: {
    label: 'Asset',
    plural: 'Equipment',
    icon: Package,
    listPath: '/assets',
    title: (r) => r.name,
    subtitle: (r) => `${r.tag} · ${r.category}`,
    badges: (r) => [{ value: r.status }, { value: r.condition }],
    statusField: 'status',
    statusOptions: ['in_service', 'in_store', 'maintenance', 'lost', 'retired'],
    facts: [
      ['tag', 'Asset tag', 'text'],
      ['category', 'Category', 'text'],
      ['serial', 'Serial number', 'text'],
      ['value', 'Replacement value', 'money'],
      ['condition', 'Condition', 'title'],
      ['purchaseDate', 'Purchased', 'date'],
      ['lastServiced', 'Last serviced', 'date'],
      ['warrantyEnd', 'Warranty ends', 'date'],
    ],
    related: (r) => [
      r.assignedTo ? { type: 'Issued to', resource: 'guards', id: r.assignedTo, name: r._guard?.name, icon: Users } : null,
      siteLink(r),
    ].filter(Boolean),
  },

  requests: {
    label: 'Service request',
    plural: 'Service desk',
    icon: Inbox,
    listPath: '/requests',
    title: (r) => r.subject,
    subtitle: (r) => `${r.ref} · ${r.type}`,
    badges: (r) => [{ value: r.status }, { value: r.priority }],
    statusField: 'status',
    statusOptions: ['open', 'in_progress', 'awaiting_client', 'resolved', 'closed'],
    facts: [
      ['ref', 'Reference', 'text'],
      ['type', 'Request type', 'text'],
      ['priority', 'Priority', 'title'],
      ['createdBy', 'Raised by', 'text'],
      ['createdAt', 'Raised', 'datetime'],
      ['updatedAt', 'Last update', 'datetime'],
      ['assignedTo', 'Assigned to', 'text'],
    ],
    prose: [['description', 'Detail']],
    related: (r) => [clientLink(r), siteLink(r)].filter(Boolean),
  },

  invoices: {
    label: 'Invoice',
    plural: 'Invoicing',
    icon: Receipt,
    listPath: '/invoices',
    title: (r) => r.number,
    subtitle: (r) => `${r._client?.name || ''} · period ${r.period}`,
    badges: (r) => [{ value: r.status }],
    statusField: 'status',
    statusOptions: ['draft', 'sent', 'paid', 'overdue', 'void'],
    facts: [
      ['number', 'Invoice number', 'text'],
      ['period', 'Billing period', 'text'],
      ['issueDate', 'Issued', 'date'],
      ['dueDate', 'Due', 'date'],
      ['subtotal', 'Subtotal', 'money'],
      ['tax', 'VAT at 15%', 'money'],
      ['total', 'Total due', 'money'],
      ['paidAt', 'Paid', 'date'],
      ['paymentMethod', 'Paid by', 'text'],
    ],
    related: (r) => [clientLink(r)].filter(Boolean),
  },

  inspections: {
    label: 'Inspection',
    plural: 'Supervisor operations',
    icon: ClipboardCheck,
    listPath: '/inspections',
    title: (r) => `${r.ref} at ${r._site?.name || 'site'}`,
    subtitle: (r) => `${titleCase(r.type)} · scored ${r.score}%`,
    badges: (r) => [{ value: r.status }, { value: r.score >= 90 ? 'active' : r.score >= 75 ? 'pending' : 'critical', label: `${r.score}%` }],
    facts: [
      ['ref', 'Reference', 'text'],
      ['type', 'Visit type', 'title'],
      ['at', 'Date of visit', 'datetime'],
      ['durationMins', 'Time on site', 'mins'],
      ['score', 'Compliance score', 'pct'],
      ['clientVisible', 'Published to client', 'bool'],
    ],
    prose: [['summary', 'Supervisor summary']],
    related: (r) => [
      siteLink(r), clientLink(r),
      r.supervisorId ? { type: 'Supervisor', resource: 'guards', id: r.supervisorId, name: r._supervisor?.name, icon: Users } : null,
    ].filter(Boolean),
  },

  posts: {
    label: 'Post',
    plural: 'Posts',
    icon: Shield,
    listPath: '/sites',
    title: (r) => r.name,
    subtitle: (r) => `${r.code} · ${r._site?.name || ''}`,
    badges: (r) => [{ value: r.status }, { value: r.criticality === 'critical' ? 'critical' : r.criticality === 'important' ? 'medium' : 'low', label: titleCase(r.criticality) }],
    facts: [
      ['code', 'Post code', 'text'],
      ['type', 'Post type', 'text'],
      ['requiredGuards', 'Officers required', 'count'],
      ['coverage', 'Coverage pattern', 'text'],
      ['criticality', 'Criticality', 'title'],
      ['armed', 'Armed post', 'bool'],
      ['createdAt', 'Created', 'date'],
    ],
    prose: [['instructions', 'Site instructions']],
    related: (r) => [siteLink(r), clientLink(r)].filter(Boolean),
  },

  users: {
    label: 'User account',
    plural: 'Users and roles',
    icon: UserCog,
    listPath: '/users',
    title: (r) => r.name,
    subtitle: (r) => r.email,
    badges: (r) => [{ value: r.status }, { value: r.role }, r.mfa ? { value: 'active', label: 'MFA on' } : null].filter(Boolean),
    statusField: 'status',
    statusOptions: ['active', 'disabled'],
    facts: [
      ['name', 'Name', 'text'],
      ['email', 'Email', 'text'],
      ['role', 'Role', 'title'],
      ['title', 'Job title', 'text'],
      ['mfa', 'Two factor', 'bool'],
      ['lastLogin', 'Last sign in', 'datetime'],
      ['createdAt', 'Created', 'date'],
    ],
    related: (r) => [
      r.clientId ? { type: 'Client', resource: 'clients', id: r.clientId, name: 'Linked client', icon: Building2 } : null,
      r.guardId ? { type: 'Officer', resource: 'guards', id: r.guardId, name: 'Linked officer file', icon: Users } : null,
    ].filter(Boolean),
  },

  audit: {
    label: 'Audit event',
    plural: 'Audit trail',
    icon: ScrollText,
    listPath: '/audit',
    title: (r) => `${titleCase(r.action)} on ${titleCase(r.entity)}`,
    subtitle: (r) => `${r.actorName} · ${fmtDateTime(r.at)}`,
    badges: (r) => [{ value: r.severity }],
    facts: [
      ['at', 'Timestamp', 'datetime'],
      ['actorName', 'Actor', 'text'],
      ['actorRole', 'Role', 'title'],
      ['action', 'Action', 'title'],
      ['entity', 'Entity type', 'title'],
      ['entityId', 'Record', 'text'],
      ['ip', 'Source IP', 'text'],
      ['agent', 'Client', 'text'],
      ['severity', 'Severity', 'title'],
    ],
    related: () => [],
  },

  payrollRuns: {
    label: 'Payroll run',
    plural: 'Payroll runs',
    icon: Wallet,
    listPath: '/payroll',
    title: (r) => `Payroll run ${r.period}`,
    subtitle: (r) => `${r.headcount} officers`,
    badges: (r) => [{ value: r.status }],
    facts: [
      ['period', 'Period', 'text'],
      ['headcount', 'Headcount', 'count'],
      ['gross', 'Gross', 'money'],
      ['deductionsTotal', 'Deductions', 'money'],
      ['net', 'Net payable', 'money'],
      ['employerTotal', 'Employer contributions', 'money'],
      ['costToCompany', 'Cost to company', 'money'],
      ['approvedBy', 'Approved by', 'text'],
      ['paidAt', 'Paid', 'date'],
    ],
    related: () => [],
  },
}

export function metaFor(resource) {
  return RECORDS[resource] || null
}
