import React, { useMemo, useState } from 'react'
import {
  Radar, Users, Clock, CheckCircle2, MapPin, Sun, Moon, Fingerprint,
  ShieldCheck, AlertTriangle, CalendarDays,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { DataTable } from '@/components/ui/DataTable'
import { Toolbar, FilterSelect } from '@/components/ui/Toolbar'
import { Modal } from '@/components/ui/Modal'
import {
  Badge, Button, StatCard, Card, Avatar, Progress, Tabs, EmptyState, Skeleton, SeverityDot,
} from '@/components/ui/primitives'
import { BarsChart, DonutChart, Legend2 } from '@/components/charts/Charts'
import { useNavigate } from 'react-router-dom'
import { useList, useTableState } from '@/lib/hooks'
import { fmtDate, fmtTime, titleCase, timeAgo, cn, pct } from '@/lib/utils'
import { hrefFor } from '@/lib/records'

export default function PortalDeployment() {
  const [tab, setTab] = useState('today')
  const [officer, setOfficer] = useState(null)
  const att = useTableState({ sort: 'date', dir: 'desc' })

  const today = new Date().toISOString().slice(0, 10)

  const guardsQ = useList('guards', { all: true, pageSize: 300 })
  const sitesQ = useList('sites', { all: true, pageSize: 200 })
  const postsQ = useList('posts', { all: true, pageSize: 400 })
  const todayQ = useList('shifts', { all: true, pageSize: 400, filters: { date: today }, sort: 'start', dir: 'asc' })
  const attQ = useList('attendance', { ...att.params, facet: 'status' }, { enabled: tab === 'attendance' })
  const attAll = useList('attendance', { all: true, pageSize: 1500 })

  const guards = guardsQ.data?.rows || []
  const sites = sitesQ.data?.rows || []
  const posts = postsQ.data?.rows || []
  const todayShifts = todayQ.data?.rows || []
  const attendance = attAll.data?.rows || []

  const onDuty = todayShifts.filter((s) => s.status === 'in_progress')
  const required = sites.filter((s) => s.status === 'active').reduce((a, s) => a + s.guardsRequired, 0)
  const deployed = guards.filter((g) => g.status === 'active').length

  const last30 = attendance.filter((a) => Date.now() - new Date(a.date) < 30 * 86400000)
  const present = last30.filter((a) => a.status !== 'absent').length
  const punctual = last30.filter((a) => a.status === 'present' || a.status === 'on_duty').length
  const attendanceRate = last30.length ? Math.round((present / last30.length) * 100) : 100
  const punctualityRate = last30.length ? Math.round((punctual / last30.length) * 100) : 100

  const attMix = ['present', 'late', 'absent', 'on_duty'].map((k) => ({
    name: k, value: last30.filter((a) => a.status === k).length,
  }))

  const bySite = useMemo(() => sites.filter((s) => s.status === 'active').map((s) => {
    const g = guards.filter((x) => x.siteId === s.id && x.status === 'active')
    const sitePosts = posts.filter((p) => p.siteId === s.id && p.status === 'active')
    const rostered = todayShifts.filter((sh) => sh.siteId === s.id)
    return {
      ...s,
      deployedCount: g.length,
      posts: sitePosts.length,
      rostered: rostered.length,
      officers: g,
    }
  }), [sites, guards, posts, todayShifts])

  const coverageChart = bySite.slice(0, 8).map((s) => ({
    name: s.name.length > 22 ? s.name.slice(0, 21) + '…' : s.name,
    value: s.guardsRequired ? Math.round((s.deployedCount / s.guardsRequired) * 100) : 100,
  }))

  const tabs = [
    { value: 'today', label: "Today's cover", count: todayShifts.length },
    { value: 'team', label: 'Your officers', count: guards.length },
    { value: 'attendance', label: 'Attendance', count: attendance.length },
  ]

  const attColumns = [
    { key: 'date', header: 'Date', width: 130, render: (r) => <span className="mono text-[12.5px] text-ink">{fmtDate(r.date)}</span> },
    {
      key: 'guardId', header: 'Officer', sortable: false,
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={r._guard?.name || 'Unassigned'} size={26} />
          <span className="truncate text-[12.5px] text-ink">{r._guard?.name}</span>
        </div>
      ),
    },
    { key: 'siteId', header: 'Site', sortable: false, width: 190, render: (r) => <span className="truncate text-[12.5px] text-muted">{r._site?.name}</span> },
    { key: 'clockIn', header: 'On post', width: 120, render: (r) => <span className="mono text-[12.5px] text-muted">{r.clockIn ? fmtTime(r.clockIn) : ''}</span> },
    { key: 'clockOut', header: 'Off post', width: 120, render: (r) => <span className="mono text-[12.5px] text-muted">{r.clockOut ? fmtTime(r.clockOut) : ''}</span> },
    { key: 'hours', header: 'Hours', align: 'right', width: 90, render: (r) => <span className="mono text-[12.5px]">{r.hours || ''}</span> },
    {
      key: 'geoVerified', header: 'Verified', align: 'center', width: 100,
      render: (r) => r.geoVerified
        ? <ShieldCheck size={14} className="mx-auto text-ok" title="Clock-in inside the site geofence" />
        : <span className="text-[11.5px] text-warn">Manual</span>,
    },
    { key: 'status', header: 'Status', width: 124, render: (r) => <Badge value={r.status} dot /> },
  ]

  return (
    <>
      <PageHeader
        title="Deployment & Attendance"
        subtitle="Who is on your sites, whether they arrived on time, and how coverage is tracking against contract."
        tabs={<Tabs tabs={tabs} value={tab} onChange={setTab} className="mt-4" />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="On duty now" value={onDuty.length} icon={Radar} tone="ok" loading={todayQ.isLoading} hint={`${todayShifts.length} shifts on today's roster`} />
        <StatCard label="Officers assigned" value={deployed} icon={Users} tone="accent" loading={guardsQ.isLoading} hint={`${required} contracted across your sites`} />
        <StatCard label="Attendance rate" value={pct(attendanceRate)} icon={CheckCircle2} tone={attendanceRate >= 97 ? 'ok' : 'warn'} loading={attAll.isLoading} hint="Last 30 days" />
        <StatCard label="Punctuality" value={pct(punctualityRate)} icon={Clock} tone={punctualityRate >= 90 ? 'ok' : 'warn'} loading={attAll.isLoading} hint="Arrived on or before shift start" />
      </div>

      {tab === 'today' && (
        <>
          <div className="mb-4 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2" title="Coverage against contract" subtitle="Officers deployed as a percentage of contracted strength">
              {coverageChart.length ? (
                <BarsChart data={coverageChart} layout="vertical" height={240} bars={[{ key: 'value', label: 'Coverage %', color: 'accent' }]} formatter={(v) => `${v}%`} />
              ) : <EmptyState icon={MapPin} title="No active sites" />}
            </Card>
            <Card title="Attendance mix" subtitle="Last 30 days">
              <DonutChart
                data={attMix}
                colorMap={{ present: 'ok', late: 'warn', absent: 'critical', on_duty: 'accent' }}
                centerLabel="Shifts"
              />
              <Legend2
                className="mt-3 justify-center"
                items={attMix.map((a) => ({
                  label: titleCase(a.name), value: a.value,
                  color: { present: 'ok', late: 'warn', absent: 'critical', on_duty: 'accent' }[a.name],
                }))}
              />
            </Card>
          </div>

          <Card title="Today's roster" subtitle={`${todayShifts.length} shifts across your sites`} noPad>
            {todayQ.isLoading ? (
              <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : todayShifts.length === 0 ? (
              <EmptyState icon={CalendarDays} title="Nothing rostered today" body="No shifts are scheduled at your sites for today." />
            ) : (
              <ul className="divide-y divide-line/60">
                {todayShifts.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="relative">
                      <Avatar name={s._guard?.name || 'Unassigned'} size={30} />
                      {s.status === 'in_progress' && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-ok" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold text-ink">{s._guard?.name || 'Unassigned'}</p>
                      <p className="truncate text-[11.5px] text-faint">
                        <MapPin size={9} className="mr-0.5 inline" />{s._site?.name}
                      </p>
                    </div>
                    <span className="hidden items-center gap-1.5 text-[12px] text-muted sm:flex">
                      {s.type === 'night' ? <Moon size={12} className="text-accent2" /> : <Sun size={12} className="text-warn" />}
                      {titleCase(s.type)}
                    </span>
                    <span className="mono w-28 shrink-0 text-right text-[12px] text-muted">{fmtTime(s.start)}-{fmtTime(s.end)}</span>
                    <Badge value={s.status} dot size="sm" />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {tab === 'team' && (
        <div className="space-y-4">
          {bySite.map((s) => (
            <Card
              key={s.id}
              title={s.name}
              subtitle={`${s.type} · ${s.posts} post${s.posts === 1 ? '' : 's'} · ${s.coverage}`}
              actions={
                <div className="flex items-center gap-2">
                  <Progress
                    value={s.guardsRequired ? Math.min(100, (s.deployedCount / s.guardsRequired) * 100) : 100}
                    tone={s.deployedCount >= s.guardsRequired ? 'ok' : 'warn'}
                    className="w-24"
                  />
                  <span className="mono text-[12px] font-semibold text-ink">{s.deployedCount}/{s.guardsRequired}</span>
                </div>
              }
              noPad
            >
              {s.officers.length === 0 ? (
                <EmptyState icon={Users} title="No officers currently assigned" body="Contact your account manager if this is unexpected." />
              ) : (
                <ul className="divide-y divide-line/60">
                  {s.officers.map((g) => (
                    <li key={g.id}>
                      <button onClick={() => setOfficer(g)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-surface2/60">
                        <Avatar name={g.name} size={28} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12.5px] font-semibold text-ink">{g.name}</p>
                          <p className="truncate text-[11px] text-faint">{g.rank} · Grade {g.grade}</p>
                        </div>
                        {g.armed && <span className="chip border-warn/25 bg-warn/10 text-warn">Armed</span>}
                        <span className="mono w-12 shrink-0 text-right text-[11.5px] text-muted">★{g.rating}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      {tab === 'attendance' && (
        <>
          <Toolbar
            q={att.q} onQ={att.setQ}
            placeholder="Search by date or status…"
            activeFilters={att.activeFilters} onReset={att.reset}
            exportName="attendance-record"
            exportRows={() => (attQ.data?.rows || []).map((r) => ({
              date: r.date, officer: r._guard?.name, site: r._site?.name,
              clockIn: r.clockIn, clockOut: r.clockOut, hours: r.hours,
              status: r.status, geoVerified: r.geoVerified,
            }))}
            filters={<FilterSelect label="Status" value={att.filters.status} onChange={(v) => att.setFilter('status', v)} options={['present', 'late', 'absent', 'on_duty']} />}
          />
          <DataTable
            columns={attColumns}
            rows={attQ.data?.rows || []}
            loading={attQ.isLoading} fetching={attQ.isFetching}
            sort={attQ.data?.sort} dir={attQ.data?.dir} onSort={att.toggleSort}
            page={attQ.data?.page} pageCount={attQ.data?.pageCount} pageSize={att.pageSize}
            total={attQ.data?.total} from={attQ.data?.from} to={attQ.data?.to}
            onPage={att.setPage} onPageSize={att.setPageSize}
            emptyIcon={Fingerprint} emptyTitle="No attendance records"
          />
        </>
      )}

      <Modal
        open={!!officer}
        onClose={() => setOfficer(null)}
        size="sm"
        title={officer?.name}
        subtitle={officer ? `${officer.rank} · Grade ${officer.grade}` : ''}
        footer={<Button variant="ghost" onClick={() => setOfficer(null)}>Close</Button>}
      >
        {officer && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg border border-line bg-surface2/40 p-3">
              <Avatar name={officer.name} size={44} />
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold text-ink">{officer.name}</p>
                <p className="truncate text-[11.5px] text-faint">{officer.rank}</p>
                <div className="mt-1.5 flex gap-1.5">
                  <Badge value={officer.status} size="sm" dot />
                  {officer.armed && <Badge value="high" label="Armed" size="sm" />}
                </div>
              </div>
            </div>

            <div className="space-y-2 text-[12.5px]">
              {[
                ['Deployed at', officer._site?.name || ''],
                ['Supervisor rating', `${officer.rating} / 5.0`],
                ['Shifts completed', officer.shiftsCompleted],
                ['Incidents handled', officer.incidentsHandled],
                ['Licence status', new Date(officer.licenseExpiry) > Date.now() ? 'Valid' : 'Under renewal'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-line/50 pb-2 last:border-0">
                  <span className="text-muted">{k}</span>
                  <span className="text-right font-medium text-ink">{v}</span>
                </div>
              ))}
            </div>

            {officer.certifications?.length > 0 && (
              <div>
                <p className="label">Certifications</p>
                <div className="flex flex-wrap gap-1.5">
                  {officer.certifications.map((c) => (
                    <span key={c} className="chip border-accent/25 bg-accent/10 text-accent">{c}</span>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[11px] leading-relaxed text-faint">
              Personal contact details and employment records are not shared through the client portal.
            </p>
          </div>
        )}
      </Modal>
    </>
  )
}
