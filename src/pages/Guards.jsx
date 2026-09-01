import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Users, Trash2, Pencil, ShieldCheck, AlertTriangle, Star, UserCheck, UserX } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { DataTable } from '@/components/ui/DataTable'
import { Toolbar, FilterSelect } from '@/components/ui/Toolbar'
import { Drawer, ConfirmDialog } from '@/components/ui/Modal'
import { Badge, Button, Field, Input, Select, Avatar, Tabs, Checkbox, StatCard } from '@/components/ui/primitives'
import { useList, useTableState, useCreate, useUpdate, useDelete, useBulk, useLookups, useForm } from '@/lib/hooks'
import { fmtDate, money2, titleCase, cn, num } from '@/lib/utils'
import { useAuth } from '@/auth/AuthContext'
import { useToast } from '@/components/ui/Toast'

const RANKS = ['Security Officer', 'Senior Officer', 'Patrol Officer', 'Control Room Operator', 'Shift Supervisor', 'Site Supervisor', 'K9 Handler', 'Armed Response', 'Access Controller', 'Detection Officer']
const CERTS = ['Guard Registration Grade A', 'Guard Registration Grade B', 'Guard Registration Grade C', 'Firearm Competency', 'First Aid Level 3', 'Fire Marshal', 'CCTV Operations', 'Crowd Control', 'Armed Escort', 'K9 Handling', 'Cash-in-Transit', 'Control Room Cert']
const STATUSES = ['active', 'on_leave', 'training', 'suspended', 'inactive']

