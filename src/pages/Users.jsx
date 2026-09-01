import React, { useEffect, useState } from 'react'
import { Plus, UserCog, Trash2, Pencil, ShieldCheck, KeyRound, Lock, Check, X, Users as UsersIcon } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { DataTable } from '@/components/ui/DataTable'
import { Toolbar, FilterSelect } from '@/components/ui/Toolbar'
import { Drawer, ConfirmDialog, Modal } from '@/components/ui/Modal'
import { Badge, Button, Field, Input, Select, Avatar, Tabs, StatCard, Card, Switch } from '@/components/ui/primitives'
import { useList, useTableState, useCreate, useUpdate, useDelete, useBulk, useLookups, useForm } from '@/lib/hooks'
import { PERMISSIONS } from '@/lib/api'
import { fmtDateTime, timeAgo, titleCase, ROLE_LABEL, cn } from '@/lib/utils'
import { hrefFor } from '@/lib/records'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { ViewAsButton } from '@/features/ViewAs'
import { useToast } from '@/components/ui/Toast'

const ROLES = ['admin', 'ops_manager', 'supervisor', 'finance', 'client', 'guard']
const RESOURCES = ['clients', 'sites', 'guards', 'shifts', 'incidents', 'patrols', 'attendance', 'assets', 'requests', 'invoices', 'payroll', 'users', 'audit']

