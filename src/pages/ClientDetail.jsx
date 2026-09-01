import React, { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Mail, Phone, MapPin, Calendar, Star, AlertTriangle, Building2,
  Receipt, ShieldAlert, LifeBuoy, TrendingUp, Clock, FileText, Users,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, Badge, Button, Avatar, Skeleton, EmptyState, Tabs, StatCard, Progress } from '@/components/ui/primitives'
import { DataTable } from '@/components/ui/DataTable'
import { RevenueChart, DonutChart, Legend2 } from '@/components/charts/Charts'
import { useOne, useList } from '@/lib/hooks'
import { fmtDate, money, money2, titleCase, timeAgo, cn } from '@/lib/utils'
import { useAuth } from '@/auth/AuthContext'
import { ViewAsEntityButton } from '@/features/ViewAs'

export default function ClientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { can } = useAuth()
  const [tab, setTab] = useState('overview')

  const { data: c, isLoading, error } = useOne('clients', id)
  const sitesQ = useList('sites', { pageSize: 100, filters: { clientId: id }, all: true }, { enabled: !!id })
  const incQ = useList('incidents', { pageSize: 100, filters: { clientId: id }, sort: 'occurredAt', dir: 'desc', all: true }, { enabled: !!id })
  const invQ = useList('invoices', { pageSize: 100, filters: { clientId: id }, sort: 'issueDate', dir: 'desc', all: true }, { enabled: !!id })
  const reqQ = useList('requests', { pageSize: 100, filters: { clientId: id }, sort: 'createdAt', dir: 'desc', all: true }, { enabled: !!id })

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-96 w-full" /></div>
  if (error) return <EmptyState icon={AlertTriangle} title="Client not found" body={error.message} action={<Button icon={ArrowLeft} onClick={() => navigate('/clients')}>Back</Button>} />

  const sites = sitesQ.data?.rows || []
  const incidents = incQ.data?.rows || []
  const invoices = invQ.data?.rows || []
  const requests = reqQ.data?.rows || []

  const billed = invoices.reduce((a, i) => a + i.total, 0)
  const collected = invoices.filter((i) => i.status === 'paid').reduce((a, i) => a + i.total, 0)
  const overdue = invoices.filter((i) => i.status === 'overdue')
  const openInc = incidents.filter((i) => i.status === 'open' || i.status === 'investigating')

  const revenue = Object.values(
    invoices.reduce((acc, i) => {
      acc[i.period] = acc[i.period] || { period: i.period, billed: 0, collected: 0 }
      acc[i.period].billed += i.total
      if (i.status === 'paid') acc[i.period].collected += i.total
      return acc
    }, {})
  ).sort((a, b) => a.period.localeCompare(b.period))

  const bySeverity = ['critical', 'high', 'medium', 'low'].map((k) => ({ name: k, value: incidents.filter((i) => i.severity === k).length }))
  const daysToRenewal = c.contractEnd ? Math.round((new Date(c.contractEnd) - Date.now()) / 86400000) : null

  const tabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'sites', label: 'Sites', count: sites.length },
    { value: 'incidents', label: 'Incidents', count: incidents.length },
    { value: 'invoices', label: 'Invoices', count: invoices.length },
    { value: 'requests', label: 'Requests', count: requests.length },
  ]

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3"><Avatar name={c.name} size={40} />{c.name}</span>}
        subtitle={`${c.industry} · ${c.city} · ${c.code}`}
        actions={
          <>
            <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate('/clients')}>Back</Button>
            <ViewAsEntityButton clientId={id} label="Open their portal" />
            <Button variant="secondary" icon={Receipt} onClick={() => navigate('/invoices')}>Invoices</Button>
          </>
        }
        tabs={<Tabs tabs={tabs} value={tab} onChange={setTab} className="mt-4" />}
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge value={c.status} dot />
          <Badge value={c.tier} />
          <Badge value="info" tone="accent" label={`SLA ${c.slaResponseMins} min`} />
          {daysToRenewal != null && daysToRenewal < 90 && (
            <Badge value={daysToRenewal < 0 ? 'critical' : 'medium'} label={daysToRenewal < 0 ? 'Contract expired' : `Renews in ${daysToRenewal}d`} />
          )}
        </div>
      </PageHeader>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="Contract value" value={money(c.contractValue)} icon={TrendingUp} tone="ok" hint="Annualised" />
            <StatCard label="Sites covered" value={sites.length} icon={Building2} tone="accent" hint={`${sites.filter((s) => s.status === 'active').length} active`} />
            <StatCard label="Open incidents" value={openInc.length} icon={ShieldAlert} tone="critical" hint={`${incidents.length} lifetime`} />
            <StatCard label="Collected" value={money(collected)} icon={Receipt} tone="accent2" hint={`${money(billed - collected)} outstanding`} />
            <StatCard label="Satisfaction" value={c.satisfaction} icon={Star} tone="warn" hint="Latest survey score" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2" title="Billing history" subtitle="Billed vs collected by period">
              {revenue.length ? <RevenueChart data={revenue} formatter={(v) => money(v)} /> : <EmptyState icon={Receipt} title="No invoices yet" />}
            </Card>

            <Card title="Account contact">
              <div className="flex items-center gap-3">
                <Avatar name={c.contactName} size={40} />
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold text-ink">{c.contactName}</p>
                  <p className="truncate text-[11.5px] text-faint">Primary contact</p>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                <a href={`mailto:${c.contactEmail}`} className="flex items-center gap-2.5 rounded-lg border border-line bg-surface2/50 px-3 py-2 text-[12.5px] text-ink transition hover:border-accent/40">
                  <Mail size={14} className="text-faint" /> <span className="truncate">{c.contactEmail}</span>
                </a>
                <a href={`tel:${c.contactPhone}`} className="flex items-center gap-2.5 rounded-lg border border-line bg-surface2/50 px-3 py-2 text-[12.5px] text-ink transition hover:border-accent/40">
                  <Phone size={14} className="text-faint" /> {c.contactPhone}
                </a>
                <div className="flex items-start gap-2.5 rounded-lg border border-line bg-surface2/50 px-3 py-2 text-[12.5px] text-ink">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-faint" /> <span>{c.address}, {c.city}</span>
                </div>
              </div>

              <div className="mt-4 border-t border-line pt-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[.1em] text-faint">Contract</p>
                <div className="space-y-1.5 text-[12.5px]">
                  <div className="flex justify-between"><span className="text-muted">Start</span><span className="mono text-ink">{fmtDate(c.contractStart)}</span></div>
                  <div className="flex justify-between"><span className="text-muted">End</span><span className="mono text-ink">{fmtDate(c.contractEnd)}</span></div>
                  <div className="flex justify-between"><span className="text-muted">Annual value</span><span className="mono font-semibold text-ink">{money(c.contractValue)}</span></div>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Incident profile" subtitle="Severity distribution">
              {incidents.length ? (
                <>
                  <DonutChart data={bySeverity} centerLabel="Incidents" />
                  <Legend2 className="mt-3 justify-center" items={bySeverity.map((s) => ({ label: titleCase(s.name), value: s.value, color: { critical: 'critical', high: 'danger', medium: 'warn', low: 'accent' }[s.name] }))} />
                </>
              ) : <EmptyState icon={ShieldAlert} title="No incidents" body="A clean record across all sites." />}
            </Card>

            <Card className="lg:col-span-2" title="Sites at a glance" noPad>
              {sites.length === 0 ? (
                <EmptyState icon={MapPin} title="No sites" body="Add a site to begin deploying officers." />
              ) : (
                <ul className="divide-y divide-line/60">
                  {sites.slice(0, 6).map((s) => {
                    const siteInc = incidents.filter((i) => i.siteId === s.id).length
                    return (
                      <li key={s.id}>
                        <Link to={`/sites/${s.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface2/60">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12.5px] font-semibold text-ink">{s.name}</p>
                            <p className="truncate text-[11px] text-faint">{s.type} · {s.city} · {s.coverage}</p>
                          </div>
                          <Badge value={s.riskLevel} size="sm" />
                          <Badge value={s.status} size="sm" dot />
                          <span className="mono w-16 shrink-0 text-right text-[11.5px] text-muted">{siteInc} inc.</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>
          </div>

          {c.notes && (
            <Card title="Account notes">
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted">{c.notes}</p>
            </Card>
          )}
        </div>
      )}

      {tab === 'sites' && (
        <DataTable
          columns={[
            { key: 'name', header: 'Site', render: (r) => <div><p className="text-[13px] font-semibold text-ink">{r.name}</p><p className="mono text-[11px] text-faint">{r.code}</p></div> },
            { key: 'type', header: 'Type', width: 160, render: (r) => <span className="text-[12.5px] text-muted">{r.type}</span> },
            { key: 'city', header: 'City', width: 130, render: (r) => <span className="text-[12.5px] text-muted">{r.city}</span> },
            { key: 'riskLevel', header: 'Risk', width: 100, render: (r) => <Badge value={r.riskLevel} /> },
            { key: 'coverage', header: 'Coverage', width: 130, render: (r) => <span className="text-[12.5px] text-muted">{r.coverage}</span> },
            { key: 'guardsRequired', header: 'Officers', align: 'right', width: 90, render: (r) => <span className="mono text-[12.5px]">{r.guardsRequired}</span> },
            { key: 'status', header: 'Status', width: 124, render: (r) => <Badge value={r.status} dot /> },
          ]}
          rows={sites}
          loading={sitesQ.isLoading}
          onRowClick={(r) => navigate(`/sites/${r.id}`)}
          emptyIcon={MapPin} emptyTitle="No sites for this client"
        />
      )}

      {tab === 'incidents' && (
        <DataTable
          columns={[
            { key: 'ref', header: 'Ref', width: 130, render: (r) => <span className="mono text-[12px] font-semibold text-ink">{r.ref}</span> },
            { key: 'title', header: 'Incident', render: (r) => <div><p className="truncate text-[12.5px] text-ink">{r.title}</p><p className="truncate text-[11px] text-faint">{r._site?.name}</p></div> },
            { key: 'severity', header: 'Severity', width: 100, render: (r) => <Badge value={r.severity} /> },
            { key: 'status', header: 'Status', width: 120, render: (r) => <Badge value={r.status} dot /> },
            { key: 'lossValue', header: 'Loss', align: 'right', width: 100, render: (r) => r.lossValue ? <span className="mono text-[12.5px] text-warn">{money(r.lossValue)}</span> : <span className="text-faint"></span> },
            { key: 'occurredAt', header: 'When', width: 120, render: (r) => <span className="text-[12px] text-muted">{timeAgo(r.occurredAt)}</span> },
          ]}
          rows={incidents}
          loading={incQ.isLoading}
          onRowClick={(r) => navigate(`/incidents/${r.id}`)}
          emptyIcon={ShieldAlert} emptyTitle="No incidents recorded"
        />
      )}

      {tab === 'invoices' && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Total billed" value={money(billed)} icon={Receipt} tone="accent" />
            <StatCard label="Collected" value={money(collected)} icon={TrendingUp} tone="ok" />
            <StatCard label="Outstanding" value={money(billed - collected)} icon={Clock} tone="warn" />
            <StatCard label="Overdue" value={overdue.length} icon={AlertTriangle} tone="critical" hint={money(overdue.reduce((a, i) => a + i.total, 0))} />
          </div>
          <DataTable
            columns={[
              { key: 'number', header: 'Invoice', width: 160, render: (r) => <span className="mono text-[12.5px] font-semibold text-ink">{r.number}</span> },
              { key: 'period', header: 'Period', width: 110, render: (r) => <span className="mono text-[12.5px] text-muted">{r.period}</span> },
              { key: 'issueDate', header: 'Issued', width: 130, render: (r) => <span className="text-[12.5px] text-muted">{fmtDate(r.issueDate)}</span> },
              { key: 'dueDate', header: 'Due', width: 130, render: (r) => <span className="text-[12.5px] text-muted">{fmtDate(r.dueDate)}</span> },
              { key: 'subtotal', header: 'Subtotal', align: 'right', width: 120, render: (r) => <span className="mono text-[12.5px]">{money2(r.subtotal)}</span> },
              { key: 'total', header: 'Total', align: 'right', width: 130, render: (r) => <span className="mono text-[12.5px] font-bold text-ink">{money2(r.total)}</span> },
              { key: 'status', header: 'Status', width: 124, render: (r) => <Badge value={r.status} /> },
            ]}
            rows={invoices}
            loading={invQ.isLoading}
            emptyIcon={Receipt} emptyTitle="No invoices"
          />
        </>
      )}

      {tab === 'requests' && (
        <DataTable
          columns={[
            { key: 'ref', header: 'Ref', width: 120, render: (r) => <span className="mono text-[12px] font-semibold text-ink">{r.ref}</span> },
            { key: 'subject', header: 'Subject', render: (r) => <div><p className="truncate text-[12.5px] text-ink">{r.subject}</p><p className="truncate text-[11px] text-faint">{r.type}</p></div> },
            { key: 'priority', header: 'Priority', width: 110, render: (r) => <Badge value={r.priority} /> },
            { key: 'status', header: 'Status', width: 140, render: (r) => <Badge value={r.status} dot /> },
            { key: 'createdAt', header: 'Raised', width: 120, render: (r) => <span className="text-[12px] text-muted">{timeAgo(r.createdAt)}</span> },
          ]}
          rows={requests}
          loading={reqQ.isLoading}
          onRowClick={() => navigate('/requests')}
          emptyIcon={LifeBuoy} emptyTitle="No service requests"
        />
      )}
    </>
  )
}
