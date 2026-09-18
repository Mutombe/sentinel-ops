import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Plus, Gavel, Award, AlertTriangle, ShieldAlert, CheckCircle2, UserX, Ban,
  MessageSquareWarning, FileWarning, ChevronRight, Star,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { DataTable } from '@/components/ui/DataTable'
import { Toolbar, FilterSelect } from '@/components/ui/Toolbar'
import { Drawer } from '@/components/ui/Modal'
import {
  Badge, Button, Field, Input, Select, Textarea, Avatar, Tabs, StatCard, Card,
  Switch, Progress, EmptyState, Skeleton,
} from '@/components/ui/primitives'
import { BarsChart } from '@/components/charts/Charts'
import { useList, useTableState, useCreate, useLookups, useForm } from '@/lib/hooks'
import { hrefFor } from '@/lib/records'
import { fmtDate, timeAgo, cn } from '@/lib/utils'
import { useAuth } from '@/auth/AuthContext'
import { useToast } from '@/components/ui/Toast'

/* The progressive discipline ladder. Each rung is its own sub module with its
   own presentation, because a verbal warning and a dismissal are not the same
   kind of record and should not look the same. */
const LADDER = [
  { type: 'verbal_warning', label: 'Verbal warning', short: 'Verbal', icon: MessageSquareWarning, tone: 'warn', months: 3 },
  { type: 'written_warning', label: 'Written warning', short: 'Written', icon: FileWarning, tone: 'danger', months: 6 },
  { type: 'final_warning', label: 'Final warning', short: 'Final', icon: ShieldAlert, tone: 'critical', months: 12 },
  { type: 'suspension', label: 'Suspension', short: 'Suspension', icon: Ban, tone: 'critical', months: 12 },
  { type: 'dismissal', label: 'Dismissal', short: 'Dismissal', icon: UserX, tone: 'critical', months: 120 },
]
const WARNING_TYPES = ['verbal_warning', 'written_warning', 'final_warning']
const TYPE_META = Object.fromEntries(LADDER.map((l) => [l.type, l]))
TYPE_META.commendation = { type: 'commendation', label: 'Commendation', short: 'Commendation', icon: Award, tone: 'ok', months: 120 }

const CATEGORIES = [
  'Late arrival', 'Absence without leave', 'Sleeping on duty', 'Uniform non-compliance',
  'Post abandonment', 'Failure to complete patrol', 'Insubordination', 'Occurrence book neglect',
  'Mobile phone use on post', 'Client complaint', 'Negligence of duty', 'Alcohol on duty',
]
const COMMENDATIONS = [
  'Prevented theft in progress', 'Excellent client feedback', 'Perfect attendance quarter',
  'Apprehended intruder', 'First aid intervention', 'Exemplary inspection score',
]
const VALIDITY = { verbal_warning: 90, written_warning: 180, final_warning: 365, suspension: 365, dismissal: 3650, commendation: 3650 }

function TypeChip({ type, size }) {
  const m = TYPE_META[type] || TYPE_META.verbal_warning
  return (
    <span className={cn('chip', `border-${m.tone}/25 bg-${m.tone}/10 text-${m.tone}`, size === 'sm' && 'px-1.5 text-[10px]')}>
      <m.icon size={11} /> {m.short}
    </span>
  )
}

