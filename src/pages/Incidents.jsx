import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, ShieldAlert, Trash2, Pencil, CheckCheck, Eye, EyeOff, FileDown } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { DataTable } from '@/components/ui/DataTable'
import { Toolbar, FilterSelect } from '@/components/ui/Toolbar'
import { Drawer, ConfirmDialog } from '@/components/ui/Modal'
import { Badge, Button, Field, Input, Select, Textarea, Avatar, Tabs, SeverityDot, Switch } from '@/components/ui/primitives'
import { useList, useTableState, useCreate, useUpdate, useDelete, useBulk, useLookups, useForm, useHotkey } from '@/lib/hooks'
import { fmtDateTime, timeAgo, money, titleCase, cn } from '@/lib/utils'
import { useAuth } from '@/auth/AuthContext'
import { useToast } from '@/components/ui/Toast'

const TYPES = ['Unauthorised Access', 'Theft', 'Vandalism', 'Trespassing', 'Assault', 'Suspicious Activity', 'Fire Alarm', 'Medical Emergency', 'Equipment Failure', 'Perimeter Breach', 'Armed Robbery', 'Vehicle Incident', 'Alarm Activation', 'Policy Violation', 'Lost Property']
const SEVERITIES = ['low', 'medium', 'high', 'critical']
const STATUSES = ['open', 'investigating', 'resolved', 'closed']

