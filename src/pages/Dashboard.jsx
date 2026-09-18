import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ShieldAlert, Users, Building2, Wallet, Activity, Clock, TrendingUp, MapPin,
  Route as RouteIcon, AlertTriangle, ArrowRight, Radio, CheckCircle2, CalendarClock, Gauge,
  Brain, Sparkles, ClipboardCheck, Radar,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, StatCard, Badge, Avatar, Progress, Skeleton, Segmented, EmptyState, Button, SeverityDot } from '@/components/ui/primitives'
import { TrendChart, DonutChart, RevenueChart, BarsChart, GaugeChart, Legend2 } from '@/components/charts/Charts'
import { useDashboard, useIntelligence } from '@/lib/hooks'
import { useAuth } from '@/auth/AuthContext'
import { money, compact, num, timeAgo, fmtTime, titleCase, cn } from '@/lib/utils'

function GreetLine({ name }) {
  const h = new Date().getHours()
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  return `${part}, ${name.split(' ')[0]}`
}

export default function Dashboard() {
  const { user, isGuard } = useAuth()
  const { data, isLoading } = useDashboard()
  const { data: intel, isLoading: intelLoading } = useIntelligence({ enabled: !isGuard })
  const [trendKey, setTrendKey] = useState('total')
  const navigate = useNavigate()
  const k = data?.kpis

  return (
    <>
      <PageHeader
        title={<GreetLine name={user.name} />}
        subtitle={
          <>
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '}
            <span className="text-ok">{k ? `${k.onDuty} officers currently on duty` : 'loading live board…'}</span>
          </>
        }
        actions={
          <>
            <Button variant="secondary" icon={RouteIcon} onClick={() => navigate('/patrols')}>Patrols</Button>
            <Button variant="primary" icon={ShieldAlert} onClick={() => navigate('/incidents?new=1')}>Log incident</Button>
          </>
        }
      />

      {/* -------------------------------- KPIs ------------------------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
        <StatCard
          label="Open incidents" value={k ? num(k.openIncidents) : ''} loading={isLoading}
          icon={ShieldAlert} tone="critical" delta={k?.incidentsDelta}
          hint={k ? `${k.criticalOpen} critical · ${k.incidents30} in 30d` : ''}
          onClick={() => navigate('/incidents')}
        />
        <StatCard
          label="On duty now" value={k ? num(k.onDuty) : ''} loading={isLoading}
          icon={Radio} tone="ok" hint={k ? `${k.activeGuards}/${k.totalGuards} officers active` : ''}
          onClick={() => navigate('/shifts')}
        />
        <StatCard
          label="Coverage today" value={k ? `${k.coverage}%` : ''} loading={isLoading}
          icon={Gauge} tone="accent" hint={k ? `${k.noShows} no-shows this week` : ''}
          onClick={() => navigate('/attendance')}
        />
        <StatCard
          label="Mean time to resolve" value={k ? `${k.mttrHrs}h` : ''} loading={isLoading}
          icon={Clock} tone="accent2" hint="Across all resolved incidents"
        />
        <StatCard
          label="Outstanding" value={k ? money(k.outstanding) : ''} loading={isLoading}
          icon={Wallet} tone="warn" hint={k ? `${k.overdueCount} invoices overdue` : ''}
          onClick={() => navigate('/invoices')}
        />
        <StatCard
          label="Contract book" value={k ? money(k.contractValue) : ''} loading={isLoading}
          icon={TrendingUp} tone="ok" hint={k ? `${k.activeClients} active clients` : ''}
          onClick={() => navigate('/clients')}
        />
      </div>

      {!isGuard && (
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Uncovered posts" value={k ? num(k.uncoveredPosts) : ''} loading={isLoading}
            icon={Radar} tone={k?.uncoveredPosts ? 'critical' : 'ok'}
            hint={k ? `${k.totalPosts} active posts across the estate` : ''}
            onClick={() => navigate('/shifts')}
          />
          <StatCard
            label="Open inspection actions" value={k ? num(k.openInspectionActions) : ''} loading={isLoading}
            icon={ClipboardCheck} tone="warn" hint="Corrective work from supervisor visits"
            onClick={() => navigate('/inspections')}
          />
          <StatCard
            label="Registrations expiring" value={k ? num(k.licenceExpiring + k.licenceExpired) : ''} loading={isLoading}
            icon={AlertTriangle} tone={k?.licenceExpired ? 'critical' : 'warn'}
            hint={k ? `${k.licenceExpired} already expired` : ''}
            onClick={() => navigate('/compliance')}
          />
          <StatCard
            label="Critical signals" value={k ? num(k.criticalSignals) : ''} loading={isLoading}
            icon={Brain} tone={k?.criticalSignals ? 'critical' : 'ok'}
            hint="Raised by operations intelligence"
            onClick={() => navigate('/intelligence')}
          />
        </div>
      )}

      {/* ----------------------------- alert strip --------------------------- */}
      {k && (k.criticalOpen > 0 || k.licenceExpiring > 0 || k.licenceExpired > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-warn/25 bg-warn/[.07] px-4 py-2.5">
          <AlertTriangle size={16} className="shrink-0 text-warn" />
          <p className="text-[12.5px] font-medium text-ink">Needs attention</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
            {k.criticalOpen > 0 && (
              <Link to="/incidents" className="inline-flex min-h-[32px] items-center hover:text-ink hover:underline sm:min-h-0">
                <span className="mono font-bold text-critical">{k.criticalOpen}</span> critical incident{k.criticalOpen > 1 ? 's' : ''} open
              </Link>
            )}
            {k.licenceExpired > 0 && (
              <Link to="/guards" className="inline-flex min-h-[32px] items-center hover:text-ink hover:underline sm:min-h-0">
                <span className="mono font-bold text-critical">{k.licenceExpired}</span> expired registration{k.licenceExpired > 1 ? 's' : ''}
              </Link>
            )}
            {k.licenceExpiring > 0 && (
              <Link to="/guards" className="inline-flex min-h-[32px] items-center hover:text-ink hover:underline sm:min-h-0">
                <span className="mono font-bold text-warn">{k.licenceExpiring}</span> licence{k.licenceExpiring > 1 ? 's' : ''} expiring in 30d
              </Link>
            )}
            {k.lateArrivals > 0 && (
              <Link to="/attendance" className="inline-flex min-h-[32px] items-center hover:text-ink hover:underline sm:min-h-0">
                <span className="mono font-bold text-warn">{k.lateArrivals}</span> late arrivals this week
              </Link>
            )}
          </div>
        </div>
      )}

      {/* --------------------- operations intelligence ----------------------- */}
      {!isGuard && (
        <section className="relative mt-4 overflow-hidden rounded-2xl border border-accent/25 bg-surface p-5">
          <div className="grid-bg pointer-events-none absolute inset-0 opacity-30" />
          <div className="pointer-events-none absolute -right-14 -top-14 h-48 w-48 rounded-full bg-accent/10 blur-[70px]" />
          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-bg">
                  <Brain size={17} strokeWidth={2.3} />
                </span>
                <div>
                  <h3 className="text-[14px] font-bold tracking-tight text-ink">Today's Operational Intelligence</h3>
                  <p className="text-[11px] text-faint">
                    {intel ? `${intel.headline.signalsRaised} signals evaluated across the portfolio` : 'Analysing operational data…'}
                  </p>
                </div>
              </div>
              <Button as={Link} to="/intelligence" size="sm" variant="secondary" iconRight={ArrowRight}>
                Full briefing
              </Button>
            </div>

            {intelLoading ? (
              <div className="mt-4 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
              </div>
            ) : intel ? (
              <>
                <div className="mt-4 space-y-2">
                  {intel.briefing.slice(0, 3).map((line, i) => (
                    <p key={i} className={cn('text-[13.5px] leading-relaxed', i === 0 ? 'font-semibold text-ink' : 'text-muted')}>
                      {i > 0 && <span className="mr-2 inline-block h-1.5 w-1.5 -translate-y-[3px] rounded-full bg-accent/70" />}
                      {line}
                    </p>
                  ))}
                </div>

                {intel.signals.length > 0 && (
                  <div className="mt-4 grid gap-2 border-t border-line pt-4 lg:grid-cols-3">
                    {intel.signals.slice(0, 3).map((s) => (
                      <Link
                        key={s.id}
                        to={s.link}
                        className="group rounded-lg border border-line bg-bg/40 p-3 transition hover:border-accent/40"
                      >
                        <div className="flex items-center gap-2">
                          <Badge value={s.severity} size="sm" />
                          <span className="mono ml-auto text-[11px] font-semibold text-muted">{s.metric}</span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-[12.5px] font-medium leading-snug text-ink">{s.title}</p>
                        <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-faint">
                          <Sparkles size={10} className="mt-0.5 shrink-0 text-accent" />
                          <span className="line-clamp-2">{s.recommendation}</span>
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </section>
      )}

      {/* ------------------------------- charts ------------------------------ */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="Incident volume over the last 14 days"
          subtitle="Reported incidents by day, split by severity band"
          actions={
            <Segmented
              size="sm"
              value={trendKey}
              onChange={setTrendKey}
              options={[{ value: 'total', label: 'All' }, { value: 'severity', label: 'Severity' }, { value: 'resolved', label: 'Resolution' }]}
            />
          }
        >
          {isLoading ? (
            <Skeleton className="h-[220px] w-full" />
          ) : (
            <TrendChart
              data={data.trend}
              keys={
                trendKey === 'total'
                  ? [{ key: 'total', label: 'Incidents', color: 'accent' }]
                  : trendKey === 'severity'
                    ? [{ key: 'critical', label: 'Critical', color: 'critical' }, { key: 'high', label: 'High', color: 'danger' }]
                    : [{ key: 'total', label: 'Reported', color: 'accent' }, { key: 'resolved', label: 'Resolved', color: 'ok' }]
              }
            />
          )}
        </Card>

        <Card title="Severity mix" subtitle="All recorded incidents">
          {isLoading ? (
            <Skeleton className="h-[200px] w-full" />
          ) : (
            <>
              <DonutChart data={data.bySeverity} centerLabel="Incidents" />
              <Legend2
                className="mt-3 justify-center"
                items={data.bySeverity.map((s) => ({
                  label: titleCase(s.name),
                  value: s.value,
                  color: { critical: 'critical', high: 'danger', medium: 'warn', low: 'accent' }[s.name],
                }))}
              />
            </>
          )}
        </Card>
      </div>

      {/* ---------------------- live board + hot sites ----------------------- */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card
          title="Live duty board"
          subtitle="Officers currently signed on"
          actions={<Link to="/shifts" className="link-action">Full roster</Link>}
          noPad
        >
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
          ) : data.liveBoard.length === 0 ? (
            <EmptyState icon={Radio} title="Nobody signed on" body="There are no shifts in progress right now." />
          ) : (
            <ul className="divide-y divide-line/60">
              {data.liveBoard.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="relative">
                    <Avatar name={s._guard?.name || 'Unassigned'} size={30} />
                    <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-ok" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-ink">{s._guard?.name}</p>
                    <p className="truncate text-[11.5px] text-faint">
                      <MapPin size={9} className="mr-0.5 inline" />{s._site?.name}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="mono text-[11.5px] font-semibold text-ink">{fmtTime(s.start)}-{fmtTime(s.end)}</p>
                    <p className="text-[10.5px] capitalize text-faint">{s.type} shift · {s.hours}h</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Hot sites"
          subtitle="Most incidents in the last 90 days"
          actions={<Link to="/sites" className="link-action">All sites</Link>}
          noPad
        >
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
          ) : (
            <ul className="divide-y divide-line/60">
              {data.siteRisk.map((s) => {
                const staffed = s.required ? Math.min(100, (s.guards / s.required) * 100) : 100
                return (
                  <li key={s.id}>
                    <Link to={`/sites/${s.id}`} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-surface2/60">
                      <SeverityDot level={s.riskLevel} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold text-ink">{s.name}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <Progress value={staffed} tone={staffed < 70 ? 'critical' : staffed < 100 ? 'warn' : 'ok'} className="w-24" />
                          <span className="mono text-[10.5px] text-faint">{s.guards}/{s.required} staffed</span>
                        </div>
                      </div>
                      <span className="mono shrink-0 rounded-md bg-surface2 px-2 py-1 text-[11.5px] font-bold text-ink">{s.incidents}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card
          title="Coverage gaps today"
          subtitle="Sites with nobody on the roster"
          actions={<Link to="/shifts" className="link-action">Roster</Link>}
          noPad
        >
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
          ) : (data.uncovered || []).length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Every site is covered" body="All active sites have officers on today's roster." />
          ) : (
            <ul className="divide-y divide-line/60">
              {data.uncovered.map((s) => (
                <li key={s.id}>
                  <Link to={`/sites/${s.id}`} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-surface2/60">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-critical/25 bg-critical/10 text-critical">
                      <Radar size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold text-ink">{s.name}</p>
                      <p className="truncate text-[11px] text-faint">{s.city} · {titleCase(s.riskLevel)} risk · {s.coverage}</p>
                    </div>
                    {s.posts > 0 && (
                      <span className="mono shrink-0 rounded-md bg-critical/12 px-2 py-1 text-[11px] font-bold text-critical">
                        {s.posts} post{s.posts === 1 ? '' : 's'}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Patrol assurance" subtitle="Checkpoint completion rate">
          {isLoading ? (
            <Skeleton className="h-[150px] w-full" />
          ) : (
            <>
              <GaugeChart
                value={data.kpis.patrolCompliance}
                label="Compliance"
                tone={data.kpis.patrolCompliance > 90 ? 'ok' : data.kpis.patrolCompliance > 75 ? 'warn' : 'critical'}
              />
              <div className="mt-2 space-y-2">
                {data.activePatrols.length === 0 ? (
                  <p className="py-2 text-center text-[12px] text-faint">No patrols in progress.</p>
                ) : (
                  data.activePatrols.map((p) => (
                    <div key={p.id} className="rounded-lg border border-line bg-surface2/50 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[12px] font-semibold text-ink">{p._site?.name}</p>
                        <Badge value="in_progress" label="Live" dot size="sm" />
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Progress value={p.checkpointsScanned} max={p.checkpointsTotal} tone="accent" className="flex-1" />
                        <span className="mono text-[10.5px] text-faint">{p.checkpointsScanned}/{p.checkpointsTotal}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* ---------------------- revenue + recent incidents -------------------- */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {!isGuard && (
          <Card className="xl:col-span-2" title="Billing performance" subtitle="Billed vs collected, last 6 periods">
            {isLoading ? <Skeleton className="h-[240px] w-full" /> : (
              <RevenueChart data={data.revenue} formatter={(v) => money(v)} />
            )}
          </Card>
        )}

        <Card
          className={isGuard ? 'xl:col-span-3' : ''}
          title="Latest incidents"
          subtitle="Newest first"
          actions={<Link to="/incidents" className="link-action">View all</Link>}
          noPad
        >
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <ul className="divide-y divide-line/60">
              {data.recentIncidents.map((i) => (
                <li key={i.id}>
                  <Link to={`/incidents/${i.id}`} className="flex items-start gap-3 px-4 py-3 transition hover:bg-surface2/60">
                    <SeverityDot level={i.severity} className="mt-1.5" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold text-ink">{i.type}</p>
                      <p className="truncate text-[11.5px] text-faint">{i._site?.name} · {i.ref}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Badge value={i.status} size="sm" />
                      <p className="mt-1 text-[10.5px] text-faint">{timeAgo(i.occurredAt)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ---------------------------- incident types -------------------------- */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Incident categories" subtitle="Top 8 by volume">
          {isLoading ? <Skeleton className="h-[240px] w-full" /> : (
            <BarsChart data={data.byType} layout="vertical" height={260} bars={[{ key: 'value', label: 'Incidents', color: 'accent' }]} />
          )}
        </Card>
        <Card title="Operational health" subtitle="Rolling indicators">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { label: 'Shift coverage', value: k?.coverage ?? 0, tone: 'ok', icon: CalendarClock },
              { label: 'Patrol compliance', value: k?.patrolCompliance ?? 0, tone: 'accent', icon: RouteIcon },
              { label: 'Officer utilisation', value: k ? Math.round((k.activeGuards / Math.max(1, k.totalGuards)) * 100) : 0, tone: 'accent2', icon: Users },
              { label: 'Sites active', value: k ? Math.round((k.activeSites / Math.max(1, k.totalSites)) * 100) : 0, tone: 'warn', icon: Building2 },
            ].map((m) => (
              <div key={m.label} className="rounded-xl border border-line bg-surface2/40 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] font-semibold text-muted">{m.label}</span>
                  <m.icon size={14} className={`text-${m.tone}`} />
                </div>
                <p className="mono mt-2 text-[22px] font-bold leading-none text-ink">{m.value}%</p>
                <Progress value={m.value} tone={m.tone} className="mt-2.5" />
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-ok/20 bg-ok/[.06] px-3 py-2">
            <CheckCircle2 size={14} className="shrink-0 text-ok" />
            <p className="text-[11.5px] text-muted">
              All control-room links healthy. Last sync {timeAgo(new Date(Date.now() - 42000))}.
            </p>
          </div>
        </Card>
      </div>
    </>
  )
}
