import React from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import AppShell from './components/layout/AppShell'
import { ShieldCheck, Lock } from 'lucide-react'

import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Incidents from './pages/Incidents'
import IncidentDetail from './pages/IncidentDetail'
import Shifts from './pages/Shifts'
import Patrols from './pages/Patrols'
import Attendance from './pages/Attendance'
import Guards from './pages/Guards'
import GuardDetail from './pages/GuardDetail'
import Payroll from './pages/Payroll'
import Assets from './pages/Assets'
import Clients from './pages/Clients'
import ClientDetail from './pages/ClientDetail'
import Sites from './pages/Sites'
import SiteDetail from './pages/SiteDetail'
import Requests from './pages/Requests'
import Invoices from './pages/Invoices'
import Reports from './pages/Reports'
import Audit from './pages/Audit'
import Users from './pages/Users'
import Settings from './pages/Settings'
import Intelligence from './pages/Intelligence'
import Inspections from './pages/Inspections'
import Leave from './pages/Leave'
import Compliance from './pages/Compliance'
import Discipline from './pages/Discipline'
import ShiftDetail from './pages/ShiftDetail'
import RecordDetail from './pages/RecordDetail'
import PayslipDetail from './pages/PayslipDetail'

import OfficerDuty from './pages/officer/OfficerDuty'
import OfficerShifts from './pages/officer/OfficerShifts'
import OfficerPatrols from './pages/officer/OfficerPatrols'
import OfficerIncidents from './pages/officer/OfficerIncidents'
import OfficerRecord from './pages/officer/OfficerRecord'

import PortalOverview from './pages/portal/PortalOverview'
import PortalIncidents from './pages/portal/PortalIncidents'
import PortalSites from './pages/portal/PortalSites'
import PortalPatrols from './pages/portal/PortalPatrols'
import PortalRequests from './pages/portal/PortalRequests'
import PortalInvoices from './pages/portal/PortalInvoices'
import PortalReports from './pages/portal/PortalReports'
import PortalInspections from './pages/portal/PortalInspections'
import PortalDeployment from './pages/portal/PortalDeployment'

function Boot() {
  return (
    <div className="grid h-full place-items-center bg-bg">
      <div className="flex flex-col items-center gap-3">
        <div className="grid h-12 w-12 animate-ring place-items-center rounded-xl bg-accent text-bg">
          <ShieldCheck size={24} strokeWidth={2.4} />
        </div>
        <p className="text-[12.5px] font-medium text-faint">Securing session…</p>
      </div>
    </div>
  )
}

export function Forbidden() {
  return (
    <div className="grid place-items-center py-24 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl border border-critical/25 bg-critical/10 text-critical">
        <Lock size={24} />
      </div>
      <h2 className="mt-4 text-[18px] font-bold text-ink">Access restricted</h2>
      <p className="mt-1 max-w-sm text-[13px] text-muted">
        Your role does not have permission to view this area. Contact an administrator if you believe this is a mistake.
      </p>
    </div>
  )
}

function RequireAuth({ children }) {
  const { user, booting } = useAuth()
  const loc = useLocation()
  if (booting && !user) return <Boot />
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />
  return children
}

function RequireRole({ roles, children }) {
  const { user } = useAuth()
  if (!roles.includes(user.role)) return <Forbidden />
  return children
}

/* Client accounts share some read permissions with staff (they need to read
   their own incidents, sites, invoices…), but the internal consoles are not
   their surface. Send them to the portal equivalent instead of a dead end. */
const PORTAL_EQUIVALENT = {
  '/dashboard': '/portal',
  '/intelligence': '/portal',
  '/incidents': '/portal/incidents',
  '/sites': '/portal/sites',
  '/patrols': '/portal/patrols',
  '/inspections': '/portal/inspections',
  '/invoices': '/portal/invoices',
  '/requests': '/portal/requests',
  '/reports': '/portal/reports',
  '/shifts': '/portal/deployment',
  '/attendance': '/portal/deployment',
  '/guards': '/portal/deployment',
  '/clients': '/portal',
}

/* Officers share read permissions with staff too, but their surface is the
   officer portal, not the operations console. */
const OFFICER_EQUIVALENT = {
  '/dashboard': '/me',
  '/shifts': '/me/shifts',
  '/patrols': '/me/patrols',
  '/incidents': '/me/incidents',
  '/attendance': '/me/shifts',
  '/leave': '/me/leave',
  '/compliance': '/me/record',
  '/discipline': '/me/record',
  '/payroll': '/me/record',
  '/inspections': '/me',
}

function StaffOnly({ children }) {
  const { user } = useAuth()
  const loc = useLocation()
  const base = '/' + loc.pathname.split('/')[1]
  if (user.role === 'client') return <Navigate to={PORTAL_EQUIVALENT[base] || '/portal'} replace />
  if (user.role === 'guard') return <Navigate to={OFFICER_EQUIVALENT[base] || '/me'} replace />
  return children
}

function RequirePerm({ resource, action = 'read', children }) {
  const { can } = useAuth()
  if (!can(resource, action)) return <Forbidden />
  return <StaffOnly>{children}</StaffOnly>
}

function HomeRedirect() {
  const { user } = useAuth()
  const home = user.role === 'client' ? '/portal' : user.role === 'guard' ? '/me' : '/dashboard'
  return <Navigate to={home} replace />
}

