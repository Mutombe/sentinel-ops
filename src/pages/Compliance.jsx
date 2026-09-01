import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  GraduationCap, FileCheck, ShieldCheck, AlertTriangle, CalendarCheck, FolderOpen,
  BadgeCheck, Clock, Plus, Upload, XCircle,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { DataTable } from '@/components/ui/DataTable'
import { Toolbar, FilterSelect } from '@/components/ui/Toolbar'
import { Drawer } from '@/components/ui/Modal'
import { Badge, Button, Field, Input, Select, Avatar, Tabs, StatCard, Card, Progress } from '@/components/ui/primitives'
import { BarsChart, DonutChart, Legend2 } from '@/components/charts/Charts'
import { useList, useTableState, useCreate, useUpdate, useBulk, useLookups, useForm } from '@/lib/hooks'
import { fmtDate, titleCase, cn, num, pct } from '@/lib/utils'
import { hrefFor } from '@/lib/records'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { useToast } from '@/components/ui/Toast'

const TR_STATUS = ['valid', 'expiring', 'expired', 'scheduled']
const DOC_STATUS = ['valid', 'expiring', 'expired', 'missing']

const COURSES = [
  'Guard Registration Grade C', 'Guard Registration Grade B', 'Guard Registration Grade A', 'Firearm Competency (Handgun)',
  'First Aid Level 3', 'Fire Marshal & Evacuation', 'CCTV Control Room Operations',
  'Conflict De-escalation', 'Cash-in-Transit Procedures', 'K9 Handling Level 2',
  'Access Control Systems', 'Occupational Health & Safety', 'Customer Service for Security',
  'Report Writing & Statements',
]

function daysLeft(v) {
  if (!v) return null
  return Math.round((new Date(v) - Date.now()) / 86400000)
}

function ExpiryCell({ value, status }) {
  if (!value) return <span className="text-[12px] text-faint">{status === 'scheduled' ? 'Not yet taken' : 'No expiry'}</span>
  const d = daysLeft(value)
  const tone = d < 0 ? 'critical' : d < 60 ? 'warn' : 'muted'
  return (
    <div className="flex items-center gap-1.5">
      {d < 60 && <AlertTriangle size={12} className={`text-${tone}`} />}
      <div>
        <p className={cn('text-[12.5px]', d < 60 ? `text-${tone} font-semibold` : 'text-muted')}>{fmtDate(value)}</p>
        <p className="text-[10.5px] text-faint">{d < 0 ? `expired ${Math.abs(d)}d ago` : `${d}d left`}</p>
      </div>
    </div>
  )
}

function TrainingForm({ open, onClose }) {
  const { data: lk } = useLookups()
  const toast = useToast()
  const create = useCreate('training', { label: 'Training record', onSuccess: onClose })
  const f = useForm({ guardId: '', course: COURSES[0], provider: 'Sentinel Academy', completedAt: '', scheduledFor: '', score: 80, hours: 16, mandatory: false, validMonths: 24 })

  const submit = async (e) => {
    e.preventDefault()
    const scheduled = !f.values.completedAt
    const completed = f.values.completedAt ? new Date(f.values.completedAt) : null
    const expires = completed ? new Date(completed.getTime() + (+f.values.validMonths || 24) * 30.44 * 86400000) : null
    const d = expires ? daysLeft(expires.toISOString()) : null
    try {
      await create.mutateAsync({
        guardId: f.values.guardId,
        course: f.values.course,
        provider: f.values.provider,
        completedAt: completed ? completed.toISOString() : null,
        scheduledFor: f.values.scheduledFor ? new Date(f.values.scheduledFor).toISOString() : null,
        expiresAt: expires ? expires.toISOString() : null,
        score: scheduled ? null : +f.values.score,
        certificateNo: scheduled ? null : 'CERT-' + Math.floor(100000 + Math.random() * 899999),
        hours: +f.values.hours,
        mandatory: !!f.values.mandatory,
        status: scheduled ? 'scheduled' : d < 0 ? 'expired' : d < 60 ? 'expiring' : 'valid',
      })
    } catch (err) {
      f.applyServerError(err)
      if (!err.fields) toast.error('Could not save', { body: err.message })
    }
  }

  return (
    <Drawer
      open={open} onClose={onClose}
      title="Record training"
      subtitle="Log a completed course or book a future one"
      width="max-w-xl"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={create.isPending} onClick={submit}>Save record</Button></>}
    >
      <form onSubmit={submit} className="space-y-4 p-5">
        <Field label="Officer" required error={f.errors.guardId}>
          <Select {...f.bind('guardId')}>
            <option value="">Select an officer…</option>
            {lk?.guards.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.employeeNo})</option>)}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Course" required error={f.errors.course}>
            <Select {...f.bind('course')}>{COURSES.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
          </Field>
          <Field label="Provider"><Input {...f.bind('provider')} /></Field>
          <Field label="Completed on" hint="Leave blank to book it as scheduled"><Input type="date" {...f.bind('completedAt')} /></Field>
          <Field label="Scheduled for"><Input type="date" {...f.bind('scheduledFor')} /></Field>
          <Field label="Score (%)"><Input type="number" min="0" max="100" {...f.bind('score')} /></Field>
          <Field label="Valid for (months)"><Input type="number" min="1" max="120" {...f.bind('validMonths')} /></Field>
          <Field label="Course hours"><Input type="number" min="1" {...f.bind('hours')} /></Field>
          <Field label="Mandatory">
            <Select value={f.values.mandatory ? 'yes' : 'no'} onChange={(e) => f.set('mandatory', e.target.value === 'yes')}>
              <option value="no">Optional</option>
              <option value="yes">Mandatory</option>
            </Select>
          </Field>
        </div>
      </form>
    </Drawer>
  )
}

