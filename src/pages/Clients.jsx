import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Building2, Trash2, Pencil, Star, LayoutGrid, List, ArrowRight, Mail, Phone } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { DataTable } from '@/components/ui/DataTable'
import { Toolbar, FilterSelect } from '@/components/ui/Toolbar'
import { Drawer, ConfirmDialog } from '@/components/ui/Modal'
import { Badge, Button, Field, Input, Select, Textarea, Avatar, Tabs, Segmented, Progress, EmptyState, Skeleton } from '@/components/ui/primitives'
import { useList, useTableState, useCreate, useUpdate, useDelete, useBulk, useForm } from '@/lib/hooks'
import { fmtDate, money, titleCase, cn, num } from '@/lib/utils'
import { useAuth } from '@/auth/AuthContext'
import { useToast } from '@/components/ui/Toast'

const INDUSTRIES = ['Banking', 'Technology', 'Retail', 'Healthcare', 'Mining', 'Residential', 'Logistics', 'Legal', 'Hospitality', 'Industrial', 'Education', 'Commercial', 'Maritime', 'Pharma', 'Energy', 'Events', 'Automotive', 'Cultural', 'Telecoms', 'Agriculture', 'Luxury', 'Sports', 'Cold Chain', 'Media']
const TIERS = ['platinum', 'gold', 'silver', 'bronze']
const STATUSES = ['active', 'onboarding', 'suspended', 'churned']

