import React, { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, MapPin, Building2, ShieldAlert, Route as RouteIcon, Users, Package,
  AlertTriangle, Calendar, Navigation, Clock, Activity, CheckCircle2,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, Badge, Button, Avatar, Skeleton, EmptyState, Tabs, StatCard, Progress, SeverityDot } from '@/components/ui/primitives'
import { DataTable } from '@/components/ui/DataTable'
import { TrendChart } from '@/components/charts/Charts'
import PostsPanel from '@/features/PostsPanel'
import { useOne, useList } from '@/lib/hooks'
import { fmtDate, fmtDateTime, fmtTime, money, titleCase, timeAgo, duration, cn } from '@/lib/utils'

export default function SiteDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState('overview')

  const { data: s, isLoading, error } = useOne('sites', id)
  const guardsQ = useList('guards', { all: true, pageSize: 200, filters: { siteId: id } }, { enabled: !!id })
  const incQ = useList('incidents', { all: true, pageSize: 200, filters: { siteId: id }, sort: 'occurredAt', dir: 'desc' }, { enabled: !!id })
  const patrolQ = useList('patrols', { all: true, pageSize: 200, filters: { siteId: id }, sort: 'startedAt', dir: 'desc' }, { enabled: !!id })
  const shiftQ = useList('shifts', { all: true, pageSize: 300, filters: { siteId: id }, sort: 'start', dir: 'desc' }, { enabled: !!id })
  const assetQ = useList('assets', { all: true, pageSize: 200, filters: { siteId: id } }, { enabled: !!id })
  const postsQ = useList('posts', { all: true, pageSize: 100, filters: { siteId: id } }, { enabled: !!id })
  const inspQ = useList('inspections', { all: true, pageSize: 100, filters: { siteId: id }, sort: 'at', dir: 'desc' }, { enabled: !!id })

  const guards = guardsQ.data?.rows || []
  const incidents = incQ.data?.rows || []
  const patrols = patrolQ.data?.rows || []
  const shifts = shiftQ.data?.rows || []
  const assets = assetQ.data?.rows || []

  // Computed before any early return, because hooks must run in the same order on
  // every render, and the loading branch below returns early.
  const trend = React.useMemo(() => {
    const out = []
    for (let d = 13; d >= 0; d--) {
      const day = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10)
      out.push({ day: day.slice(5), total: incidents.filter((i) => i.occurredAt.slice(0, 10) === day).length })
    }
    return out
  }, [incidents])

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-96 w-full" /></div>
  if (error) return <EmptyState icon={AlertTriangle} title="Site not found" body={error.message} action={<Button icon={ArrowLeft} onClick={() => navigate('/sites')}>Back</Button>} />

  const deployed = guards.filter((g) => g.status === 'active').length
  const staffPct = s.guardsRequired ? (deployed / s.guardsRequired) * 100 : 100
  const finished = patrols.filter((p) => p.status !== 'in_progress')
  const compliance = finished.length ? Math.round((finished.filter((p) => p.status === 'complete').length / finished.length) * 100) : 0
  const openInc = incidents.filter((i) => i.status === 'open' || i.status === 'investigating')

  const tabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'posts', label: 'Posts & Orders', count: postsQ.data?.total ?? undefined },
    { value: 'roster', label: 'Roster', count: shifts.length },
    { value: 'incidents', label: 'Incidents', count: incidents.length },
    { value: 'patrols', label: 'Patrols', count: patrols.length },
    { value: 'assets', label: 'Equipment', count: assets.length },
  ]

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2.5"><SeverityDot level={s.riskLevel} className="h-3 w-3" />{s.name}</span>}
        subtitle={`${s.type} · ${s.address}, ${s.city} · ${s.code}`}
        actions={
          <>
            <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate('/sites')}>Back</Button>
            <Button
              variant="secondary"
              icon={Navigation}
              as="a"
              href={`https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lng}#map=16/${s.lat}/${s.lng}`}
              target="_blank"
              rel="noreferrer"
            >
              Map
            </Button>
          </>
        }
        tabs={<Tabs tabs={tabs} value={tab} onChange={setTab} className="mt-4" />}
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge value={s.status} dot />
          <Badge value={s.riskLevel} label={`${titleCase(s.riskLevel)} risk`} />
          <Badge value="info" tone="accent" label={s.coverage} />
          <Link to={`/clients/${s.clientId}`} className="chip border-line bg-surface2 text-muted transition hover:text-ink">
            <Building2 size={11} /> {s._client?.name}
          </Link>
        </div>
      </PageHeader>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="Officers deployed" value={`${deployed}/${s.guardsRequired}`} icon={Users} tone={staffPct < 100 ? 'warn' : 'ok'} hint={`${Math.round(staffPct)}% of requirement`} />
            <StatCard label="Open incidents" value={openInc.length} icon={ShieldAlert} tone="critical" hint={`${incidents.length} lifetime`} />
            <StatCard label="Patrol compliance" value={`${compliance}%`} icon={RouteIcon} tone={compliance > 90 ? 'ok' : 'warn'} hint={`${finished.length} tours audited`} />
            <StatCard label="Checkpoints" value={s.checkpoints} icon={CheckCircle2} tone="accent" hint="Scan points on route" />
            <StatCard label="Equipment on site" value={assets.length} icon={Package} tone="accent2" hint={money(assets.reduce((a, x) => a + x.value, 0))} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2" title="Incident volume" subtitle="Last 14 days at this site">
              <TrendChart data={trend} keys={[{ key: 'total', label: 'Incidents', color: 'accent' }]} />
            </Card>

            <Card title="Site profile">
              <div className="space-y-2.5 text-[12.5px]">
                {[
                  ['Client', s._client?.name],
                  ['Type', s.type],
                  ['City', s.city],
                  ['Coverage', s.coverage],
                  ['Risk grading', titleCase(s.riskLevel)],
                  ['Opened', fmtDate(s.openedAt)],
                  ['Coordinates', `${s.lat}, ${s.lng}`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 border-b border-line/50 pb-2 last:border-0">
                    <span className="text-muted">{k}</span>
                    <span className="truncate text-right font-medium text-ink">{v}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-[12px]">
                  <span className="text-muted">Staffing level</span>
                  <span className="mono font-semibold text-ink">{deployed}/{s.guardsRequired}</span>
                </div>
                <Progress value={Math.min(100, staffPct)} tone={staffPct < 70 ? 'critical' : staffPct < 100 ? 'warn' : 'ok'} />
              </div>
            </Card>
          </div>

          {(inspQ.data?.rows || []).length > 0 && (
            <Card
              title="Recent supervisor inspections"
              subtitle={`Average score ${Math.round((inspQ.data.rows.reduce((a, i) => a + i.score, 0) / inspQ.data.rows.length))}% across ${inspQ.data.rows.length} visits`}
              noPad
            >
              <ul className="divide-y divide-line/60">
                {inspQ.data.rows.slice(0, 5).map((i) => (
                  <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className={cn('mono grid h-9 w-12 shrink-0 place-items-center rounded-lg border text-[12px] font-bold',
                      i.score >= 90 ? 'border-ok/25 bg-ok/10 text-ok'
                        : i.score >= 75 ? 'border-warn/25 bg-warn/10 text-warn'
                        : 'border-critical/25 bg-critical/10 text-critical')}>
                      {i.score}%
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold text-ink">{i.ref}, {titleCase(i.type)}</p>
                      <p className="truncate text-[11px] text-faint">
                        {i._supervisor?.name || 'Supervisor'} · {timeAgo(i.at)}
                        {i.findings?.length ? ` · ${i.findings.length} finding${i.findings.length === 1 ? '' : 's'}` : ' · no findings'}
                      </p>
                    </div>
                    <Badge value={i.status} size="sm" dot />
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Deployed officers" subtitle={`${guards.length} on the site register`} noPad>
            {guards.length === 0 ? (
              <EmptyState icon={Users} title="No officers assigned" body="Assign officers from the personnel register." />
            ) : (
              <ul className="divide-y divide-line/60">
                {guards.map((g) => (
                  <li key={g.id}>
                    <Link to={`/guards/${g.id}`} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-surface2/60">
                      <Avatar name={g.name} size={30} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold text-ink">{g.name}</p>
                        <p className="mono truncate text-[11px] text-faint">{g.employeeNo} · {g.rank}</p>
                      </div>
                      <Badge value={g.status} size="sm" dot />
                      <span className="mono w-12 shrink-0 text-right text-[11.5px] text-muted">★{g.rating}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === 'posts' && <PostsPanel site={s} />}

      {tab === 'roster' && (
        <DataTable
          columns={[
            { key: 'date', header: 'Date', width: 130, render: (r) => <span className="mono text-[12.5px] text-ink">{fmtDate(r.start)}</span> },
            { key: 'guardId', header: 'Officer', sortable: false, render: (r) => (
              <div className="flex items-center gap-2"><Avatar name={r._guard?.name || 'Unassigned'} size={24} /><span className="truncate text-[12.5px] text-ink">{r._guard?.name}</span></div>
            ) },
            { key: 'type', header: 'Shift', width: 90, render: (r) => <Badge value={r.type === 'night' ? 'medium' : 'low'} label={titleCase(r.type)} size="sm" /> },
            { key: 'start', header: 'Window', sortable: false, width: 150, render: (r) => <span className="mono text-[12px] text-muted">{fmtTime(r.start)}-{fmtTime(r.end)}</span> },
            { key: 'hours', header: 'Hours', align: 'right', width: 80, render: (r) => <span className="mono text-[12.5px]">{r.hours}h</span> },
            { key: 'status', header: 'Status', width: 120, render: (r) => <Badge value={r.status} dot /> },
          ]}
          rows={shifts.slice(0, 50)}
          loading={shiftQ.isLoading}
          emptyIcon={Calendar} emptyTitle="No shifts rostered"
        />
      )}

      {tab === 'incidents' && (
        <DataTable
          columns={[
            { key: 'ref', header: 'Ref', width: 130, render: (r) => <span className="mono text-[12px] font-semibold text-ink">{r.ref}</span> },
            { key: 'title', header: 'Incident', render: (r) => <span className="truncate text-[12.5px] text-ink">{r.title}</span> },
            { key: 'severity', header: 'Severity', width: 100, render: (r) => <Badge value={r.severity} /> },
            { key: 'status', header: 'Status', width: 120, render: (r) => <Badge value={r.status} dot /> },
            { key: 'occurredAt', header: 'When', width: 120, render: (r) => <span className="text-[12px] text-muted">{timeAgo(r.occurredAt)}</span> },
          ]}
          rows={incidents}
          loading={incQ.isLoading}
          onRowClick={(r) => navigate(`/incidents/${r.id}`)}
          emptyIcon={ShieldAlert} emptyTitle="No incidents at this site"
        />
      )}

      {tab === 'patrols' && (
        <DataTable
          columns={[
            { key: 'ref', header: 'Tour', width: 120, render: (r) => <span className="mono text-[12px] font-semibold text-ink">{r.ref}</span> },
            { key: 'route', header: 'Route', width: 160, render: (r) => <span className="text-[12.5px] text-muted">{r.route}</span> },
            { key: 'guardId', header: 'Officer', sortable: false, render: (r) => <span className="text-[12.5px] text-ink">{r._guard?.name}</span> },
            { key: 'checkpointsScanned', header: 'Checkpoints', width: 160, render: (r) => (
              <div className="flex items-center gap-2">
                <Progress value={r.checkpointsScanned} max={r.checkpointsTotal} tone={r.checkpointsScanned === r.checkpointsTotal ? 'ok' : 'warn'} className="w-20" />
                <span className="mono text-[11.5px] text-muted">{r.checkpointsScanned}/{r.checkpointsTotal}</span>
              </div>
            ) },
            { key: 'durationMins', header: 'Duration', align: 'right', width: 100, render: (r) => <span className="mono text-[12.5px] text-muted">{duration(r.durationMins)}</span> },
            { key: 'status', header: 'Result', width: 130, render: (r) => <Badge value={r.status} dot /> },
            { key: 'startedAt', header: 'Started', width: 130, render: (r) => <span className="text-[12px] text-muted">{timeAgo(r.startedAt)}</span> },
          ]}
          rows={patrols}
          loading={patrolQ.isLoading}
          emptyIcon={RouteIcon} emptyTitle="No patrol tours recorded"
        />
      )}

      {tab === 'assets' && (
        <DataTable
          columns={[
            { key: 'tag', header: 'Asset tag', width: 130, render: (r) => <span className="mono text-[12px] font-semibold text-ink">{r.tag}</span> },
            { key: 'name', header: 'Item', render: (r) => <span className="text-[12.5px] text-ink">{r.name}</span> },
            { key: 'category', header: 'Category', width: 150, render: (r) => <span className="text-[12.5px] text-muted">{r.category}</span> },
            { key: 'assignedTo', header: 'Issued to', sortable: false, width: 180, render: (r) => <span className="text-[12.5px] text-muted">{r._guard?.name || 'Site store'}</span> },
            { key: 'condition', header: 'Condition', width: 110, render: (r) => <Badge value={r.condition} /> },
            { key: 'status', header: 'Status', width: 120, render: (r) => <Badge value={r.status} dot /> },
            { key: 'value', header: 'Value', align: 'right', width: 100, render: (r) => <span className="mono text-[12.5px]">{money(r.value)}</span> },
          ]}
          rows={assets}
          loading={assetQ.isLoading}
          emptyIcon={Package} emptyTitle="No equipment at this site"
        />
      )}
    </>
  )
}
