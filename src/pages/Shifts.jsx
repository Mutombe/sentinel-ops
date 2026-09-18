import React, { useEffect, useMemo, useState } from 'react'
import { Plus, Calendar, ChevronLeft, ChevronRight, Trash2, Pencil, CheckCheck, Sun, Moon, Users, AlertTriangle } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { DataTable } from '@/components/ui/DataTable'
import { Toolbar, FilterSelect } from '@/components/ui/Toolbar'
import { Drawer, ConfirmDialog } from '@/components/ui/Modal'
import { Badge, Button, Field, Input, Select, Avatar, Segmented, Skeleton, EmptyState, Card, StatCard } from '@/components/ui/primitives'
import { useList, useTableState, useCreate, useUpdate, useDelete, useBulk, useLookups, useForm } from '@/lib/hooks'
import { fmtDate, fmtTime, titleCase, cn, money2 } from '@/lib/utils'
import { hrefFor } from '@/lib/records'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { useToast } from '@/components/ui/Toast'

const STATUSES = ['scheduled', 'confirmed', 'in_progress', 'completed', 'no_show', 'cancelled', 'swapped']
const DAY = 86400000

function startOfWeek(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

function ShiftForm({ open, onClose, initial, presetDate }) {
  const isEdit = !!initial
  const { data: lk } = useLookups()
  const toast = useToast()
  const create = useCreate('shifts', { label: 'Shift', onSuccess: onClose })
  const update = useUpdate('shifts', { label: 'Shift', onSuccess: onClose })
  const busy = create.isPending || update.isPending

  const blank = {
    guardId: '', siteId: '', date: presetDate || new Date().toISOString().slice(0, 10),
    startTime: '07:00', hours: 12, type: 'day', status: 'scheduled', overtime: 0, notes: '',
  }
  const f = useForm(blank)

  useEffect(() => {
    if (!open) return
    f.reset(initial ? {
      ...initial,
      date: initial.date,
      startTime: new Date(initial.start).toTimeString().slice(0, 5),
    } : { ...blank, date: presetDate || blank.date })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id, presetDate])

  const submit = async (e) => {
    e.preventDefault()
    const site = lk?.sites.find((s) => s.id === f.values.siteId)
    const guard = lk?.guards.find((g) => g.id === f.values.guardId)
    const start = new Date(`${f.values.date}T${f.values.startTime || '07:00'}:00`)
    const hours = +f.values.hours || 12
    const payload = {
      ...f.values,
      hours,
      overtime: +f.values.overtime || 0,
      clientId: site?.clientId || null,
      start: start.toISOString(),
      end: new Date(start.getTime() + hours * 3600000).toISOString(),
      payRate: guard ? undefined : undefined,
    }
    delete payload.startTime
    try {
      if (isEdit) await update.mutateAsync({ id: initial.id, patch: payload })
      else await create.mutateAsync(payload)
    } catch (err) {
      f.applyServerError(err)
      if (!err.fields) toast.error('Could not save shift', { body: err.message })
    }
  }

  const siteGuards = useMemo(() => {
    if (!lk) return []
    const active = lk.guards.filter((g) => g.status === 'active')
    if (!f.values.siteId) return active
    return [...active].sort((a, b) => (b.siteId === f.values.siteId) - (a.siteId === f.values.siteId))
  }, [lk, f.values.siteId])

  return (
    <Drawer
      open={open} onClose={onClose}
      title={isEdit ? 'Edit shift' : 'Roster a shift'}
      subtitle={isEdit ? `${initial._guard?.name || ''} · ${initial._site?.name || ''}` : 'Assign an officer to a site for a duty window'}
      width="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={submit}>{isEdit ? 'Save shift' : 'Add to roster'}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4 p-5">
        <Field label="Site" required error={f.errors.siteId}>
          <Select {...f.bind('siteId')}>
            <option value="">Select a site…</option>
            {lk?.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>

        <Field label="Officer" required error={f.errors.guardId} hint="Officers already deployed to this site are listed first.">
          <Select {...f.bind('guardId')}>
            <option value="">Select an officer…</option>
            {siteGuards.map((g) => (
              <option key={g.id} value={g.id}>{g.name} ({g.rank}){g.siteId === f.values.siteId ? ' (on site)' : ''}</option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" required error={f.errors.date}><Input type="date" {...f.bind('date')} /></Field>
          <Field label="Start time"><Input type="time" {...f.bind('startTime')} /></Field>
          <Field label="Duration (hours)"><Input type="number" min="1" max="24" {...f.bind('hours')} /></Field>
          <Field label="Overtime (hours)"><Input type="number" min="0" max="12" {...f.bind('overtime')} /></Field>
          <Field label="Shift type">
            <Select {...f.bind('type')}><option value="day">Day</option><option value="night">Night</option></Select>
          </Field>
          <Field label="Status">
            <Select {...f.bind('status')}>{STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
          </Field>
        </div>

        <Field label="Handover notes"><Input {...f.bind('notes')} placeholder="Keys, access codes, standing instructions…" /></Field>
      </form>
    </Drawer>
  )
}

function WeekBoard({ weekStart, rows, loading, onAdd, onEdit }) {
  const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY))
  const byDay = useMemo(() => {
    const m = {}
    rows.forEach((r) => { (m[r.date] = m[r.date] || []).push(r) })
    Object.values(m).forEach((list) => list.sort((a, b) => a.start.localeCompare(b.start)))
    return m
  }, [rows])

  const todayKey = new Date().toISOString().slice(0, 10)

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
      {days.map((d) => {
        const key = d.toISOString().slice(0, 10)
        const list = byDay[key] || []
        const isToday = key === todayKey
        return (
          <div key={key} className={cn('card flex min-w-0 flex-col', isToday && 'border-accent/40')}>
            <div className={cn('flex items-center justify-between border-b border-line px-3 py-2', isToday && 'bg-accent/[.06]')}>
              <div>
                <p className={cn('text-[11px] font-bold uppercase tracking-wide', isToday ? 'text-accent' : 'text-faint')}>
                  {d.toLocaleDateString('en', { weekday: 'short' })}
                </p>
                <p className="mono text-[15px] font-bold leading-tight text-ink">{d.getDate()}</p>
              </div>
              <div className="flex items-center gap-1">
                <span className="mono rounded bg-surface2 px-1.5 py-0.5 text-[10.5px] font-bold text-muted">{list.length}</span>
                <button onClick={() => onAdd(key)} className="btn btn-ghost h-9 w-9 px-0 sm:h-6 sm:w-6" title="Add shift"><Plus size={12} /></button>
              </div>
            </div>
            <div className="min-h-[120px] flex-1 space-y-1.5 p-2">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)
              ) : list.length === 0 ? (
                <p className="py-6 text-center text-[11.5px] text-faint">No shifts</p>
              ) : (
                list.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onEdit(s)}
                    className={cn(
                      'w-full rounded-lg border p-2 text-left transition hover:border-faint/60',
                      s.status === 'no_show' ? 'border-critical/35 bg-critical/[.07]'
                        : s.status === 'in_progress' ? 'border-ok/35 bg-ok/[.07]'
                        : s.status === 'cancelled' ? 'border-line bg-surface2/40 opacity-60'
                        : 'border-line bg-surface2/50',
                      s.__optimistic && 'opacity-60'
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      {s.type === 'night' ? <Moon size={10} className="shrink-0 text-accent2" /> : <Sun size={10} className="shrink-0 text-warn" />}
                      <span className="mono text-[10.5px] font-semibold text-muted">{fmtTime(s.start)}-{fmtTime(s.end)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Avatar name={s._guard?.name || 'Unassigned'} size={18} />
                      <span className="truncate text-[11.5px] font-semibold text-ink">{s._guard?.name || 'Unassigned'}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[10.5px] text-faint">{s._site?.name}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function Shifts() {
  const { can, isGuard } = useAuth()
  const navigate = useNavigate()
  const t = useTableState({ sort: 'start', dir: 'desc' })
  const [view, setView] = useState('board')
  const [weekOffset, setWeekOffset] = useState(0)
  const [selected, setSelected] = useState([])
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [presetDate, setPresetDate] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const weekStart = useMemo(() => new Date(startOfWeek(new Date()).getTime() + weekOffset * 7 * DAY), [weekOffset])
  const weekEnd = new Date(weekStart.getTime() + 6 * DAY)

  const boardQ = useList(
    'shifts',
    { all: true, pageSize: 500, sort: 'start', dir: 'asc', filters: { date: { from: weekStart.toISOString().slice(0, 10), to: weekEnd.toISOString().slice(0, 10) }, ...t.filters }, q: t.params.q },
    { enabled: view === 'board' }
  )
  const tableQ = useList('shifts', { ...t.params, facet: 'status' }, { enabled: view === 'table' })
  const del = useDelete('shifts', { label: 'Shift' })
  const bulk = useBulk('shifts')

  const boardRows = boardQ.data?.rows || []
  const weekStats = useMemo(() => {
    const total = boardRows.length
    const hours = boardRows.reduce((a, s) => a + s.hours + (s.overtime || 0), 0)
    const noShow = boardRows.filter((s) => s.status === 'no_show').length
    const officers = new Set(boardRows.map((s) => s.guardId)).size
    return { total, hours, noShow, officers }
  }, [boardRows])

  const columns = [
    { key: 'date', header: 'Date', width: 130, render: (r) => <span className="mono text-[12.5px] text-ink">{fmtDate(r.start)}</span> },
    {
      key: 'guardId', header: 'Officer', sortable: false,
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={r._guard?.name || 'Unassigned'} size={26} />
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-semibold text-ink">{r._guard?.name || 'Unassigned'}</p>
            <p className="truncate text-[11px] text-faint">{r._guard?.rank}</p>
          </div>
        </div>
      ),
    },
    { key: 'siteId', header: 'Site', sortable: false, width: 200, render: (r) => <span className="truncate text-[12.5px] text-muted">{r._site?.name}</span> },
    {
      key: 'type', header: 'Type', width: 96,
      render: (r) => (
        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
          {r.type === 'night' ? <Moon size={12} className="text-accent2" /> : <Sun size={12} className="text-warn" />}
          {titleCase(r.type)}
        </span>
      ),
    },
    { key: 'start', header: 'Window', sortable: false, width: 150, render: (r) => <span className="mono text-[12px] text-muted">{fmtTime(r.start)}-{fmtTime(r.end)}</span> },
    {
      key: 'hours', header: 'Hours', align: 'right', width: 100,
      render: (r) => <span className="mono text-[12.5px]">{r.hours}h{r.overtime ? <span className="text-warn"> +{r.overtime}</span> : null}</span>,
    },
    { key: 'status', header: 'Status', width: 126, render: (r) => <Badge value={r.status} dot /> },
    {
      key: 'actions', header: '', sortable: false, width: 92, align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          {can('shifts', 'update') && <button className="btn btn-ghost h-7 w-7 px-0" onClick={() => { setEditing(r); setFormOpen(true) }}><Pencil size={13} /></button>}
          {can('shifts', 'delete') && <button className="btn btn-ghost h-7 w-7 px-0 text-critical" onClick={() => setConfirm(r)}><Trash2 size={13} /></button>}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title={isGuard ? 'My shifts' : 'Roster & Shifts'}
        subtitle="Plan coverage, confirm attendance and track duty windows across every site."
        actions={can('shifts', 'create') && (
          <Button variant="primary" icon={Plus} onClick={() => { setEditing(null); setPresetDate(null); setFormOpen(true) }}>Roster shift</Button>
        )}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented value={view} onChange={setView} options={[{ value: 'board', label: 'Week board' }, { value: 'table', label: 'All shifts' }]} />
        {view === 'board' && (
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="secondary" icon={ChevronLeft} onClick={() => setWeekOffset((w) => w - 1)} />
            <Button size="sm" variant={weekOffset === 0 ? 'primary' : 'secondary'} onClick={() => setWeekOffset(0)}>This week</Button>
            <Button size="sm" variant="secondary" icon={ChevronRight} onClick={() => setWeekOffset((w) => w + 1)} />
            <span className="ml-1 text-[12.5px] font-medium text-muted">
              {weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} to {weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
        )}
      </div>

      {view === 'board' ? (
        <>
          <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Shifts this week" value={weekStats.total} icon={Calendar} tone="accent" loading={boardQ.isLoading} />
            <StatCard label="Officers rostered" value={weekStats.officers} icon={Users} tone="accent2" loading={boardQ.isLoading} />
            <StatCard label="Duty hours" value={weekStats.hours} icon={Calendar} tone="ok" loading={boardQ.isLoading} hint="Including overtime" />
            <StatCard label="No-shows" value={weekStats.noShow} icon={AlertTriangle} tone="critical" loading={boardQ.isLoading} />
          </div>

          <Toolbar
            q={t.q} onQ={t.setQ}
            placeholder="Filter this week…"
            activeFilters={t.activeFilters} onReset={t.reset}
            filters={
              <>
                <FilterSelect label="Status" value={t.filters.status} onChange={(v) => t.setFilter('status', v)} options={STATUSES} />
                <FilterSelect label="Type" value={t.filters.type} onChange={(v) => t.setFilter('type', v)} options={['day', 'night']} />
              </>
            }
            exportName="roster-week"
            exportRows={() => boardRows.map((r) => ({
              date: r.date, officer: r._guard?.name, site: r._site?.name, type: r.type,
              start: r.start, end: r.end, hours: r.hours, overtime: r.overtime, status: r.status,
            }))}
          />

          <WeekBoard
            weekStart={weekStart}
            rows={boardRows}
            loading={boardQ.isLoading}
            onAdd={(date) => { setEditing(null); setPresetDate(date); setFormOpen(true) }}
            onEdit={(s) => navigate(hrefFor('shifts', s.id))}
          />
        </>
      ) : (
        <>
          <Toolbar
            q={t.q} onQ={t.setQ}
            placeholder="Search by date, type, status…"
            activeFilters={t.activeFilters} onReset={t.reset}
            exportName="shifts"
            exportRows={() => (tableQ.data?.rows || []).map((r) => ({
              date: r.date, officer: r._guard?.name, site: r._site?.name, client: r._client?.name,
              type: r.type, start: r.start, end: r.end, hours: r.hours, overtime: r.overtime, status: r.status,
            }))}
            filters={
              <>
                <FilterSelect label="Status" value={t.filters.status} onChange={(v) => t.setFilter('status', v)} options={STATUSES} />
                <FilterSelect label="Type" value={t.filters.type} onChange={(v) => t.setFilter('type', v)} options={['day', 'night']} />
              </>
            }
          />
          <DataTable
            columns={columns}
            rows={tableQ.data?.rows || []}
            loading={tableQ.isLoading} fetching={tableQ.isFetching}
            sort={tableQ.data?.sort} dir={tableQ.data?.dir} onSort={t.toggleSort}
            page={tableQ.data?.page} pageCount={tableQ.data?.pageCount} pageSize={t.pageSize}
            total={tableQ.data?.total} from={tableQ.data?.from} to={tableQ.data?.to}
            onPage={t.setPage} onPageSize={t.setPageSize}
            onRowClick={(r) => navigate(hrefFor('shifts', r.id))}
            selectable={can('shifts', 'update')}
            selected={selected} onSelected={setSelected}
            emptyIcon={Calendar} emptyTitle="No shifts match this view"
            bulkBar={(ids) => (
              <>
                <Button size="xs" variant="secondary" icon={CheckCheck} onClick={() => bulk.update.mutate({ ids, patch: { status: 'confirmed' } })}>Confirm</Button>
                <Button size="xs" variant="secondary" onClick={() => bulk.update.mutate({ ids, patch: { status: 'cancelled' } })}>Cancel</Button>
                {can('shifts', 'delete') && <Button size="xs" variant="danger" icon={Trash2} onClick={() => { bulk.remove.mutate(ids); setSelected([]) }}>Delete</Button>}
              </>
            )}
          />
        </>
      )}

      <ShiftForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); setPresetDate(null) }}
        initial={editing}
        presetDate={presetDate}
      />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Remove this shift?"
        body={`${confirm?._guard?.name || 'This officer'} will be taken off the roster for ${confirm ? fmtDate(confirm.start) : ''}.`}
        confirmLabel="Remove shift"
        onConfirm={() => del.mutate(confirm.id)}
      />
    </>
  )
}