function ClientForm({ open, onClose, initial }) {
  const isEdit = !!initial
  const toast = useToast()
  const create = useCreate('clients', { label: 'Client', onSuccess: onClose })
  const update = useUpdate('clients', { label: 'Client', onSuccess: onClose })
  const busy = create.isPending || update.isPending

  const blank = {
    name: '', industry: INDUSTRIES[0], contactName: '', contactEmail: '', contactPhone: '',
    city: 'Harare', address: '', status: 'onboarding', tier: 'silver', contractValue: 12000,
    contractStart: new Date().toISOString().slice(0, 10), contractEnd: '', slaResponseMins: 30, notes: '',
  }
  const f = useForm(blank)

  useEffect(() => {
    if (!open) return
    f.reset(initial ? {
      ...initial,
      contractStart: (initial.contractStart || '').slice(0, 10),
      contractEnd: (initial.contractEnd || '').slice(0, 10),
    } : blank)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id])

  const submit = async (e) => {
    e.preventDefault()
    const payload = {
      ...f.values,
      contractValue: +f.values.contractValue || 0,
      slaResponseMins: +f.values.slaResponseMins || 30,
      contractStart: f.values.contractStart ? new Date(f.values.contractStart).toISOString() : new Date().toISOString(),
      contractEnd: f.values.contractEnd ? new Date(f.values.contractEnd).toISOString() : null,
      code: isEdit ? initial.code : f.values.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase() + Math.floor(10 + Math.random() * 89),
      satisfaction: initial?.satisfaction ?? 4.2,
    }
    try {
      if (isEdit) await update.mutateAsync({ id: initial.id, patch: payload })
      else await create.mutateAsync(payload)
    } catch (err) {
      f.applyServerError(err)
      if (!err.fields) toast.error('Could not save client', { body: err.message })
    }
  }

  return (
    <Drawer
      open={open} onClose={onClose}
      title={isEdit ? `Edit ${initial.name}` : 'New client account'}
      subtitle={isEdit ? initial.code : 'Set up a contract and primary contact'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={submit}>{isEdit ? 'Save client' : 'Create client'}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5 p-5">
        <section>
          <h4 className="mb-3 text-[11px] font-bold uppercase tracking-[.1em] text-faint">Account</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name" required error={f.errors.name} className="sm:col-span-2"><Input {...f.bind('name')} /></Field>
            <Field label="Industry" required error={f.errors.industry}>
              <Select {...f.bind('industry')}>{INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}</Select>
            </Field>
            <Field label="Service tier">
              <Select {...f.bind('tier')}>{TIERS.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Select>
            </Field>
            <Field label="Account status">
              <Select {...f.bind('status')}>{STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
            </Field>
            <Field label="City"><Input {...f.bind('city')} /></Field>
            <Field label="Billing address" className="sm:col-span-2"><Input {...f.bind('address')} /></Field>
          </div>
        </section>

        <section>
          <h4 className="mb-3 text-[11px] font-bold uppercase tracking-[.1em] text-faint">Primary contact</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contact name" required error={f.errors.contactName}><Input {...f.bind('contactName')} /></Field>
            <Field label="Contact email" required error={f.errors.contactEmail}><Input type="email" {...f.bind('contactEmail')} /></Field>
            <Field label="Contact phone" className="sm:col-span-2"><Input {...f.bind('contactPhone')} /></Field>
          </div>
        </section>

        <section>
          <h4 className="mb-3 text-[11px] font-bold uppercase tracking-[.1em] text-faint">Contract</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Annual value (USD)"><Input type="number" min="0" step="500" {...f.bind('contractValue')} /></Field>
            <Field label="SLA response (minutes)"><Input type="number" min="5" step="5" {...f.bind('slaResponseMins')} /></Field>
            <Field label="Start date"><Input type="date" {...f.bind('contractStart')} /></Field>
            <Field label="End date"><Input type="date" {...f.bind('contractEnd')} /></Field>
            <Field label="Account notes" className="sm:col-span-2"><Textarea rows={3} {...f.bind('notes')} placeholder="Escalation preferences, key stakeholders, site access notes…" /></Field>
          </div>
        </section>
      </form>
    </Drawer>
  )
}

function ClientCard({ c, onOpen }) {
  return (
    <button onClick={onOpen} className="card group p-4 text-left transition hover:border-accent/40 hover:shadow-pop">
      <div className="flex items-start gap-3">
        <Avatar name={c.name} size={38} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-ink">{c.name}</p>
          <p className="truncate text-[11.5px] text-faint">{c.industry} · {c.city}</p>
        </div>
        <ArrowRight size={15} className="shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-accent" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge value={c.status} dot size="sm" />
        <Badge value={c.tier} size="sm" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3">
        <div>
          <p className="text-[10.5px] uppercase tracking-wide text-faint">Contract</p>
          <p className="mono text-[14px] font-bold text-ink">{money(c.contractValue)}</p>
        </div>
        <div>
          <p className="text-[10.5px] uppercase tracking-wide text-faint">Satisfaction</p>
          <p className="mono flex items-center gap-1 text-[14px] font-bold text-ink">
            <Star size={12} className="fill-warn text-warn" />{c.satisfaction}
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-1 text-[11.5px] text-muted">
        <p className="flex items-center gap-1.5 truncate"><Mail size={11} className="text-faint" />{c.contactEmail}</p>
        <p className="flex items-center gap-1.5 truncate"><Phone size={11} className="text-faint" />{c.contactPhone}</p>
      </div>
    </button>
  )
}

export default function Clients() {
  const navigate = useNavigate()
  const { can } = useAuth()
  const t = useTableState({ sort: 'name', dir: 'asc' })
  const [tab, setTab] = useState('all')
  const [view, setView] = useState('table')
  const [selected, setSelected] = useState([])
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const filters = { ...t.filters, ...(tab === 'all' ? {} : { status: tab }) }
  const query = useList('clients', { ...t.params, pageSize: view === 'grid' ? 12 : t.pageSize, filters, facet: 'status' })
  const del = useDelete('clients', { label: 'Client' })
  const bulk = useBulk('clients')
  const facets = query.data?.facets || {}

  const tabs = [
    { value: 'all', label: 'All accounts', count: Object.values(facets).reduce((a, b) => a + b, 0) },
    ...STATUSES.map((s) => ({ value: s, label: titleCase(s), count: facets[s] || 0 })),
  ]

  const columns = [
    {
      key: 'name', header: 'Client',
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={r.name} size={30} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-ink">{r.name}</p>
            <p className="mono truncate text-[11px] text-faint">{r.code} · {r.industry}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'contactName', header: 'Contact', width: 190,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[12.5px] text-ink">{r.contactName}</p>
          <p className="truncate text-[11px] text-faint">{r.contactEmail}</p>
        </div>
      ),
    },
    { key: 'tier', header: 'Tier', width: 100, render: (r) => <Badge value={r.tier} /> },
    { key: 'status', header: 'Status', width: 124, render: (r) => <Badge value={r.status} dot /> },
    {
      key: 'contractValue', header: 'Contract', align: 'right', width: 110,
      render: (r) => <span className="mono text-[12.5px] font-semibold text-ink">{money(r.contractValue)}</span>,
    },
    {
      key: 'slaResponseMins', header: 'SLA', align: 'right', width: 80,
      render: (r) => <span className="mono text-[12.5px] text-muted">{r.slaResponseMins}m</span>,
    },
    {
      key: 'satisfaction', header: 'CSAT', align: 'right', width: 90,
      render: (r) => (
        <span className="inline-flex items-center gap-1">
          <Star size={12} className={r.satisfaction >= 4 ? 'fill-warn text-warn' : 'text-faint'} />
          <span className="mono text-[12.5px] font-semibold">{r.satisfaction}</span>
        </span>
      ),
    },
    { key: 'contractEnd', header: 'Renews', width: 110, render: (r) => <span className="text-[12px] text-muted">{fmtDate(r.contractEnd)}</span> },
    {
      key: 'actions', header: '', sortable: false, width: 92, align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          {can('clients', 'update') && <button className="btn btn-ghost h-7 w-7 px-0" onClick={() => { setEditing(r); setFormOpen(true) }}><Pencil size={13} /></button>}
          {can('clients', 'delete') && <button className="btn btn-ghost h-7 w-7 px-0 text-critical" onClick={() => setConfirm(r)}><Trash2 size={13} /></button>}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle="Contracted accounts, service tiers and commercial performance."
        actions={can('clients', 'create') && (
          <Button variant="primary" icon={Plus} onClick={() => { setEditing(null); setFormOpen(true) }}>New client</Button>
        )}
        tabs={<Tabs tabs={tabs} value={tab} onChange={(v) => { setTab(v); t.setPage(1); setSelected([]) }} className="mt-4" />}
      />

      <Toolbar
        q={t.q} onQ={t.setQ}
        placeholder="Search client, code, contact…"
        activeFilters={t.activeFilters} onReset={t.reset}
        exportName="clients"
        exportRows={() => (query.data?.rows || []).map(({ _client, _site, ...r }) => r)}
        filters={
          <>
            <FilterSelect label="Tier" value={t.filters.tier} onChange={(v) => t.setFilter('tier', v)} options={TIERS} />
            <FilterSelect label="Industry" value={t.filters.industry} onChange={(v) => t.setFilter('industry', v)} options={INDUSTRIES} />
          </>
        }
      >
        <Segmented
          size="sm"
          value={view}
          onChange={setView}
          options={[{ value: 'table', label: 'Table' }, { value: 'grid', label: 'Cards' }]}
        />
      </Toolbar>

      {view === 'grid' ? (
        query.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
          </div>
        ) : (query.data?.rows || []).length === 0 ? (
          <EmptyState icon={Building2} title="No clients found" body="Adjust your search or add a new account." />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {query.data.rows.map((c) => <ClientCard key={c.id} c={c} onOpen={() => navigate(`/clients/${c.id}`)} />)}
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
        )
      ) : (
        <DataTable
          columns={columns}
          rows={query.data?.rows || []}
          loading={query.isLoading} fetching={query.isFetching}
          sort={query.data?.sort} dir={query.data?.dir} onSort={t.toggleSort}
          page={query.data?.page} pageCount={query.data?.pageCount} pageSize={t.pageSize}
          total={query.data?.total} from={query.data?.from} to={query.data?.to}
          onPage={t.setPage} onPageSize={t.setPageSize}
          onRowClick={(r) => navigate(`/clients/${r.id}`)}
          selectable={can('clients', 'update')}
          selected={selected} onSelected={setSelected}
          emptyIcon={Building2} emptyTitle="No clients found"
          bulkBar={(ids) => (
            <>
              <Button size="xs" variant="secondary" onClick={() => bulk.update.mutate({ ids, patch: { status: 'active' } })}>Activate</Button>
              <Button size="xs" variant="secondary" onClick={() => bulk.update.mutate({ ids, patch: { status: 'suspended' } })}>Suspend</Button>
            </>
          )}
        />
      )}

      <ClientForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null) }} initial={editing} />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Delete client account?"
        body={`${confirm?.name} will be removed. Clients with active sites cannot be deleted. Remove or reassign their sites first.`}
        confirmLabel="Delete client"
        requireText={confirm?.code}
        onConfirm={() => del.mutate(confirm.id)}
      />
    </>
  )
}
