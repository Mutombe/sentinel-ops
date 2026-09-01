import React, { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardCheck, Plus, Trash2, CheckCircle2, XCircle, MinusCircle, AlertTriangle,
  ListChecks, Gauge, UserCheck, Moon, Users, FileDown, Printer,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { DataTable } from '@/components/ui/DataTable'
import { Toolbar, FilterSelect } from '@/components/ui/Toolbar'
import { Drawer, ConfirmDialog } from '@/components/ui/Modal'
import {
  Badge, Button, Field, Input, Select, Textarea, Avatar, Tabs, StatCard, Card,
  Progress, EmptyState, Checkbox, Switch, Skeleton,
} from '@/components/ui/primitives'
import { BarsChart } from '@/components/charts/Charts'
import { useList, useTableState, useCreate, useDelete, useBulk, useLookups, useForm } from '@/lib/hooks'
import { api } from '@/lib/api'
import { fmtDateTime, fmtDate, timeAgo, titleCase, duration, cn, download, toCSV } from '@/lib/utils'
import { hrefFor } from '@/lib/records'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { useToast } from '@/components/ui/Toast'

const TYPES = ['routine', 'spot_check', 'night_visit', 'client_joint']
const TYPE_LABEL = {
  routine: 'Routine visit',
  spot_check: 'Spot check',
  night_visit: 'Night visit',
  client_joint: 'Joint client visit',
}
const STATUSES = ['draft', 'submitted', 'actioned', 'closed']

const TEMPLATE = [
  {
    name: 'Presentation & Discipline',
    items: [
      'Uniform complete, clean and correctly worn',
      'Officer alert, standing and correctly posted',
      'Appointment certificate and ZRP registration card carried',
      'Radio present, charged and on the correct channel',
    ],
  },
  {
    name: 'Access Control',
    items: [
      'Visitor register complete and legible',
      'Outbound vehicle searches being conducted',
      'All access points manned or secured',
      'Identification verified before entry granted',
    ],
  },
  {
    name: 'Post & Documentation',
    items: [
      'Occurrence book written up and current',
      'Post orders available and understood at the post',
      'Emergency contact list displayed',
      'Handover conducted and signed',
    ],
  },
  {
    name: 'Site Condition',
    items: [
      'Perimeter fence and gates intact',
      'Security lighting fully operational',
      'CCTV cameras functional and unobstructed',
      'Fire equipment in date and accessible',
    ],
  },
]

function scoreOf(sections) {
  const flat = sections.flatMap((s) => s.items)
  const scored = flat.filter((i) => i.result !== 'na')
  if (!scored.length) return 100
  return Math.round((scored.filter((i) => i.result === 'pass').length / scored.length) * 100)
}

function ScorePill({ score, size = 'md' }) {
  const tone = score >= 90 ? 'ok' : score >= 75 ? 'warn' : 'critical'
  return (
    <span className={cn(
      'mono inline-flex items-center justify-center rounded-md font-bold',
      `text-${tone} bg-${tone}/10 border border-${tone}/25`,
      size === 'lg' ? 'px-3 py-1.5 text-[18px]' : 'px-2 py-1 text-[12.5px]'
    )}>
      {score}%
    </span>
  )
}

const RESULTS = [
  { value: 'pass', label: 'Pass', icon: CheckCircle2, tone: 'ok' },
  { value: 'fail', label: 'Fail', icon: XCircle, tone: 'critical' },
  { value: 'na', label: 'N/A', icon: MinusCircle, tone: 'muted' },
]

function ResultToggle({ value, onChange }) {
  return (
    <div className="inline-flex shrink-0 rounded-lg border border-line bg-surface2 p-0.5">
      {RESULTS.map((r) => {
        const active = value === r.value
        return (
          <button
            key={r.value}
            type="button"
            onClick={() => onChange(r.value)}
            className={cn(
              'flex items-center gap-1 rounded-[6px] px-2 py-1 text-[11.5px] font-semibold transition',
              active ? `bg-${r.tone}/15 text-${r.tone}` : 'text-faint hover:text-muted'
            )}
          >
            <r.icon size={12} />
            <span className="hidden sm:inline">{r.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ---------------------------- new inspection ---------------------------- */
function InspectionForm({ open, onClose }) {
  const { data: lk } = useLookups()
  const toast = useToast()
  const { user } = useAuth()
  const create = useCreate('inspections', { label: 'Inspection', onSuccess: onClose })

  const blank = () => ({
    siteId: '', type: 'routine', durationMins: 30, summary: '', clientVisible: true,
    sections: TEMPLATE.map((s) => ({ name: s.name, items: s.items.map((q) => ({ q, result: 'pass', note: '' })) })),
    guardsChecked: [],
  })
  const f = useForm(blank())

  useEffect(() => { if (open) f.reset(blank()) /* eslint-disable-next-line */ }, [open])

  const score = useMemo(() => scoreOf(f.values.sections), [f.values.sections])
  const fails = useMemo(
    () => f.values.sections.flatMap((s) => s.items).filter((i) => i.result === 'fail'),
    [f.values.sections]
  )

  const siteGuards = useMemo(
    () => (lk?.guards || []).filter((g) => g.siteId === f.values.siteId && g.status === 'active'),
    [lk, f.values.siteId]
  )

  const setItem = (si, ii, patch) => {
    const sections = f.values.sections.map((s, x) =>
      x !== si ? s : { ...s, items: s.items.map((it, y) => (y !== ii ? it : { ...it, ...patch })) }
    )
    f.set('sections', sections)
  }

  const toggleGuard = (gid) => {
    const list = f.values.guardsChecked
    f.set('guardsChecked', list.some((g) => g.guardId === gid)
      ? list.filter((g) => g.guardId !== gid)
      : [...list, { guardId: gid, uniform: 'pass', alertness: 'pass', knowledge: 'pass', documentation: 'pass', note: '' }])
  }

  const submit = async (e) => {
    e.preventDefault()
    const site = lk?.sites.find((s) => s.id === f.values.siteId)
    const findings = fails.map((i, n) => ({
      id: 'fd_' + Date.now() + '_' + n,
      area: i.q,
      detail: i.note || 'Non-conformance observed during inspection.',
      severity: 'medium',
    }))
    try {
      await create.mutateAsync({
        ...f.values,
        ref: 'INSP-' + Math.floor(1000 + Math.random() * 8999),
        clientId: site?.clientId || null,
        supervisorId: user.guardId || null,
        supervisorName: user.name,
        at: new Date().toISOString(),
        score,
        maxScore: 100,
        findings,
        actionsRequired: findings.map((fd, n) => ({
          id: 'ia_' + Date.now() + '_' + n,
          description: `Correct: ${fd.area}`,
          owner: 'Site Supervisor',
          dueAt: new Date(Date.now() + 7 * 86400000).toISOString(),
          status: 'open',
        })),
        status: findings.length ? 'actioned' : 'submitted',
        durationMins: +f.values.durationMins || 30,
      })
    } catch (err) {
      f.applyServerError(err)
      if (!err.fields) toast.error('Could not file inspection', { body: err.message })
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="New site inspection"
      subtitle="Walk the checklist. The compliance score is calculated as you go"
      badge={<ScorePill score={score} />}
      width="max-w-3xl"
      footer={
        <>
          <span className="mr-auto text-[12px] text-faint">
            {fails.length ? `${fails.length} non-conformance${fails.length === 1 ? '' : 's'} will raise corrective actions` : 'No findings, a clean inspection'}
          </span>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={create.isPending} onClick={submit}>File inspection</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Site" required error={f.errors.siteId} className="sm:col-span-2">
            <Select {...f.bind('siteId')}>
              <option value="">Select a site…</option>
              {lk?.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Visit type" required error={f.errors.type}>
            <Select {...f.bind('type')}>
              {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </Select>
          </Field>
        </div>

        {f.values.sections.map((sec, si) => {
          const secScore = scoreOf([sec])
          return (
            <section key={sec.name} className="rounded-xl border border-line">
              <header className="flex items-center justify-between gap-3 border-b border-line bg-surface2/50 px-4 py-2.5">
                <h4 className="text-[12.5px] font-semibold text-ink">{sec.name}</h4>
                <ScorePill score={secScore} />
              </header>
              <ul className="divide-y divide-line/60">
                {sec.items.map((it, ii) => (
                  <li key={it.q} className="px-4 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 flex-1 text-[12.5px] text-muted">{it.q}</span>
                      <ResultToggle value={it.result} onChange={(v) => setItem(si, ii, { result: v })} />
                    </div>
                    {it.result === 'fail' && (
                      <input
                        className="input mt-2 h-8 text-[12px]"
                        placeholder="What did you observe? (appears in the client report)"
                        value={it.note}
                        onChange={(e) => setItem(si, ii, { note: e.target.value })}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )
        })}

        <section className="rounded-xl border border-line p-4">
          <h4 className="mb-3 text-[12.5px] font-semibold text-ink">Officer spot checks</h4>
          {!f.values.siteId ? (
            <p className="text-[12px] text-faint">Select a site to list the officers deployed there.</p>
          ) : siteGuards.length === 0 ? (
            <p className="text-[12px] text-faint">No active officers are currently deployed to this site.</p>
          ) : (
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {siteGuards.map((g) => (
                <Checkbox
                  key={g.id}
                  label={g.name}
                  checked={f.values.guardsChecked.some((x) => x.guardId === g.id)}
                  onChange={() => toggleGuard(g.id)}
                />
              ))}
            </div>
          )}
        </section>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Visit duration (minutes)">
            <Input type="number" min="5" max="240" {...f.bind('durationMins')} />
          </Field>
          <Field label="Supervisor summary" className="sm:col-span-2">
            <Input {...f.bind('summary')} placeholder="One line for the client report" />
          </Field>
        </div>

        <div className="rounded-lg border border-line bg-surface2/50 p-3.5">
          <Switch
            checked={f.values.clientVisible}
            onChange={(v) => f.set('clientVisible', v)}
            label="Publish to the client portal"
            hint="Clients see the score, summary and findings, but not the officer spot checks."
          />
        </div>
      </form>
    </Drawer>
  )
}

/* --------------------------- inspection detail -------------------------- */
function InspectionDetail({ row, onClose, canManage }) {
  const { data: lk } = useLookups()
  const guardName = (id) => lk?.guards.find((g) => g.id === id)?.name || id
  const qc = useQueryClient()
  const toast = useToast()

  const setAction = useMutation({
    mutationFn: ({ actionId, status }) => api.setInspectionActionStatus(row.id, actionId, status),
    onMutate: async ({ actionId, status }) => {
      await qc.cancelQueries({ queryKey: ['inspections'] })
      const snaps = qc.getQueriesData({ queryKey: ['inspections', 'list'] })
      snaps.forEach(([key, data]) => {
        if (!data) return
        qc.setQueryData(key, {
          ...data,
          rows: data.rows.map((r) => r.id === row.id
            ? { ...r, actionsRequired: (r.actionsRequired || []).map((a) => (a.id === actionId ? { ...a, status } : a)) }
            : r),
        })
      })
      return { snaps }
    },
    onError: (err, _v, ctx) => {
      ctx?.snaps.forEach(([key, data]) => qc.setQueryData(key, data))
      toast.error('Could not update the action', { body: err.message })
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['inspections'] }),
  })

  if (!row) return null
  const openActions = (row.actionsRequired || []).filter((a) => a.status === 'open')

  return (
    <Drawer
      open={!!row}
      onClose={onClose}
      title={`${row.ref} at ${row._site?.name || 'site'}`}
      subtitle={`${TYPE_LABEL[row.type]} · ${fmtDateTime(row.at)} · ${duration(row.durationMins)}`}
      badge={<ScorePill score={row.score} />}
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print</Button>
          <Button
            variant="secondary"
            icon={FileDown}
            onClick={() => {
              download(`${row.ref}.csv`, toCSV(row.sections.flatMap((s) => s.items.map((i) => ({ section: s.name, item: i.q, result: i.result, note: i.note })))))
              toast.success('Inspection exported')
            }}
          >
            Export
          </Button>
        </>
      }
    >
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge value={row.status} dot />
          <Badge value={row.score >= 90 ? 'active' : row.score >= 75 ? 'pending' : 'critical'} label={row.score >= 90 ? 'Compliant' : row.score >= 75 ? 'Minor findings' : 'Non-compliant'} />
          {row.clientVisible && <span className="chip border-line bg-surface2 text-muted">Published to client</span>}
        </div>

        <Card title="Supervisor summary">
          <div className="flex items-start gap-3">
            <Avatar name={row._supervisor?.name || row.supervisorName || 'Unassigned'} size={34} />
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold text-ink">{row._supervisor?.name || row.supervisorName || 'Supervisor'}</p>
              <p className="text-[11px] text-faint">{row._supervisor?.rank || 'Supervisor'} · {timeAgo(row.at)}</p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{row.summary}</p>
            </div>
          </div>
        </Card>

        {row.sections.map((sec) => {
          const secScore = scoreOf([sec])
          return (
            <Card key={sec.name} title={sec.name} actions={<ScorePill score={secScore} />} noPad>
              <ul className="divide-y divide-line/60">
                {sec.items.map((it) => (
                  <li key={it.q} className="flex items-start gap-3 px-4 py-2.5">
                    <span className={cn(
                      'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full',
                      it.result === 'pass' ? 'bg-ok/12 text-ok' : it.result === 'fail' ? 'bg-critical/12 text-critical' : 'bg-surface2 text-faint'
                    )}>
                      {it.result === 'pass' ? <CheckCircle2 size={12} /> : it.result === 'fail' ? <XCircle size={12} /> : <MinusCircle size={12} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-[12.5px]', it.result === 'fail' ? 'font-medium text-ink' : 'text-muted')}>{it.q}</p>
                      {it.note && <p className="mt-0.5 text-[11.5px] leading-relaxed text-critical">{it.note}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )
        })}

        {row.guardsChecked?.length > 0 && (
          <Card title="Officer spot checks" subtitle={`${row.guardsChecked.length} officer${row.guardsChecked.length === 1 ? '' : 's'} checked`} noPad>
            <ul className="divide-y divide-line/60">
              {row.guardsChecked.map((c) => {
                const fails = ['uniform', 'alertness', 'knowledge', 'documentation'].filter((k) => c[k] === 'fail')
                return (
                  <li key={c.guardId} className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={guardName(c.guardId)} size={26} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold text-ink">{guardName(c.guardId)}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {['uniform', 'alertness', 'knowledge', 'documentation'].map((k) => (
                            <span key={k} className={cn('chip', c[k] === 'pass' ? 'border-ok/25 bg-ok/10 text-ok' : 'border-critical/25 bg-critical/10 text-critical')}>
                              {titleCase(k)}
                            </span>
                          ))}
                        </div>
                      </div>
                      <Badge value={fails.length ? 'critical' : 'active'} label={fails.length ? `${fails.length} fail` : 'Clear'} size="sm" />
                    </div>
                    {c.note && <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{c.note}</p>}
                  </li>
                )
              })}
            </ul>
          </Card>
        )}

        {row.findings?.length > 0 && (
          <Card title="Findings" subtitle={`${row.findings.length} non-conformance${row.findings.length === 1 ? '' : 's'}`} noPad>
            <ul className="divide-y divide-line/60">
              {row.findings.map((fd) => (
                <li key={fd.id} className="flex items-start gap-3 px-4 py-3">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold text-ink">{fd.area}</p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{fd.detail}</p>
                  </div>
                  <Badge value={fd.severity} size="sm" />
                </li>
              ))}
            </ul>
          </Card>
        )}

        {row.actionsRequired?.length > 0 && (
          <Card
            title="Corrective actions"
            subtitle={`${openActions.length} of ${row.actionsRequired.length} still open`}
            noPad
          >
            <ul className="divide-y divide-line/60">
              {row.actionsRequired.map((a) => {
                const overdue = a.status === 'open' && new Date(a.dueAt) < Date.now()
                return (
                  <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                    {canManage ? (
                      <button
                        onClick={() => setAction.mutate({ actionId: a.id, status: a.status === 'done' ? 'open' : 'done' })}
                        className={cn(
                          'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border transition',
                          a.status === 'done' ? 'border-ok bg-ok text-bg' : 'border-line hover:border-faint'
                        )}
                        title={a.status === 'done' ? 'Reopen' : 'Mark done'}
                      >
                        {a.status === 'done' && <CheckCircle2 size={12} />}
                      </button>
                    ) : (
                      <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', a.status === 'done' ? 'bg-ok' : overdue ? 'bg-critical' : 'bg-warn')} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-[12.5px]', a.status === 'done' ? 'text-faint line-through' : 'text-ink')}>{a.description}</p>
                      <p className="mt-0.5 text-[11px] text-faint">
                        {a.owner} · due {fmtDate(a.dueAt)}
                        {overdue && <span className="ml-1.5 font-semibold text-critical">overdue</span>}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>
        )}
      </div>
    </Drawer>
  )
}

/* ------------------------------- the page ------------------------------- */
export default function Inspections() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const t = useTableState({ sort: 'at', dir: 'desc' })
  const [tab, setTab] = useState('all')
  const [selected, setSelected] = useState([])
  const [formOpen, setFormOpen] = useState(false)
  const [detail, setDetail] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const filters = { ...t.filters, ...(tab === 'all' ? {} : { type: tab }) }
  const query = useList('inspections', { ...t.params, filters, facet: 'type' })
  const allQ = useList('inspections', { all: true, pageSize: 500 })
  const del = useDelete('inspections', { label: 'Inspection' })
  const bulk = useBulk('inspections')

  const live = detail ? (query.data?.rows || []).find((r) => r.id === detail.id) || detail : null

  const all = allQ.data?.rows || []
  const last30 = all.filter((i) => Date.now() - new Date(i.at) < 30 * 86400000)
  const avgScore = last30.length ? Math.round(last30.reduce((a, i) => a + i.score, 0) / last30.length) : 0
  const failed = last30.filter((i) => i.score < 75)
  const openActions = all.flatMap((i) => i.actionsRequired || []).filter((a) => a.status === 'open')
  const overdueActions = openActions.filter((a) => new Date(a.dueAt) < Date.now())

  const bySite = useMemo(() => {
    const m = {}
    last30.forEach((i) => {
      const k = i._site?.name || i.siteId
      m[k] = m[k] || { name: k, total: 0, sum: 0 }
      m[k].total++
      m[k].sum += i.score
    })
    return Object.values(m)
      .map((x) => ({ name: x.name, value: Math.round(x.sum / x.total) }))
      .sort((a, b) => a.value - b.value)
      .slice(0, 8)
  }, [last30])

  const facets = query.data?.facets || {}
  const tabs = [
    { value: 'all', label: 'All visits', count: Object.values(facets).reduce((a, b) => a + b, 0) },
    ...TYPES.map((x) => ({ value: x, label: TYPE_LABEL[x], count: facets[x] || 0 })),
  ]

  const columns = [
    { key: 'ref', header: 'Ref', width: 110, render: (r) => <span className="mono text-[12px] font-semibold text-ink">{r.ref}</span> },
    {
      key: 'siteId', header: 'Site', sortable: false,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-semibold text-ink">{r._site?.name}</p>
          <p className="truncate text-[11px] text-faint">{r._client?.name}</p>
        </div>
      ),
    },
    {
      key: 'supervisorId', header: 'Supervisor', sortable: false, width: 132,
      render: (r) => (
        <div className="flex items-center gap-2">
          <Avatar name={r._supervisor?.name || r.supervisorName || 'Unassigned'} size={24} />
          <span className="truncate text-[12.5px] text-muted">{r._supervisor?.name || r.supervisorName || ''}</span>
        </div>
      ),
    },
    {
      key: 'type', header: 'Type', width: 140,
      render: (r) => (
        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
          {r.type === 'night_visit' && <Moon size={12} className="text-accent2" />}
          {r.type === 'client_joint' && <Users size={12} className="text-accent" />}
          {r.type === 'spot_check' && <UserCheck size={12} className="text-warn" />}
          {TYPE_LABEL[r.type]}
        </span>
      ),
    },
    {
      key: 'score', header: 'Score', width: 150,
      render: (r) => (
        <div className="flex items-center gap-2">
          <Progress value={r.score} tone={r.score >= 90 ? 'ok' : r.score >= 75 ? 'warn' : 'critical'} className="w-20" />
          <span className="mono text-[12px] font-semibold text-ink">{r.score}%</span>
        </div>
      ),
    },
    {
      key: 'findings', header: 'Issues', sortable: false, align: 'center', width: 80,
      render: (r) => r.findings?.length
        ? <span className="mono text-[12.5px] font-semibold text-warn">{r.findings.length}</span>
        : <span className="text-[12px] text-faint"></span>,
    },
    {
      key: 'actionsRequired', header: 'Actions', sortable: false, align: 'center', width: 90,
      render: (r) => {
        const n = (r.actionsRequired || []).filter((a) => a.status === 'open').length
        return n ? <span className="mono text-[12.5px] font-semibold text-critical">{n}</span> : <span className="text-[12px] text-faint"></span>
      },
    },
    { key: 'status', header: 'Status', width: 124, render: (r) => <Badge value={r.status} dot /> },
    { key: 'at', header: 'Visited', width: 105, render: (r) => <span className="text-[12px] text-muted">{timeAgo(r.at)}</span> },
    {
      key: 'actions', header: '', sortable: false, width: 56, align: 'right',
      render: (r) => can('inspections', 'delete') && (
        <div onClick={(e) => e.stopPropagation()}>
          <button className="btn btn-ghost h-7 w-7 px-0 text-critical" onClick={() => setConfirm(r)}><Trash2 size={13} /></button>
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Supervisor Operations"
        subtitle="Site visits, inspection scoring, officer spot checks and the corrective actions that follow."
        actions={can('inspections', 'create') && (
          <Button variant="primary" icon={Plus} onClick={() => setFormOpen(true)}>New inspection</Button>
        )}
        tabs={<Tabs tabs={tabs} value={tab} onChange={(v) => { setTab(v); t.setPage(1); setSelected([]) }} className="mt-4" />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Compliance score" value={`${avgScore}%`} icon={Gauge} tone={avgScore >= 90 ? 'ok' : avgScore >= 75 ? 'warn' : 'critical'} loading={allQ.isLoading} hint={`Average across ${last30.length} visits in 30 days`} />
        <StatCard label="Visits (30 days)" value={last30.length} icon={ClipboardCheck} tone="accent" loading={allQ.isLoading} hint={`${all.length} on record`} />
        <StatCard label="Below standard" value={failed.length} icon={AlertTriangle} tone="critical" loading={allQ.isLoading} hint="Scored under 75%" />
        <StatCard label="Open actions" value={openActions.length} icon={ListChecks} tone="warn" loading={allQ.isLoading} hint={`${overdueActions.length} past their due date`} />
      </div>

      {bySite.length > 0 && (
        <Card className="mb-4" title="Lowest scoring sites" subtitle="Average inspection score over the last 30 days">
          <BarsChart data={bySite} layout="vertical" height={230} bars={[{ key: 'value', label: 'Score %', color: 'warn' }]} formatter={(v) => `${v}%`} />
        </Card>
      )}

      <Toolbar
        q={t.q} onQ={t.setQ}
        placeholder="Search reference, summary…"
        activeFilters={t.activeFilters} onReset={t.reset}
        exportName="inspections"
        exportRows={() => (query.data?.rows || []).map((r) => ({
          ref: r.ref, site: r._site?.name, client: r._client?.name,
          supervisor: r._supervisor?.name || r.supervisorName, type: r.type, at: r.at,
          score: r.score, findings: r.findings?.length || 0,
          openActions: (r.actionsRequired || []).filter((a) => a.status === 'open').length, status: r.status,
        }))}
        filters={<FilterSelect label="Status" value={t.filters.status} onChange={(v) => t.setFilter('status', v)} options={STATUSES} />}
      />

      <DataTable
        columns={columns}
        rows={query.data?.rows || []}
        loading={query.isLoading} fetching={query.isFetching}
        sort={query.data?.sort} dir={query.data?.dir} onSort={t.toggleSort}
        page={query.data?.page} pageCount={query.data?.pageCount} pageSize={t.pageSize}
        total={query.data?.total} from={query.data?.from} to={query.data?.to}
        onPage={t.setPage} onPageSize={t.setPageSize}
        onRowClick={(r) => navigate(hrefFor('inspections', r.id))}
        selectable={can('inspections', 'update')}
        selected={selected} onSelected={setSelected}
        emptyIcon={ClipboardCheck}
        emptyTitle="No inspections recorded"
        emptyBody="File a supervisor visit to start building the compliance record."
        bulkBar={(ids) => (
          <>
            <Button size="xs" variant="secondary" onClick={() => bulk.update.mutate({ ids, patch: { status: 'closed' } })}>Close out</Button>
            <Button size="xs" variant="secondary" onClick={() => bulk.update.mutate({ ids, patch: { clientVisible: true } })}>Publish to clients</Button>
          </>
        )}
      />

      <InspectionForm open={formOpen} onClose={() => setFormOpen(false)} />
      <InspectionDetail row={live} onClose={() => setDetail(null)} canManage={can('inspections', 'update')} />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Delete this inspection?"
        body={`${confirm?.ref} for ${confirm?._site?.name}. The score, findings and corrective actions will be removed from the compliance record.`}
        confirmLabel="Delete inspection"
        onConfirm={() => del.mutate(confirm.id)}
      />
    </>
  )
}
