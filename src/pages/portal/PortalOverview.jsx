import React from 'react'
import { Link } from 'react-router-dom'
import {
  ShieldAlert, MapPin, Route as RouteIcon, Receipt, LifeBuoy, CheckCircle2,
  Clock, TrendingUp, ArrowRight, Radio,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, StatCard, Badge, Button, Progress, Skeleton, EmptyState, SeverityDot, Avatar } from '@/components/ui/primitives'
import { TrendChart, DonutChart, GaugeChart, Legend2 } from '@/components/charts/Charts'
import { useDashboard, useList } from '@/lib/hooks'
import { useAuth } from '@/auth/AuthContext'
import { money, num, timeAgo, titleCase, fmtDate } from '@/lib/utils'

export default function PortalOverview() {
  const { user } = useAuth()
  const { data, isLoading } = useDashboard()
  const k = data?.kpis

  const invQ = useList('invoices', { all: true, pageSize: 100, sort: 'issueDate', dir: 'desc' })
  const reqQ = useList('requests', { pageSize: 5, sort: 'updatedAt', dir: 'desc' })
  const inspQ = useList('inspections', { pageSize: 4, sort: 'at', dir: 'desc' })

  const invoices = invQ.data?.rows || []
  const outstanding = invoices.filter((i) => i.status === 'sent' || i.status === 'overdue')
  const nextInvoice = outstanding.sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user.name.split(' ')[0]}`}
        subtitle="Your live security picture: incidents, patrol assurance and service performance."
        actions={
          <>
            <Button as={Link} to="/portal/requests" variant="secondary" icon={LifeBuoy}>Service requests</Button>
            <Button as={Link} to="/portal/incidents" variant="primary" icon={ShieldAlert}>Incident reports</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Open incidents" value={k ? num(k.openIncidents) : ''} loading={isLoading} icon={ShieldAlert} tone="critical" hint={k ? `${k.criticalOpen} critical` : ''} />
        <StatCard label="Officers on duty" value={k ? num(k.onDuty) : ''} loading={isLoading} icon={Radio} tone="ok" hint="Across your sites right now" />
        <StatCard label="Sites covered" value={k ? num(k.activeSites) : ''} loading={isLoading} icon={MapPin} tone="accent" hint={k ? `${k.totalSites} contracted` : ''} />
        <StatCard label="Patrol compliance" value={k ? `${k.patrolCompliance}%` : ''} loading={isLoading} icon={RouteIcon} tone="accent2" hint="Checkpoints scanned on time" />
        <StatCard label="Outstanding" value={k ? money(k.outstanding) : ''} loading={isLoading} icon={Receipt} tone="warn" hint={nextInvoice ? `Next due ${fmtDate(nextInvoice.dueDate)}` : 'Nothing due'} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Incidents at your sites" subtitle="Last 14 days">
          {isLoading ? <Skeleton className="h-[220px] w-full" /> : (
            <TrendChart
              data={data.trend}
              keys={[{ key: 'total', label: 'Reported', color: 'accent' }, { key: 'resolved', label: 'Resolved', color: 'ok' }]}
            />
          )}
        </Card>

        <Card title="Patrol assurance" subtitle="Proof of presence">
          {isLoading ? <Skeleton className="h-[150px] w-full" /> : (
            <>
              <GaugeChart
                value={k.patrolCompliance}
                label="Compliance"
                tone={k.patrolCompliance > 90 ? 'ok' : k.patrolCompliance > 75 ? 'warn' : 'critical'}
              />
              <p className="mt-2 text-center text-[11.5px] leading-relaxed text-faint">
                Every checkpoint scan is logged with a timestamp and the officer's identity.
              </p>
              <Button as={Link} to="/portal/patrols" className="mt-3 w-full" variant="secondary" iconRight={ArrowRight}>
                View patrol log
              </Button>
            </>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="Recent incident reports"
          subtitle="Published to your portal"
          actions={<Link to="/portal/incidents" className="text-[12px] font-semibold text-accent hover:underline">View all</Link>}
          noPad
        >
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : data.recentIncidents.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="No incidents reported" body="Your sites have a clean record in this period." />
          ) : (
            <ul className="divide-y divide-line/60">
              {data.recentIncidents.map((i) => (
                <li key={i.id} className="flex items-start gap-3 px-4 py-3">
                  <SeverityDot level={i.severity} className="mt-1.5" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-ink">{i.type}</p>
                    <p className="truncate text-[11.5px] text-faint">{i._site?.name} · {i.ref}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge value={i.status} size="sm" />
                    <p className="mt-1 text-[10.5px] text-faint">{timeAgo(i.occurredAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <Card
            title="Your service requests"
            actions={<Link to="/portal/requests" className="text-[12px] font-semibold text-accent hover:underline">Manage</Link>}
            noPad
          >
            {reqQ.isLoading ? (
              <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
            ) : (reqQ.data?.rows || []).length === 0 ? (
              <EmptyState icon={LifeBuoy} title="No open requests" body="Raise one any time from the portal." />
            ) : (
              <ul className="divide-y divide-line/60">
                {reqQ.data.rows.map((r) => (
                  <li key={r.id} className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">{r.subject}</p>
                      <Badge value={r.status} size="sm" dot />
                    </div>
                    <p className="mono mt-0.5 text-[10.5px] text-faint">{r.ref} · updated {timeAgo(r.updatedAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Latest inspections"
            actions={<Link to="/portal/inspections" className="text-[12px] font-semibold text-accent hover:underline">All reports</Link>}
            noPad
          >
            {inspQ.isLoading ? (
              <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
            ) : (inspQ.data?.rows || []).length === 0 ? (
              <EmptyState icon={CheckCircle2} title="No inspections published yet" />
            ) : (
              <ul className="divide-y divide-line/60">
                {inspQ.data.rows.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className={`mono grid h-8 w-11 shrink-0 place-items-center rounded-lg text-[11.5px] font-bold ${
                      i.score >= 90 ? 'bg-ok/10 text-ok' : i.score >= 75 ? 'bg-warn/10 text-warn' : 'bg-critical/10 text-critical'
                    }`}>
                      {i.score}%
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium text-ink">{i._site?.name}</p>
                      <p className="truncate text-[10.5px] text-faint">{i.ref} · {timeAgo(i.at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Billing" subtitle="Current account position">
            {invQ.isLoading ? <Skeleton className="h-24 w-full" /> : (
              <div className="space-y-2.5 text-[12.5px]">
                <div className="flex justify-between border-b border-line/50 pb-2">
                  <span className="text-muted">Invoices issued</span>
                  <span className="mono font-semibold text-ink">{invoices.length}</span>
                </div>
                <div className="flex justify-between border-b border-line/50 pb-2">
                  <span className="text-muted">Paid to date</span>
                  <span className="mono font-semibold text-ok">{money(invoices.filter((i) => i.status === 'paid').reduce((a, i) => a + i.total, 0))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Outstanding</span>
                  <span className="mono font-semibold text-warn">{money(outstanding.reduce((a, i) => a + i.total, 0))}</span>
                </div>
                <Button as={Link} to="/portal/invoices" className="mt-2 w-full" variant="secondary" iconRight={ArrowRight}>
                  View invoices
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Incident severity mix" subtitle="All reports on your account">
          {isLoading ? <Skeleton className="h-[200px] w-full" /> : (
            <>
              <DonutChart data={data.bySeverity} centerLabel="Incidents" />
              <Legend2
                className="mt-3 justify-center"
                items={data.bySeverity.map((s) => ({
                  label: titleCase(s.name), value: s.value,
                  color: { critical: 'critical', high: 'danger', medium: 'warn', low: 'accent' }[s.name],
                }))}
              />
            </>
          )}
        </Card>

        <Card title="Site coverage" subtitle="Officers deployed against requirement" noPad>
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : (
            <ul className="divide-y divide-line/60">
              {data.siteRisk.map((s) => {
                const p = s.required ? Math.min(100, (s.guards / s.required) * 100) : 100
                return (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                    <SeverityDot level={s.riskLevel} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold text-ink">{s.name}</p>
                      <Progress value={p} tone={p < 70 ? 'critical' : p < 100 ? 'warn' : 'ok'} className="mt-1.5 w-32" />
                    </div>
                    <span className="mono shrink-0 text-[11.5px] text-muted">{s.guards}/{s.required}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
