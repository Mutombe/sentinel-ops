import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, FileDown, AlertTriangle, DollarSign, HeartPulse, Timer, Star } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, StatCard, Badge, Button, Segmented, Skeleton, Avatar, Progress, EmptyState } from '@/components/ui/primitives'
import { DataTable } from '@/components/ui/DataTable'
import { TrendChart, BarsChart, DonutChart, Legend2 } from '@/components/charts/Charts'
import { api } from '@/lib/api'
import { qk } from '@/lib/hooks'
import { money, num, titleCase, download, toCSV, pct } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/auth/AuthContext'

export default function Reports() {
  const [range, setRange] = useState(90)
  const toast = useToast()
  const { isClient } = useAuth()

  const { data, isLoading } = useQuery({
    queryKey: qk.reports(range),
    queryFn: () => api.reportData(range),
    staleTime: 30_000,
  })

  const exportAll = () => {
    if (!data) return
    download(`operations-report-${range}d.csv`, toCSV(data.byClient))
    toast.success('Report exported', { body: `${data.byClient.length} client rows written to CSV.` })
  }

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Operational performance, loss exposure and commercial insight."
        actions={
          <>
            <Segmented
              value={String(range)}
              onChange={(v) => setRange(+v)}
              options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '180', label: '6 months' }]}
            />
            <Button variant="secondary" icon={FileDown} onClick={exportAll}>Export</Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Incidents" value={data ? num(data.totals.incidents) : ''} loading={isLoading} icon={BarChart3} tone="accent" hint={`Last ${range} days`} />
        <StatCard label="Loss exposure" value={data ? money(data.totals.loss) : ''} loading={isLoading} icon={DollarSign} tone="warn" hint="Value of goods and damage" />
        <StatCard label="SLA breaches" value={data ? num(data.totals.slaBreaches) : ''} loading={isLoading} icon={Timer} tone="critical" hint="Reported later than target" />
        <StatCard label="Injuries recorded" value={data ? num(data.totals.injuries) : ''} loading={isLoading} icon={HeartPulse} tone="accent2" hint="People harmed on duty" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Weekly incident throughput" subtitle="Reported vs resolved by week">
          {isLoading ? <Skeleton className="h-[240px] w-full" /> : data.weekly.length === 0 ? (
            <EmptyState icon={BarChart3} title="No data in this window" />
          ) : (
            <TrendChart
              data={data.weekly}
              height={240}
              keys={[{ key: 'incidents', label: 'Reported', color: 'accent' }, { key: 'resolved', label: 'Resolved', color: 'ok' }]}
            />
          )}
        </Card>

        <Card title="Report latency" subtitle="Time from occurrence to report">
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
        <Card title="Loss value by week" subtitle="Recorded financial exposure">
          {isLoading ? <Skeleton className="h-[220px] w-full" /> : (
            <BarsChart
              data={(data.weekly || []).map((w) => ({ name: w.week, value: Math.round(w.loss) }))}
              height={220}
              bars={[{ key: 'value', label: 'Loss', color: 'warn' }]}
              formatter={(v) => money(v)}
            />
          )}
        </Card>

        <Card title="Attendance quality" subtitle="Across all recorded shifts">
          {isLoading ? <Skeleton className="h-[220px] w-full" /> : (
            <>
              <BarsChart
                data={data.attStats.map((a) => ({ name: titleCase(a.name), value: a.value }))}
                height={220}
                bars={[{ key: 'value', label: 'Records', color: 'accent2' }]}
              />
            </>
          )}
        </Card>
      </div>

      {!isClient && (
        <Card className="mt-4" title="Top performing officers" subtitle="Ranked by supervisor rating and incidents handled" noPad>
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : (
            <ul className="divide-y divide-line/60">
              {data.topOfficers.map((o, i) => (
                <li key={o.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="mono w-6 shrink-0 text-center text-[12px] font-bold text-faint">{i + 1}</span>
                  <Avatar name={o.name} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-ink">{o.name}</p>
                    <p className="truncate text-[11px] text-faint">{o.rank}</p>
                  </div>
                  <div className="hidden w-40 sm:block">
                    <Progress value={(o.rating / 5) * 100} tone={o.rating >= 4.5 ? 'ok' : 'accent'} />
                  </div>
                  <span className="mono flex w-14 shrink-0 items-center justify-end gap-1 text-[12.5px] font-bold text-ink">
                    <Star size={11} className="fill-warn text-warn" />{o.rating}
                  </span>
                  <span className="mono w-20 shrink-0 text-right text-[11.5px] text-muted">{o.incidents} inc.</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <div className="mt-4">
        <h3 className="mb-3 text-[15px] font-semibold text-ink">Client performance</h3>
        <DataTable
          columns={[
            { key: 'name', header: 'Client', render: (r) => (
              <div className="flex items-center gap-2.5">
                <Avatar name={r.name} size={26} />
                <span className="truncate text-[12.5px] font-semibold text-ink">{r.name}</span>
              </div>
            ) },
            { key: 'tier', header: 'Tier', width: 100, render: (r) => <Badge value={r.tier} /> },
            { key: 'sites', header: 'Sites', align: 'right', width: 80, render: (r) => <span className="mono text-[12.5px]">{r.sites}</span> },
            { key: 'incidents', header: 'Incidents', align: 'right', width: 100, render: (r) => <span className="mono text-[12.5px]">{r.incidents}</span> },
            { key: 'critical', header: 'Critical', align: 'right', width: 90, render: (r) => (
              <span className={`mono text-[12.5px] ${r.critical ? 'font-bold text-critical' : 'text-faint'}`}>{r.critical || ''}</span>
            ) },
            { key: 'billed', header: 'Billed', align: 'right', width: 120, render: (r) => <span className="mono text-[12.5px] font-semibold text-ink">{money(r.billed)}</span> },
            { key: 'satisfaction', header: 'CSAT', align: 'right', width: 90, render: (r) => (
              <span className="mono inline-flex items-center gap-1 text-[12.5px]">
                <Star size={11} className={r.satisfaction >= 4 ? 'fill-warn text-warn' : 'text-faint'} />{r.satisfaction}
              </span>
            ) },
          ]}
          rows={data?.byClient || []}
          loading={isLoading}
          emptyIcon={BarChart3} emptyTitle="No client data"
        />
      </div>
    </>
  )
}
