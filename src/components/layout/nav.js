import {
  LayoutDashboard, ShieldAlert, CalendarRange, Route, Fingerprint, Users, Wallet,
  Building2, MapPin, Inbox, Receipt, Package, BarChart3, ScrollText, UserCog, Settings,
  FileText, LifeBuoy, ClipboardList, ClipboardCheck, Brain, PalmtreeIcon, GraduationCap,
  Gavel, Radar,
} from 'lucide-react'

export const STAFF_NAV = [
  {
    section: 'Command',
    items: [
      { to: '/dashboard', label: 'Command Centre', icon: LayoutDashboard },
      { to: '/intelligence', label: 'Ops Intelligence', icon: Brain, resource: 'intelligence', badge: 'criticalSignals' },
    ],
  },
  {
    section: 'Operations',
    items: [
      { to: '/incidents', label: 'Incidents', icon: ShieldAlert, badge: 'openIncidents', resource: 'incidents' },
      { to: '/shifts', label: 'Roster & Shifts', icon: CalendarRange, resource: 'shifts' },
      { to: '/patrols', label: 'Patrol Tours', icon: Route, resource: 'patrols' },
      { to: '/inspections', label: 'Supervisor Ops', icon: ClipboardCheck, resource: 'inspections' },
      { to: '/attendance', label: 'Attendance', icon: Fingerprint, resource: 'attendance' },
    ],
  },
  {
    section: 'Workforce',
    items: [
      { to: '/guards', label: 'Officers', icon: Users, resource: 'guards' },
      { to: '/leave', label: 'Leave', icon: PalmtreeIcon, resource: 'leave' },
      { to: '/compliance', label: 'Training & Files', icon: GraduationCap, resource: 'training' },
      { to: '/discipline', label: 'Discipline', icon: Gavel, resource: 'discipline' },
      { to: '/payroll', label: 'Payroll', icon: Wallet, resource: 'payroll' },
      { to: '/assets', label: 'Equipment', icon: Package, resource: 'assets' },
    ],
  },
  {
    section: 'Commercial',
    items: [
      { to: '/clients', label: 'Clients', icon: Building2, resource: 'clients' },
      { to: '/sites', label: 'Sites & Posts', icon: MapPin, resource: 'sites' },
      { to: '/requests', label: 'Service Desk', icon: Inbox, badge: 'openRequests', resource: 'requests' },
      { to: '/invoices', label: 'Invoicing', icon: Receipt, resource: 'invoices' },
    ],
  },
  {
    section: 'Insight',
    items: [
      { to: '/reports', label: 'Analytics', icon: BarChart3, resource: 'reports' },
      { to: '/audit', label: 'Audit Trail', icon: ScrollText, resource: 'audit' },
    ],
  },
  {
    section: 'Administration',
    items: [
      { to: '/users', label: 'Users & Roles', icon: UserCog, resource: 'users' },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

export const CLIENT_NAV = [
  {
    section: 'Portal',
    items: [
      { to: '/portal', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/portal/incidents', label: 'Incident Reports', icon: ShieldAlert },
      { to: '/portal/sites', label: 'My Sites', icon: MapPin },
      { to: '/portal/deployment', label: 'Deployment', icon: Radar },
      { to: '/portal/patrols', label: 'Patrol Assurance', icon: Route },
      { to: '/portal/inspections', label: 'Inspection Reports', icon: ClipboardCheck },
    ],
  },
  {
    section: 'Account',
    items: [
      { to: '/portal/requests', label: 'Service Requests', icon: LifeBuoy },
      { to: '/portal/invoices', label: 'Billing', icon: Receipt },
      { to: '/portal/reports', label: 'Performance Reports', icon: FileText },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

export const GUARD_NAV = [
  {
    section: 'On Duty',
    items: [
      { to: '/me', label: 'My Duty', icon: LayoutDashboard, end: true },
      { to: '/me/shifts', label: 'My Shifts', icon: CalendarRange },
      { to: '/me/patrols', label: 'Patrols', icon: Route },
      { to: '/me/incidents', label: 'Incident Reports', icon: ShieldAlert },
    ],
  },
  {
    section: 'My Record',
    items: [
      { to: '/me/record', label: 'My File', icon: ClipboardList },
      { to: '/me/leave', label: 'My Leave', icon: PalmtreeIcon },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

export function navForRole(role) {
  if (role === 'client') return CLIENT_NAV
  if (role === 'guard') return GUARD_NAV
  return STAFF_NAV
}
