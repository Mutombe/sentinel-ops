import React, { useState } from 'react'
import { Route as RouteIcon, CheckCircle2, AlertTriangle, Radio, Clock } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { DataTable } from '@/components/ui/DataTable'
import { Toolbar, FilterSelect } from '@/components/ui/Toolbar'
import { Modal } from '@/components/ui/Modal'
import { Badge, Button, Avatar, Progress, StatCard, Card } from '@/components/ui/primitives'
import { GaugeChart } from '@/components/charts/Charts'
import { useList, useTableState } from '@/lib/hooks'
import { fmtDateTime, timeAgo, duration, titleCase, cn } from '@/lib/utils'

export default function PortalPatrols() {
  const t = useTableState({ sort: 'startedAt', dir: 'desc' })
  const [open, setOpen] = useState(null)

  const query = useList('patrols', { ...t.params, facet: 'status' })
  const allQ = useList('patrols', { all: true, pageSize: 500 })

  const all = allQ.data?.rows || []
  const finished = all.filter((p) => p.status !== 'in_progress')
  const compliance = finished.length ? Math.round((finished.filter((p) => p.status === 'complete').length / finished.length) * 100) : 0
  const live = all.filter((p) => p.status === 'in_progress')
  const exceptions = finished.filter((p) => p.status === 'exceptions')

  const columns = [
    { key: 'ref', header: 'Tour', width: 120, render: (r) => <span className="mono text-[12px] font-semibold text-ink">{r.ref}</span> },
    { key: 'siteId', header: 'Site', sortable: false, render: (r) => <span className="truncate text-[12.5px] text-ink">{r._site?.name}</span> },
    { key: 'route', header: 'Route', width: 160, render: (r) => <span className="text-[12.5px] text-muted">{r.route}</span> },
    {
      key: 'checkpointsScanned', header: 'Checkpoints', width: 160,
      render: (r) => (
        <div className="flex items-center gap-2">
          <Progress
            value={r.checkpointsScanned} max={r.checkpointsTotal}
            tone={r.status === 'in_progress' ? 'accent' : r.checkpointsScanned === r.checkpointsTotal ? 'ok' : 'critical'}
            className="w-24"
          />
          <span className="mono text-[11.5px] text-muted">{r.checkpointsScanned}/{r.checkpointsTotal}</span>
        </div>
      ),
    },
    { key: 'durationMins', header: 'Duration', align: 'right', width: 100, render: (r) => <span className="mono text-[12.5px] text-muted">{duration(r.durationMins)}</span> },
    { key: 'status', header: 'Result', width: 130, render: (r) => <Badge value={r.status} dot /> },
    { key: 'startedAt', header: 'Started', width: 140, render: (r) => <span className="text-[12.5px] text-muted">{fmtDateTime(r.startedAt).split(' · ')[0]}</span> },
  ]

  return (
    <>
      <PageHeader
        title="Patrol Assurance"
        subtitle="Independent proof that every round was walked, checkpoint by checkpoint."
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-1" title="Compliance">
          <GaugeChart value={compliance} label="Checkpoints" tone={compliance > 90 ? 'ok' : compliance > 75 ? 'warn' : 'critical'} />
        </Card>
        <div className="grid grid-cols-2 gap-3 lg:col-span-3 lg:grid-cols-3">
          <StatCard label="Tours logged" value={all.length} icon={RouteIcon} tone="accent" loading={allQ.isLoading} hint="Across your sites" />
          <StatCard label="Live now" value={live.length} icon={Radio} tone="ok" loading={allQ.isLoading} hint="Officers walking a route" />
          <StatCard label="Exceptions" value={exceptions.length} icon={AlertTriangle} tone="critical" loading={allQ.isLoading}
            hint={`${exceptions.reduce((a, p) => a + p.exceptions, 0)} checkpoints missed`} />
          <StatCard label="Complete tours" value={finished.filter((p) => p.status === 'complete').length} icon={CheckCircle2} tone="ok" loading={allQ.isLoading} />
          <StatCard
            label="Average duration"
            value={duration(finished.length ? Math.round(finished.reduce((a, p) => a + (p.durationMins || 0), 0) / finished.length) : 0)}
            icon={Clock} tone="accent2" loading={allQ.isLoading}
          />
          <StatCard label="Sites patrolled" value={new Set(all.map((p) => p.siteId)).size} icon={RouteIcon} tone="warn" loading={allQ.isLoading} />
        </div>
      </div>

      <Toolbar
        q={t.q} onQ={t.setQ}
        placeholder="Search tour reference or route…"
        activeFilters={t.activeFilters} onReset={t.reset}
        exportName="patrol-assurance"
        exportRows={() => (query.data?.rows || []).map((r) => ({
          ref: r.ref, site: r._site?.name, route: r.route, scanned: r.checkpointsScanned,
          total: r.checkpointsTotal, status: r.status, startedAt: r.startedAt, durationMins: r.durationMins,
        }))}
        filters={<FilterSelect label="Result" value={t.filters.status} onChange={(v) => t.setFilter('status', v)} options={['complete', 'exceptions', 'in_progress']} />}
      />

      <DataTable
        columns={columns}
        rows={query.data?.rows || []}
        loading={query.isLoading} fetching={query.isFetching}
        sort={query.data?.sort} dir={query.data?.dir} onSort={t.toggleSort}
        page={query.data?.page} pageCount={query.data?.pageCount} pageSize={t.pageSize}
        total={query.data?.total} from={query.data?.from} to={query.data?.to}
        onPage={t.setPage} onPageSize={t.setPageSize}
        onRowClick={setOpen}
        emptyIcon={RouteIcon} emptyTitle="No patrol tours recorded"
      />

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        size="md"
        title={open ? `Patrol ${open.ref}` : ''}
        subtitle={open ? `${open.route} · ${open._site?.name}` : ''}
        footer={<Button variant="ghost" onClick={() => setOpen(null)}>Close</Button>}
      >
        {open && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-line bg-surface2/40 p-3">
              <Avatar name={open._guard?.name || 'Unassigned'} size={34} />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-ink">{open._guard?.name}</p>
                <p className="truncate text-[11.5px] text-faint">Started {fmtDateTime(open.startedAt)}</p>
              </div>
              <div className="ml-auto"><Badge value={open.status} dot /></div>
            </div>

            <ul className="divide-y divide-line/60 overflow-hidden rounded-lg border border-line">
              {Array.from({ length: open.checkpointsTotal }).map((_, i) => {
                const scanned = i < open.checkpointsScanned
                const at = new Date(new Date(open.startedAt).getTime() + i * 4.5 * 60000)
                return (
                  <li key={i} className="flex items-center gap-3 bg-surface px-4 py-2.5">
                    <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full', scanned ? 'bg-ok/12 text-ok' : 'bg-critical/10 text-critical')}>
                      {scanned ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                    </span>
                    <span className="flex-1 text-[12.5px] text-ink">Checkpoint {String(i + 1).padStart(2, '0')}</span>
                    <span className="mono text-[11.5px] text-faint">
                      {scanned ? at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'Missed'}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </Modal>
    </>
  )
}
