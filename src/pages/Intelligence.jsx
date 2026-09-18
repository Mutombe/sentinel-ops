import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Brain, RefreshCw, FileDown, AlertTriangle, ArrowRight, TrendingUp, TrendingDown,
  MapPin, Users, ShieldAlert, Route as RouteIcon, Clock, CalendarOff, Radar,
  CheckCircle2, Sparkles, Info, ListChecks, Gauge,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, StatCard, Badge, Button, Avatar, Skeleton, EmptyState, Segmented, Progress, SeverityDot } from '@/components/ui/primitives'
import { TrendChart, BarsChart } from '@/components/charts/Charts'
import { useIntelligence } from '@/lib/hooks'
import { cn, timeAgo, titleCase, num, download, toCSV } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'

const KIND_ICON = {
  incident_spike: ShieldAlert,
  repeat_pattern: ShieldAlert,
  patrol_failure: RouteIcon,
  attendance_anomaly: Clock,
  staffing_gap: Users,
  uncovered_post: Radar,
  open_critical: AlertTriangle,
  sla_trend: Gauge,
  inspection_fail: ListChecks,
  inspection_drop: TrendingDown,
  compliance_licence: AlertTriangle,
  compliance_documents: ListChecks,
  compliance_training: ListChecks,
  overdue_actions: ListChecks,
  leave_clash: CalendarOff,
}

const KIND_LABEL = {
  incident_spike: 'Incident spike',
  repeat_pattern: 'Repeat pattern',
  patrol_failure: 'Patrol compliance',
  attendance_anomaly: 'Attendance',
  staffing_gap: 'Staffing',
  uncovered_post: 'Coverage',
  open_critical: 'Escalation',
  sla_trend: 'SLA trend',
  inspection_fail: 'Inspection',
  inspection_drop: 'Inspection',
  compliance_licence: 'Licensing',
  compliance_documents: 'Personnel files',
  compliance_training: 'Training',
  overdue_actions: 'Corrective actions',
  leave_clash: 'Roster conflict',
}

