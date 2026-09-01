import React, { useState } from 'react'
import {
  GraduationCap, FolderOpen, Gavel, Wallet, ShieldCheck, Award, AlertTriangle,
  CheckCircle2, BadgeCheck, Star, Phone, Mail, Home, UserRound, Calendar,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, Badge, Button, Avatar, Tabs, Skeleton, EmptyState, Progress, StatCard } from '@/components/ui/primitives'
import { DataTable } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { useMyDuty, useList } from '@/lib/hooks'
import { fmtDate, money2, titleCase, cn } from '@/lib/utils'
import { NotLinked } from './OfficerDuty'

const daysLeft = (v) => (v ? Math.round((new Date(v) - Date.now()) / 86400000) : null)

function Info({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-line bg-surface2/40 px-3 py-2.5">
      <Icon size={15} className="shrink-0 text-faint" />
      <div className="min-w-0">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">{label}</p>
        <p className="truncate text-[12.5px] font-medium text-ink">{value || 'Not recorded'}</p>
      </div>
    </div>
  )
}

export default function OfficerRecord() {
  const { data: duty, isLoading, error } = useMyDuty()
  const [tab, setTab] = useState('overview')
  const [payslip, setPayslip] = useState(null)

  const gid = duty?.guard?.id
  const on = (t) => ({ enabled: !!gid && (tab === t || tab === 'overview') })

  const trainQ = useList('training', { all: true, pageSize: 60, sort: 'expiresAt', dir: 'asc', filters: { guardId: gid } }, { enabled: !!gid })
  const docQ = useList('documents', { all: true, pageSize: 60, filters: { guardId: gid } }, { enabled: !!gid })
  const discQ = useList('discipline', { all: true, pageSize: 60, sort: 'issuedAt', dir: 'desc', filters: { guardId: gid } }, { enabled: !!gid })
  const payQ = useList('payroll', { all: true, pageSize: 24, sort: 'period', dir: 'desc', filters: { guardId: gid } }, { enabled: !!gid })

  if (error?.status === 403) return <NotLinked />
  if (isLoading) return <div className="space-y-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-96 w-full" /></div>
  if (!duty?.guard) return <NotLinked />

  const g = duty.guard
  const training = trainQ.data?.rows || []
  const documents = docQ.data?.rows || []
  const discipline = discQ.data?.rows || []
  const payslips = payQ.data?.rows || []

  const lic = daysLeft(g.licenseExpiry)
  const mandatoryDocs = documents.filter((d) => d.mandatory)
  const complete = mandatoryDocs.filter((d) => d.status === 'valid' || d.status === 'expiring').length
  const filePct = mandatoryDocs.length ? Math.round((complete / mandatoryDocs.length) * 100) : 100
  const commendations = discipline.filter((d) => d.type === 'commendation')
  const sanctions = discipline.filter((d) => d.type !== 'commendation' && d.status === 'active')

  const tabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'training', label: 'Training', count: training.length },
    { value: 'documents', label: 'Documents', count: documents.length },
    { value: 'record', label: 'Record', count: discipline.length },
    { value: 'payslips', label: 'Payslips', count: payslips.length },
  ]

  return (
    <>
      <PageHeader
        title="My file"
        subtitle="Everything held on your personnel record: training, documents, conduct and pay."
        tabs={<Tabs tabs={tabs} value={tab} onChange={setTab} className="mt-4" />}
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge value={g.status} dot />
          {g.armed && <Badge value="high" label="Firearm authorised" />}
          {lic != null && (
            <Badge
              value={lic < 0 ? 'critical' : lic < 30 ? 'medium' : 'active'}
              label={lic < 0 ? 'Registration expired' : `Registration valid · ${lic}d`}
            />
          )}
        </div>
      </PageHeader>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Performance rating" value={g.rating.toFixed(1)} icon={Star} tone="warn" hint="Set by your supervisor" />
            <StatCard label="File completeness" value={`${filePct}%`} icon={FolderOpen} tone={filePct === 100 ? 'ok' : 'warn'} hint={`${mandatoryDocs.length - complete} document${mandatoryDocs.length - complete === 1 ? '' : 's'} outstanding`} />
            <StatCard label="Commendations" value={commendations.length} icon={Award} tone="ok" hint="Positive entries on file" />
            <StatCard label="Live sanctions" value={sanctions.length} icon={Gavel} tone={sanctions.length ? 'critical' : 'ok'} hint={sanctions.length ? 'Active on your record' : 'Clean record'} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2" title="Personal details" subtitle="Ask your supervisor to correct anything that is wrong">
              <div className="flex items-center gap-4 rounded-lg border border-line bg-surface2/40 p-4">
                <Avatar name={g.name} size={52} />
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold text-ink">{g.name}</p>
                  <p className="mono truncate text-[12px] text-faint">{g.employeeNo} · {g.rank} · Grade {g.grade}</p>
                </div>
              </div>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                <Info icon={Mail} label="Email" value={g.email} />
                <Info icon={Phone} label="Phone" value={g.phone} />
                <Info icon={Home} label="Address" value={g.address} />
                <Info icon={UserRound} label="Emergency contact" value={g.emergencyContact} />
                <Info icon={Calendar} label="Hired" value={fmtDate(g.hireDate)} />
                <Info icon={ShieldCheck} label="ZRP registration" value={`${g.licenseNo} · ${fmtDate(g.licenseExpiry)}`} />
              </div>

              <div className="mt-4">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[.1em] text-faint">Certifications held</p>
                <div className="flex flex-wrap gap-1.5">
                  {(g.certifications || []).map((c) => (
                    <span key={c} className="chip border-accent/25 bg-accent/10 text-accent"><Award size={11} /> {c}</span>
                  ))}
                </div>
              </div>
            </Card>

            <Card title="Compliance">
              <div className="space-y-3.5">
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-[12px]">
                    <span className="text-muted">ZRP registration</span>
                    <span className={cn('mono font-semibold', lic < 0 ? 'text-critical' : lic < 60 ? 'text-warn' : 'text-ok')}>
                      {lic < 0 ? 'Expired' : `${lic}d left`}
                    </span>
                  </div>
                  <Progress value={Math.max(0, Math.min(100, ((lic ?? 0) / 365) * 100))} tone={lic < 0 ? 'critical' : lic < 60 ? 'warn' : 'ok'} />
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-[12px]">
                    <span className="text-muted">Training in date</span>
                    <span className="mono font-semibold text-ink">
                      {training.filter((t) => t.status === 'valid').length}/{training.length}
                    </span>
                  </div>
                  <Progress
                    value={training.length ? (training.filter((t) => t.status === 'valid').length / training.length) * 100 : 100}
                    tone="accent"
                  />
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-[12px]">
                    <span className="text-muted">Documents on file</span>
                    <span className="mono font-semibold text-ink">{complete}/{mandatoryDocs.length}</span>
                  </div>
                  <Progress value={filePct} tone={filePct === 100 ? 'ok' : 'warn'} />
                </div>
              </div>

              {(lic < 30 || training.some((t) => t.status === 'expired') || filePct < 100) && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-warn/25 bg-warn/[.08] p-3">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
                  <p className="text-[11.5px] leading-relaxed text-muted">
                    Anything outstanding here can stop you being rostered. Speak to your supervisor.
                  </p>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === 'training' && (
        <DataTable
          columns={[
            {
              key: 'course', header: 'Course',
              render: (r) => (
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-[12.5px] font-medium text-ink">
                    {r.mandatory && <BadgeCheck size={12} className="shrink-0 text-accent" />}
                    {r.course}
                  </p>
                  <p className="truncate text-[11px] text-faint">{r.provider}</p>
                </div>
              ),
            },
            { key: 'completedAt', header: 'Completed', width: 130, render: (r) => <span className="text-[12.5px] text-muted">{r.completedAt ? fmtDate(r.completedAt) : ''}</span> },
            { key: 'expiresAt', header: 'Expires', width: 130, render: (r) => <span className="text-[12.5px] text-muted">{r.expiresAt ? fmtDate(r.expiresAt) : ''}</span> },
            { key: 'score', header: 'Score', align: 'right', width: 90, render: (r) => r.score ? <span className="mono text-[12.5px]">{r.score}%</span> : <span className="text-faint"></span> },
            { key: 'status', header: 'Status', width: 120, render: (r) => <Badge value={r.status} dot /> },
          ]}
          rows={training}
          loading={trainQ.isLoading}
          emptyIcon={GraduationCap}
          emptyTitle="No training on file"
        />
      )}

      {tab === 'documents' && (
        <DataTable
          columns={[
            {
              key: 'type', header: 'Document',
              render: (r) => (
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-[12.5px] font-medium text-ink">
                    {r.mandatory && <BadgeCheck size={12} className="shrink-0 text-accent" />}
                    {r.type}
                  </p>
                  <p className="mono truncate text-[11px] text-faint">{r.status === 'missing' ? 'not on file' : r.name}</p>
                </div>
              ),
            },
            { key: 'mandatory', header: 'Required', align: 'center', width: 100, render: (r) => r.mandatory ? <span className="text-[12px] text-ink">Yes</span> : <span className="text-[12px] text-faint">No</span> },
            { key: 'uploadedAt', header: 'Uploaded', width: 130, render: (r) => <span className="text-[12.5px] text-muted">{r.uploadedAt ? fmtDate(r.uploadedAt) : ''}</span> },
            { key: 'expiresAt', header: 'Expires', width: 130, render: (r) => <span className="text-[12.5px] text-muted">{r.expiresAt ? fmtDate(r.expiresAt) : ''}</span> },
            { key: 'status', header: 'Status', width: 120, render: (r) => <Badge value={r.status} dot /> },
          ]}
          rows={documents}
          loading={docQ.isLoading}
          emptyIcon={FolderOpen}
          emptyTitle="No documents on file"
        />
      )}

      {tab === 'record' && (
        discipline.length === 0 ? (
          <Card>
            <EmptyState icon={CheckCircle2} title="Clean record" body="You have no warnings or commendations on file." />
          </Card>
        ) : (
          <div className="space-y-2.5">
            {discipline.map((d) => {
              const good = d.type === 'commendation'
              return (
                <Card key={d.id} className={cn('border', good ? 'border-ok/25' : 'border-line')}>
                  <div className="flex items-start gap-3">
                    <span className={cn(
                      'grid h-9 w-9 shrink-0 place-items-center rounded-lg border',
                      good ? 'border-ok/25 bg-ok/10 text-ok' : 'border-warn/25 bg-warn/10 text-warn'
                    )}>
                      {good ? <Award size={16} /> : <Gavel size={16} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13px] font-semibold text-ink">{titleCase(d.type)}</p>
                        <span className="mono text-[11px] text-faint">{d.ref}</span>
                        <Badge value={d.status} size="sm" dot />
                      </div>
                      <p className="mt-0.5 text-[12px] font-medium text-muted">{d.category}</p>
                      <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{d.description}</p>
                      <p className="mt-2 text-[11px] text-faint">
                        Issued by {d.issuedBy} on {fmtDate(d.issuedAt)} · held on file until {fmtDate(d.expiresAt)}
                        {d.acknowledged ? ' · signed by you' : ' · not yet signed'}
                      </p>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )
      )}

      {tab === 'payslips' && (
        <DataTable
          columns={[
            { key: 'period', header: 'Period', render: (r) => <span className="mono text-[12.5px] font-semibold text-ink">{r.period}</span> },
            { key: 'baseHours', header: 'Base hrs', align: 'right', width: 100, render: (r) => <span className="mono text-[12.5px]">{r.baseHours}</span> },
            { key: 'otHours', header: 'OT hrs', align: 'right', width: 90, render: (r) => <span className="mono text-[12.5px] text-warn">{r.otHours || ''}</span> },
            { key: 'gross', header: 'Gross', align: 'right', width: 115, render: (r) => <span className="mono text-[12.5px]">{money2(r.gross)}</span> },
            { key: 'deductions', header: 'Deductions', align: 'right', width: 120, render: (r) => <span className="mono text-[12.5px] text-critical">-{money2(r.deductions)}</span> },
            { key: 'net', header: 'Net pay', align: 'right', width: 125, render: (r) => <span className="mono text-[12.5px] font-bold text-ok">{money2(r.net)}</span> },
            { key: 'status', header: 'Status', width: 124, render: (r) => <Badge value={r.status} /> },
          ]}
          rows={payslips}
          loading={payQ.isLoading}
          onRowClick={setPayslip}
          emptyIcon={Wallet}
          emptyTitle="No payslips yet"
        />
      )}

      <Modal
        open={!!payslip}
        onClose={() => setPayslip(null)}
        size="sm"
        title="Payslip"
        subtitle={payslip ? `${g.name} · ${payslip.period}` : ''}
        footer={<Button variant="ghost" onClick={() => setPayslip(null)}>Close</Button>}
      >
        {payslip && (
          <div className="space-y-2 text-[13px]">
            <p className="text-[11px] font-bold uppercase tracking-wide text-faint">Earnings</p>
            <div className="flex justify-between"><span className="text-muted">Base hours</span><span className="mono text-ink">{payslip.baseHours}</span></div>
            <div className="flex justify-between"><span className="text-muted">Overtime hours</span><span className="mono text-ink">{payslip.otHours}</span></div>
            <div className="flex justify-between border-t border-line pt-2"><span className="font-semibold text-ink">Gross pay</span><span className="mono font-semibold text-ink">{money2(payslip.gross)}</span></div>

            <p className="pt-3 text-[11px] font-bold uppercase tracking-wide text-faint">Deductions</p>
            <div className="flex justify-between"><span className="text-muted">PAYE</span><span className="mono text-critical">-{money2(payslip.paye)}</span></div>
            <div className="flex justify-between"><span className="text-muted">NSSA</span><span className="mono text-critical">-{money2(payslip.nssa)}</span></div>
            {payslip.advances > 0 && <div className="flex justify-between"><span className="text-muted">Advance</span><span className="mono text-critical">-{money2(payslip.advances)}</span></div>}

            <div className="mt-3 flex justify-between rounded-lg bg-ok/10 px-3 py-2.5">
              <span className="text-[14px] font-bold text-ink">Net pay</span>
              <span className="mono text-[16px] font-bold text-ok">{money2(payslip.net)}</span>
            </div>
            <p className="pt-1 text-[11px] text-faint">
              {payslip.paidAt ? `Paid ${fmtDate(payslip.paidAt)}` : `Status: ${titleCase(payslip.status)}`}
            </p>
          </div>
        )}
      </Modal>
    </>
  )
}