function UserForm({ open, onClose, initial }) {
  const isEdit = !!initial
  const { data: lk } = useLookups()
  const toast = useToast()
  const create = useCreate('users', { label: 'User', onSuccess: onClose })
  const update = useUpdate('users', { label: 'User', onSuccess: onClose })
  const busy = create.isPending || update.isPending

  const blank = { name: '', email: '', password: 'welcome123', role: 'supervisor', title: '', status: 'active', mfa: false, clientId: '', guardId: '' }
  const f = useForm(blank)

  useEffect(() => {
    if (!open) return
    f.reset(initial ? { ...initial, password: '', clientId: initial.clientId || '', guardId: initial.guardId || '' } : blank)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id])

  const submit = async (e) => {
    e.preventDefault()
    const payload = { ...f.values, clientId: f.values.clientId || null, guardId: f.values.guardId || null, avatarHue: initial?.avatarHue ?? Math.floor(Math.random() * 360) }
    if (isEdit && !payload.password) delete payload.password
    try {
      if (isEdit) await update.mutateAsync({ id: initial.id, patch: payload })
      else await create.mutateAsync(payload)
    } catch (err) {
      f.applyServerError(err)
      if (!err.fields) toast.error('Could not save user', { body: err.message })
    }
  }

  const perms = PERMISSIONS[f.values.role] || []

  return (
    <Drawer
      open={open} onClose={onClose}
      title={isEdit ? `Edit ${initial.name}` : 'Invite a user'}
      subtitle={isEdit ? initial.email : 'Create an account and assign a role'}
      width="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={submit}>{isEdit ? 'Save user' : 'Create user'}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={f.errors.name}><Input {...f.bind('name')} /></Field>
          <Field label="Email" required error={f.errors.email}><Input type="email" {...f.bind('email')} /></Field>
          <Field label="Job title"><Input {...f.bind('title')} placeholder="e.g. Regional Supervisor" /></Field>
          <Field label={isEdit ? 'Reset password' : 'Temporary password'} hint={isEdit ? 'Leave blank to keep the current password' : 'The user is prompted to change it on first sign-in'}>
            <Input type="text" {...f.bind('password')} />
          </Field>
          <Field label="Role" required error={f.errors.role}>
            <Select {...f.bind('role')}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select>
          </Field>
          <Field label="Account status">
            <Select {...f.bind('status')}>{['active', 'disabled'].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
          </Field>
        </div>

        {f.values.role === 'client' && (
          <Field label="Linked client account" required hint="Portal users only see data belonging to this client.">
            <Select {...f.bind('clientId')}>
              <option value="">Select a client…</option>
              {lk?.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        )}

        {f.values.role === 'guard' && (
          <Field label="Linked officer record" hint="Links the login to a personnel file for shifts and payslips.">
            <Select {...f.bind('guardId')}>
              <option value="">Select an officer…</option>
              {lk?.guards.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.employeeNo})</option>)}
            </Select>
          </Field>
        )}

        <div className="rounded-lg border border-line bg-surface2/50 p-3.5">
          <Switch
            checked={!!f.values.mfa}
            onChange={(v) => f.set('mfa', v)}
            label="Require two-factor authentication"
            hint="The user must enter a 6-digit authenticator code at sign-in."
          />
        </div>

        <div>
          <p className="label">Effective permissions for {ROLE_LABEL[f.values.role]}</p>
          <div className="overflow-hidden rounded-lg border border-line">
            <table className="w-full">
              <thead className="bg-surface2/70">
                <tr>
                  <th className="th">Module</th>
                  <th className="th text-center">Read</th>
                  <th className="th text-center">Create</th>
                  <th className="th text-center">Update</th>
                  <th className="th text-center">Delete</th>
                </tr>
              </thead>
              <tbody>
                {RESOURCES.map((res) => {
                  const has = (a) => perms.includes('*') || perms.includes(`${res}:*`) || perms.includes(`${res}:${a}`)
                  return (
                    <tr key={res} className="border-t border-line/70">
                      <td className="td text-[12.5px] text-ink">{titleCase(res)}</td>
                      {['read', 'create', 'update', 'delete'].map((a) => (
                        <td key={a} className="td text-center">
                          {has(a)
                            ? <Check size={13} className="mx-auto text-ok" />
                            : <X size={13} className="mx-auto text-line" />}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </form>
    </Drawer>
  )
}

export default function Users() {
  const { can, user: me } = useAuth()
  const navigate = useNavigate()
  const t = useTableState({ sort: 'name', dir: 'asc' })
  const [tab, setTab] = useState('all')
  const [selected, setSelected] = useState([])
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [matrix, setMatrix] = useState(false)

  const filters = { ...t.filters, ...(tab === 'all' ? {} : { role: tab }) }
  const query = useList('users', { ...t.params, filters, facet: 'role' })
  const allQ = useList('users', { all: true, pageSize: 500 })
  const del = useDelete('users', { label: 'User' })
  const update = useUpdate('users', { label: 'User' })
  const bulk = useBulk('users')

  const all = allQ.data?.rows || []
  const facets = query.data?.facets || {}

  const tabs = [
    { value: 'all', label: 'All users', count: Object.values(facets).reduce((a, b) => a + b, 0) },
    ...ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r], count: facets[r] || 0 })),
  ]

  const columns = [
    {
      key: 'name', header: 'User',
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={r.name} hue={r.avatarHue} size={30} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-ink">
              {r.name} {r.id === me.id && <span className="text-[11px] font-normal text-faint">(you)</span>}
            </p>
            <p className="truncate text-[11px] text-faint">{r.email}</p>
          </div>
        </div>
      ),
    },
    { key: 'title', header: 'Job title', width: 190, render: (r) => <span className="truncate text-[12.5px] text-muted">{r.title}</span> },
    {
      key: 'role', header: 'Role', width: 170,
      render: (r) => can('users', 'update') && r.id !== me.id ? (
        <div onClick={(e) => e.stopPropagation()}>
          <Select
            value={r.role}
            onChange={(e) => update.mutate({ id: r.id, patch: { role: e.target.value } })}
            className="h-7 text-[12px]"
          >
            {ROLES.map((x) => <option key={x} value={x}>{ROLE_LABEL[x]}</option>)}
          </Select>
        </div>
      ) : <Badge value={r.role} label={ROLE_LABEL[r.role]} />,
    },
    {
      key: 'mfa', header: 'MFA', width: 90, align: 'center',
      render: (r) => r.mfa
        ? <ShieldCheck size={15} className="mx-auto text-ok" title="Enabled" />
        : <span className="text-[11.5px] text-faint">Off</span>,
    },
    { key: 'status', header: 'Status', width: 124, render: (r) => <Badge value={r.status} dot /> },
    {
      key: 'lastLogin', header: 'Last seen', width: 120,
      render: (r) => (
        <div>
          <p className="text-[12.5px] text-muted">{timeAgo(r.lastLogin)}</p>
          <p className="text-[10.5px] text-faint">{fmtDateTime(r.lastLogin).split(' · ')[0]}</p>
        </div>
      ),
    },
    {
      key: 'actions', header: '', sortable: false, width: 140, align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          {r.id !== me.id && <ViewAsButton userId={r.id} label="View as" size="xs" variant="ghost" />}
          {can('users', 'update') && <button className="btn btn-ghost h-7 w-7 px-0" onClick={() => { setEditing(r); setFormOpen(true) }}><Pencil size={13} /></button>}
          {can('users', 'delete') && r.id !== me.id && (
            <button className="btn btn-ghost h-7 w-7 px-0 text-critical" onClick={() => setConfirm(r)}><Trash2 size={13} /></button>
          )}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Users & Roles"
        subtitle="Accounts, role-based access control and authentication policy."
        actions={
          <>
            <Button variant="secondary" icon={Lock} onClick={() => setMatrix(true)}>Permission matrix</Button>
            {can('users', 'create') && (
              <Button variant="primary" icon={Plus} onClick={() => { setEditing(null); setFormOpen(true) }}>Invite user</Button>
            )}
          </>
        }
        tabs={<Tabs tabs={tabs} value={tab} onChange={(v) => { setTab(v); t.setPage(1); setSelected([]) }} className="mt-4" />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total accounts" value={all.length} icon={UsersIcon} tone="accent" loading={allQ.isLoading} />
        <StatCard label="Active" value={all.filter((u) => u.status === 'active').length} icon={ShieldCheck} tone="ok" loading={allQ.isLoading} />
        <StatCard label="MFA enabled" value={all.filter((u) => u.mfa).length} icon={KeyRound} tone="accent2" loading={allQ.isLoading}
          hint={`${Math.round((all.filter((u) => u.mfa).length / (all.length || 1)) * 100)}% coverage`} />
        <StatCard label="Portal users" value={all.filter((u) => u.role === 'client').length} icon={UserCog} tone="warn" loading={allQ.isLoading} hint="External client logins" />
      </div>

      <Toolbar
        q={t.q} onQ={t.setQ}
        placeholder="Search name, email, role…"
        activeFilters={t.activeFilters} onReset={t.reset}
        exportName="users"
        exportRows={() => (query.data?.rows || []).map((r) => ({
          name: r.name, email: r.email, role: r.role, title: r.title,
          status: r.status, mfa: r.mfa, lastLogin: r.lastLogin,
        }))}
        filters={<FilterSelect label="Status" value={t.filters.status} onChange={(v) => t.setFilter('status', v)} options={['active', 'disabled']} />}
      />

      <DataTable
        columns={columns}
        rows={query.data?.rows || []}
        loading={query.isLoading} fetching={query.isFetching}
        sort={query.data?.sort} dir={query.data?.dir} onSort={t.toggleSort}
        page={query.data?.page} pageCount={query.data?.pageCount} pageSize={t.pageSize}
        total={query.data?.total} from={query.data?.from} to={query.data?.to}
        onPage={t.setPage} onPageSize={t.setPageSize}
        onRowClick={(r) => navigate(hrefFor('users', r.id))}
        selectable={can('users', 'update')}
        selected={selected} onSelected={setSelected}
        emptyIcon={UserCog} emptyTitle="No users found"
        bulkBar={(ids) => (
          <>
            <Button size="xs" variant="secondary" onClick={() => bulk.update.mutate({ ids, patch: { status: 'active' } })}>Enable</Button>
            <Button size="xs" variant="secondary" onClick={() => bulk.update.mutate({ ids, patch: { status: 'disabled' } })}>Disable</Button>
            <Button size="xs" variant="secondary" icon={KeyRound} onClick={() => bulk.update.mutate({ ids, patch: { mfa: true } })}>Require MFA</Button>
          </>
        )}
      />

      <UserForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null) }} initial={editing} />

      <Modal open={matrix} onClose={() => setMatrix(false)} size="xl" title="Role permission matrix" subtitle="What each role can do across the platform">
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[640px]">
            <thead className="bg-surface2/70">
              <tr>
                <th className="th">Module</th>
                {ROLES.map((r) => <th key={r} className="th text-center">{ROLE_LABEL[r]}</th>)}
              </tr>
            </thead>
            <tbody>
              {RESOURCES.map((res) => (
                <tr key={res} className="border-t border-line/70">
                  <td className="td text-[12.5px] font-medium text-ink">{titleCase(res)}</td>
                  {ROLES.map((role) => {
                    const perms = PERMISSIONS[role] || []
                    const level = perms.includes('*') || perms.includes(`${res}:*`) ? 'full'
                      : perms.includes(`${res}:read`) ? 'read'
                      : perms.some((p) => p.startsWith(res + ':')) ? 'partial' : 'none'
                    return (
                      <td key={role} className="td text-center">
                        <span className={cn(
                          'chip mx-auto',
                          level === 'full' ? 'border-ok/25 bg-ok/10 text-ok'
                            : level === 'read' ? 'border-accent/25 bg-accent/10 text-accent'
                            : level === 'partial' ? 'border-warn/25 bg-warn/10 text-warn'
                            : 'border-line bg-surface2 text-faint'
                        )}>
                          {level === 'full' ? 'Full' : level === 'read' ? 'Read' : level === 'partial' ? 'Partial' : ''}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Delete this user account?"
        body={`${confirm?.name} (${confirm?.email}) will lose access immediately. Their audit history is retained.`}
        confirmLabel="Delete user"
        requireText={confirm?.email}
        onConfirm={() => del.mutate(confirm.id)}
      />
    </>
  )
}
