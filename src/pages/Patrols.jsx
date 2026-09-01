import React, { useState } from 'react'
import { Route as RouteIcon, CheckCircle2, AlertTriangle, Radio, Clock, MapPin } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { DataTable } from '@/components/ui/DataTable'
import { Toolbar, FilterSelect } from '@/components/ui/Toolbar'
import { Drawer } from '@/components/ui/Modal'
import { Badge, Button, Avatar, Progress, StatCard, Card, EmptyState, Skeleton } from '@/components/ui/primitives'
import { useNavigate } from 'react-router-dom'
import { useList, useTableState } from '@/lib/hooks'
import { fmtDateTime, timeAgo, duration, titleCase, cn } from '@/lib/utils'
import { hrefFor } from '@/lib/records'

const ROUTES = ['Perimeter Loop', 'Internal Sweep', 'Roof & Plant', 'Parking Levels', 'Full Site Round']
const STATUSES = ['complete', 'exceptions', 'in_progress']

function PatrolDrawer({ patrol, onClose }) {
  if (!patrol) return null
  const pct = (patrol.checkpointsScanned / patrol.checkpointsTotal) * 100
  const missed = patrol.checkpointsTotal - patrol.checkpointsScanned

  return (
    <Drawer
      open={!!patrol}
      onClose={onClose}
      title={`Patrol ${patrol.ref}`}
      subtitle={`${patrol.route} · ${patrol._site?.name}`}
      badge={<Badge value={patrol.status} dot />}
      width="max-w-xl"
    >
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-line bg-surface2/50 p-3.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">Checkpoints</p>
            <p className="mono mt-1 text-[22px] font-bold leading-none text-ink">{patrol.checkpointsScanned}/{patrol.checkpointsTotal}</p>
            <Progress value={pct} tone={pct === 100 ? 'ok' : pct > 70 ? 'warn' : 'critical'} className="mt-2.5" />
          </div>
          <div className="rounded-xl border border-line bg-surface2/50 p-3.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">Duration</p>
            <p className="mono mt-1 text-[22px] font-bold leading-none text-ink">{duration(patrol.durationMins)}</p>
            <p className="mt-2 text-[11.5px] text-faint">{patrol.completedAt ? 'Tour closed' : 'Currently in progress'}</p>
          </div>
        </div>

        <Card title="Checkpoint scan log" noPad>
          <ul className="divide-y divide-line/60">
            {Array.from({ length: patrol.checkpointsTotal }).map((_, i) => {
              const scanned = i < patrol.checkpointsScanned
              const at = new Date(new Date(patrol.startedAt).getTime() + i * 4.5 * 60000)
              return (
                <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full', scanned ? 'bg-ok/12 text-ok' : 'bg-critical/10 text-critical')}>
                    {scanned ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-medium text-ink">Checkpoint {String(i + 1).padStart(2, '0')}</p>
                    <p className="text-[11px] text-faint">
                      {scanned ? `NFC tag scanned · ${at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Not scanned, exception raised'}
                    </p>
                  </div>
                  <Badge value={scanned ? 'complete' : 'critical'} label={scanned ? 'Scanned' : 'Missed'} size="sm" />
                </li>
              )
            })}
          </ul>
        </Card>

        <Card title="Tour details">
          <div className="space-y-2 text-[12.5px]">
            {[
              ['Officer', patrol._guard?.name],
              ['Site', patrol._site?.name],
              ['Client', patrol._client?.name],
              ['Route', patrol.route],
              ['Started', fmtDateTime(patrol.startedAt)],
              ['Completed', patrol.completedAt ? fmtDateTime(patrol.completedAt) : 'In progress'],
              ['Exceptions', missed ? `${missed} checkpoint${missed > 1 ? 's' : ''} missed` : 'None'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-line/50 pb-2 last:border-0">
                <span className="text-muted">{k}</span>
                <span className="truncate text-right font-medium text-ink">{v}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Drawer>
  )
}

export default function Patrols() {
  const navigate = useNavigate()
  const t = useTableState({ sort: 'startedAt', dir: 'desc' })
  const [open, setOpen] = useState(null)

  const query = useList('patrols', { ...t.params, facet: 'status' })
  const allQ = useList('patrols', { all: true, pageSize: 500 })

  const all = allQ.data?.rows || []
  const finished = all.filter((p) => p.status !== 'in_progress')
  const compliance = finished.length ? Math.round((finished.filter((p) => p.status === 'complete').length / finished.length) * 100) : 0
  const live = all.filter((p) => p.status === 'in_progress')
  const exceptions = finished.filter((p) => p.status === 'exceptions')
  const avgDuration = finished.length ? Math.round(finished.reduce((a, p) => a + (p.durationMins || 0), 0) / finished.length) : 0

  const columns = [
    { key: 'ref', header: 'Tour', width: 120, render: (r) => <span className="mono text-[12px] font-semibold text-ink">{r.ref}</span> },
    {
      key: 'siteId', header: 'Site', sortable: false,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-semibold text-ink">{r._site?.name}</p>
          <p className="truncate text-[11px] text-faint">{r._client?.name}</p>
        </div>
      ),
    },
    { key: 'route', header: 'Route', width: 160, render: (r) => <span className="text-[12.5px] text-muted">{r.route}</span> },
    {
      key: 'guardId', header: 'Officer', sortable: false, width: 180,
      render: (r) => (
        <div className="flex items-center gap-2">
          <Avatar name={r._guard?.name || 'Unassigned'} size={24} />
          <span className="truncate text-[12.5px] text-muted">{r._guard?.name}</span>
        </div>
      ),
    },
    {
      key: 'checkpointsScanned', header: 'Checkpoints', width: 160,
      render: (r) => (
        <div className="flex items-center gap-2">
          <Progress
            value={r.checkpointsScanned} max={r.checkpointsTotal}
            tone={r.status === 'in_progress' ? 'accent' : r.checkpointsScanned === r.checkpointsTotal ? 'ok' : 'critical'}
            className="w-20"
          />
          <span className="mono text-[11.5px] text-muted">{r.checkpointsScanned}/{r.checkpointsTotal}</span>
        </div>
      ),
    },
    { key: 'durationMins', header: 'Duration', align: 'right', width: 100, render: (r) => <span className="mono text-[12.5px] text-muted">{duration(r.durationMins)}</span> },
    { key: 'status', header: 'Result', width: 130, render: (r) => <Badge value={r.status} dot /> },
    { key: 'startedAt', header: 'Started', width: 130, render: (r) => <span className="text-[12px] text-muted">{timeAgo(r.startedAt)}</span> },
  ]

  return (
    <>
      <PageHeader
        title="Patrol Tours"
        subtitle="Checkpoint scan assurance, proof of presence for every guarded round."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Compliance rate" value={`${compliance}%`} icon={CheckCircle2} tone={compliance > 90 ? 'ok' : 'warn'} loading={allQ.isLoading} hint={`${finished.length} tours audited`} />
        <StatCard label="Live tours" value={live.length} icon={Radio} tone="accent" loading={allQ.isLoading} hint="Officers walking now" />
        <StatCard label="Exception tours" value={exceptions.length} icon={AlertTriangle} tone="critical" loading={allQ.isLoading} hint={`${exceptions.reduce((a, p) => a + p.exceptions, 0)} missed checkpoints`} />
        <StatCard label="Average duration" value={duration(avgDuration)} icon={Clock} tone="accent2" loading={allQ.isLoading} hint="Per completed tour" />
      </div>

      {live.length > 0 && (
        <Card className="mb-4" title="Tours in progress" subtitle="Live checkpoint feed" noPad>
          <ul className="divide-y divide-line/60">
            {live.slice(0, 6).map((p) => (
              <li key={p.id}>
                <button onClick={() => navigate(hrefFor('patrols', p.id))} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface2/60">
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-ok" />
                  </span>
                  <Avatar name={p._guard?.name || 'Unassigned'} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-ink">{p._guard?.name}</p>
                    <p className="truncate text-[11px] text-faint"><MapPin size={9} className="mr-0.5 inline" />{p._site?.name} · {p.route}</p>
                  </div>
                  <div className="w-40 shrink-0">
                    <Progress value={p.checkpointsScanned} max={p.checkpointsTotal} tone="accent" showLabel />
                  </div>
                  <span className="mono w-16 shrink-0 text-right text-[11.5px] text-faint">{timeAgo(p.startedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Toolbar
        q={t.q} onQ={t.setQ}
        placeholder="Search tour reference or route…"
        activeFilters={t.activeFilters} onReset={t.reset}
        exportName="patrols"
        exportRows={() => (query.data?.rows || []).map((r) => ({
          ref: r.ref, site: r._site?.name, client: r._client?.name, officer: r._guard?.name,
          route: r.route, scanned: r.checkpointsScanned, total: r.checkpointsTotal,
          status: r.status, startedAt: r.startedAt, durationMins: r.durationMins,
        }))}
        filters={
          <>
            <FilterSelect label="Result" value={t.filters.status} onChange={(v) => t.setFilter('status', v)} options={STATUSES} />
            <FilterSelect label="Route" value={t.filters.route} onChange={(v) => t.setFilter('route', v)} options={ROUTES} />
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={query.data?.rows || []}
        loading={query.isLoading} fetching={query.isFetching}
        sort={query.data?.sort} dir={query.data?.dir} onSort={t.toggleSort}
        page={query.data?.page} pageCount={query.data?.pageCount} pageSize={t.pageSize}
        total={query.data?.total} from={query.data?.from} to={query.data?.to}
        onPage={t.setPage} onPageSize={t.setPageSize}
        onRowClick={(r) => navigate(hrefFor('patrols', r.id))}
        emptyIcon={RouteIcon} emptyTitle="No patrol tours found"
      />

      <PatrolDrawer patrol={open} onClose={() => setOpen(null)} />
    </>
  )
}
