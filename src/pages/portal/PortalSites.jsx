import React, { useState } from 'react'
import { MapPin, Users, ShieldAlert, Route as RouteIcon, Navigation, Clock } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Toolbar, FilterSelect } from '@/components/ui/Toolbar'
import { Modal } from '@/components/ui/Modal'
import { Card, Badge, Button, Progress, Skeleton, EmptyState, SeverityDot, Avatar, StatCard } from '@/components/ui/primitives'
import { useList, useTableState } from '@/lib/hooks'
import { titleCase, fmtDate, timeAgo, cn, num } from '@/lib/utils'

export default function PortalSites() {
  const t = useTableState({ sort: 'name', dir: 'asc', pageSize: 12 })
  const [open, setOpen] = useState(null)

  const query = useList('sites', { ...t.params })
  const guardsQ = useList('guards', { all: true, pageSize: 500 })
  const incQ = useList('incidents', { all: true, pageSize: 500 })
  const patrolQ = useList('patrols', { all: true, pageSize: 500 })

  const guards = guardsQ.data?.rows || []
  const incidents = incQ.data?.rows || []
  const patrols = patrolQ.data?.rows || []

  const rows = query.data?.rows || []
  const totalRequired = rows.reduce((a, s) => a + s.guardsRequired, 0)
  const totalDeployed = guards.filter((g) => g.status === 'active').length

  const siteGuards = (id) => guards.filter((g) => g.siteId === id)
  const siteIncidents = (id) => incidents.filter((i) => i.siteId === id)
  const sitePatrols = (id) => patrols.filter((p) => p.siteId === id)

  return (
    <>
      <PageHeader
        title="My Sites"
        subtitle="Coverage, risk grading and officer deployment at each of your locations."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Sites under contract" value={query.data?.total ?? 'Unspecified'} icon={MapPin} tone="accent" loading={query.isLoading} />
        <StatCard label="Officers deployed" value={totalDeployed} icon={Users} tone="ok" loading={guardsQ.isLoading} hint={`${totalRequired} required across all sites`} />
        <StatCard label="Incidents recorded" value={incidents.length} icon={ShieldAlert} tone="warn" loading={incQ.isLoading} />
        <StatCard label="Patrol tours" value={patrols.length} icon={RouteIcon} tone="accent2" loading={patrolQ.isLoading} hint="Logged with checkpoint scans" />
      </div>

      <Toolbar
        q={t.q} onQ={t.setQ}
        placeholder="Search site name or city…"
        activeFilters={t.activeFilters} onReset={t.reset}
        filters={<FilterSelect label="Risk" value={t.filters.riskLevel} onChange={(v) => t.setFilter('riskLevel', v)} options={['low', 'medium', 'high', 'critical']} />}
      />

      {query.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={MapPin} title="No sites found" body="Adjust your search to see your contracted locations." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((s) => {
              const g = siteGuards(s.id)
              const inc = siteIncidents(s.id)
              const pat = sitePatrols(s.id).filter((p) => p.status !== 'in_progress')
              const compliance = pat.length ? Math.round((pat.filter((p) => p.status === 'complete').length / pat.length) * 100) : 100
              const staffPct = s.guardsRequired ? (g.filter((x) => x.status === 'active').length / s.guardsRequired) * 100 : 100
              return (
                <button key={s.id} onClick={() => setOpen(s)} className="card p-4 text-left transition hover:border-accent/40 hover:shadow-pop">
                  <div className="flex items-start gap-2.5">
                    <SeverityDot level={s.riskLevel} className="mt-1.5" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-semibold text-ink">{s.name}</p>
                      <p className="truncate text-[11.5px] text-faint">{s.type} · {s.city}</p>
                    </div>
                    <Badge value={s.status} size="sm" dot />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge value={s.riskLevel} label={`${titleCase(s.riskLevel)} risk`} size="sm" />
                    <span className="chip border-line bg-surface2 text-muted">{s.coverage}</span>
                  </div>

                  <div className="mt-3 space-y-2.5 border-t border-line pt-3">
                    <div>
                      <div className="mb-1 flex justify-between text-[11.5px]">
                        <span className="text-muted">Officers on site</span>
                        <span className="mono font-semibold text-ink">{g.filter((x) => x.status === 'active').length}/{s.guardsRequired}</span>
                      </div>
                      <Progress value={Math.min(100, staffPct)} tone={staffPct < 70 ? 'critical' : staffPct < 100 ? 'warn' : 'ok'} />
                    </div>
                    <div>
                      <div className="mb-1 flex justify-between text-[11.5px]">
                        <span className="text-muted">Patrol compliance</span>
                        <span className="mono font-semibold text-ink">{compliance}%</span>
                      </div>
                      <Progress value={compliance} tone={compliance > 90 ? 'ok' : compliance > 75 ? 'warn' : 'critical'} />
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[11.5px] text-faint">
                    <span>{s.checkpoints} checkpoints</span>
                    <span className={cn(inc.length ? 'text-warn' : 'text-ok')}>{inc.length} incidents</span>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="card mt-3">
            <div className="flex items-center justify-between px-4 py-2.5">
              <p className="text-[12px] text-faint">
                Showing <span className="mono font-semibold text-muted">{query.data.from}-{query.data.to}</span> of{' '}
                <span className="mono font-semibold text-muted">{num(query.data.total)}</span>
              </p>
              <div className="flex gap-1">
                <Button size="xs" variant="secondary" disabled={query.data.page <= 1} onClick={() => t.setPage(query.data.page - 1)}>Previous</Button>
                <Button size="xs" variant="secondary" disabled={query.data.page >= query.data.pageCount} onClick={() => t.setPage(query.data.page + 1)}>Next</Button>
              </div>
            </div>
          </div>
        </>
      )}

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        size="lg"
        title={open?.name}
        subtitle={open ? `${open.type} · ${open.address}, ${open.city}` : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(null)}>Close</Button>
            {open && (
              <Button
                as="a"
                variant="secondary"
                icon={Navigation}
                href={`https://www.openstreetmap.org/?mlat=${open.lat}&mlon=${open.lng}#map=16/${open.lat}/${open.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                Open map
              </Button>
            )}
          </>
        }
      >
        {open && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['Risk grading', titleCase(open.riskLevel)],
                ['Coverage pattern', open.coverage],
                ['Officers required', open.guardsRequired],
                ['Patrol checkpoints', open.checkpoints],
                ['Site opened', fmtDate(open.openedAt)],
                ['Status', titleCase(open.status)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-line bg-surface2/40 px-3 py-2.5">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">{k}</p>
                  <p className="mt-0.5 text-[12.5px] font-medium text-ink">{v}</p>
                </div>
              ))}
            </div>

            <Card title="Officers deployed here" noPad>
              {siteGuards(open.id).length === 0 ? (
                <EmptyState icon={Users} title="No officers currently assigned" />
              ) : (
                <ul className="divide-y divide-line/60">
                  {siteGuards(open.id).map((g) => (
                    <li key={g.id} className="flex items-center gap-3 px-4 py-2.5">
                      <Avatar name={g.name} size={28} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold text-ink">{g.name}</p>
                        <p className="truncate text-[11px] text-faint">{g.rank} · Grade {g.grade}</p>
                      </div>
                      <Badge value={g.status} size="sm" dot />
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Recent incidents at this site" noPad>
              {siteIncidents(open.id).length === 0 ? (
                <EmptyState icon={ShieldAlert} title="Clean record" body="No incidents recorded at this location." />
              ) : (
                <ul className="divide-y divide-line/60">
                  {siteIncidents(open.id).slice(0, 5).map((i) => (
                    <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                      <SeverityDot level={i.severity} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium text-ink">{i.type}</p>
                        <p className="mono truncate text-[11px] text-faint">{i.ref}</p>
                      </div>
                      <Badge value={i.status} size="sm" />
                      <span className="w-16 shrink-0 text-right text-[11px] text-faint">{timeAgo(i.occurredAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </Modal>
    </>
  )
}