export function GuardForm({ open, onClose, initial }) {
  const isEdit = !!initial
  const { data: lk } = useLookups()
  const toast = useToast()
  const create = useCreate('guards', { label: 'Officer', onSuccess: onClose })
  const update = useUpdate('guards', { label: 'Officer', onSuccess: onClose })
  const busy = create.isPending || update.isPending

  const blank = {
    firstName: '', lastName: '', email: '', phone: '', rank: RANKS[0], grade: 'C',
    licenseNo: '', licenseExpiry: '', siteId: '', hourlyRate: 5.5, status: 'active',
    hireDate: new Date().toISOString().slice(0, 10), certifications: [], armed: false,
    emergencyContact: '', address: '',
  }
  const f = useForm(blank)

  useEffect(() => {
    if (!open) return
    f.reset(initial ? {
      ...initial,
      licenseExpiry: (initial.licenseExpiry || '').slice(0, 10),
      hireDate: (initial.hireDate || '').slice(0, 10),
      siteId: initial.siteId || '',
    } : blank)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id])

  const toggleCert = (c) => {
    const list = f.values.certifications || []
    f.set('certifications', list.includes(c) ? list.filter((x) => x !== c) : [...list, c])
  }

  const submit = async (e) => {
    e.preventDefault()
    const payload = {
      ...f.values,
      hourlyRate: +f.values.hourlyRate || 0,
      siteId: f.values.siteId || null,
      licenseExpiry: f.values.licenseExpiry ? new Date(f.values.licenseExpiry).toISOString() : null,
      hireDate: f.values.hireDate ? new Date(f.values.hireDate).toISOString() : new Date().toISOString(),
      employeeNo: isEdit ? initial.employeeNo : 'SG-' + Math.floor(1000 + Math.random() * 8999),
      rating: initial?.rating ?? 4,
      incidentsHandled: initial?.incidentsHandled ?? 0,
      shiftsCompleted: initial?.shiftsCompleted ?? 0,
    }
    try {
      if (isEdit) await update.mutateAsync({ id: initial.id, patch: payload })
      else await create.mutateAsync(payload)
    } catch (err) {
      f.applyServerError(err)
      if (!err.fields) toast.error('Could not save officer', { body: err.message })
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${initial.name}` : 'Add security officer'}
      subtitle={isEdit ? initial.employeeNo : 'Create a personnel record and deploy to a site'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={submit}>{isEdit ? 'Save officer' : 'Create officer'}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5 p-5">
        <section>
          <h4 className="mb-3 text-[11px] font-bold uppercase tracking-[.1em] text-faint">Personal</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" required error={f.errors.firstName}><Input {...f.bind('firstName')} /></Field>
            <Field label="Last name" required error={f.errors.lastName}><Input {...f.bind('lastName')} /></Field>
            <Field label="Email" required error={f.errors.email}><Input type="email" {...f.bind('email')} /></Field>
            <Field label="Phone"><Input {...f.bind('phone')} placeholder="+263 77 123 4567" /></Field>
            <Field label="Home address" className="sm:col-span-2"><Input {...f.bind('address')} /></Field>
            <Field label="Emergency contact" className="sm:col-span-2"><Input {...f.bind('emergencyContact')} /></Field>
          </div>
        </section>

        <section>
          <h4 className="mb-3 text-[11px] font-bold uppercase tracking-[.1em] text-faint">Deployment</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Rank" required error={f.errors.rank}>
              <Select {...f.bind('rank')}>{RANKS.map((r) => <option key={r} value={r}>{r}</option>)}</Select>
            </Field>
            <Field label="Grade">
              <Select {...f.bind('grade')}>{['A', 'B', 'C', 'D'].map((g) => <option key={g} value={g}>Grade {g}</option>)}</Select>
            </Field>
            <Field label="Assigned site">
              <Select {...f.bind('siteId')}>
                <option value="">Unassigned / bench</option>
                {lk?.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Employment status">
              <Select {...f.bind('status')}>{STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
            </Field>
            <Field label="Hourly rate (USD)" error={f.errors.hourlyRate}>
              <Input type="number" step="0.01" min="0" {...f.bind('hourlyRate')} />
            </Field>
            <Field label="Hire date"><Input type="date" {...f.bind('hireDate')} /></Field>
          </div>
        </section>

        <section>
          <h4 className="mb-3 text-[11px] font-bold uppercase tracking-[.1em] text-faint">Compliance</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ZRP registration no."><Input {...f.bind('licenseNo')} placeholder="ZRP123456" /></Field>
            <Field label="Registration expiry"><Input type="date" {...f.bind('licenseExpiry')} /></Field>
          </div>
          <div className="mt-3">
            <p className="label">Certifications</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-lg border border-line bg-surface2/50 p-3">
              {CERTS.map((c) => (
                <Checkbox key={c} label={c} checked={(f.values.certifications || []).includes(c)} onChange={() => toggleCert(c)} />
              ))}
            </div>
          </div>
          <div className="mt-3">
            <Checkbox
              label="Authorised to carry a firearm"
              checked={!!f.values.armed}
              onChange={() => f.set('armed', !f.values.armed)}
            />
          </div>
        </section>
      </form>
    </Drawer>
  )
}

function LicenceCell({ value }) {
  if (!value) return <span className="text-faint"></span>
  const days = Math.round((new Date(value) - Date.now()) / 86400000)
  const tone = days < 0 ? 'critical' : days < 30 ? 'warn' : 'muted'
  return (
    <div className="flex items-center gap-1.5">
      {days < 30 && <AlertTriangle size={12} className={`text-${tone}`} />}
      <div>
        <p className={cn('text-[12.5px]', days < 30 ? `text-${tone} font-semibold` : 'text-muted')}>{fmtDate(value)}</p>
        <p className="text-[10.5px] text-faint">{days < 0 ? `expired ${Math.abs(days)}d ago` : `${days}d left`}</p>
      </div>
    </div>
  )
}

export default function Guards() {
  const navigate = useNavigate()
  const { can } = useAuth()
  const t = useTableState({ sort: 'name', dir: 'asc' })
  const [tab, setTab] = useState('all')
  const [selected, setSelected] = useState([])
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const filters = { ...t.filters, ...(tab === 'all' ? {} : { status: tab }) }
  const query = useList('guards', { ...t.params, filters, facet: 'status' })
  const del = useDelete('guards', { label: 'Officer' })
  const bulk = useBulk('guards')
  const facets = query.data?.facets || {}

  const tabs = [
    { value: 'all', label: 'All officers', count: Object.values(facets).reduce((a, b) => a + b, 0) },
    ...STATUSES.map((s) => ({ value: s, label: titleCase(s), count: facets[s] || 0 })),
  ]

  const columns = [
    {
      key: 'name', header: 'Officer',
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={r.name} size={30} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-ink">{r.name}</p>
            <p className="mono truncate text-[11px] text-faint">{r.employeeNo} · Grade {r.grade}</p>
          </div>
          {r.armed && <ShieldCheck size={13} className="shrink-0 text-warn" title="Firearm authorised" />}
        </div>
      ),
    },
    { key: 'rank', header: 'Rank', width: 160, render: (r) => <span className="text-[12.5px] text-muted">{r.rank}</span> },
    {
      key: 'siteId', header: 'Site', width: 170, sortable: false,
      render: (r) => r._site ? (
        <span className="truncate text-[12.5px] text-muted">{r._site.name}</span>
      ) : <span className="chip border-line bg-surface2 text-faint">On bench</span>,
    },
    { key: 'status', header: 'Status', width: 124, render: (r) => <Badge value={r.status} dot /> },
    { key: 'licenseExpiry', header: 'ZRP registration', width: 150, render: (r) => <LicenceCell value={r.licenseExpiry} /> },
    {
      key: 'rating', header: 'Rating', width: 96, align: 'right',
      render: (r) => (
        <span className="inline-flex items-center gap-1">
          <Star size={12} className={r.rating >= 4 ? 'fill-warn text-warn' : 'text-faint'} />
          <span className="mono text-[12.5px] font-semibold text-ink">{r.rating.toFixed(1)}</span>
        </span>
      ),
    },
    {
      key: 'hourlyRate', header: 'Rate', width: 90, align: 'right',
      render: (r) => <span className="mono text-[12.5px] text-muted">{money2(r.hourlyRate)}</span>,
    },
    {
      key: 'actions', header: '', sortable: false, width: 92, align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          {can('guards', 'update') && (
            <button className="btn btn-ghost h-7 w-7 px-0" title="Edit" onClick={() => { setEditing(r); setFormOpen(true) }}><Pencil size={13} /></button>
          )}
          {can('guards', 'delete') && (
            <button className="btn btn-ghost h-7 w-7 px-0 text-critical" title="Delete" onClick={() => setConfirm(r)}><Trash2 size={13} /></button>
          )}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Officers"
        subtitle="Personnel records, deployment, licensing and performance."
        actions={can('guards', 'create') && (
          <Button variant="primary" icon={Plus} onClick={() => { setEditing(null); setFormOpen(true) }}>Add officer</Button>
        )}
        tabs={<Tabs tabs={tabs} value={tab} onChange={(v) => { setTab(v); t.setPage(1); setSelected([]) }} className="mt-4" />}
      />

      <Toolbar
        q={t.q} onQ={t.setQ}
        placeholder="Search name, employee no., licence…"
        activeFilters={t.activeFilters} onReset={t.reset}
        exportName="officers"
        exportRows={() => (query.data?.rows || []).map((r) => ({
          employeeNo: r.employeeNo, name: r.name, rank: r.rank, grade: r.grade, status: r.status,
          site: r._site?.name || '', email: r.email, phone: r.phone, licence: r.licenseNo,
          licenceExpiry: r.licenseExpiry, hourlyRate: r.hourlyRate, rating: r.rating,
        }))}
        filters={
          <>
            <FilterSelect label="Rank" value={t.filters.rank} onChange={(v) => t.setFilter('rank', v)} options={RANKS} />
            <FilterSelect label="Grade" value={t.filters.grade} onChange={(v) => t.setFilter('grade', v)} options={['A', 'B', 'C', 'D']} />
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
        onRowClick={(r) => navigate(`/guards/${r.id}`)}
        selectable={can('guards', 'update')}
        selected={selected} onSelected={setSelected}
        emptyIcon={Users}
        emptyTitle="No officers found"
        emptyBody="Adjust your filters or add a new personnel record."
        bulkBar={(ids) => (
          <>
            <Button size="xs" variant="secondary" icon={UserCheck} onClick={() => bulk.update.mutate({ ids, patch: { status: 'active' } })}>
              Set active
            </Button>
            <Button size="xs" variant="secondary" icon={UserX} onClick={() => bulk.update.mutate({ ids, patch: { status: 'on_leave' } })}>
              Set on leave
            </Button>
            {can('guards', 'delete') && (
              <Button size="xs" variant="danger" icon={Trash2} onClick={() => { bulk.remove.mutate(ids); setSelected([]) }}>Delete</Button>
            )}
          </>
        )}
      />

      <GuardForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null) }} initial={editing} />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Remove this officer?"
        body={`${confirm?.name} (${confirm?.employeeNo}) will be removed from the personnel register. Historic shifts and incidents remain, but will show an unknown officer.`}
        confirmLabel="Remove officer"
        onConfirm={() => del.mutate(confirm.id)}
      />
    </>
  )
}