/* ------------------------------- new record ---------------------------- */
function RecordForm({ open, onClose, preset }) {
  const { data: lk } = useLookups()
  const toast = useToast()
  const create = useCreate('discipline', { label: 'Record', onSuccess: onClose })
  const blank = { guardId: '', type: preset || 'verbal_warning', category: CATEGORIES[0], description: '', sanction: '', acknowledged: false }
  const f = useForm(blank)

  useEffect(() => { if (open) f.reset({ ...blank, type: preset || 'verbal_warning' }) /* eslint-disable-next-line */ }, [open, preset])

  const isCommendation = f.values.type === 'commendation'
  const options = isCommendation ? COMMENDATIONS : CATEGORIES
  useEffect(() => {
    if (!options.includes(f.values.category)) f.set('category', options[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.values.type])

  const submit = async (e) => {
    e.preventDefault()
    const now = Date.now()
    try {
      await create.mutateAsync({
        ...f.values,
        ref: (isCommendation ? 'COM-' : 'DR-') + Math.floor(1000 + Math.random() * 8999),
        issuedBy: 'Operations',
        issuedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + (VALIDITY[f.values.type] || 180) * 86400000).toISOString(),
        status: 'active',
        incidentId: null,
        sanction: f.values.sanction || null,
      })
    } catch (err) {
      f.applyServerError(err)
      if (!err.fields) toast.error('Could not save the record', { body: err.message })
    }
  }

  return (
    <Drawer
      open={open} onClose={onClose}
      title={isCommendation ? 'Record a commendation' : 'Record a disciplinary action'}
      subtitle="Held against the officer file for the period set by the record type"
      width="max-w-xl"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={create.isPending} onClick={submit}>Record</Button></>}
    >
      <form onSubmit={submit} className="space-y-4 p-5">
        <Field label="Officer" required error={f.errors.guardId}>
          <Select {...f.bind('guardId')}>
            <option value="">Select an officer</option>
            {lk?.guards.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.employeeNo})</option>)}
          </Select>
        </Field>

        <Field label="Record type" required error={f.errors.type}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[...LADDER, TYPE_META.commendation].map((m) => (
              <button
                key={m.type}
                type="button"
                onClick={() => f.set('type', m.type)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[12px] font-semibold transition',
                  f.values.type === m.type
                    ? `border-${m.tone}/50 bg-${m.tone}/10 text-${m.tone}`
                    : 'border-line bg-surface2/40 text-muted hover:border-faint/60'
                )}
              >
                <m.icon size={14} className="shrink-0" /> {m.short}
              </button>
            ))}
          </div>
        </Field>

        <Field label={isCommendation ? 'Recognition' : 'Category'} required error={f.errors.category}>
          <Select {...f.bind('category')}>{options.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
        </Field>

        <Field label={isCommendation ? 'Citation' : 'Account of events'} hint={`Held on file for ${Math.round((VALIDITY[f.values.type] || 180) / 30)} months.`}>
          <Textarea rows={5} {...f.bind('description')} placeholder="What happened, when, who was present, what was said" />
        </Field>

        {f.values.type === 'suspension' && (
          <Field label="Sanction"><Input {...f.bind('sanction')} placeholder="e.g. 3 days without pay" /></Field>
        )}
        {f.values.type === 'dismissal' && (
          <Field label="Termination terms"><Input {...f.bind('sanction')} placeholder="e.g. Summary dismissal, notice paid in lieu" /></Field>
        )}

        <div className="rounded-lg border border-line bg-surface2/50 p-3.5">
          <Switch
            checked={!!f.values.acknowledged}
            onChange={(v) => f.set('acknowledged', v)}
            label="Officer has acknowledged receipt"
            hint="Records without acknowledgement carry less weight at a hearing."
          />
        </div>
      </form>
    </Drawer>
  )
}

