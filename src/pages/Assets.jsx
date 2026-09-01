import React, { useEffect, useState } from 'react'
import { Plus, Package, Trash2, Pencil, AlertTriangle, Wrench, ShieldCheck, DollarSign } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { DataTable } from '@/components/ui/DataTable'
import { Toolbar, FilterSelect } from '@/components/ui/Toolbar'
import { Drawer, ConfirmDialog } from '@/components/ui/Modal'
import { Badge, Button, Field, Input, Select, Avatar, Tabs, StatCard, Card } from '@/components/ui/primitives'
import { BarsChart } from '@/components/charts/Charts'
import { useList, useTableState, useCreate, useUpdate, useDelete, useBulk, useLookups, useForm } from '@/lib/hooks'
import { fmtDate, money, titleCase, cn } from '@/lib/utils'
import { hrefFor } from '@/lib/records'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { useToast } from '@/components/ui/Toast'

const CATEGORIES = ['Radio', 'Body Camera', 'Firearm', 'Vehicle', 'Metal Detector', 'Uniform Set', 'Torch', 'Baton', 'Handcuffs', 'Tablet', 'Patrol Scanner', 'K9 Unit']
const STATUSES = ['in_service', 'in_store', 'maintenance', 'lost', 'retired']
const CONDITIONS = ['excellent', 'good', 'fair', 'poor']