export default function App() {
  const { user } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={user ? <HomeRedirect /> : <Login />} />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<HomeRedirect />} />
        <Route path="/dashboard" element={<StaffOnly><Dashboard /></StaffOnly>} />
        <Route path="/intelligence" element={<RequirePerm resource="intelligence"><Intelligence /></RequirePerm>} />

        <Route path="/incidents" element={<RequirePerm resource="incidents"><Incidents /></RequirePerm>} />
        <Route path="/incidents/:id" element={<RequirePerm resource="incidents"><IncidentDetail /></RequirePerm>} />
        <Route path="/shifts" element={<RequirePerm resource="shifts"><Shifts /></RequirePerm>} />
        <Route path="/shifts/:id" element={<RequirePerm resource="shifts"><ShiftDetail /></RequirePerm>} />
        <Route path="/patrols" element={<RequirePerm resource="patrols"><Patrols /></RequirePerm>} />
        <Route path="/attendance" element={<RequirePerm resource="attendance"><Attendance /></RequirePerm>} />
        <Route path="/inspections" element={<RequirePerm resource="inspections"><Inspections /></RequirePerm>} />

        <Route path="/guards" element={<RequirePerm resource="guards"><Guards /></RequirePerm>} />
        <Route path="/guards/:id" element={<RequirePerm resource="guards"><GuardDetail /></RequirePerm>} />
        <Route path="/leave" element={<RequirePerm resource="leave"><Leave /></RequirePerm>} />
        <Route path="/compliance" element={<RequirePerm resource="training"><Compliance /></RequirePerm>} />
        <Route path="/discipline" element={<RequirePerm resource="discipline"><Discipline /></RequirePerm>} />
        <Route path="/payroll" element={<RequirePerm resource="payroll"><Payroll /></RequirePerm>} />
        <Route path="/payroll/:id" element={<RequirePerm resource="payroll"><PayslipDetail /></RequirePerm>} />
        <Route path="/assets" element={<RequirePerm resource="assets"><Assets /></RequirePerm>} />

        <Route path="/clients" element={<RequirePerm resource="clients"><Clients /></RequirePerm>} />
        <Route path="/clients/:id" element={<RequirePerm resource="clients"><ClientDetail /></RequirePerm>} />
        <Route path="/sites" element={<RequirePerm resource="sites"><Sites /></RequirePerm>} />
        <Route path="/sites/:id" element={<RequirePerm resource="sites"><SiteDetail /></RequirePerm>} />
        <Route path="/requests" element={<RequirePerm resource="requests"><Requests /></RequirePerm>} />
        <Route path="/invoices" element={<RequirePerm resource="invoices"><Invoices /></RequirePerm>} />

        <Route path="/reports" element={<StaffOnly><Reports /></StaffOnly>} />
        <Route path="/audit" element={<RequirePerm resource="audit"><Audit /></RequirePerm>} />
        <Route path="/users" element={<RequirePerm resource="users"><Users /></RequirePerm>} />
        <Route path="/settings" element={<Settings />} />

        {/* Universal record detail: any resource without a purpose built page */}
        <Route path="/records/:resource/:id" element={<RecordDetail />} />

        {/* ------------------------- officer portal ------------------------- */}
        <Route path="/me" element={<RequireRole roles={['guard', 'admin', 'ops_manager']}><OfficerDuty /></RequireRole>} />
        <Route path="/me/shifts" element={<RequireRole roles={['guard', 'admin', 'ops_manager']}><OfficerShifts /></RequireRole>} />
        <Route path="/me/patrols" element={<RequireRole roles={['guard', 'admin', 'ops_manager']}><OfficerPatrols /></RequireRole>} />
        <Route path="/me/incidents" element={<RequireRole roles={['guard', 'admin', 'ops_manager']}><OfficerIncidents /></RequireRole>} />
        <Route path="/me/record" element={<RequireRole roles={['guard', 'admin', 'ops_manager']}><OfficerRecord /></RequireRole>} />
        <Route path="/me/leave" element={<RequireRole roles={['guard', 'admin', 'ops_manager']}><Leave /></RequireRole>} />

        {/* -------------------------- client portal -------------------------- */}
        <Route path="/portal" element={<RequireRole roles={['client', 'admin']}><PortalOverview /></RequireRole>} />
        <Route path="/portal/incidents" element={<RequireRole roles={['client', 'admin']}><PortalIncidents /></RequireRole>} />
        <Route path="/portal/sites" element={<RequireRole roles={['client', 'admin']}><PortalSites /></RequireRole>} />
        <Route path="/portal/patrols" element={<RequireRole roles={['client', 'admin']}><PortalPatrols /></RequireRole>} />
        <Route path="/portal/inspections" element={<RequireRole roles={['client', 'admin']}><PortalInspections /></RequireRole>} />
        <Route path="/portal/deployment" element={<RequireRole roles={['client', 'admin']}><PortalDeployment /></RequireRole>} />
        <Route path="/portal/requests" element={<RequireRole roles={['client', 'admin']}><PortalRequests /></RequireRole>} />
        <Route path="/portal/invoices" element={<RequireRole roles={['client', 'admin']}><PortalInvoices /></RequireRole>} />
        <Route path="/portal/reports" element={<RequireRole roles={['client', 'admin']}><PortalReports /></RequireRole>} />

        <Route path="*" element={<Forbidden />} />
      </Route>
    </Routes>
  )
}