function IncidentForm({ open, onClose, initial }) {
  const isEdit = !!initial
  const { data: lk } = useLookups()
  const toast = useToast()
  const create = useCreate('incidents', { label: 'Incident', onSuccess: () => onClose() })
  const update = useUpdate('incidents', { label: 'Incident', onSuccess: () => onClose() })
  const busy = create.isPending || update.isPending

  const blank = {
    title: '', type: TYPES[0], severity: 'medium', status: 'open',
    siteId: '', description: '', occurredAt: new Date().toISOString().slice(0, 16),
    lossValue: 0, injuries: 0, policeRef: '', visibleToClient: true, assignedTo: '',
  }
  const f = useForm(blank)

  useEffect(() => {
    if (!open) return
    f.reset(
      initial
        ? { ...initial, occurredAt: (initial.occurredAt || '').slice(0, 16) }
        : blank
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id])

  const site = lk?.sites.find((s) => s.id === f.values.siteId)

  const submit = async (e) => {
    e.preventDefault()
    const payload = {
      ...f.values,
      lossValue: +f.values.lossValue || 0,
      injuries: +f.values.injuries || 0,
      clientId: site?.clientId || null,
      occurredAt: new Date(f.values.occurredAt).toISOString(),
      reportedAt: isEdit ? initial.reportedAt : new Date().toISOString(),
      ref: isEdit ? initial.ref : `INC-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`,
      timeline: isEdit ? initial.timeline : [{ at: new Date().toISOString(), actor: 'You', action: 'Reported', note: 'Filed from the operations console' }],
      tags: initial?.tags || [],
    }
    try {
      if (isEdit) await update.mutateAsync({ id: initial.id, patch: payload })
      else await create.mutateAsync(payload)
    } catch (err) {
      f.applyServerError(err)
      if (!err.fields) toast.error('Could not save', { body: err.message })
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${initial.ref}` : 'Report an incident'}
      subtitle={isEdit ? initial.title : 'Captured details are pushed to the control room immediately'}
      badge={isEdit && <Badge value={initial.severity} size="sm" />}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={submit}>{isEdit ? 'Save changes' : 'File incident'}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4 p-5">
        <Field label="Incident title" required error={f.errors.title}>
          <Input placeholder="e.g. Perimeter breach at loading bay" {...f.bind('title')} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" required error={f.errors.type}>
            <Select {...f.bind('type')}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Severity" required error={f.errors.severity}>
            <Select {...f.bind('severity')}>
              {SEVERITIES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Site" required error={f.errors.siteId}>
            <Select {...f.bind('siteId')}>
              <option value="">Select a site…</option>
              {lk?.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Occurred at" required>
            <Input type="datetime-local" {...f.bind('occurredAt')} />
          </Field>
        </div>

        <Field label="What happened?" hint="Include actions taken, people involved and evidence secured.">
          <Textarea rows={5} placeholder="Describe the incident…" {...f.bind('description')} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Estimated loss (USD)">
            <Input type="number" min="0" step="1" {...f.bind('lossValue')} />
          </Field>
          <Field label="Injuries">
            <Input type="number" min="0" step="1" {...f.bind('injuries')} />
          </Field>
          <Field label="Police reference">
            <Input placeholder="CR123/08/26" {...f.bind('policeRef')} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Assign to officer">
            <Select {...f.bind('assignedTo')}>
              <option value="">Unassigned</option>
              {lk?.guards.filter((g) => g.status === 'active').map((g) => (
                <option key={g.id} value={g.id}>{g.name} ({g.rank})</option>
              ))}
            </Select>
          </Field>
          {isEdit && (
            <Field label="Status">
              <Select {...f.bind('status')}>
                {STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
              </Select>
            </Field>
          )}
        </div>

        <div className="rounded-lg border border-line bg-surface2/50 p-3.5">
          <Switch
            checked={!!f.values.visibleToClient}
            onChange={(v) => f.set('visibleToClient', v)}
            label="Visible in the client portal"
            hint="When on, the client can read this report and its resolution notes."
          />
        </div>
      </form>
    </Drawer>
  )
}

export default function Incidents() {
  const navigate = useNavigate()
  const { can } = useAuth()
  const [params, setParams] = useSearchParams()
  const t = useTableState({ sort: 'occurredAt', dir: 'desc' })
  const [tab, setTab] = useState('all')
  const [selected, setSelected] = useState([])
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const filters = useMemo(() => ({ ...t.filters, ...(tab === 'all' ? {} : { status: tab }) }), [t.filters, tab])
  const query = useList('incidents', { ...t.params, filters, facet: 'status' })
  const del = useDelete('incidents', { label: 'Incident' })
  const bulk = useBulk('incidents')

  useHotkey('n', () => can('incidents', 'create') && setFormOpen(true))

  useEffect(() => {
    if (params.get('new') === '1') { setFormOpen(true); params.delete('new'); setParams(params, { replace: true }) }
  }, [params, setParams])

  const facets = query.data?.facets || {}
  const tabs = [
    { value: 'all', label: 'All', count: Object.values(facets).reduce((a, b) => a + b, 0) },
    ...STATUSES.map((s) => ({ value: s, label: titleCase(s), count: facets[s] || 0 })),
  ]

  const columns = [
    {
      key: 'ref', header: 'Ref', width: 130,
      render: (r) => (
        <div className="flex items-center gap-2">
          <SeverityDot level={r.severity} />
          <div className="min-w-0">
            <p className="mono truncate text-[12px] font-semibold text-ink">{r.ref}</p>
            <p className="truncate text-[11px] text-faint">{r.type}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'title', header: 'Incident',
      render: (r) => (
        <div className="min-w-0 max-w-[320px]">
          <p className="truncate text-[13px] font-medium text-ink">{r.title}</p>
          <p className="truncate text-[11.5px] text-faint">{r._site?.name} · {r._client?.name}</p>
        </div>
      ),
    },
    { key: 'severity', header: 'Severity', width: 108, render: (r) => <Badge value={r.severity} /> },
    { key: 'status', header: 'Status', width: 124, render: (r) => <Badge value={r.status} dot /> },
    {
      key: 'reportedBy', header: 'Reported by', sortable: false, width: 170,
      render: (r) => r._reporter ? (
        <div className="flex items-center gap-2">
          <Avatar name={r._reporter.name} size={22} />
          <span className="truncate text-[12.5px] text-muted">{r._reporter.name}</span>
        </div>
      ) : <span className="text-faint"></span>,
    },
    {
      key: 'lossValue', header: 'Loss', align: 'right', width: 90,
      render: (r) => r.lossValue ? <span className="mono text-[12.5px] font-semibold text-warn">{money(r.lossValue)}</span> : <span className="text-faint"></span>,
    },
    {
      key: 'occurredAt', header: 'Occurred', width: 130,
      render: (r) => (
        <div>
          <p className="text-[12.5px] text-ink">{timeAgo(r.occurredAt)}</p>
          <p className="text-[11px] text-faint">{fmtDateTime(r.occurredAt).split(' · ')[0]}</p>
        </div>
      ),
    },
    {
      key: 'actions', header: '', sortable: false, width: 92, align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          {can('incidents', 'update') && (
            <button className="btn btn-ghost h-7 w-7 px-0" title="Edit" onClick={() => { setEditing(r); setFormOpen(true) }}>
              <Pencil size={13} />
            </button>
          )}
          {can('incidents', 'delete') && (
            <button className="btn btn-ghost h-7 w-7 px-0 text-critical" title="Delete" onClick={() => setConfirm(r)}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Incident Management"
        subtitle="Every reported event, from first report through investigation to sign-off."
        actions={
          can('incidents', 'create') && (
            <Button variant="primary" icon={Plus} onClick={() => { setEditing(null); setFormOpen(true) }}>
              Report incident
            </Button>
          )
        }
        tabs={<Tabs tabs={tabs} value={tab} onChange={(v) => { setTab(v); t.setPage(1); setSelected([]) }} className="mt-4" />}
      />

      <Toolbar
        q={t.q}
        onQ={t.setQ}
        placeholder="Search reference, title, description…"
        activeFilters={t.activeFilters}
        onReset={t.reset}
        exportName="incidents"
        exportRows={() => (query.data?.rows || []).map((r) => ({
          ref: r.ref, title: r.title, type: r.type, severity: r.severity, status: r.status,
          site: r._site?.name, client: r._client?.name, occurredAt: r.occurredAt, loss: r.lossValue,
        }))}
        filters={
          <>
            <FilterSelect label="Severity" value={t.filters.severity} onChange={(v) => t.setFilter('severity', v)} options={SEVERITIES} />
            <FilterSelect label="Category" value={t.filters.type} onChange={(v) => t.setFilter('type', v)} options={TYPES} />
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={query.data?.rows || []}
        loading={query.isLoading}
        fetching={query.isFetching}
        sort={query.data?.sort} dir={query.data?.dir} onSort={t.toggleSort}
        page={query.data?.page} pageCount={query.data?.pageCount} pageSize={t.pageSize}
        total={query.data?.total} from={query.data?.from} to={query.data?.to}
        onPage={t.setPage} onPageSize={t.setPageSize}
        onRowClick={(r) => navigate(`/incidents/${r.id}`)}
        selectable={can('incidents', 'update')}
        selected={selected}
        onSelected={setSelected}
        emptyIcon={ShieldAlert}
        emptyTitle="No incidents match this view"
        emptyBody="Try clearing filters, or report a new incident to get started."
        bulkBar={(ids) => (
          <>
            <Button size="xs" variant="secondary" icon={CheckCheck}
              onClick={() => bulk.update.mutate({ ids, patch: { status: 'resolved', resolvedAt: new Date().toISOString() } })}>
              Mark resolved
            </Button>
            <Button size="xs" variant="secondary" icon={EyeOff}
              onClick={() => bulk.update.mutate({ ids, patch: { visibleToClient: false } })}>
              Hide from client
            </Button>
            {can('incidents', 'delete') && (
              <Button size="xs" variant="danger" icon={Trash2}
                onClick={() => { bulk.remove.mutate(ids); setSelected([]) }}>
                Delete
              </Button>
            )}
          </>
        )}
      />

      <IncidentForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null) }} initial={editing} />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Delete incident report?"
        body={`${confirm?.ref}, ${confirm?.title}. This removes the report and its full timeline. This action is recorded in the audit trail.`}
        confirmLabel="Delete report"
        onConfirm={() => del.mutate(confirm.id)}
      />
    </>
  )
}
