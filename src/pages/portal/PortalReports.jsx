import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  FileText, FileDown, DollarSign, Timer, HeartPulse, BarChart3, ShieldCheck,
  Gauge, Route as RouteIcon, ClipboardCheck, CheckCircle2, Printer, CalendarDays,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, StatCard, Button, Segmented, Skeleton, EmptyState, Badge, Progress } from '@/components/ui/primitives'
import { TrendChart, BarsChart, DonutChart, Legend2 } from '@/components/charts/Charts'
import { api } from '@/lib/api'
import { qk, useList } from '@/lib/hooks'
import { money, num, titleCase, download, toCSV, fmtDate, pct } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'

export default function PortalReports() {
  const [range, setRange] = useState(90)
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const toast = useToast()

  const incQ = useList('incidents', { all: true, pageSize: 500 })
  const patQ = useList('patrols', { all: true, pageSize: 500 })
  const attQ = useList('attendance', { all: true, pageSize: 2000 })
  const inspQ = useList('inspections', { all: true, pageSize: 300 })
  const cliQ = useList('clients', { all: true, pageSize: 10 })
  const monthLoading = incQ.isLoading || patQ.isLoading || attQ.isLoading || inspQ.isLoading

  const months = useMemo(() => {
    const out = []
    const d = new Date()
    for (let i = 0; i < 6; i++) {
      out.push(new Date(d.getFullYear(), d.getMonth() - i, 1).toISOString().slice(0, 7))
    }
    return out
  }, [])

  const monthLabel = useMemo(
    () => new Date(month + '-02').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    [month]
  )

  const inMonth = (iso) => iso && iso.slice(0, 7) === month
  const monthIncidents = (incQ.data?.rows || []).filter((i) => inMonth(i.occurredAt))
  const monthPatrols = (patQ.data?.rows || []).filter((p) => inMonth(p.startedAt) && p.status !== 'in_progress')
  const monthAtt = (attQ.data?.rows || []).filter((a) => inMonth(a.date))
  const monthInsp = (inspQ.data?.rows || []).filter((i) => inMonth(i.at))
  const monthLoss = monthIncidents.reduce((a, i) => a + (i.lossValue || 0), 0)
  const slaTarget = cliQ.data?.rows?.[0]?.slaResponseMins ?? 30

  const scorecard = useMemo(() => {
    const patrolPct = monthPatrols.length
      ? Math.round((monthPatrols.filter((p) => p.status === 'complete').length / monthPatrols.length) * 100)
      : 100
    const attPct = monthAtt.length
      ? Math.round((monthAtt.filter((a) => a.status !== 'absent').length / monthAtt.length) * 100)
      : 100
    const punctualPct = monthAtt.length
      ? Math.round((monthAtt.filter((a) => a.status === 'present' || a.status === 'on_duty').length / monthAtt.length) * 100)
      : 100
    const slaPct = monthIncidents.length
      ? Math.round((monthIncidents.filter((i) => (new Date(i.reportedAt) - new Date(i.occurredAt)) / 60000 <= slaTarget).length / monthIncidents.length) * 100)
      : 100
    const inspPct = monthInsp.length
      ? Math.round(monthInsp.reduce((a, i) => a + i.score, 0) / monthInsp.length)
      : null
    const resolvedPct = monthIncidents.length
      ? Math.round((monthIncidents.filter((i) => i.status === 'resolved' || i.status === 'closed').length / monthIncidents.length) * 100)
      : 100

    const rows = [
      { metric: 'Patrol route compliance', icon: RouteIcon, targetN: 95, pct: patrolPct, target: '≥ 95%', achieved: patrolPct + '%' },
      { metric: 'Officer attendance', icon: CheckCircle2, targetN: 98, pct: attPct, target: '≥ 98%', achieved: attPct + '%' },
      { metric: 'Punctuality', icon: Timer, targetN: 90, pct: punctualPct, target: '≥ 90%', achieved: punctualPct + '%' },
      { metric: `Incident reported within ${slaTarget} min`, icon: ShieldCheck, targetN: 90, pct: slaPct, target: '≥ 90%', achieved: slaPct + '%' },
      { metric: 'Incidents resolved in period', icon: BarChart3, targetN: 85, pct: resolvedPct, target: '≥ 85%', achieved: resolvedPct + '%' },
    ]
    if (inspPct != null) {
      rows.push({ metric: 'Supervisor inspection score', icon: ClipboardCheck, targetN: 90, pct: inspPct, target: '≥ 90%', achieved: inspPct + '%' })
    }
    return rows.map((r) => ({ ...r, met: r.pct >= r.targetN }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, incQ.data, patQ.data, attQ.data, inspQ.data, slaTarget])

  const overall = scorecard.length ? Math.round(scorecard.reduce((a, r) => a + Math.min(100, r.pct), 0) / scorecard.length) : 0
  const overallTone = overall >= 95 ? 'ok' : overall >= 85 ? 'warn' : 'critical'

  const { data, isLoading } = useQuery({
    queryKey: qk.reports(range),
    queryFn: () => api.reportData(range),
    staleTime: 30_000,
  })

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Board-ready summaries of security performance across your contract."
        actions={
          <>
            <Segmented
              value={String(range)}
              onChange={(v) => setRange(+v)}
              options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '180', label: '6 months' }]}
            />
            <Button
              variant="secondary"
              icon={FileDown}
              onClick={() => {
                if (!data) return
                download(`security-report-${range}d.csv`, toCSV(data.weekly))
                toast.success('Report downloaded')
              }}
            >
              Download
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Incidents" value={data ? num(data.totals.incidents) : ''} loading={isLoading} icon={BarChart3} tone="accent" hint={`Last ${range} days`} />
        <StatCard label="Loss exposure" value={data ? money(data.totals.loss) : ''} loading={isLoading} icon={DollarSign} tone="warn" hint="Value of goods and damage" />
        <StatCard label="SLA breaches" value={data ? num(data.totals.slaBreaches) : ''} loading={isLoading} icon={Timer} tone="critical" hint="Reported outside target window" />
        <StatCard label="Injuries" value={data ? num(data.totals.injuries) : ''} loading={isLoading} icon={HeartPulse} tone="accent2" hint="People harmed on your sites" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Incidents reported vs resolved" subtitle="By week">
          {isLoading ? <Skeleton className="h-[240px] w-full" /> : data.weekly.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="A clean period" body="No incidents were recorded at your sites in this window." />
          ) : (
            <TrendChart
              data={data.weekly}
              height={240}
              keys={[{ key: 'incidents', label: 'Reported', color: 'accent' }, { key: 'resolved', label: 'Resolved', color: 'ok' }]}
            />
          )}
        </Card>

        <Card title="Report latency" subtitle="Occurrence to written report">
          {isLoading ? <Skeleton className="h-[200px] w-full" /> : (
            <>
              <DonutChart
                data={data.responseBuckets}
                colorMap={{ '< 15m': 'ok', '15 to 30m': 'accent', '30 to 60m': 'warn', '1 to 4h': 'danger', '> 4h': 'critical' }}
                centerLabel="Incidents"
              />
              <Legend2
                className="mt-3 justify-center"
                items={data.responseBuckets.map((b) => ({
                  label: b.name, value: b.value,
                  color: { '< 15m': 'ok', '15 to 30m': 'accent', '30 to 60m': 'warn', '1 to 4h': 'danger', '> 4h': 'critical' }[b.name],
                }))}
              />
            </>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Loss value by week" subtitle="Financial exposure recorded on your sites">
          {isLoading ? <Skeleton className="h-[220px] w-full" /> : (
            <BarsChart
              data={(data.weekly || []).map((w) => ({ name: w.week, value: Math.round(w.loss) }))}
              height={220}
              bars={[{ key: 'value', label: 'Loss', color: 'warn' }]}
              formatter={(v) => money(v)}
            />
          )}
        </Card>

        <Card title="Attendance assurance" subtitle="Officer punctuality on your sites">
          {isLoading ? <Skeleton className="h-[220px] w-full" /> : (
            <BarsChart
              data={data.attStats.map((a) => ({ name: titleCase(a.name), value: a.value }))}
              height={220}
              bars={[{ key: 'value', label: 'Shifts', color: 'accent2' }]}
            />
          )}
        </Card>
      </div>

      {/* ------------------- monthly performance report ------------------- */}
      <Card
        className="mt-4"
        title="Monthly performance report"
        subtitle="The service levels we committed to, and how we performed against them"
        actions={
          <div className="flex items-center gap-2">
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-8 rounded-md border border-line bg-surface2 px-2 text-[12px] text-ink outline-none focus:border-accent/60"
            >
              {months.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <Button size="sm" variant="secondary" icon={Printer} onClick={() => window.print()}>Print</Button>
            <Button
              size="sm" variant="secondary" icon={FileDown}
              onClick={() => { download(`performance-${month}.csv`, toCSV(scorecard)); toast.success('Report downloaded') }}
            >
              CSV
            </Button>
          </div>
        }
      >
        {monthLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-xl border border-line bg-surface2/40 p-3.5">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">Reporting period</p>
                <p className="mt-1 text-[15px] font-bold text-ink">{monthLabel}</p>
                <p className="mt-1 text-[11.5px] text-faint">{monthIncidents.length} incidents · {monthPatrols.length} patrol tours</p>
              </div>
              <div className="rounded-xl border border-line bg-surface2/40 p-3.5">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">Overall service score</p>
                <p className={`mono mt-1 text-[24px] font-bold leading-none text-${overallTone}`}>{overall}%</p>
                <Progress value={overall} tone={overallTone} className="mt-2" />
              </div>
              <div className="rounded-xl border border-line bg-surface2/40 p-3.5">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">Targets met</p>
                <p className="mono mt-1 text-[24px] font-bold leading-none text-ink">
                  {scorecard.filter((r) => r.met).length}/{scorecard.length}
                </p>
                <p className="mt-1 text-[11.5px] text-faint">Contracted service levels</p>
              </div>
              <div className="rounded-xl border border-line bg-surface2/40 p-3.5">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">Loss recorded</p>
                <p className="mono mt-1 text-[24px] font-bold leading-none text-ink">{money(monthLoss)}</p>
                <p className="mt-1 text-[11.5px] text-faint">Across all your sites</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[560px]">
                <thead className="bg-surface2/70">
                  <tr>
                    <th className="th">Service level</th>
                    <th className="th">Target</th>
                    <th className="th">Achieved</th>
                    <th className="th w-40">Performance</th>
                    <th className="th text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {scorecard.map((r) => (
                    <tr key={r.metric} className="border-t border-line/70">
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <r.icon size={14} className="shrink-0 text-faint" />
                          <span className="text-[12.5px] font-medium text-ink">{r.metric}</span>
                        </div>
                      </td>
                      <td className="td mono text-[12.5px] text-muted">{r.target}</td>
                      <td className="td mono text-[12.5px] font-semibold text-ink">{r.achieved}</td>
                      <td className="td">
                        <Progress value={r.pct} tone={r.met ? 'ok' : r.pct > 80 ? 'warn' : 'critical'} />
                      </td>
                      <td className="td text-right">
                        <Badge value={r.met ? 'resolved' : 'open'} label={r.met ? 'Met' : 'Below target'} size="sm" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-[11.5px] leading-relaxed text-faint">
              Figures are calculated from the same operational records you can inspect elsewhere in this portal:
              incident reports, patrol checkpoint scans, biometric clock-ins and signed supervisor inspections.
            </p>
          </>
        )}
      </Card>

      <Card className="mt-4" title="What is in this report">
        <ul className="grid gap-3 sm:grid-cols-2">
          {[
            ['Incident throughput', 'Every event reported at your sites, and how many of them were closed out within the same period.'],
            ['Report latency', 'How quickly an event became a written report, our proxy for how fast the site responded.'],
            ['Loss exposure', 'The value of goods, cash and damage recorded against incidents on your contract.'],
            ['Attendance assurance', 'Officer punctuality and coverage, measured from biometric and geofenced clock-ins.'],
          ].map(([t2, d]) => (
            <li key={t2} className="flex gap-2.5">
              <FileText size={15} className="mt-0.5 shrink-0 text-accent" />
              <div>
                <p className="text-[12.5px] font-semibold text-ink">{t2}</p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{d}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}