function SignalCard({ s }) {
  const Icon = KIND_ICON[s.kind] || Info
  const tone = { critical: 'critical', high: 'danger', medium: 'warn', low: 'accent' }[s.severity]
  return (
    <article className={cn('rounded-xl border bg-surface p-4 transition hover:shadow-pop', `border-${tone}/25`)}>
      <div className="flex items-start gap-3">
        <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg border', `text-${tone} bg-${tone}/10 border-${tone}/20`)}>
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge value={s.severity} />
            <span className="chip border-line bg-surface2 text-faint">{KIND_LABEL[s.kind] || titleCase(s.kind)}</span>
          </div>
          <h3 className="mt-2 text-[13.5px] font-semibold leading-snug text-ink">{s.title}</h3>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{s.detail}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="mono rounded-md border border-line bg-surface2 px-2 py-1 text-[11.5px] font-semibold text-ink">
              {s.metric}
            </span>
            <span className="text-[11px] text-faint">vs</span>
            <span className="mono rounded-md border border-line bg-surface2/50 px-2 py-1 text-[11.5px] text-muted">
              {s.baseline}
            </span>
            {s.delta != null && s.delta !== 0 && (
              <span className={cn('mono inline-flex items-center gap-1 text-[11.5px] font-bold', s.delta > 0 ? 'text-critical' : 'text-ok')}>
                {s.delta > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {s.delta > 0 ? '+' : ''}{s.delta}
              </span>
            )}
          </div>

          <div className="mt-3 flex items-start gap-2 rounded-lg border border-accent/20 bg-accent/[.06] px-3 py-2">
            <Sparkles size={13} className="mt-0.5 shrink-0 text-accent" />
            <p className="text-[12px] leading-relaxed text-muted">
              <span className="font-semibold text-ink">Recommended: </span>{s.recommendation}
            </p>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className="truncate text-[11.5px] text-faint">{s.entity.name}</span>
            <Link to={s.link} className="link-action">
              Open <ArrowRight size={12} />
            </Link>
          </div>
        </div>
      </div>
    </article>
  )
}

export default function Intelligence() {
  const { data, isLoading, isFetching } = useIntelligence()
  const qc = useQueryClient()
  const toast = useToast()
  const [filter, setFilter] = useState('all')

  const signals = useMemo(() => {
    const list = data?.signals || []
    if (filter === 'all') return list
    if (filter === 'action') return list.filter((s) => s.severity === 'critical' || s.severity === 'high')
    return list.filter((s) => s.severity === filter)
  }, [data, filter])

  const counts = useMemo(() => {
    const list = data?.signals || []
    return {
      all: list.length,
      critical: list.filter((s) => s.severity === 'critical').length,
      high: list.filter((s) => s.severity === 'high').length,
      medium: list.filter((s) => s.severity === 'medium').length,
    }
  }, [data])

  const h = data?.headline

  return (
    <>
      <PageHeader
        title="Operations Intelligence"
        subtitle="What needs your attention across the portfolio this morning, and why."
        actions={
          <>
            <Button
              variant="secondary"
              icon={RefreshCw}
              loading={isFetching}
              onClick={() => qc.invalidateQueries({ queryKey: ['intelligence'] })}
            >
              Re-run
            </Button>
            <Button
              variant="secondary"
              icon={FileDown}
              onClick={() => {
                if (!data) return
                download(
                  `operational-briefing-${new Date().toISOString().slice(0, 10)}.csv`,
                  toCSV(data.signals.map((s) => ({
                    severity: s.severity, category: KIND_LABEL[s.kind] || s.kind, title: s.title,
                    metric: s.metric, baseline: s.baseline, entity: s.entity.name,
                    detail: s.detail, recommendation: s.recommendation,
                  })))
                )
                toast.success('Briefing exported')
              }}
            >
              Export briefing
            </Button>
          </>
        }
      />

      {/* ------------------------- the briefing ------------------------- */}
      <section className="relative overflow-hidden rounded-2xl border border-accent/25 bg-surface p-5 sm:p-6">
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-[0.35]" />
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent/10 blur-[80px]" />

        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-bg">
                <Brain size={19} strokeWidth={2.3} />
              </span>
              <div>
                <h2 className="text-[16px] font-bold tracking-tight text-ink">Today's Operational Intelligence</h2>
                <p className="text-[11.5px] text-faint">
                  {data ? `Generated ${timeAgo(data.generatedAt)} · ${h.signalsRaised} signals evaluated` : 'Analysing operational data…'}
                </p>
              </div>
            </div>
            {h && (
              <div className="flex items-center gap-2">
                {h.criticalSignals > 0
                  ? <Badge value="critical" label={`${h.criticalSignals} critical`} />
                  : <Badge value="active" label="Nothing critical" />}
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="mt-5 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
            </div>
          ) : (
            <div className="mt-5 space-y-2.5">
              {data.briefing.map((line, i) => (
                <p key={i} className={cn('text-[14px] leading-relaxed', i === 0 ? 'font-semibold text-ink' : 'text-muted')}>
                  {i > 0 && <span className="mr-2 inline-block h-1.5 w-1.5 -translate-y-[3px] rounded-full bg-accent/70" />}
                  {line}
                </p>
              ))}
            </div>
          )}

          {h && (
            <div className="mt-5 grid grid-cols-2 gap-2.5 border-t border-line pt-4 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { k: 'Sites needing attention', v: h.sitesNeedingAttention, tone: h.sitesNeedingAttention ? 'critical' : 'ok', to: null },
                { k: 'Missed checkpoints (24h)', v: h.missedPatrols, tone: h.missedPatrols ? 'warn' : 'ok', to: '/patrols' },
                { k: 'Late arrivals (24h)', v: h.lateArrivals, tone: h.lateArrivals ? 'warn' : 'ok', to: '/attendance' },
                { k: 'Overnight incidents', v: h.overnightIncidents, tone: h.overnightSevere ? 'critical' : 'accent', to: '/incidents' },
                { k: 'Open critical', v: h.openCritical, tone: h.openCritical ? 'critical' : 'ok', to: '/incidents' },
                { k: 'Uncovered posts', v: h.uncoveredPosts, tone: h.uncoveredPosts ? 'critical' : 'ok', to: '/shifts' },
              ].map((m) => {
                const Inner = (
                  <>
                    <p className={cn('mono text-[22px] font-bold leading-none', `text-${m.tone}`)}>{num(m.v)}</p>
                    <p className="mt-1.5 text-[10.5px] font-semibold uppercase leading-tight tracking-wide text-faint">{m.k}</p>
                  </>
                )
                return m.to ? (
                  <Link key={m.k} to={m.to} className="rounded-lg border border-line bg-bg/40 p-3 transition hover:border-faint/50">{Inner}</Link>
                ) : (
                  <div key={m.k} className="rounded-lg border border-line bg-bg/40 p-3">{Inner}</div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* --------------------------- signals ---------------------------- */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-ink">Signals</h2>
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `All ${counts.all}` },
            { value: 'action', label: `Needs action ${counts.critical + counts.high}` },
            { value: 'critical', label: `Critical ${counts.critical}` },
            { value: 'medium', label: `Medium ${counts.medium}` },
          ]}
        />
      </div>

      {isLoading ? (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
        </div>
      ) : signals.length === 0 ? (
        <Card className="mt-3">
          <EmptyState
            icon={CheckCircle2}
            title="Nothing flagged in this band"
            body="No signal in the selected severity band. Operations are running inside their normal envelope."
          />
        </Card>
      ) : (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {signals.map((s) => <SignalCard key={s.id} s={s} />)}
        </div>
      )}

      {/* -------------------------- watchlists -------------------------- */}
      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="14-day operating picture" subtitle="Incidents, patrol compliance and attendance on one axis">
          {isLoading ? <Skeleton className="h-[240px] w-full" /> : (
            <TrendChart
              data={data.trend}
              height={240}
              keys={[
                { key: 'incidents', label: 'Incidents', color: 'accent' },
                { key: 'severe', label: 'High / critical', color: 'critical' },
              ]}
            />
          )}
          {!isLoading && (
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">Patrol compliance trend</p>
                <div className="mt-1.5 flex items-end gap-[3px]">
                  {data.trend.map((d, i) => (
                    <div
                      key={i}
                      title={`${d.day}: ${d.patrolCompliance ?? 'Unspecified'}%`}
                      className={cn(
                        'flex-1 rounded-sm',
                        d.patrolCompliance == null ? 'bg-line'
                          : d.patrolCompliance >= 90 ? 'bg-ok'
                          : d.patrolCompliance >= 75 ? 'bg-warn' : 'bg-critical'
                      )}
                      style={{ height: Math.max(4, (d.patrolCompliance ?? 0) * 0.32) }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">Attendance trend</p>
                <div className="mt-1.5 flex items-end gap-[3px]">
                  {data.trend.map((d, i) => (
                    <div
                      key={i}
                      title={`${d.day}: ${d.attendance ?? 'Unspecified'}%`}
                      className={cn(
                        'flex-1 rounded-sm',
                        d.attendance == null ? 'bg-line'
                          : d.attendance >= 95 ? 'bg-ok'
                          : d.attendance >= 85 ? 'bg-warn' : 'bg-critical'
                      )}
                      style={{ height: Math.max(4, (d.attendance ?? 0) * 0.32) }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </Card>

        <Card title="Post coverage" subtitle="Active posts against today's roster">
          {isLoading ? <Skeleton className="h-[200px] w-full" /> : (
            <>
              <div className="mb-4 flex items-baseline gap-2">
                <span className="mono text-[30px] font-bold leading-none text-ink">
                  {data.coverage.totalPosts - data.coverage.uncovered}
                </span>
                <span className="text-[13px] text-muted">of {data.coverage.totalPosts} posts covered</span>
              </div>
              <Progress
                value={data.coverage.totalPosts ? ((data.coverage.totalPosts - data.coverage.uncovered) / data.coverage.totalPosts) * 100 : 100}
                tone={data.coverage.uncovered ? 'warn' : 'ok'}
              />
              <div className="mt-4 space-y-2.5">
                {data.coverage.byCriticality.map((c) => (
                  <div key={c.name}>
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span className="flex items-center gap-1.5 text-muted">
                        <SeverityDot level={c.name === 'critical' ? 'critical' : c.name === 'important' ? 'medium' : 'low'} />
                        {titleCase(c.name)} posts
                      </span>
                      <span className="mono font-semibold text-ink">{c.total - c.uncovered}/{c.total}</span>
                    </div>
                    <Progress
                      value={c.total ? ((c.total - c.uncovered) / c.total) * 100 : 100}
                      tone={c.uncovered ? (c.name === 'critical' ? 'critical' : 'warn') : 'ok'}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Site watchlist" subtitle="Ranked by composite risk score across all signals" noPad>
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : data.watchSites.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="No sites on the watchlist" body="No site triggered a signal in this cycle." />
          ) : (
            <ul className="divide-y divide-line/60">
              {data.watchSites.map((s, i) => (
                <li key={s.id}>
                  <Link to={`/sites/${s.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface2/60">
                    <span className="mono w-5 shrink-0 text-center text-[12px] font-bold text-faint">{i + 1}</span>
                    <SeverityDot level={s.riskLevel} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold text-ink">{s.name}</p>
                      <p className="truncate text-[11px] text-faint">
                        {s.incidents14} incidents / 14d · {s.staffed}/{s.required} staffed · {s.reasons.map((r) => KIND_LABEL[r] || r).join(', ')}
                      </p>
                    </div>
                    <span className="mono shrink-0 rounded-md bg-critical/12 px-2 py-1 text-[11.5px] font-bold text-critical">{s.score}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Officer watchlist" subtitle="Attendance and performance outliers" noPad>
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : data.watchGuards.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="No officers on the watchlist" body="Attendance and performance are inside normal ranges." />
          ) : (
            <ul className="divide-y divide-line/60">
              {data.watchGuards.map((g, i) => (
                <li key={g.id}>
                  <Link to={`/guards/${g.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface2/60">
                    <span className="mono w-5 shrink-0 text-center text-[12px] font-bold text-faint">{i + 1}</span>
                    <Avatar name={g.name} size={28} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold text-ink">{g.name}</p>
                      <p className="truncate text-[11px] text-faint">
                        {g.rank} · {g.late} late, {g.absent} absent across {g.shifts} shifts
                      </p>
                    </div>
                    <span className="mono shrink-0 rounded-md bg-warn/12 px-2 py-1 text-[11.5px] font-bold text-warn">{g.score}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {data && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-line bg-surface2/40 px-4 py-3">
          <Info size={15} className="mt-0.5 shrink-0 text-faint" />
          <p className="text-[11.5px] leading-relaxed text-muted">
            <span className="font-semibold text-ink">How this is produced: </span>{data.method}
          </p>
        </div>
      )}
    </>
  )
}
