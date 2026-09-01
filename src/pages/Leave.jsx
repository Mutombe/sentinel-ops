import React, { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, PalmtreeIcon, Check, X, CalendarOff, CalendarCheck, Clock, AlertTriangle, Users,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { DataTable } from '@/components/ui/DataTable'
import { Toolbar, FilterSelect } from '@/components/ui/Toolbar'
import { Drawer, ConfirmDialog } from '@/components/ui/Modal'
import { Badge, Button, Field, Input, Select, Textarea, Avatar, Tabs, StatCard, Card, EmptyState } from '@/components/ui/primitives'
import { BarsChart } from '@/components/charts/Charts'
import { useList, useTableState, useCreate, useDelete, useLookups, useForm } from '@/lib/hooks'
import { api } from '@/lib/api'
import { fmtDate, timeAgo, titleCase, cn, num } from '@/lib/utils'
import { hrefFor } from '@/lib/records'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { useToast } from '@/components/ui/Toast'

const TYPES = ['annual', 'sick', 'unpaid', 'compassionate', 'study', 'maternity']
const STATUSES = ['pending', 'approved', 'rejected', 'cancelled']

const dayDiff = (a, b) => Math.max(1, Math.round((new Date(b) - new Date(a)) / 86400000) + 1)

function LeaveForm({ open, onClose, lockGuardId }) {
  const { data: lk } = useLookups()
  const toast = useToast()
  const create = useCreate('leave', { label: 'Leave request', onSuccess: onClose })

  const blank = {
    guardId: lockGuardId || '', type: 'annual',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10),
    reason: '', coveredBy: '',
  }
  const f = useForm(blank)
  useEffect(() => { if (open) f.reset({ ...blank, guardId: lockGuardId || '' }) /* eslint-disable-next-line */ }, [open, lockGuardId])

  const days = useMemo(
    () => (f.values.startDate && f.values.endDate ? dayDiff(f.values.startDate, f.values.endDate) : 0),
    [f.values.startDate, f.values.endDate]
  )

  const submit = async (e) => {
    e.preventDefault()
    try {
      await create.mutateAsync({
        ...f.values,
        coveredBy: f.values.coveredBy || null,
        days,
        ref: 'LV-' + Math.floor(1000 + Math.random() * 8999),
        status: 'pending',
        requestedAt: new Date().toISOString(),
        approvedBy: null,
        decidedAt: null,
        balanceBefore: 18,
      })
    } catch (err) {
      f.applyServerError(err)
      if (!err.fields) toast.error('Could not submit request', { body: err.message })
    }
  }

  return (
    <Drawer
      open={open} onClose={onClose}
      title="New leave request"
      subtitle="Requests route to the operations manager for approval"
      width="max-w-xl"
      footer={
        <>
          <span className="mr-auto text-[12px] text-faint">{days} calendar day{days === 1 ? '' : 's'}</span>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={create.isPending} onClick={submit}>Submit request</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4 p-5">
        {!lockGuardId && (
          <Field label="Officer" required error={f.errors.guardId}>
            <Select {...f.bind('guardId')}>
              <option value="">Select an officer…</option>
              {lk?.guards.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.employeeNo})</option>)}
            </Select>
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Leave type" required error={f.errors.type}>
            <Select {...f.bind('type')}>{TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Select>
          </Field>
          <Field label="First day" required error={f.errors.startDate}><Input type="date" {...f.bind('startDate')} /></Field>
          <Field label="Last day" required error={f.errors.endDate}><Input type="date" {...f.bind('endDate')} /></Field>
        </div>

        <Field label="Cover officer" hint="Nominating cover now avoids an approval conflict if the officer is already rostered.">
          <Select {...f.bind('coveredBy')}>
            <option value="">To be arranged</option>
            {lk?.guards.filter((g) => g.status === 'active' && g.id !== f.values.guardId).map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </Select>
        </Field>

        <Field label="Reason"><Textarea rows={3} {...f.bind('reason')} placeholder="Supporting detail for the approver…" /></Field>
      </form>
    </Drawer>
  )
}

function DecisionDrawer({ row, onClose, canDecide }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { data: lk } = useLookups()
  const [cover, setCover] = useState('')
  const [notes, setNotes] = useState('')
  const [conflict, setConflict] = useState(null)

  useEffect(() => { setCover(row?.coveredBy || ''); setNotes(row?.notes || ''); setConflict(null) }, [row?.id])

  const decide = useMutation({
    mutationFn: ({ status }) => api.decideLeave(row.id, { status, notes, coveredBy: cover || null }),
    onMutate: async ({ status }) => {
      await qc.cancelQueries({ queryKey: ['leave'] })
      const snaps = qc.getQueriesData({ queryKey: ['leave', 'list'] })
      snaps.forEach(([key, data]) => {
        if (!data) return
        qc.setQueryData(key, { ...data, rows: data.rows.map((r) => (r.id === row.id ? { ...r, status, __optimistic: true } : r)) })
      })
      return { snaps }
    },
    onError: (err, _v, ctx) => {
      ctx?.snaps.forEach(([key, data]) => qc.setQueryData(key, data))
      if (err.status === 409) setConflict(err.message)
      else toast.error('Decision not saved', { body: err.message })
    },
    onSuccess: (_r, v) => {
      toast.success(v.status === 'approved' ? 'Leave approved' : 'Leave rejected')
      onClose()
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: ['leave'] }); qc.invalidateQueries({ queryKey: ['intelligence'] }) },
  })

  if (!row) return null

  return (
    <Drawer
      open={!!row}
      onClose={onClose}
      title={`${row.ref} for ${row._guard?.name || 'the officer'}`}
      subtitle={`${titleCase(row.type)} leave · ${fmtDate(row.startDate)} → ${fmtDate(row.endDate)}`}
      badge={<Badge value={row.status} dot />}
      width="max-w-xl"
      footer={
        canDecide && row.status === 'pending' ? (
          <>
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button variant="secondary" icon={X} loading={decide.isPending} onClick={() => decide.mutate({ status: 'rejected' })}>Reject</Button>
            <Button variant="primary" icon={Check} loading={decide.isPending} onClick={() => decide.mutate({ status: 'approved' })}>Approve</Button>
          </>
        ) : <Button variant="ghost" onClick={onClose}>Close</Button>
      }
    >
      <div className="space-y-4 p-5">
        <div className="flex items-center gap-3 rounded-lg border border-line bg-surface2/40 p-3">
          <Avatar name={row._guard?.name || 'Unassigned'} size={38} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-ink">{row._guard?.name}</p>
            <p className="mono truncate text-[11.5px] text-faint">{row._guard?.employeeNo} · {row._guard?.rank}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="mono text-[20px] font-bold leading-none text-ink">{row.days}</p>
            <p className="text-[10.5px] uppercase tracking-wide text-faint">days</p>
          </div>
        </div>

        {conflict && (
          <div className="flex items-start gap-2.5 rounded-lg border border-critical/30 bg-critical/10 p-3">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-critical" />
            <div>
              <p className="text-[12.5px] font-semibold text-critical">Approval blocked</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{conflict}</p>
            </div>
          </div>
        )}

        <Card title="Request detail">
          <div className="space-y-2 text-[12.5px]">
            {[
              ['Type', titleCase(row.type)],
              ['Period', `${fmtDate(row.startDate)} → ${fmtDate(row.endDate)}`],
              ['Calendar days', row.days],
              ['Requested', timeAgo(row.requestedAt)],
              ['Balance before', `${row.balanceBefore} days`],
              ['Decided by', row.approvedBy || 'Not yet decided'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-line/50 pb-2 last:border-0">
                <span className="text-muted">{k}</span>
                <span className="text-right font-medium text-ink">{v}</span>
              </div>
            ))}
          </div>
          {row.reason && <p className="mt-3 border-t border-line pt-3 text-[12.5px] leading-relaxed text-muted">{row.reason}</p>}
        </Card>

        {canDecide && row.status === 'pending' && (
          <Card title="Decision">
            <div className="space-y-4">
              <Field label="Cover officer" hint="Required if the officer is already rostered during this period.">
                <Select value={cover} onChange={(e) => setCover(e.target.value)}>
                  <option value="">No cover nominated</option>
                  {lk?.guards.filter((g) => g.status === 'active' && g.id !== row.guardId).map((g) => (
                    <option key={g.id} value={g.id}>{g.name} ({g.rank})</option>
                  ))}
                </Select>
              </Field>
              <Field label="Note to the officer">
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional, shown on the decision." />
              </Field>
            </div>
          </Card>
        )}

        {row.notes && row.status !== 'pending' && (
          <Card title="Decision note">
            <p className="text-[12.5px] leading-relaxed text-muted">{row.notes}</p>
          </Card>
        )}
      </div>
    </Drawer>
  )
}

