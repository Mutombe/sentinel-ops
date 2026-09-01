import React, { useMemo, useState } from 'react'
import { Fingerprint, CheckCircle2, AlertTriangle, Clock, MapPinned, ShieldQuestion, UserX } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { DataTable } from '@/components/ui/DataTable'
import { Toolbar, FilterSelect } from '@/components/ui/Toolbar'
import { Badge, Button, Avatar, StatCard, Card, Segmented, Progress } from '@/components/ui/primitives'
import { BarsChart, DonutChart, Legend2 } from '@/components/charts/Charts'
import { useList, useTableState, useUpdate, useBulk } from '@/lib/hooks'
import { fmtDate, fmtTime, titleCase, cn, pct } from '@/lib/utils'
import { hrefFor } from '@/lib/records'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'

const STATUSES = ['present', 'late', 'absent', 'on_duty']
const METHODS = ['biometric', 'qr-scan', 'nfc-tag', 'supervisor']

export default function Attendance() {
  const { can, isGuard } = useAuth()
  const navigate = useNavigate()
  const t = useTableState({ sort: 'date', dir: 'desc' })
  const [range, setRange] = useState('7')
  const [selected, setSelected] = useState([])

  const from = useMemo(() => new Date(Date.now() - +range * 86400000).toISOString().slice(0, 10), [range])
  const filters = { ...t.filters, date: { from } }

  const query = useList('attendance', { ...t.params, filters, facet: 'status' })
  const allQ = useList('attendance', { all: true, pageSize: 2000, filters })
  const bulk = useBulk('attendance')

  const all = allQ.data?.rows || []
  const counts = STATUSES.map((s) => ({ name: s, value: all.filter((a) => a.status === s).length }))
  const total = all.length || 1
  const present = all.filter((a) => a.status === 'present' || a.status === 'on_duty').length
  const late = all.filter((a) => a.status === 'late')
  const absent = all.filter((a) => a.status === 'absent')
  const avgLate = late.length ? Math.round(late.reduce((a, x) => a + x.lateMins, 0) / late.length) : 0
  const geoRate = all.length ? Math.round((all.filter((a) => a.geoVerified).length / all.length) * 100) : 0

  const byDay = useMemo(() => {
    const m = {}
    all.forEach((a) => {
      m[a.date] = m[a.date] || { name: a.date.slice(5), present: 0, late: 0, absent: 0 }
      if (a.status === 'absent') m[a.date].absent++
      else if (a.status === 'late') m[a.date].late++
      else m[a.date].present++
    })
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v)
  }, [all])

  const columns = [
    { key: 'date', header: 'Date', width: 120, render: (r) => <span className="mono text-[12.5px] text-ink">{fmtDate(r.date)}</span> },
    {
      key: 'guardId', header: 'Officer', sortable: false,
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={r._guard?.name || 'Unassigned'} size={26} />
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-semibold text-ink">{r._guard?.name}</p>
            <p className="mono truncate text-[11px] text-faint">{r._guard?.employeeNo}</p>
          </div>
        </div>
      ),
    },
    { key: 'siteId', header: 'Site', sortable: false, width: 190, render: (r) => <span className="truncate text-[12.5px] text-muted">{r._site?.name}</span> },
    {
      key: 'clockIn', header: 'Clock in', width: 120,
      render: (r) => r.clockIn ? (
        <div>
          <p className="mono text-[12.5px] text-ink">{fmtTime(r.clockIn)}</p>
          {r.lateMins > 0 && <p className="text-[10.5px] font-semibold text-warn">+{r.lateMins}m late</p>}
        </div>
      ) : <span className="text-[12.5px] text-critical">No show</span>,
    },
    { key: 'clockOut', header: 'Clock out', width: 110, render: (r) => <span className="mono text-[12.5px] text-muted">{r.clockOut ? fmtTime(r.clockOut) : ''}</span> },
    { key: 'hours', header: 'Hours', align: 'right', width: 80, render: (r) => <span className="mono text-[12.5px]">{r.hours || ''}</span> },
    {
      key: 'method', header: 'Verified by', width: 140,
      render: (r) => (
        <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
          {r.geoVerified ? <MapPinned size={12} className="text-ok" /> : <ShieldQuestion size={12} className="text-warn" />}
          {titleCase(r.method)}
        </span>
      ),
    },
    { key: 'status', header: 'Status', width: 124, render: (r) => <Badge value={r.status} dot /> },
  ]

  return (
    <>
      <PageHeader
        title={isGuard ? 'My attendance' : 'Attendance & Time'}
        subtitle="Clock-in verification, punctuality and coverage assurance."
        actions={
          <Segmented
            value={range}
            onChange={(v) => { setRange(v); t.setPage(1) }}
            options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]}
          />
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Attendance rate" value={pct((present / total) * 100)} icon={CheckCircle2} tone="ok" loading={allQ.isLoading} hint={`${present} of ${all.length} shifts`} />
        <StatCard label="Late arrivals" value={late.length} icon={Clock} tone="warn" loading={allQ.isLoading} hint={`Average ${avgLate} minutes late`} />
        <StatCard label="Absences" value={absent.length} icon={UserX} tone="critical" loading={allQ.isLoading} hint="Unexplained no-shows" />
        <StatCard label="Geo-verified" value={`${geoRate}%`} icon={MapPinned} tone="accent" loading={allQ.isLoading} hint="Clock-ins inside the geofence" />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Daily attendance" subtitle={`Last ${range} days`}>
          <BarsChart
            data={byDay}
            height={220}
            stacked
            bars={[
              { key: 'present', label: 'Present', color: 'ok' },
              { key: 'late', label: 'Late', color: 'warn' },
              { key: 'absent', label: 'Absent', color: 'critical' },
            ]}
          />
        </Card>
        <Card title="Status mix">
          <DonutChart
            data={counts}
            colorMap={{ present: 'ok', late: 'warn', absent: 'critical', on_duty: 'accent' }}
            centerLabel="Records"
          />
          <Legend2
            className="mt-3 justify-center"
            items={counts.map((c) => ({ label: titleCase(c.name), value: c.value, color: { present: 'ok', late: 'warn', absent: 'critical', on_duty: 'accent' }[c.name] }))}
          />
        </Card>
      </div>

      <Toolbar
        q={t.q} onQ={t.setQ}
        placeholder="Search by date, status, method…"
        activeFilters={t.activeFilters} onReset={t.reset}
        exportName="attendance"
        exportRows={() => (query.data?.rows || []).map((r) => ({
          date: r.date, officer: r._guard?.name, employeeNo: r._guard?.employeeNo, site: r._site?.name,
          clockIn: r.clockIn, clockOut: r.clockOut, hours: r.hours, lateMins: r.lateMins,
          status: r.status, method: r.method, geoVerified: r.geoVerified,
        }))}
        filters={
          <>
            <FilterSelect label="Status" value={t.filters.status} onChange={(v) => t.setFilter('status', v)} options={STATUSES} />
            <FilterSelect label="Method" value={t.filters.method} onChange={(v) => t.setFilter('method', v)} options={METHODS} />
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
        onRowClick={(r) => navigate(hrefFor('attendance', r.id))}
        selectable={can('attendance', 'update')}
        selected={selected} onSelected={setSelected}
        emptyIcon={Fingerprint} emptyTitle="No attendance records in this window"
        bulkBar={(ids) => (
          <>
            <Button size="xs" variant="secondary" icon={CheckCircle2} onClick={() => bulk.update.mutate({ ids, patch: { status: 'present', lateMins: 0 } })}>
              Mark present
            </Button>
            <Button size="xs" variant="secondary" icon={AlertTriangle} onClick={() => bulk.update.mutate({ ids, patch: { status: 'absent' } })}>
              Mark absent
            </Button>
          </>
        )}
      />
    </>
  )
}