/* ------------------------------- the page ------------------------------ */
export default function Discipline() {
  const { can, isGuard } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('overview')
  const [formOpen, setFormOpen] = useState(false)
  const [preset, setPreset] = useState(null)

  const allQ = useList('discipline', { all: true, pageSize: 600 })
  const all = allQ.data?.rows || []

  const byType = (type) => all.filter((r) => r.type === type)
  const warnings = all.filter((r) => WARNING_TYPES.includes(r.type))
  const suspensions = byType('suspension')
  const dismissals = byType('dismissal')
  const commendations = byType('commendation')
  const activeSanctions = all.filter((r) => r.type !== 'commendation' && r.status === 'active')

  /* Where each officer currently sits on the ladder. */
  const ladderByOfficer = useMemo(() => {
    const m = {}
    all.filter((r) => r.status === 'active' && r.type !== 'commendation').forEach((r) => {
      const rank = LADDER.findIndex((l) => l.type === r.type)
      if (!m[r.guardId] || rank > m[r.guardId].rank) {
        m[r.guardId] = { rank, record: r, name: r._guard?.name, employeeNo: r._guard?.employeeNo, guardId: r.guardId }
      }
      m[r.guardId].count = (m[r.guardId].count || 0) + 1
    })
    return m
  }, [all])

  const atRisk = Object.values(ladderByOfficer)
    .filter((x) => x.rank >= 2)
    .sort((a, b) => b.rank - a.rank || b.count - a.count)

  const byCategory = useMemo(() => {
    const m = {}
    all.filter((r) => r.type !== 'commendation').forEach((r) => { m[r.category] = (m[r.category] || 0) + 1 })
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8)
  }, [all])

  const tabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'warnings', label: 'Warnings', count: warnings.length },
    { value: 'suspensions', label: 'Suspensions', count: suspensions.length },
    { value: 'dismissals', label: 'Dismissals', count: dismissals.length },
    { value: 'commendations', label: 'Commendations', count: commendations.length },
  ]

  const openNew = (type) => { setPreset(type); setFormOpen(true) }

  return (
    <>
      <PageHeader
        title={isGuard ? 'My record' : 'Discipline and Recognition'}
        subtitle="Warnings, sanctions, dismissals and commendations, each held against the officer file."
        actions={can('discipline', 'create') && (
          <Button variant="primary" icon={Plus} onClick={() => openNew(null)}>New record</Button>
        )}
        tabs={<Tabs tabs={tabs} value={tab} onChange={setTab} className="mt-4" />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Live sanctions" value={activeSanctions.length} icon={Gavel} tone="warn" loading={allQ.isLoading} hint={`${all.length - commendations.length} issued in total`} />
        <StatCard label="On final warning" value={byType('final_warning').filter((r) => r.status === 'active').length} icon={ShieldAlert} tone="critical" loading={allQ.isLoading} hint="One step from dismissal" />
        <StatCard label="Unacknowledged" value={activeSanctions.filter((r) => !r.acknowledged).length} icon={AlertTriangle} tone="danger" loading={allQ.isLoading} hint="Not signed by the officer" />
        <StatCard label="Commendations" value={commendations.length} icon={Award} tone="ok" loading={allQ.isLoading} hint="Positive records on file" />
      </div>

      {/* ------------------------------ overview ----------------------------- */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <Card title="Progressive discipline ladder" subtitle="How many live records sit at each stage, and who is where">
            <div className="flex flex-wrap items-stretch gap-2">
              {LADDER.map((l, i) => {
                const live = all.filter((r) => r.type === l.type && r.status === 'active').length
                const total = byType(l.type).length
                return (
                  <React.Fragment key={l.type}>
                    {i > 0 && <div className="hidden self-center text-faint sm:block"><ChevronRight size={16} /></div>}
                    <button
                      onClick={() => setTab(l.type === 'suspension' ? 'suspensions' : l.type === 'dismissal' ? 'dismissals' : 'warnings')}
                      className={cn(
                        'flex-1 rounded-xl border p-3.5 text-left transition hover:shadow-pop',
                        live ? `border-${l.tone}/30 bg-${l.tone}/[.07]` : 'border-line bg-surface2/30'
                      )}
                    >
                      <l.icon size={16} className={cn(live ? `text-${l.tone}` : 'text-faint')} />
                      <p className="mono mt-2 text-[22px] font-bold leading-none text-ink">{live}</p>
                      <p className="mt-1 text-[11.5px] font-semibold text-ink">{l.label}</p>
                      <p className="text-[10.5px] text-faint">{total} ever, lapses after {l.months} months</p>
                    </button>
                  </React.Fragment>
                )
              })}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Officers at risk" subtitle="Sitting at final warning or beyond" noPad>
              {allQ.isLoading ? (
                <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
              ) : atRisk.length === 0 ? (
                <EmptyState icon={CheckCircle2} title="Nobody at final warning" body="No officer is currently at the top of the ladder." />
              ) : (
                <ul className="divide-y divide-line/60">
                  {atRisk.slice(0, 8).map((x) => {
                    const m = LADDER[x.rank]
                    return (
                      <li key={x.guardId}>
                        <Link to={`/guards/${x.guardId}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface2/60">
                          <Avatar name={x.name || 'Officer'} size={30} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12.5px] font-semibold text-ink">{x.name}</p>
                            <p className="mono truncate text-[11px] text-faint">{x.employeeNo} · {x.count} live records</p>
                          </div>
                          <TypeChip type={m.type} />
                          <ChevronRight size={13} className="shrink-0 text-faint" />
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>

            <Card title="Most common causes" subtitle="Across every disciplinary record">
              {byCategory.length ? (
                <BarsChart data={byCategory} layout="vertical" height={250} bars={[{ key: 'value', label: 'Records', color: 'danger' }]} />
              ) : <EmptyState icon={Gavel} title="Nothing recorded" />}
            </Card>
          </div>

          <Card
            title="Recent commendations"
            subtitle="The other half of the record"
            actions={<button onClick={() => setTab('commendations')} className="link-action">See all</button>}
            noPad
          >
            {commendations.length === 0 ? (
              <EmptyState icon={Award} title="No commendations yet" />
            ) : (
              <ul className="divide-y divide-line/60">
                {commendations.slice(0, 4).map((r) => (
                  <li key={r.id}>
                    <Link to={hrefFor('discipline', r.id)} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface2/60">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-ok/25 bg-ok/10 text-ok">
                        <Award size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold text-ink">{r.category}</p>
                        <p className="truncate text-[11px] text-faint">{r._guard?.name} · {timeAgo(r.issuedAt)}</p>
                      </div>
                      <ChevronRight size={13} className="shrink-0 text-faint" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {/* ------------------------------ warnings ----------------------------- */}
      {tab === 'warnings' && (
        <WarningsView rows={warnings} loading={allQ.isLoading} ladder={ladderByOfficer} onNew={() => openNew('verbal_warning')} canCreate={can('discipline', 'create')} navigate={navigate} />
      )}

      {/* ---------------------------- suspensions ---------------------------- */}
      {tab === 'suspensions' && (
        <SuspensionsView rows={suspensions} loading={allQ.isLoading} onNew={() => openNew('suspension')} canCreate={can('discipline', 'create')} />
      )}

      {/* ----------------------------- dismissals ---------------------------- */}
      {tab === 'dismissals' && (
        <DismissalsView rows={dismissals} loading={allQ.isLoading} />
      )}

      {/* --------------------------- commendations --------------------------- */}
      {tab === 'commendations' && (
        <CommendationsView rows={commendations} loading={allQ.isLoading} onNew={() => openNew('commendation')} canCreate={can('discipline', 'create')} />
      )}

      <RecordForm open={formOpen} onClose={() => { setFormOpen(false); setPreset(null) }} preset={preset} />
    </>
  )
}

/* ===================== warnings: the ladder, as a table ================= */
function WarningsView({ rows, loading, ladder, onNew, canCreate, navigate }) {
  const t = useTableState({ sort: 'issuedAt', dir: 'desc' })
  const [stage, setStage] = useState('all')

  const filtered = useMemo(() => {
    let list = rows
    if (stage !== 'all') list = list.filter((r) => r.type === stage)
    const q = t.q.trim().toLowerCase()
    if (q) list = list.filter((r) => [r.ref, r.category, r.description, r._guard?.name].filter(Boolean).some((v) => v.toLowerCase().includes(q)))
    if (t.filters.status && t.filters.status !== 'all') list = list.filter((r) => r.status === t.filters.status)
    return list
  }, [rows, stage, t.q, t.filters])

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        {[{ value: 'all', label: `All warnings ${rows.length}` }, ...WARNING_TYPES.map((w) => ({ value: w, label: `${TYPE_META[w].short} ${rows.filter((r) => r.type === w).length}` }))].map((o) => (
          <button
            key={o.value}
            onClick={() => setStage(o.value)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition',
              stage === o.value ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-surface2/40 text-muted hover:text-ink'
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      <Toolbar
        q={t.q} onQ={t.setQ}
        placeholder="Search reference, officer or reason"
        activeFilters={t.activeFilters} onReset={t.reset}
        exportName="warnings"
        exportRows={() => filtered.map((r) => ({ ref: r.ref, officer: r._guard?.name, type: r.type, category: r.category, issuedAt: r.issuedAt, expiresAt: r.expiresAt, status: r.status, acknowledged: r.acknowledged }))}
        filters={<FilterSelect label="Status" value={t.filters.status} onChange={(v) => t.setFilter('status', v)} options={['active', 'expired', 'appealed', 'overturned']} />}
        right={canCreate && <Button size="sm" variant="secondary" icon={Plus} onClick={onNew}>Issue warning</Button>}
      />

      <DataTable
        columns={[
          { key: 'ref', header: 'Ref', width: 110, render: (r) => <span className="mono text-[12px] font-semibold text-ink">{r.ref}</span> },
          {
            key: 'guardId', header: 'Officer', sortable: false,
            render: (r) => (
              <div className="flex items-center gap-2.5">
                <Avatar name={r._guard?.name || 'Officer'} size={26} />
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-semibold text-ink">{r._guard?.name}</p>
                  <p className="mono truncate text-[11px] text-faint">{r._guard?.employeeNo}</p>
                </div>
              </div>
            ),
          },
          { key: 'type', header: 'Stage', width: 130, render: (r) => <TypeChip type={r.type} /> },
          {
            key: 'ladder', header: 'On file', sortable: false, width: 120,
            render: (r) => {
              const pos = ladder[r.guardId]
              if (!pos) return <span className="text-[12px] text-faint">Lapsed</span>
              return (
                <div className="flex items-center gap-1.5">
                  <Progress value={(pos.rank + 1) / LADDER.length * 100} tone={pos.rank >= 2 ? 'critical' : 'warn'} className="w-12" />
                  <span className="mono text-[11px] text-muted">{pos.count}</span>
                </div>
              )
            },
          },
          { key: 'category', header: 'Reason', render: (r) => <span className="truncate text-[12.5px] text-muted">{r.category}</span> },
          { key: 'issuedAt', header: 'Issued', width: 116, render: (r) => <span className="text-[12.5px] text-muted">{fmtDate(r.issuedAt)}</span> },
          { key: 'expiresAt', header: 'Until', width: 110, render: (r) => <span className="text-[12.5px] text-muted">{fmtDate(r.expiresAt)}</span> },
          { key: 'acknowledged', header: 'Signed', align: 'center', width: 80, render: (r) => r.acknowledged ? <CheckCircle2 size={14} className="mx-auto text-ok" /> : <span className="text-[11.5px] text-warn">No</span> },
          { key: 'status', header: 'Status', width: 124, render: (r) => <Badge value={r.status} dot /> },
        ]}
        rows={filtered}
        loading={loading}
        sort={t.sort} dir={t.dir} onSort={t.toggleSort}
        onRowClick={(r) => navigate(hrefFor('discipline', r.id))}
        emptyIcon={Gavel} emptyTitle="No warnings in this view"
      />
    </>
  )
}

/* ================== suspensions: pay impact and return date ============= */
function SuspensionsView({ rows, loading, onNew, canCreate }) {
  const sorted = [...rows].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
  const days = (r) => {
    const m = /(\d+)\s*day/i.exec(r.sanction || '')
    return m ? +m[1] : null
  }
  return (
    <>
      {canCreate && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" variant="secondary" icon={Ban} onClick={onNew}>Record a suspension</Button>
        </div>
      )}
      {loading ? (
        <div className="grid gap-3 lg:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>
      ) : sorted.length === 0 ? (
        <Card><EmptyState icon={Ban} title="No suspensions on record" body="Nobody has been suspended." /></Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {sorted.map((r) => {
            const d = days(r)
            const back = d ? new Date(new Date(r.issuedAt).getTime() + d * 86400000) : null
            const served = back ? back.getTime() < Date.now() : true
            return (
              <Link key={r.id} to={hrefFor('discipline', r.id)} className="card p-4 transition hover:border-critical/40 hover:shadow-pop">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-critical/25 bg-critical/10 text-critical">
                    <Ban size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[13.5px] font-semibold text-ink">{r._guard?.name}</p>
                      <span className="mono text-[11px] text-faint">{r.ref}</span>
                      <Badge value={r.status} size="sm" dot />
                    </div>
                    <p className="mt-0.5 text-[12px] font-medium text-critical">{r.category}</p>
                  </div>
                </div>

                <p className="mt-3 line-clamp-2 text-[12.5px] leading-relaxed text-muted">{r.description}</p>

                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-faint">Sanction</p>
                    <p className="mt-0.5 text-[12px] font-semibold text-ink">{r.sanction || 'Not recorded'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-faint">Suspended</p>
                    <p className="mt-0.5 text-[12px] font-semibold text-ink">{fmtDate(r.issuedAt)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-faint">Back on duty</p>
                    <p className={cn('mt-0.5 text-[12px] font-semibold', served ? 'text-ok' : 'text-warn')}>
                      {back ? fmtDate(back) : 'Not set'}
                    </p>
                  </div>
                </div>

                {!r.acknowledged && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-warn/12 px-2 py-1 text-[11px] font-semibold text-warn">
                    <AlertTriangle size={10} /> Not signed by the officer
                  </p>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}

/* ==================== dismissals: the terminal record =================== */
function DismissalsView({ rows, loading }) {
  const sorted = [...rows].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
  return loading ? (
    <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
  ) : sorted.length === 0 ? (
    <Card><EmptyState icon={UserX} title="No dismissals on record" body="No contract has been terminated for conduct." /></Card>
  ) : (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5 rounded-xl border border-critical/25 bg-critical/[.07] px-4 py-3">
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-critical" />
        <p className="text-[12px] leading-relaxed text-muted">
          Dismissal records are held for ten years and are disclosed on any reference request. They cannot be
          removed from the register, only overturned on appeal.
        </p>
      </div>
      {sorted.map((r) => (
        <Link key={r.id} to={hrefFor('discipline', r.id)} className="card block p-4 transition hover:border-critical/40">
          <div className="flex flex-wrap items-start gap-4">
            <Avatar name={r._guard?.name || 'Officer'} size={44} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[14px] font-bold text-ink">{r._guard?.name}</p>
                <span className="mono text-[11px] text-faint">{r.ref}</span>
                <TypeChip type={r.type} />
                <Badge value={r.status} size="sm" dot />
              </div>
              <p className="mt-1 text-[12.5px] font-medium text-critical">{r.category}</p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{r.description}</p>
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 border-t border-line pt-3 text-[11.5px]">
                {[
                  ['Terminated', fmtDate(r.issuedAt)],
                  ['Authorised by', r.issuedBy],
                  ['Terms', r.sanction || 'Not recorded'],
                  ['Acknowledged', r.acknowledged ? 'Yes' : 'No'],
                  ['On file until', fmtDate(r.expiresAt)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-faint">{k}</dt>
                    <dd className="font-semibold text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

/* =================== commendations: recognition, not sanction =========== */
function CommendationsView({ rows, loading, onNew, canCreate }) {
  const sorted = [...rows].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
  return (
    <>
      {canCreate && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" variant="secondary" icon={Award} onClick={onNew}>Record a commendation</Button>
        </div>
      )}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}</div>
      ) : sorted.length === 0 ? (
        <Card><EmptyState icon={Award} title="No commendations yet" body="Recognise good work and it appears here." /></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((r) => (
            <Link
              key={r.id}
              to={hrefFor('discipline', r.id)}
              className="group relative overflow-hidden rounded-xl border border-ok/25 bg-ok/[.05] p-4 transition hover:border-ok/50 hover:shadow-pop"
            >
              <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-ok/10 blur-2xl" />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-full border border-ok/30 bg-ok/12 text-ok">
                    <Award size={18} />
                  </span>
                  <span className="mono text-[11px] text-faint">{r.ref}</span>
                </div>
                <p className="mt-3 text-[13.5px] font-bold leading-snug text-ink">{r.category}</p>
                <p className="mt-1.5 line-clamp-3 text-[12px] leading-relaxed text-muted">{r.description}</p>
                <div className="mt-3 flex items-center gap-2.5 border-t border-ok/20 pt-3">
                  <Avatar name={r._guard?.name || 'Officer'} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-ink">{r._guard?.name}</p>
                    <p className="truncate text-[10.5px] text-faint">{fmtDate(r.issuedAt)} · {r.issuedBy}</p>
                  </div>
                  <Star size={13} className="shrink-0 fill-ok text-ok" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