export default function Compliance() {
  const { can, isGuard } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('training')
  const [formOpen, setFormOpen] = useState(false)
  const toast = useToast()

  const tr = useTableState({ sort: 'expiresAt', dir: 'asc' })
  const dc = useTableState({ sort: 'expiresAt', dir: 'asc' })
  const gd = useTableState({ sort: 'licenseExpiry', dir: 'asc' })

  const trQ = useList('training', { ...tr.params, facet: 'status' }, { enabled: tab === 'training' })
  const dcQ = useList('documents', { ...dc.params, facet: 'status' }, { enabled: tab === 'documents' })
  const gdQ = useList('guards', { ...gd.params }, { enabled: tab === 'licences' })

  const trAll = useList('training', { all: true, pageSize: 2000 })
  const dcAll = useList('documents', { all: true, pageSize: 3000 })
  const gdAll = useList('guards', { all: true, pageSize: 300 })
  const updateDoc = useUpdate('documents', { label: 'Document' })

  const training = trAll.data?.rows || []
  const documents = dcAll.data?.rows || []
  const guards = gdAll.data?.rows || []

  const trExpired = training.filter((x) => x.status === 'expired')
  const trExpiring = training.filter((x) => x.status === 'expiring')
  const docMissing = documents.filter((x) => x.status === 'missing' && x.mandatory)
  const docExpired = documents.filter((x) => x.status === 'expired')
  const licExpired = guards.filter((g) => g.status !== 'inactive' && daysLeft(g.licenseExpiry) < 0)
  const licSoon = guards.filter((g) => g.status !== 'inactive' && daysLeft(g.licenseExpiry) >= 0 && daysLeft(g.licenseExpiry) < 30)

  const mandatoryDocs = documents.filter((d) => d.mandatory)
  const fileCompleteness = mandatoryDocs.length
    ? Math.round((mandatoryDocs.filter((d) => d.status === 'valid' || d.status === 'expiring').length / mandatoryDocs.length) * 100)
    : 100

  const byCourse = useMemo(() => {
    const m = {}
    training.filter((x) => x.status === 'expired' || x.status === 'expiring').forEach((x) => {
      m[x.course] = (m[x.course] || 0) + 1
    })
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8)
  }, [training])

  const docMix = DOC_STATUS.map((s) => ({ name: s, value: documents.filter((d) => d.status === s).length }))

  const tabs = [
    { value: 'training', label: 'Training', count: training.length },
    { value: 'documents', label: 'Personnel files', count: documents.length },
    ...(isGuard ? [] : [{ value: 'licences', label: 'Licensing', count: guards.length }]),
  ]

  const trainingCols = [
    ...(isGuard ? [] : [{
      key: 'guardId', header: 'Officer', sortable: false,
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={r._guard?.name || 'Unassigned'} size={26} />
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-semibold text-ink">{r._guard?.name}</p>
            <p className="mono truncate text-[11px] text-faint">{r._guard?.employeeNo}</p>
          </div>
        </div>
      ),
    }]),
    {
      key: 'course', header: 'Course',
      render: (r) => (
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-[12.5px] font-medium text-ink">
            {r.mandatory && <BadgeCheck size={12} className="shrink-0 text-accent" title="Mandatory" />}
            {r.course}
          </p>
          <p className="truncate text-[11px] text-faint">{r.provider}</p>
        </div>
      ),
    },
    { key: 'completedAt', header: 'Completed', width: 130, render: (r) => <span className="text-[12.5px] text-muted">{r.completedAt ? fmtDate(r.completedAt) : ''}</span> },
    { key: 'expiresAt', header: 'Expires', width: 150, render: (r) => <ExpiryCell value={r.expiresAt} status={r.status} /> },
    { key: 'score', header: 'Score', align: 'right', width: 90, render: (r) => r.score ? <span className="mono text-[12.5px] text-ink">{r.score}%</span> : <span className="text-faint"></span> },
    { key: 'status', header: 'Status', width: 124, render: (r) => <Badge value={r.status} dot /> },
  ]

  const docCols = [
    ...(isGuard ? [] : [{
      key: 'guardId', header: 'Officer', sortable: false,
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={r._guard?.name || 'Unassigned'} size={26} />
          <span className="truncate text-[12.5px] text-ink">{r._guard?.name}</span>
        </div>
      ),
    }]),
    {
      key: 'type', header: 'Document',
      render: (r) => (
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-[12.5px] font-medium text-ink">
            {r.mandatory && <BadgeCheck size={12} className="shrink-0 text-accent" title="Mandatory" />}
            {r.type}
          </p>
          <p className="mono truncate text-[11px] text-faint">{r.status === 'missing' ? 'not on file' : r.name}</p>
        </div>
      ),
    },
    { key: 'uploadedAt', header: 'Uploaded', width: 130, render: (r) => <span className="text-[12.5px] text-muted">{r.uploadedAt ? fmtDate(r.uploadedAt) : ''}</span> },
    { key: 'expiresAt', header: 'Expires', width: 150, render: (r) => <ExpiryCell value={r.expiresAt} status={r.status} /> },
    { key: 'verifiedBy', header: 'Verified', width: 130, render: (r) => <span className="text-[12.5px] text-muted">{r.verifiedBy || <span className="text-faint">Unverified</span>}</span> },
    { key: 'status', header: 'Status', width: 124, render: (r) => <Badge value={r.status} dot /> },
    ...(can('documents', 'update') ? [{
      key: 'actions', header: '', sortable: false, width: 110, align: 'right',
      render: (r) => (
        <div onClick={(e) => e.stopPropagation()}>
          {r.status === 'missing' ? (
            <Button
              size="xs" variant="secondary" icon={Upload}
              onClick={() => {
                updateDoc.mutate({
                  id: r.id,
                  patch: {
                    status: 'valid',
                    uploadedAt: new Date().toISOString(),
                    name: `${r.type.toLowerCase().replace(/\s+/g, '-')}.pdf`,
                    sizeKb: 640,
                    mime: 'application/pdf',
                  },
                })
                toast.info('Document recorded', { body: 'In production this is a real file upload.' })
              }}
            >
              Record
            </Button>
          ) : !r.verifiedBy ? (
            <Button size="xs" variant="ghost" onClick={() => updateDoc.mutate({ id: r.id, patch: { verifiedBy: 'HR Desk' } })}>Verify</Button>
          ) : null}
        </div>
      ),
    }] : []),
  ]

  const licenceCols = [
    {
      key: 'name', header: 'Officer',
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={r.name} size={28} />
          <div className="min-w-0">
            <Link to={`/guards/${r.id}`} className="truncate text-[12.5px] font-semibold text-ink hover:text-accent">{r.name}</Link>
            <p className="mono truncate text-[11px] text-faint">{r.employeeNo} · Grade {r.grade}</p>
          </div>
        </div>
      ),
    },
    { key: 'rank', header: 'Rank', width: 170, render: (r) => <span className="text-[12.5px] text-muted">{r.rank}</span> },
    { key: 'licenseNo', header: 'Reg. no.', width: 120, render: (r) => <span className="mono text-[12.5px] text-muted">{r.licenseNo}</span> },
    { key: 'licenseExpiry', header: 'Expires', width: 160, render: (r) => <ExpiryCell value={r.licenseExpiry} /> },
    { key: 'status', header: 'Employment', width: 130, render: (r) => <Badge value={r.status} dot /> },
    {
      key: 'deploy', header: 'Deployable', sortable: false, width: 130,
      render: (r) => daysLeft(r.licenseExpiry) < 0
        ? <span className="chip border-critical/25 bg-critical/10 text-critical"><XCircle size={11} /> Blocked</span>
        : <span className="chip border-ok/25 bg-ok/10 text-ok"><ShieldCheck size={11} /> Cleared</span>,
    },
  ]

  return (
    <>
      <PageHeader
        title={isGuard ? 'My training & files' : 'Training & Personnel Files'}
        subtitle="Certification currency, document completeness and licensing status across the workforce."
        actions={can('training', 'create') && (
          <Button variant="primary" icon={Plus} onClick={() => setFormOpen(true)}>Record training</Button>
        )}
        tabs={<Tabs tabs={tabs} value={tab} onChange={setTab} className="mt-4" />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Lapsed training" value={trExpired.length} icon={GraduationCap} tone="critical" loading={trAll.isLoading} hint={`${trExpiring.length} expiring within 60 days`} />
        <StatCard label="File completeness" value={pct(fileCompleteness)} icon={FolderOpen} tone={fileCompleteness > 90 ? 'ok' : 'warn'} loading={dcAll.isLoading} hint={`${docMissing.length} mandatory documents missing`} />
        <StatCard label="Expired documents" value={docExpired.length} icon={FileCheck} tone="warn" loading={dcAll.isLoading} hint="Require re-issue before deployment" />
        <StatCard label="Registrations blocked" value={licExpired.length} icon={ShieldCheck} tone={licExpired.length ? 'critical' : 'ok'} loading={gdAll.isLoading} hint={`${licSoon.length} expire within 30 days`} />
      </div>

      {(licExpired.length > 0 || docMissing.length > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-critical/25 bg-critical/[.07] px-4 py-3">
          <AlertTriangle size={16} className="shrink-0 text-critical" />
          <p className="flex-1 text-[12.5px] text-ink">
            {licExpired.length > 0 && (
              <>
                <span className="mono font-bold text-critical">{licExpired.length}</span> officer{licExpired.length === 1 ? ' is' : 's are'} deployed on an expired ZRP registration, which is a regulatory breach.
              </>
            )}
            {licExpired.length > 0 && docMissing.length > 0 && ' '}
            {docMissing.length > 0 && (
              <>
                <span className="mono font-bold text-critical">{docMissing.length}</span> mandatory personnel documents are not on file.
              </>
            )}
          </p>
          <Button size="sm" variant="secondary" onClick={() => setTab(licExpired.length ? 'licences' : 'documents')}>Review</Button>
        </div>
      )}

      {tab === 'training' && (
        <>
          {byCourse.length > 0 && (
            <Card className="mb-4" title="Courses needing renewal" subtitle="Expired or expiring within 60 days">
              <BarsChart data={byCourse} layout="vertical" height={230} bars={[{ key: 'value', label: 'Officers', color: 'warn' }]} />
            </Card>
          )}
          <Toolbar
            q={tr.q} onQ={tr.setQ}
            placeholder="Search course, provider, certificate…"
            activeFilters={tr.activeFilters} onReset={tr.reset}
            exportName="training-records"
            exportRows={() => (trQ.data?.rows || []).map((r) => ({
              officer: r._guard?.name, employeeNo: r._guard?.employeeNo, course: r.course,
              provider: r.provider, completedAt: r.completedAt, expiresAt: r.expiresAt,
              score: r.score, status: r.status, mandatory: r.mandatory,
            }))}
            filters={
              <>
                <FilterSelect label="Status" value={tr.filters.status} onChange={(v) => tr.setFilter('status', v)} options={TR_STATUS} />
                <FilterSelect label="Course" value={tr.filters.course} onChange={(v) => tr.setFilter('course', v)} options={COURSES} />
              </>
            }
          />
          <DataTable
            columns={trainingCols}
            rows={trQ.data?.rows || []}
            loading={trQ.isLoading} fetching={trQ.isFetching}
            sort={trQ.data?.sort} dir={trQ.data?.dir} onSort={tr.toggleSort}
            page={trQ.data?.page} pageCount={trQ.data?.pageCount} pageSize={tr.pageSize}
            total={trQ.data?.total} from={trQ.data?.from} to={trQ.data?.to}
            onPage={tr.setPage} onPageSize={tr.setPageSize}
            onRowClick={(r) => navigate(hrefFor('training', r.id))}
            emptyIcon={GraduationCap} emptyTitle="No training records"
          />
        </>
      )}

      {tab === 'documents' && (
        <>
          <div className="mb-4 grid gap-4 lg:grid-cols-3">
            <Card title="Document status mix">
              <DonutChart
                data={docMix}
                colorMap={{ valid: 'ok', expiring: 'warn', expired: 'danger', missing: 'critical' }}
                centerLabel="Documents"
              />
              <Legend2
                className="mt-3 justify-center"
                items={docMix.map((d) => ({
                  label: titleCase(d.name), value: d.value,
                  color: { valid: 'ok', expiring: 'warn', expired: 'danger', missing: 'critical' }[d.name],
                }))}
              />
            </Card>
            <Card className="lg:col-span-2" title="Mandatory file completeness" subtitle="Every officer needs a complete set before deployment">
              <div className="flex items-baseline gap-2">
                <span className="mono text-[34px] font-bold leading-none text-ink">{fileCompleteness}%</span>
                <span className="text-[13px] text-muted">of mandatory documents are on file and in date</span>
              </div>
              <Progress value={fileCompleteness} tone={fileCompleteness > 90 ? 'ok' : fileCompleteness > 75 ? 'warn' : 'critical'} className="mt-3" />
              <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {DOC_STATUS.map((s) => (
                  <div key={s} className="rounded-lg border border-line bg-surface2/40 px-3 py-2.5">
                    <p className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">{titleCase(s)}</p>
                    <p className="mono mt-0.5 text-[18px] font-bold leading-none text-ink">{num(documents.filter((d) => d.status === s).length)}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Toolbar
            q={dc.q} onQ={dc.setQ}
            placeholder="Search document type or file name…"
            activeFilters={dc.activeFilters} onReset={dc.reset}
            exportName="personnel-documents"
            exportRows={() => (dcQ.data?.rows || []).map((r) => ({
              officer: r._guard?.name, type: r.type, status: r.status,
              uploadedAt: r.uploadedAt, expiresAt: r.expiresAt, mandatory: r.mandatory, verifiedBy: r.verifiedBy,
            }))}
            filters={<FilterSelect label="Status" value={dc.filters.status} onChange={(v) => dc.setFilter('status', v)} options={DOC_STATUS} />}
          />
          <DataTable
            columns={docCols}
            rows={dcQ.data?.rows || []}
            loading={dcQ.isLoading} fetching={dcQ.isFetching}
            sort={dcQ.data?.sort} dir={dcQ.data?.dir} onSort={dc.toggleSort}
            page={dcQ.data?.page} pageCount={dcQ.data?.pageCount} pageSize={dc.pageSize}
            total={dcQ.data?.total} from={dcQ.data?.from} to={dcQ.data?.to}
            onPage={dc.setPage} onPageSize={dc.setPageSize}
            onRowClick={(r) => navigate(hrefFor('documents', r.id))}
            emptyIcon={FolderOpen} emptyTitle="No documents"
          />
        </>
      )}

      {tab === 'licences' && (
        <>
          <Toolbar
            q={gd.q} onQ={gd.setQ}
            placeholder="Search officer or licence number…"
            activeFilters={gd.activeFilters} onReset={gd.reset}
            exportName="licensing"
            exportRows={() => (gdQ.data?.rows || []).map((r) => ({
              officer: r.name, employeeNo: r.employeeNo, rank: r.rank, grade: r.grade,
              licenceNo: r.licenseNo, expires: r.licenseExpiry, status: r.status,
            }))}
            filters={<FilterSelect label="Grade" value={gd.filters.grade} onChange={(v) => gd.setFilter('grade', v)} options={['A', 'B', 'C', 'D']} />}
          />
          <DataTable
            columns={licenceCols}
            rows={gdQ.data?.rows || []}
            loading={gdQ.isLoading} fetching={gdQ.isFetching}
            sort={gdQ.data?.sort} dir={gdQ.data?.dir} onSort={gd.toggleSort}
            page={gdQ.data?.page} pageCount={gdQ.data?.pageCount} pageSize={gd.pageSize}
            total={gdQ.data?.total} from={gdQ.data?.from} to={gdQ.data?.to}
            onPage={gd.setPage} onPageSize={gd.setPageSize}
            onRowClick={(r) => navigate(hrefFor('guards', r.id))}
            emptyIcon={ShieldCheck} emptyTitle="No officers"
          />
        </>
      )}

      <TrainingForm open={formOpen} onClose={() => setFormOpen(false)} />
    </>
  )
}
