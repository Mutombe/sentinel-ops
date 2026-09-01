import React, { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Mail, Phone, MapPin, Calendar, ShieldCheck, Star, Award, AlertTriangle,
  Pencil, Clock, Wallet, Package, Activity, Home, UserRound,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, Badge, Button, Avatar, Skeleton, EmptyState, Tabs, Progress, StatCard } from '@/components/ui/primitives'
import { DataTable } from '@/components/ui/DataTable'
import { useOne, useList, useTableState } from '@/lib/hooks'
import { GuardForm } from './Guards'
import { fmtDate, fmtDateTime, fmtTime, money, money2, titleCase, timeAgo, cn } from '@/lib/utils'
import { useAuth } from '@/auth/AuthContext'
import { ViewAsEntityButton } from '@/features/ViewAs'

function Info({ icon: Icon, label, value, tone }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-line bg-surface2/40 px-3 py-2.5">
      <Icon size={15} className={cn('shrink-0', tone ? `text-${tone}` : 'text-faint')} />
      <div className="min-w-0">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">{label}</p>
        <p className="truncate text-[12.5px] font-medium text-ink">{value || 'Not recorded'}</p>
      </div>
    </div>
  )
}

export default function GuardDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { can } = useAuth()
  const [tab, setTab] = useState('overview')
  const [editing, setEditing] = useState(false)
  const { data: g, isLoading, error } = useOne('guards', id)

  const shifts = useTableState({ sort: 'start', dir: 'desc', pageSize: 8 })
  const shiftQ = useList('shifts', { ...shifts.params, filters: { guardId: id } }, { enabled: !!id && tab === 'shifts' })

  const incQ = useList('incidents', { pageSize: 8, filters: { reportedBy: id }, sort: 'occurredAt', dir: 'desc' }, { enabled: !!id && tab === 'incidents' })
  const attQ = useList('attendance', { pageSize: 8, filters: { guardId: id }, sort: 'date', dir: 'desc' }, { enabled: !!id && tab === 'attendance' })
  const payQ = useList('payroll', { pageSize: 8, filters: { guardId: id }, sort: 'period', dir: 'desc' }, { enabled: !!id && tab === 'payroll' })
  const assetQ = useList('assets', { pageSize: 20, filters: { assignedTo: id } }, { enabled: !!id && tab === 'equipment' })
  const upcoming = useList('shifts', { pageSize: 5, filters: { guardId: id, status: 'scheduled' }, sort: 'start', dir: 'asc' }, { enabled: !!id })
  const leaveQ = useList('leave', { all: true, pageSize: 60, filters: { guardId: id }, sort: 'startDate', dir: 'desc' }, { enabled: !!id })
  const discQ = useList('discipline', { all: true, pageSize: 60, filters: { guardId: id }, sort: 'issuedAt', dir: 'desc' }, { enabled: !!id })
  const trainQ = useList('training', { all: true, pageSize: 60, filters: { guardId: id }, sort: 'expiresAt', dir: 'asc' }, { enabled: !!id })
  const docQ = useList('documents', { all: true, pageSize: 60, filters: { guardId: id } }, { enabled: !!id })

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-96 w-full" /></div>
  if (error) return <EmptyState icon={AlertTriangle} title="Officer not found" body={error.message} action={<Button icon={ArrowLeft} onClick={() => navigate('/guards')}>Back</Button>} />

  const licDays = g.licenseExpiry ? Math.round((new Date(g.licenseExpiry) - Date.now()) / 86400000) : null
  const tenure = Math.round((Date.now() - new Date(g.hireDate)) / 86400000 / 30.44)

  const tabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'shifts', label: 'Shifts' },
    { value: 'incidents', label: 'Incidents' },
    { value: 'attendance', label: 'Attendance' },
    { value: 'leave', label: 'Leave', count: leaveQ.data?.total },
    { value: 'discipline', label: 'Record', count: discQ.data?.total },
    { value: 'training', label: 'Training', count: trainQ.data?.total },
    { value: 'documents', label: 'Documents', count: docQ.data?.total },
    { value: 'payroll', label: 'Payslips' },
    { value: 'equipment', label: 'Equipment' },
  ]

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <Avatar name={g.name} size={40} />
            {g.name}
          </span>
        }
        subtitle={`${g.rank} · ${g.employeeNo} · Grade ${g.grade}`}
        actions={
          <>
            <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate('/guards')}>Back</Button>
            <ViewAsEntityButton guardId={id} label="Open their portal" />
            {can('guards', 'update') && <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>}
          </>
        }
        tabs={<Tabs tabs={tabs} value={tab} onChange={setTab} className="mt-4" />}
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge value={g.status} dot />
          {g.armed && <Badge value="high" label="Firearm authorised" />}
          {licDays != null && licDays < 30 && (
            <Badge value={licDays < 0 ? 'critical' : 'medium'} label={licDays < 0 ? 'Registration expired' : `Registration expires in ${licDays}d`} />
          )}
          <Badge value="info" label={`${tenure} months service`} tone="accent" />
        </div>
      </PageHeader>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Performance" value={g.rating.toFixed(1)} icon={Star} tone="warn" hint="Supervisor rating out of 5" />
            <StatCard label="Shifts completed" value={g.shiftsCompleted} icon={Clock} tone="accent" hint="Lifetime" />
            <StatCard label="Incidents handled" value={g.incidentsHandled} icon={ShieldCheck} tone="accent2" hint="Reported or resolved" />
            <StatCard label="Hourly rate" value={money2(g.hourlyRate)} icon={Wallet} tone="ok" hint="Base, excl. overtime" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2" title="Personnel file">
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Info icon={Mail} label="Email" value={g.email} />
                <Info icon={Phone} label="Phone" value={g.phone} />
                <Info icon={Home} label="Address" value={g.address} />
                <Info icon={UserRound} label="Emergency contact" value={g.emergencyContact} />
                <Info icon={Calendar} label="Hired" value={fmtDate(g.hireDate)} />
                <Info
                  icon={ShieldCheck}
                  label="ZRP registration"
                  value={`${g.licenseNo} · ${fmtDate(g.licenseExpiry)}`}
                  tone={licDays < 0 ? 'critical' : licDays < 30 ? 'warn' : null}
                />
                <Info
                  icon={MapPin}
                  label="Current deployment"
                  value={g._site?.name || 'On bench'}
                />
                <Info icon={Activity} label="Coverage type" value={g._site ? `${g._site.city}` : ''} />
              </div>

              <div className="mt-4">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[.1em] text-faint">Certifications</p>
                {g.certifications?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {g.certifications.map((c) => (
                      <span key={c} className="chip border-accent/25 bg-accent/10 text-accent">
                        <Award size={11} /> {c}
                      </span>
                    ))}
                  </div>
                ) : <p className="text-[12.5px] text-faint">No certifications on file.</p>}
              </div>
            </Card>

            <div className="space-y-4">
              <Card title="Upcoming shifts" subtitle="Next 5 scheduled" noPad>
                {upcoming.isLoading ? (
                  <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
                ) : (upcoming.data?.rows || []).length === 0 ? (
                  <EmptyState icon={Calendar} title="No upcoming shifts" body="This officer is not currently rostered." />
                ) : (
                  <ul className="divide-y divide-line/60">
                    {upcoming.data.rows.map((s) => (
                      <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-surface2 text-center">
                          <span className="mono text-[11px] font-bold leading-none text-ink">{new Date(s.start).getDate()}</span>
                          <span className="text-[8.5px] uppercase text-faint">{new Date(s.start).toLocaleDateString('en', { month: 'short' })}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12.5px] font-medium text-ink">{s._site?.name}</p>
                          <p className="mono text-[11px] text-faint">{fmtTime(s.start)}-{fmtTime(s.end)} · {s.type}</p>
                        </div>
                        <Badge value={s.status} size="sm" />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card title="Compliance">
                <div className="space-y-3">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-[12px]">
                      <span className="text-muted">Registration validity</span>
                      <span className={cn('mono font-semibold', licDays < 0 ? 'text-critical' : licDays < 60 ? 'text-warn' : 'text-ok')}>
                        {licDays < 0 ? 'Expired' : `${licDays}d`}
                      </span>
                    </div>
                    <Progress value={Math.max(0, Math.min(100, ((licDays ?? 0) / 365) * 100))} tone={licDays < 0 ? 'critical' : licDays < 60 ? 'warn' : 'ok'} />
                  </div>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-[12px]">
                      <span className="text-muted">Certification coverage</span>
                      <span className="mono font-semibold text-ink">{g.certifications?.length || 0}/12</span>
                    </div>
                    <Progress value={((g.certifications?.length || 0) / 12) * 100} tone="accent" />
                  </div>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-[12px]">
                      <span className="text-muted">Performance</span>
                      <span className="mono font-semibold text-ink">{g.rating.toFixed(1)}/5.0</span>
                    </div>
                    <Progress value={(g.rating / 5) * 100} tone={g.rating >= 4 ? 'ok' : g.rating >= 3 ? 'warn' : 'critical'} />
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {tab === 'shifts' && (
        <DataTable
          columns={[
            { key: 'date', header: 'Date', render: (r) => <span className="mono text-[12.5px] text-ink">{fmtDate(r.start)}</span> },
            { key: 'siteId', header: 'Site', sortable: false, render: (r) => <span className="text-[12.5px] text-muted">{r._site?.name}</span> },
            { key: 'type', header: 'Type', width: 90, render: (r) => <Badge value={r.type === 'night' ? 'medium' : 'low'} label={titleCase(r.type)} size="sm" /> },
            { key: 'start', header: 'Window', sortable: false, width: 140, render: (r) => <span className="mono text-[12px] text-muted">{fmtTime(r.start)}-{fmtTime(r.end)}</span> },
            { key: 'hours', header: 'Hours', align: 'right', width: 80, render: (r) => <span className="mono text-[12.5px]">{r.hours}h{r.overtime ? ` +${r.overtime}` : ''}</span> },
            { key: 'status', header: 'Status', width: 120, render: (r) => <Badge value={r.status} dot /> },
          ]}
          rows={shiftQ.data?.rows || []}
          loading={shiftQ.isLoading} fetching={shiftQ.isFetching}
          sort={shiftQ.data?.sort} dir={shiftQ.data?.dir} onSort={shifts.toggleSort}
          page={shiftQ.data?.page} pageCount={shiftQ.data?.pageCount} pageSize={shifts.pageSize}
          total={shiftQ.data?.total} from={shiftQ.data?.from} to={shiftQ.data?.to}
          onPage={shifts.setPage} onPageSize={shifts.setPageSize}
          emptyIcon={Calendar} emptyTitle="No shifts recorded"
        />
      )}

      {tab === 'incidents' && (
        <DataTable
          columns={[
            { key: 'ref', header: 'Ref', width: 120, render: (r) => <span className="mono text-[12px] font-semibold text-ink">{r.ref}</span> },
            { key: 'type', header: 'Incident', render: (r) => <span className="text-[12.5px] text-ink">{r.title}</span> },
            { key: 'severity', header: 'Severity', width: 100, render: (r) => <Badge value={r.severity} /> },
            { key: 'status', header: 'Status', width: 120, render: (r) => <Badge value={r.status} dot /> },
            { key: 'occurredAt', header: 'When', width: 120, render: (r) => <span className="text-[12px] text-muted">{timeAgo(r.occurredAt)}</span> },
          ]}
          rows={incQ.data?.rows || []}
          loading={incQ.isLoading}
          page={incQ.data?.page} pageCount={incQ.data?.pageCount} pageSize={8}
          total={incQ.data?.total} from={incQ.data?.from} to={incQ.data?.to}
          onPage={() => {}}
          onRowClick={(r) => navigate(`/incidents/${r.id}`)}
          emptyIcon={ShieldCheck} emptyTitle="No incidents reported by this officer"
        />
      )}

      {tab === 'attendance' && (
        <DataTable
          columns={[
            { key: 'date', header: 'Date', render: (r) => <span className="mono text-[12.5px] text-ink">{fmtDate(r.date)}</span> },
            { key: 'siteId', header: 'Site', sortable: false, render: (r) => <span className="text-[12.5px] text-muted">{r._site?.name}</span> },
            { key: 'clockIn', header: 'Clock in', width: 110, render: (r) => <span className="mono text-[12px]">{r.clockIn ? fmtTime(r.clockIn) : ''}</span> },
            { key: 'clockOut', header: 'Clock out', width: 110, render: (r) => <span className="mono text-[12px]">{r.clockOut ? fmtTime(r.clockOut) : ''}</span> },
            { key: 'hours', header: 'Hours', align: 'right', width: 80, render: (r) => <span className="mono text-[12.5px]">{r.hours || ''}</span> },
            { key: 'status', header: 'Status', width: 124, render: (r) => <Badge value={r.status} dot /> },
          ]}
          rows={attQ.data?.rows || []}
          loading={attQ.isLoading}
          page={attQ.data?.page} pageCount={attQ.data?.pageCount} pageSize={8}
          total={attQ.data?.total} from={attQ.data?.from} to={attQ.data?.to}
          onPage={() => {}}
          emptyIcon={Clock} emptyTitle="No attendance records"
        />
      )}

      {tab === 'leave' && (
        <DataTable
          columns={[
            { key: 'ref', header: 'Ref', width: 110, render: (r) => <span className="mono text-[12px] font-semibold text-ink">{r.ref}</span> },
            { key: 'type', header: 'Type', width: 140, render: (r) => <span className="text-[12.5px] text-muted">{titleCase(r.type)}</span> },
            { key: 'startDate', header: 'Period', render: (r) => <span className="mono text-[12.5px] text-ink">{fmtDate(r.startDate)} → {fmtDate(r.endDate)}</span> },
            { key: 'days', header: 'Days', align: 'right', width: 80, render: (r) => <span className="mono text-[12.5px]">{r.days}</span> },
            { key: 'coveredBy', header: 'Cover', sortable: false, width: 160, render: (r) => <span className="text-[12.5px] text-muted">{r._cover?.name || ''}</span> },
            { key: 'status', header: 'Status', width: 120, render: (r) => <Badge value={r.status} dot /> },
          ]}
          rows={leaveQ.data?.rows || []}
          loading={leaveQ.isLoading}
          emptyIcon={Calendar} emptyTitle="No leave on record"
        />
      )}

      {tab === 'discipline' && (
        <DataTable
          columns={[
            { key: 'ref', header: 'Ref', width: 110, render: (r) => <span className="mono text-[12px] font-semibold text-ink">{r.ref}</span> },
            { key: 'type', header: 'Record', width: 170, render: (r) => (
              <span className={cn('chip', r.type === 'commendation' ? 'border-ok/25 bg-ok/10 text-ok' : 'border-warn/25 bg-warn/10 text-warn')}>
                {titleCase(r.type)}
              </span>
            ) },
            { key: 'category', header: 'Reason', render: (r) => <span className="truncate text-[12.5px] text-muted">{r.category}</span> },
            { key: 'issuedAt', header: 'Issued', width: 120, render: (r) => <span className="text-[12.5px] text-muted">{fmtDate(r.issuedAt)}</span> },
            { key: 'expiresAt', header: 'Until', width: 110, render: (r) => <span className="text-[12.5px] text-muted">{fmtDate(r.expiresAt)}</span> },
            { key: 'status', header: 'Status', width: 120, render: (r) => <Badge value={r.status} dot /> },
          ]}
          rows={discQ.data?.rows || []}
          loading={discQ.isLoading}
          emptyIcon={ShieldCheck} emptyTitle="Clean record" emptyBody="No warnings or commendations on file."
        />
      )}

      {tab === 'training' && (
        <DataTable
          columns={[
            { key: 'course', header: 'Course', render: (r) => (
              <div className="min-w-0">
                <p className="truncate text-[12.5px] font-medium text-ink">{r.course}</p>
                <p className="truncate text-[11px] text-faint">{r.provider}</p>
              </div>
            ) },
            { key: 'completedAt', header: 'Completed', width: 130, render: (r) => <span className="text-[12.5px] text-muted">{r.completedAt ? fmtDate(r.completedAt) : ''}</span> },
            { key: 'expiresAt', header: 'Expires', width: 130, render: (r) => <span className="text-[12.5px] text-muted">{r.expiresAt ? fmtDate(r.expiresAt) : ''}</span> },
            { key: 'score', header: 'Score', align: 'right', width: 90, render: (r) => r.score ? <span className="mono text-[12.5px]">{r.score}%</span> : <span className="text-faint"></span> },
            { key: 'status', header: 'Status', width: 120, render: (r) => <Badge value={r.status} dot /> },
          ]}
          rows={trainQ.data?.rows || []}
          loading={trainQ.isLoading}
          emptyIcon={Award} emptyTitle="No training records"
        />
      )}

      {tab === 'documents' && (
        <DataTable
          columns={[
            { key: 'type', header: 'Document', render: (r) => (
              <div className="min-w-0">
                <p className="truncate text-[12.5px] font-medium text-ink">{r.type}</p>
                <p className="mono truncate text-[11px] text-faint">{r.status === 'missing' ? 'not on file' : r.name}</p>
              </div>
            ) },
            { key: 'mandatory', header: 'Required', align: 'center', width: 100, render: (r) => r.mandatory ? <span className="text-[12px] text-ink">Yes</span> : <span className="text-[12px] text-faint">No</span> },
            { key: 'uploadedAt', header: 'Uploaded', width: 130, render: (r) => <span className="text-[12.5px] text-muted">{r.uploadedAt ? fmtDate(r.uploadedAt) : ''}</span> },
            { key: 'expiresAt', header: 'Expires', width: 130, render: (r) => <span className="text-[12.5px] text-muted">{r.expiresAt ? fmtDate(r.expiresAt) : ''}</span> },
            { key: 'verifiedBy', header: 'Verified', width: 130, render: (r) => <span className="text-[12.5px] text-muted">{r.verifiedBy || <span className="text-faint">Unverified</span>}</span> },
            { key: 'status', header: 'Status', width: 120, render: (r) => <Badge value={r.status} dot /> },
          ]}
          rows={docQ.data?.rows || []}
          loading={docQ.isLoading}
          emptyIcon={Package} emptyTitle="No documents on file"
        />
      )}

      {tab === 'payroll' && (
        <DataTable
          columns={[
            { key: 'period', header: 'Period', render: (r) => <span className="mono text-[12.5px] font-semibold text-ink">{r.period}</span> },
            { key: 'baseHours', header: 'Base hrs', align: 'right', width: 100, render: (r) => <span className="mono text-[12.5px]">{r.baseHours}</span> },
            { key: 'otHours', header: 'OT hrs', align: 'right', width: 90, render: (r) => <span className="mono text-[12.5px] text-warn">{r.otHours || ''}</span> },
            { key: 'gross', header: 'Gross', align: 'right', width: 110, render: (r) => <span className="mono text-[12.5px]">{money2(r.gross)}</span> },
            { key: 'deductions', header: 'Deductions', align: 'right', width: 120, render: (r) => <span className="mono text-[12.5px] text-critical">-{money2(r.deductions)}</span> },
            { key: 'net', header: 'Net pay', align: 'right', width: 120, render: (r) => <span className="mono text-[12.5px] font-bold text-ok">{money2(r.net)}</span> },
            { key: 'status', header: 'Status', width: 124, render: (r) => <Badge value={r.status} /> },
          ]}
          rows={payQ.data?.rows || []}
          loading={payQ.isLoading}
          page={payQ.data?.page} pageCount={payQ.data?.pageCount} pageSize={8}
          total={payQ.data?.total} from={payQ.data?.from} to={payQ.data?.to}
          onPage={() => {}}
          emptyIcon={Wallet} emptyTitle="No payslips available"
        />
      )}

      {tab === 'equipment' && (
        <Card title="Issued equipment" subtitle="Assets currently signed out to this officer" noPad>
          {assetQ.isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : (assetQ.data?.rows || []).length === 0 ? (
            <EmptyState icon={Package} title="No equipment issued" body="Nothing is currently signed out to this officer." />
          ) : (
            <ul className="divide-y divide-line/60">
              {assetQ.data.rows.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-surface2 text-faint">
                    <Package size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-ink">{a.name}</p>
                    <p className="mono truncate text-[11px] text-faint">{a.tag} · {a.serial}</p>
                  </div>
                  <Badge value={a.condition} size="sm" />
                  <Badge value={a.status} size="sm" />
                  <span className="mono w-20 shrink-0 text-right text-[12px] text-muted">{money(a.value)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <GuardForm open={editing} onClose={() => setEditing(false)} initial={g} />
    </>
  )
}