function AssetForm({ open, onClose, initial }) {
  const isEdit = !!initial
  const { data: lk } = useLookups()
  const toast = useToast()
  const create = useCreate('assets', { label: 'Asset', onSuccess: onClose })
  const update = useUpdate('assets', { label: 'Asset', onSuccess: onClose })
  const busy = create.isPending || update.isPending

  const blank = {
    name: '', category: CATEGORIES[0], serial: '', assignedTo: '', siteId: '',
    status: 'in_store', condition: 'good', value: 200,
    purchaseDate: new Date().toISOString().slice(0, 10), warrantyEnd: '', lastServiced: '',
  }
  const f = useForm(blank)

  useEffect(() => {
    if (!open) return
    f.reset(initial ? {
      ...initial,
      assignedTo: initial.assignedTo || '',
      siteId: initial.siteId || '',
      purchaseDate: (initial.purchaseDate || '').slice(0, 10),
      warrantyEnd: (initial.warrantyEnd || '').slice(0, 10),
      lastServiced: (initial.lastServiced || '').slice(0, 10),
    } : blank)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id])

  const submit = async (e) => {
    e.preventDefault()
    const payload = {
      ...f.values,
      value: +f.values.value || 0,
      assignedTo: f.values.assignedTo || null,
      siteId: f.values.siteId || null,
      purchaseDate: f.values.purchaseDate ? new Date(f.values.purchaseDate).toISOString() : null,
      warrantyEnd: f.values.warrantyEnd ? new Date(f.values.warrantyEnd).toISOString() : null,
      lastServiced: f.values.lastServiced ? new Date(f.values.lastServiced).toISOString() : null,
      tag: isEdit ? initial.tag : 'AST-' + Math.floor(1000 + Math.random() * 8999),
    }
    try {
      if (isEdit) await update.mutateAsync({ id: initial.id, patch: payload })
      else await create.mutateAsync(payload)
    } catch (err) {
      f.applyServerError(err)
      if (!err.fields) toast.error('Could not save asset', { body: err.message })
    }
  }

  return (
    <Drawer
      open={open} onClose={onClose}
      title={isEdit ? `Edit ${initial.tag}` : 'Register equipment'}
      subtitle={isEdit ? initial.name : 'Add an item to the equipment register'}
      width="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={submit}>{isEdit ? 'Save asset' : 'Register asset'}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Item name" required error={f.errors.name} className="sm:col-span-2"><Input {...f.bind('name')} placeholder="e.g. Body Camera Pro" /></Field>
          <Field label="Category" required error={f.errors.category}>
            <Select {...f.bind('category')}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
          </Field>
          <Field label="Serial number"><Input {...f.bind('serial')} /></Field>
          <Field label="Issued to officer">
            <Select {...f.bind('assignedTo')}>
              <option value="">Unassigned</option>
              {lk?.guards.filter((g) => g.status === 'active').map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </Field>
          <Field label="Held at site">
            <Select {...f.bind('siteId')}>
              <option value="">Central store</option>
              {lk?.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select {...f.bind('status')}>{STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
          </Field>
          <Field label="Condition">
            <Select {...f.bind('condition')}>{CONDITIONS.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</Select>
          </Field>
          <Field label="Replacement value (USD)"><Input type="number" min="0" {...f.bind('value')} /></Field>
          <Field label="Purchase date"><Input type="date" {...f.bind('purchaseDate')} /></Field>
          <Field label="Last serviced"><Input type="date" {...f.bind('lastServiced')} /></Field>
          <Field label="Warranty ends"><Input type="date" {...f.bind('warrantyEnd')} /></Field>
        </div>
      </form>
    </Drawer>
  )
}

export default function Assets() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const t = useTableState({ sort: 'tag', dir: 'asc' })
  const [tab, setTab] = useState('all')
  const [selected, setSelected] = useState([])
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const filters = { ...t.filters, ...(tab === 'all' ? {} : { status: tab }) }
  const query = useList('assets', { ...t.params, filters, facet: 'status' })
  const allQ = useList('assets', { all: true, pageSize: 1000 })
  const del = useDelete('assets', { label: 'Asset' })
  const bulk = useBulk('assets')

  const all = allQ.data?.rows || []
  const totalValue = all.reduce((a, x) => a + x.value, 0)
  const inService = all.filter((a) => a.status === 'in_service')
  const maintenance = all.filter((a) => a.status === 'maintenance')
  const lost = all.filter((a) => a.status === 'lost')

  const byCategory = CATEGORIES.map((c) => ({ name: c, value: all.filter((a) => a.category === c).length }))
    .filter((c) => c.value > 0).sort((a, b) => b.value - a.value).slice(0, 8)

  const facets = query.data?.facets || {}
  const tabs = [
    { value: 'all', label: 'All equipment', count: Object.values(facets).reduce((a, b) => a + b, 0) },
    ...STATUSES.map((s) => ({ value: s, label: titleCase(s), count: facets[s] || 0 })),
  ]

  const columns = [
    { key: 'tag', header: 'Asset tag', width: 130, render: (r) => <span className="mono text-[12px] font-semibold text-ink">{r.tag}</span> },
    {
      key: 'name', header: 'Item',
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-semibold text-ink">{r.name}</p>
          <p className="mono truncate text-[11px] text-faint">{r.serial}</p>
        </div>
      ),
    },
    { key: 'category', header: 'Category', width: 150, render: (r) => <span className="text-[12.5px] text-muted">{r.category}</span> },
    {
      key: 'assignedTo', header: 'Issued to', sortable: false, width: 190,
      render: (r) => r._guard ? (
        <div className="flex items-center gap-2">
          <Avatar name={r._guard.name} size={24} />
          <span className="truncate text-[12.5px] text-muted">{r._guard.name}</span>
        </div>
      ) : <span className="chip border-line bg-surface2 text-faint">In store</span>,
    },
    { key: 'siteId', header: 'Location', sortable: false, width: 170, render: (r) => <span className="truncate text-[12.5px] text-muted">{r._site?.name || 'Central store'}</span> },
    { key: 'condition', header: 'Condition', width: 110, render: (r) => <Badge value={r.condition} /> },
    { key: 'status', header: 'Status', width: 120, render: (r) => <Badge value={r.status} dot /> },
    { key: 'value', header: 'Value', align: 'right', width: 100, render: (r) => <span className="mono text-[12.5px] text-ink">{money(r.value)}</span> },
    {
      key: 'actions', header: '', sortable: false, width: 92, align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          {can('assets', 'update') && <button className="btn btn-ghost h-7 w-7 px-0" onClick={() => { setEditing(r); setFormOpen(true) }}><Pencil size={13} /></button>}
          {can('assets', 'delete') && <button className="btn btn-ghost h-7 w-7 px-0 text-critical" onClick={() => setConfirm(r)}><Trash2 size={13} /></button>}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Equipment Register"
        subtitle="Radios, cameras, vehicles and issued kit, tracked to the officer."
        actions={can('assets', 'create') && (
          <Button variant="primary" icon={Plus} onClick={() => { setEditing(null); setFormOpen(true) }}>Register asset</Button>
        )}
        tabs={<Tabs tabs={tabs} value={tab} onChange={(v) => { setTab(v); t.setPage(1); setSelected([]) }} className="mt-4" />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Register value" value={money(totalValue)} icon={DollarSign} tone="ok" loading={allQ.isLoading} hint={`${all.length} items tracked`} />
        <StatCard label="In service" value={inService.length} icon={ShieldCheck} tone="accent" loading={allQ.isLoading} hint={`${Math.round((inService.length / (all.length || 1)) * 100)}% of register`} />
        <StatCard label="In maintenance" value={maintenance.length} icon={Wrench} tone="warn" loading={allQ.isLoading} hint={money(maintenance.reduce((a, x) => a + x.value, 0))} />
        <StatCard label="Lost or missing" value={lost.length} icon={AlertTriangle} tone="critical" loading={allQ.isLoading} hint={money(lost.reduce((a, x) => a + x.value, 0)) + ' written down'} />
      </div>

      <Card className="mb-4" title="Register by category" subtitle="Top categories by item count">
        <BarsChart data={byCategory} layout="vertical" height={230} bars={[{ key: 'value', label: 'Items', color: 'accent2' }]} />
      </Card>

      <Toolbar
        q={t.q} onQ={t.setQ}
        placeholder="Search tag, item, serial…"
        activeFilters={t.activeFilters} onReset={t.reset}
        exportName="equipment"
        exportRows={() => (query.data?.rows || []).map((r) => ({
          tag: r.tag, name: r.name, category: r.category, serial: r.serial,
          issuedTo: r._guard?.name || '', site: r._site?.name || '', condition: r.condition,
          status: r.status, value: r.value, purchaseDate: r.purchaseDate,
        }))}
        filters={
          <>
            <FilterSelect label="Category" value={t.filters.category} onChange={(v) => t.setFilter('category', v)} options={CATEGORIES} />
            <FilterSelect label="Condition" value={t.filters.condition} onChange={(v) => t.setFilter('condition', v)} options={CONDITIONS} />
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
        onRowClick={(r) => navigate(hrefFor('assets', r.id))}
        selectable={can('assets', 'update')}
        selected={selected} onSelected={setSelected}
        emptyIcon={Package} emptyTitle="No equipment found"
        bulkBar={(ids) => (
          <>
            <Button size="xs" variant="secondary" icon={Wrench} onClick={() => bulk.update.mutate({ ids, patch: { status: 'maintenance' } })}>Send to service</Button>
            <Button size="xs" variant="secondary" onClick={() => bulk.update.mutate({ ids, patch: { status: 'in_store', assignedTo: null } })}>Return to store</Button>
            {can('assets', 'delete') && <Button size="xs" variant="danger" icon={Trash2} onClick={() => { bulk.remove.mutate(ids); setSelected([]) }}>Delete</Button>}
          </>
        )}
      />

      <AssetForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null) }} initial={editing} />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Remove asset from register?"
        body={`${confirm?.tag}, ${confirm?.name}. This permanently removes the item and its service history.`}
        confirmLabel="Delete asset"
        onConfirm={() => del.mutate(confirm.id)}
      />
    </>
  )
}
