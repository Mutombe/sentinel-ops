import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, MapPin, Trash2, Pencil, ShieldAlert, Radio } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { DataTable } from '@/components/ui/DataTable'
import { Toolbar, FilterSelect } from '@/components/ui/Toolbar'
import { Drawer, ConfirmDialog } from '@/components/ui/Modal'
import { Badge, Button, Field, Input, Select, Tabs, Progress, SeverityDot } from '@/components/ui/primitives'
import { useList, useTableState, useCreate, useUpdate, useDelete, useBulk, useLookups, useForm } from '@/lib/hooks'
import { fmtDate, titleCase, cn } from '@/lib/utils'
import { useAuth } from '@/auth/AuthContext'
import { useToast } from '@/components/ui/Toast'

const TYPES = ['Corporate HQ', 'Warehouse', 'Retail Mall', 'Data Centre', 'Residential Estate', 'Construction Site', 'Hospital Campus', 'Cash Centre', 'Industrial Park', 'Transport Depot']
const RISKS = ['low', 'medium', 'high', 'critical']
const COVERAGE = ['24/7', '12h Day', '12h Night', 'Business Hours', 'Weekend Only']
const STATUSES = ['active', 'pending', 'inactive']

function SiteForm({ open, onClose, initial }) {
  const isEdit = !!initial
  const { data: lk } = useLookups()
  const toast = useToast()
  const create = useCreate('sites', { label: 'Site', onSuccess: onClose })
  const update = useUpdate('sites', { label: 'Site', onSuccess: onClose })
  const busy = create.isPending || update.isPending

  const blank = {
    name: '', clientId: '', type: TYPES[0], city: 'Harare', address: '',
    riskLevel: 'medium', guardsRequired: 4, coverage: '24/7', checkpoints: 8, status: 'active',
    lat: -17.8252, lng: 31.0335,
  }
  const f = useForm(blank)

  useEffect(() => {
    if (!open) return
    f.reset(initial ? { ...initial } : blank)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id])

  const submit = async (e) => {
    e.preventDefault()
    const client = lk?.clients.find((c) => c.id === f.values.clientId)
    const payload = {
      ...f.values,
      guardsRequired: +f.values.guardsRequired || 1,
      checkpoints: +f.values.checkpoints || 1,
      lat: +f.values.lat, lng: +f.values.lng,
      code: isEdit ? initial.code : `${(client?.code || 'STE')}-S${Math.floor(1 + Math.random() * 9)}`,
      openedAt: initial?.openedAt || new Date().toISOString(),
    }
    try {
      if (isEdit) await update.mutateAsync({ id: initial.id, patch: payload })
      else await create.mutateAsync(payload)
    } catch (err) {
      f.applyServerError(err)
      if (!err.fields) toast.error('Could not save site', { body: err.message })
    }
  }

  return (
    <Drawer
      open={open} onClose={onClose}
      title={isEdit ? `Edit ${initial.name}` : 'New site'}
      subtitle={isEdit ? initial.code : 'Register a guarded location under a client contract'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={submit}>{isEdit ? 'Save site' : 'Create site'}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4 p-5">
        <Field label="Site name" required error={f.errors.name}><Input {...f.bind('name')} placeholder="e.g. Samora Tower North Gate" /></Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client" required error={f.errors.clientId}>
            <Select {...f.bind('clientId')}>
              <option value="">Select a client…</option>
              {lk?.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Site type" required error={f.errors.type}>
            <Select {...f.bind('type')}>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select>
          </Field>
          <Field label="City"><Input {...f.bind('city')} /></Field>
          <Field label="Status"><Select {...f.bind('status')}>{STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select></Field>
          <Field label="Street address" className="sm:col-span-2"><Input {...f.bind('address')} /></Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Risk level" hint="Drives patrol frequency and armed-response rules">
            <Select {...f.bind('riskLevel')}>{RISKS.map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}</Select>
          </Field>
          <Field label="Coverage pattern">
            <Select {...f.bind('coverage')}>{COVERAGE.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
          </Field>
          <Field label="Officers required"><Input type="number" min="1" {...f.bind('guardsRequired')} /></Field>
          <Field label="Patrol checkpoints"><Input type="number" min="1" {...f.bind('checkpoints')} /></Field>
          <Field label="Latitude"><Input type="number" step="0.0001" {...f.bind('lat')} /></Field>
          <Field label="Longitude"><Input type="number" step="0.0001" {...f.bind('lng')} /></Field>
        </div>
      </form>
    </Drawer>
  )
}

export default function Sites() {
  const navigate = useNavigate()
  const { can } = useAuth()
  const t = useTableState({ sort: 'name', dir: 'asc' })
  const [tab, setTab] = useState('all')
  const [selected, setSelected] = useState([])
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const filters = { ...t.filters, ...(tab === 'all' ? {} : { status: tab }) }
  const query = useList('sites', { ...t.params, filters, facet: 'status' })
  const guardsQ = useList('guards', { all: true, pageSize: 500 })
  const del = useDelete('sites', { label: 'Site' })
  const bulk = useBulk('sites')
  const facets = query.data?.facets || {}

  const staffing = React.useMemo(() => {
    const m = {}
    ;(guardsQ.data?.rows || []).forEach((g) => { if (g.siteId && g.status === 'active') m[g.siteId] = (m[g.siteId] || 0) + 1 })
    return m
  }, [guardsQ.data])

  const tabs = [
    { value: 'all', label: 'All sites', count: Object.values(facets).reduce((a, b) => a + b, 0) },
    ...STATUSES.map((s) => ({ value: s, label: titleCase(s), count: facets[s] || 0 })),
  ]

  const columns = [
    {
      key: 'name', header: 'Site',
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <SeverityDot level={r.riskLevel} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-ink">{r.name}</p>
            <p className="mono truncate text-[11px] text-faint">{r.code} · {r.city}</p>
          </div>
        </div>
      ),
    },
    { key: 'clientId', header: 'Client', width: 200, sortable: false, render: (r) => <span className="truncate text-[12.5px] text-muted">{r._client?.name || ''}</span> },
    { key: 'type', header: 'Type', width: 150, render: (r) => <span className="text-[12.5px] text-muted">{r.type}</span> },
    { key: 'riskLevel', header: 'Risk', width: 100, render: (r) => <Badge value={r.riskLevel} /> },
    { key: 'coverage', header: 'Coverage', width: 130, render: (r) => <span className="text-[12.5px] text-muted">{r.coverage}</span> },
    {
      key: 'guardsRequired', header: 'Staffing', width: 150,
      render: (r) => {
        const have = staffing[r.id] || 0
        const p = r.guardsRequired ? (have / r.guardsRequired) * 100 : 100
        return (
          <div className="flex items-center gap-2">
            <Progress value={Math.min(100, p)} tone={p < 70 ? 'critical' : p < 100 ? 'warn' : 'ok'} className="w-16" />
            <span className="mono text-[11.5px] text-muted">{have}/{r.guardsRequired}</span>
          </div>
        )
      },
    },
    { key: 'checkpoints', header: 'Checkpoints', align: 'right', width: 110, render: (r) => <span className="mono text-[12.5px] text-muted">{r.checkpoints}</span> },
    { key: 'status', header: 'Status', width: 124, render: (r) => <Badge value={r.status} dot /> },
    {
      key: 'actions', header: '', sortable: false, width: 92, align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          {can('sites', 'update') && <button className="btn btn-ghost h-7 w-7 px-0" onClick={() => { setEditing(r); setFormOpen(true) }}><Pencil size={13} /></button>}
          {can('sites', 'delete') && <button className="btn btn-ghost h-7 w-7 px-0 text-critical" onClick={() => setConfirm(r)}><Trash2 size={13} /></button>}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Sites"
        subtitle="Guarded locations, risk grading, coverage patterns and staffing levels."
        actions={can('sites', 'create') && (
          <Button variant="primary" icon={Plus} onClick={() => { setEditing(null); setFormOpen(true) }}>New site</Button>
        )}
        tabs={<Tabs tabs={tabs} value={tab} onChange={(v) => { setTab(v); t.setPage(1); setSelected([]) }} className="mt-4" />}
      />

      <Toolbar
        q={t.q} onQ={t.setQ}
        placeholder="Search site, code, city…"
        activeFilters={t.activeFilters} onReset={t.reset}
        exportName="sites"
        exportRows={() => (query.data?.rows || []).map((r) => ({
          code: r.code, name: r.name, client: r._client?.name, type: r.type, city: r.city,
          risk: r.riskLevel, coverage: r.coverage, required: r.guardsRequired, deployed: staffing[r.id] || 0, status: r.status,
        }))}
        filters={
          <>
            <FilterSelect label="Risk" value={t.filters.riskLevel} onChange={(v) => t.setFilter('riskLevel', v)} options={RISKS} />
            <FilterSelect label="Type" value={t.filters.type} onChange={(v) => t.setFilter('type', v)} options={TYPES} />
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
        onRowClick={(r) => navigate(`/sites/${r.id}`)}
        selectable={can('sites', 'update')}
        selected={selected} onSelected={setSelected}
        emptyIcon={MapPin} emptyTitle="No sites found"
        bulkBar={(ids) => (
          <>
            <Button size="xs" variant="secondary" onClick={() => bulk.update.mutate({ ids, patch: { status: 'active' } })}>Activate</Button>
            <Button size="xs" variant="secondary" onClick={() => bulk.update.mutate({ ids, patch: { riskLevel: 'high' } })}>Raise risk</Button>
          </>
        )}
      />

      <SiteForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null) }} initial={editing} />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Delete this site?"
        body={`${confirm?.name} will be removed. Sites with upcoming rostered shifts cannot be deleted.`}
        confirmLabel="Delete site"
        onConfirm={() => del.mutate(confirm.id)}
      />
    </>
  )
}