export default function Leave() {
  const { can, user, isGuard } = useAuth()
  const navigate = useNavigate()
  const t = useTableState({ sort: 'startDate', dir: 'desc' })
  const [tab, setTab] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [detail, setDetail] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const filters = { ...t.filters, ...(tab === 'all' ? {} : { status: tab }) }
  const query = useList('leave', { ...t.params, filters, facet: 'status' })
  const allQ = useList('leave', { all: true, pageSize: 500 })
  const del = useDelete('leave', { label: 'Leave request' })

  const live = detail ? (query.data?.rows || []).find((r) => r.id === detail.id) || detail : null
  const all = allQ.data?.rows || []
  const today = new Date().toISOString().slice(0, 10)
  const pending = all.filter((r) => r.status === 'pending')
  const onLeaveToday = all.filter((r) => r.status === 'approved' && r.startDate <= today && r.endDate >= today)
  const next30 = all.filter((r) => r.status === 'approved' && r.startDate > today && new Date(r.startDate) < Date.now() + 30 * 86400000)
  const uncovered = all.filter((r) => r.status === 'approved' && !r.coveredBy && r.endDate >= today)

  const byType = TYPES.map((ty) => ({ name: titleCase(ty), value: all.filter((r) => r.type === ty).length })).filter((x) => x.value)

  const facets = query.data?.facets || {}
  const tabs = [
    { value: 'all', label: 'All requests', count: Object.values(facets).reduce((a, b) => a + b, 0) },
    ...STATUSES.map((s) => ({ value: s, label: titleCase(s), count: facets[s] || 0 })),
  ]

  const columns = [
    { key: 'ref', header: 'Ref', width: 110, render: (r) => <span className="mono text-[12px] font-semibold text-ink">{r.ref}</span> },
    ...(isGuard ? [] : [{
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
    }]),
    { key: 'type', header: 'Type', width: 130, render: (r) => <span className="text-[12.5px] text-muted">{titleCase(r.type)}</span> },
    {
      key: 'startDate', header: 'Period', width: 200,
      render: (r) => (
        <div>
          <p className="mono text-[12.5px] text-ink">{fmtDate(r.startDate)} → {fmtDate(r.endDate)}</p>
          <p className="text-[10.5px] text-faint">{r.days} day{r.days === 1 ? '' : 's'}{r.startDate > today ? ` · starts ${timeAgo(r.startDate)}` : ''}</p>
        </div>
      ),
    },
    {
      key: 'coveredBy', header: 'Cover', sortable: false, width: 160,
      render: (r) => r._cover
        ? <span className="truncate text-[12.5px] text-muted">{r._cover.name}</span>
        : r.status === 'approved'
          ? <span className="chip border-warn/25 bg-warn/10 text-warn">Not arranged</span>
          : <span className="text-[12px] text-faint"></span>,
    },
    { key: 'status', header: 'Status', width: 124, render: (r) => <Badge value={r.status} dot /> },
    { key: 'requestedAt', header: 'Requested', width: 120, render: (r) => <span className="text-[12px] text-muted">{timeAgo(r.requestedAt)}</span> },
    {
      key: 'actions', header: '', sortable: false, width: 56, align: 'right',
      render: (r) => can('leave', 'delete') && (
        <div onClick={(e) => e.stopPropagation()}>
          <button className="btn btn-ghost h-7 w-7 px-0 text-critical" onClick={() => setConfirm(r)}>
            <CalendarOff size={13} />
          </button>
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title={isGuard ? 'My leave' : 'Leave Management'}
        subtitle="Requests, approvals and the cover arrangements that keep posts staffed."
        actions={can('leave', 'create') && (
          <Button variant="primary" icon={Plus} onClick={() => setFormOpen(true)}>Request leave</Button>
        )}
        tabs={<Tabs tabs={tabs} value={tab} onChange={(v) => { setTab(v); t.setPage(1) }} className="mt-4" />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Awaiting approval" value={pending.length} icon={Clock} tone="warn" loading={allQ.isLoading} hint={`${pending.reduce((a, r) => a + r.days, 0)} days requested`} />
        <StatCard label="On leave today" value={onLeaveToday.length} icon={PalmtreeIcon} tone="accent" loading={allQ.isLoading} hint="Officers unavailable right now" />
        <StatCard label="Starting in 30 days" value={next30.length} icon={CalendarCheck} tone="accent2" loading={allQ.isLoading} hint={`${next30.reduce((a, r) => a + r.days, 0)} days booked`} />
        <StatCard label="Cover not arranged" value={uncovered.length} icon={Users} tone="critical" loading={allQ.isLoading} hint="Approved leave without a nominated officer" />
      </div>

      {pending.length > 0 && can('leave', 'update') && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-warn/25 bg-warn/[.07] px-4 py-3">
          <Clock size={16} className="text-warn" />
          <p className="flex-1 text-[12.5px] text-ink">
            <span className="mono font-bold">{pending.length}</span> leave request{pending.length === 1 ? '' : 's'} awaiting your decision.
            The oldest has been waiting {timeAgo(pending.map((p) => p.requestedAt).sort()[0])}.
          </p>
          <Button size="sm" variant="secondary" onClick={() => setTab('pending')}>Review now</Button>
        </div>
      )}

      {!isGuard && byType.length > 0 && (
        <Card className="mb-4" title="Leave by type" subtitle="All recorded requests">
          <BarsChart data={byType} height={190} bars={[{ key: 'value', label: 'Requests', color: 'accent' }]} />
        </Card>
      )}

      <Toolbar
        q={t.q} onQ={t.setQ}
        placeholder="Search reference, type, reason…"
        activeFilters={t.activeFilters} onReset={t.reset}
        exportName="leave"
        exportRows={() => (query.data?.rows || []).map((r) => ({
          ref: r.ref, officer: r._guard?.name, employeeNo: r._guard?.employeeNo, type: r.type,
          startDate: r.startDate, endDate: r.endDate, days: r.days, status: r.status,
          cover: r._cover?.name || '', approvedBy: r.approvedBy || '', requestedAt: r.requestedAt,
        }))}
        filters={<FilterSelect label="Type" value={t.filters.type} onChange={(v) => t.setFilter('type', v)} options={TYPES} />}
      />

      <DataTable
        columns={columns}
        rows={query.data?.rows || []}
        loading={query.isLoading} fetching={query.isFetching}
        sort={query.data?.sort} dir={query.data?.dir} onSort={t.toggleSort}
        page={query.data?.page} pageCount={query.data?.pageCount} pageSize={t.pageSize}
        total={query.data?.total} from={query.data?.from} to={query.data?.to}
        onPage={t.setPage} onPageSize={t.setPageSize}
        onRowClick={(r) => navigate(hrefFor('leave', r.id))}
        emptyIcon={PalmtreeIcon}
        emptyTitle="No leave requests"
        emptyBody="Nothing has been requested in this view."
      />

      <LeaveForm open={formOpen} onClose={() => setFormOpen(false)} lockGuardId={isGuard ? user.guardId : null} />
      <DecisionDrawer row={live} onClose={() => setDetail(null)} canDecide={can('leave', 'update')} />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Withdraw this leave request?"
        body={`${confirm?.ref} for ${confirm?._guard?.name} will be removed from the leave register.`}
        confirmLabel="Withdraw request"
        onConfirm={() => del.mutate(confirm.id)}
      />
    </>
  )
}
