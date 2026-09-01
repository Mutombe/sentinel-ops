import React, { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Inbox, Trash2, Send, LifeBuoy, Clock, CheckCircle2, AlertTriangle, MessageSquare } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { DataTable } from '@/components/ui/DataTable'
import { Toolbar, FilterSelect } from '@/components/ui/Toolbar'
import { Drawer, ConfirmDialog } from '@/components/ui/Modal'
import { Badge, Button, Field, Input, Select, Textarea, Avatar, Tabs, StatCard, Card, EmptyState } from '@/components/ui/primitives'
import { useList, useTableState, useCreate, useUpdate, useDelete, useBulk, useLookups, useForm } from '@/lib/hooks'
import { api } from '@/lib/api'
import { fmtDateTime, timeAgo, titleCase, cn } from '@/lib/utils'
import { hrefFor } from '@/lib/records'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { useToast } from '@/components/ui/Toast'

const TYPES = ['Additional Coverage', 'Incident Follow-up', 'Site Assessment', 'Guard Replacement', 'Access List Update', 'Equipment Request', 'Complaint', 'Contract Amendment']
const PRIORITIES = ['low', 'normal', 'high', 'urgent']
const STATUSES = ['open', 'in_progress', 'awaiting_client', 'resolved', 'closed']

export function RequestForm({ open, onClose, initial, lockClientId }) {
  const isEdit = !!initial
  const { data: lk } = useLookups()
  const toast = useToast()
  const create = useCreate('requests', { label: 'Request', onSuccess: onClose })
  const update = useUpdate('requests', { label: 'Request', onSuccess: onClose })
  const busy = create.isPending || update.isPending
  const { user } = useAuth()

  const blank = {
    clientId: lockClientId || '', siteId: '', type: TYPES[0], priority: 'normal',
    subject: '', description: '', status: 'open', assignedTo: 'Ops Desk',
  }
  const f = useForm(blank)

  useEffect(() => {
    if (!open) return
    f.reset(initial ? { ...initial, siteId: initial.siteId || '' } : { ...blank, clientId: lockClientId || '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id, lockClientId])

  const sites = (lk?.sites || []).filter((s) => !f.values.clientId || s.clientId === f.values.clientId)

  const submit = async (e) => {
    e.preventDefault()
    const payload = {
      ...f.values,
      siteId: f.values.siteId || null,
      ref: isEdit ? initial.ref : 'REQ-' + Math.floor(1000 + Math.random() * 8999),
      createdBy: isEdit ? initial.createdBy : user.name,
      updatedAt: new Date().toISOString(),
      comments: initial?.comments || [],
    }
    try {
      if (isEdit) await update.mutateAsync({ id: initial.id, patch: payload })
      else await create.mutateAsync(payload)
    } catch (err) {
      f.applyServerError(err)
      if (!err.fields) toast.error('Could not save request', { body: err.message })
    }
  }

  return (
    <Drawer
      open={open} onClose={onClose}
      title={isEdit ? `Edit ${initial.ref}` : 'Raise a service request'}
      subtitle={isEdit ? initial.subject : 'Send a request to the operations desk'}
      width="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={submit}>{isEdit ? 'Save request' : 'Submit request'}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4 p-5">
        {!lockClientId && (
          <Field label="Client" required error={f.errors.clientId}>
            <Select {...f.bind('clientId')}>
              <option value="">Select a client…</option>
              {lk?.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Request type" required error={f.errors.type}>
            <Select {...f.bind('type')}>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select>
          </Field>
          <Field label="Priority">
            <Select {...f.bind('priority')}>{PRIORITIES.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}</Select>
          </Field>
          <Field label="Site (optional)" className="sm:col-span-2">
            <Select {...f.bind('siteId')}>
              <option value="">All sites / not site specific</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
        </div>

        <Field label="Subject" required error={f.errors.subject}><Input {...f.bind('subject')} placeholder="Short summary of what you need" /></Field>
        <Field label="Details"><Textarea rows={5} {...f.bind('description')} placeholder="Give the operations desk everything they need to action this…" /></Field>

        {isEdit && (
          <Field label="Status">
            <Select {...f.bind('status')}>{STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
          </Field>
        )}
      </form>
    </Drawer>
  )
}

export function RequestThread({ request, onClose, canManage }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { user } = useAuth()
  const [body, setBody] = useState('')
  const update = useUpdate('requests', { label: 'Request', silent: true })

  const comment = useMutation({
    mutationFn: (text) => api.addRequestComment(request.id, text),
    onMutate: async (text) => {
      await qc.cancelQueries({ queryKey: ['requests'] })
      const snaps = qc.getQueriesData({ queryKey: ['requests', 'list'] })
      snaps.forEach(([key, data]) => {
        if (!data) return
        qc.setQueryData(key, {
          ...data,
          rows: data.rows.map((r) => r.id === request.id
            ? { ...r, comments: [...(r.comments || []), { id: 'tmp', at: new Date().toISOString(), author: user.name, body: text, __optimistic: true }] }
            : r),
        })
      })
      setBody('')
      return { snaps }
    },
    onError: (err, _v, ctx) => {
      ctx?.snaps.forEach(([key, data]) => qc.setQueryData(key, data))
      toast.error('Message not sent', { body: err.message })
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['requests'] }),
  })

  if (!request) return null

  return (
    <Drawer
      open={!!request}
      onClose={onClose}
      title={request.subject}
      subtitle={`${request.ref} · ${request.type} · raised ${timeAgo(request.createdAt)}`}
      badge={<Badge value={request.priority} size="sm" />}
      width="max-w-xl"
      footer={
        canManage ? (
          <div className="flex w-full items-center gap-2">
            <Select
              value={request.status}
              onChange={(e) => update.mutate({ id: request.id, patch: { status: e.target.value, updatedAt: new Date().toISOString() } })}
              className="max-w-[190px]"
            >
              {STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
            </Select>
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" onClick={onClose}>Close</Button>
              <Button
                variant="primary"
                icon={CheckCircle2}
                onClick={() => { update.mutate({ id: request.id, patch: { status: 'resolved' } }); toast.success('Request resolved') }}
              >
                Resolve
              </Button>
            </div>
          </div>
        ) : <Button variant="ghost" onClick={onClose}>Close</Button>
      }
    >
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge value={request.status} dot />
          <Badge value={request.priority} />
          {request._site && <span className="chip border-line bg-surface2 text-muted">{request._site.name}</span>}
          {request._client && <span className="chip border-line bg-surface2 text-muted">{request._client.name}</span>}
        </div>

        <Card title="Request details">
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted">{request.description}</p>
          <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-[11.5px] text-faint">
            <Avatar name={request.createdBy} size={20} />
            Raised by {request.createdBy} · {fmtDateTime(request.createdAt)}
          </div>
        </Card>

        <Card title="Conversation" subtitle={`${request.comments?.length || 0} messages`}>
          {(request.comments || []).length === 0 ? (
            <EmptyState icon={MessageSquare} title="No messages yet" body="Start the conversation below." />
          ) : (
            <ul className="space-y-3">
              {request.comments.map((c) => (
                <li key={c.id} className={cn('flex gap-2.5', c.__optimistic && 'opacity-60')}>
                  <Avatar name={c.author} size={28} />
                  <div className="min-w-0 flex-1 rounded-lg rounded-tl-none border border-line bg-surface2/50 px-3 py-2">
                    <div className="flex items-baseline gap-2">
                      <p className="text-[12.5px] font-semibold text-ink">{c.author}</p>
                      <p className="text-[10.5px] text-faint">{timeAgo(c.at)}</p>
                    </div>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{c.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form
            className="mt-4 border-t border-line pt-4"
            onSubmit={(e) => { e.preventDefault(); if (body.trim()) comment.mutate(body.trim()) }}
          >
            <div className="flex items-start gap-2.5">
              <Avatar name={user.name} size={28} />
              <div className="min-w-0 flex-1">
                <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a reply…" />
                <div className="mt-2 flex justify-end">
                  <Button type="submit" size="sm" variant="primary" icon={Send} loading={comment.isPending} disabled={!body.trim()}>Send</Button>
                </div>
              </div>
            </div>
          </form>
        </Card>
      </div>
    </Drawer>
  )
}

export default function Requests() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const t = useTableState({ sort: 'createdAt', dir: 'desc' })
  const [tab, setTab] = useState('all')
  const [selected, setSelected] = useState([])
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [thread, setThread] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const filters = { ...t.filters, ...(tab === 'all' ? {} : { status: tab }) }
  const query = useList('requests', { ...t.params, filters, facet: 'status' })
  const allQ = useList('requests', { all: true, pageSize: 500 })
  const del = useDelete('requests', { label: 'Request' })
  const bulk = useBulk('requests')

  // keep the open thread in sync with fresh list data
  const liveThread = thread ? (query.data?.rows || []).find((r) => r.id === thread.id) || thread : null

  const all = allQ.data?.rows || []
  const open = all.filter((r) => r.status === 'open')
  const urgent = all.filter((r) => r.priority === 'urgent' && r.status !== 'closed' && r.status !== 'resolved')
  const resolved = all.filter((r) => r.status === 'resolved' || r.status === 'closed')

  const facets = query.data?.facets || {}
  const tabs = [
    { value: 'all', label: 'All requests', count: Object.values(facets).reduce((a, b) => a + b, 0) },
    ...STATUSES.map((s) => ({ value: s, label: titleCase(s), count: facets[s] || 0 })),
  ]

  const columns = [
    { key: 'ref', header: 'Ref', width: 115, render: (r) => <span className="mono text-[12px] font-semibold text-ink">{r.ref}</span> },
    {
      key: 'subject', header: 'Request',
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-semibold text-ink">{r.subject}</p>
          <p className="truncate text-[11px] text-faint">{r.type} · {r._client?.name}</p>
        </div>
      ),
    },
    { key: 'priority', header: 'Priority', width: 105, render: (r) => <Badge value={r.priority} /> },
    { key: 'status', header: 'Status', width: 140, render: (r) => <Badge value={r.status} dot /> },
    {
      key: 'comments', header: 'Thread', sortable: false, width: 90, align: 'center',
      render: (r) => (
        <span className="inline-flex items-center gap-1 text-[12px] text-muted">
          <MessageSquare size={12} className="text-faint" />{r.comments?.length || 0}
        </span>
      ),
    },
    { key: 'createdBy', header: 'Raised by', width: 160, render: (r) => <span className="truncate text-[12.5px] text-muted">{r.createdBy}</span> },
    { key: 'updatedAt', header: 'Updated', width: 120, render: (r) => <span className="text-[12px] text-muted">{timeAgo(r.updatedAt)}</span> },
    {
      key: 'actions', header: '', sortable: false, width: 60, align: 'right',
      render: (r) => can('requests', 'delete') && (
        <div onClick={(e) => e.stopPropagation()}>
          <button className="btn btn-ghost h-7 w-7 px-0 text-critical" onClick={() => setConfirm(r)}><Trash2 size={13} /></button>
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Service Desk"
        subtitle="Client requests, complaints and change orders, with a full conversation trail."
        actions={can('requests', 'create') && (
          <Button variant="primary" icon={Plus} onClick={() => { setEditing(null); setFormOpen(true) }}>New request</Button>
        )}
        tabs={<Tabs tabs={tabs} value={tab} onChange={(v) => { setTab(v); t.setPage(1); setSelected([]) }} className="mt-4" />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open requests" value={open.length} icon={Inbox} tone="accent" loading={allQ.isLoading} hint="Awaiting first action" />
        <StatCard label="Urgent" value={urgent.length} icon={AlertTriangle} tone="critical" loading={allQ.isLoading} hint="Escalate within the hour" />
        <StatCard label="Resolved" value={resolved.length} icon={CheckCircle2} tone="ok" loading={allQ.isLoading} hint={`${Math.round((resolved.length / (all.length || 1)) * 100)}% of all requests`} />
        <StatCard label="Total raised" value={all.length} icon={LifeBuoy} tone="accent2" loading={allQ.isLoading} hint="Across all clients" />
      </div>

      <Toolbar
        q={t.q} onQ={t.setQ}
        placeholder="Search reference, subject, type…"
        activeFilters={t.activeFilters} onReset={t.reset}
        exportName="service-requests"
        exportRows={() => (query.data?.rows || []).map((r) => ({
          ref: r.ref, client: r._client?.name, site: r._site?.name || '', type: r.type,
          priority: r.priority, status: r.status, subject: r.subject, createdBy: r.createdBy,
          createdAt: r.createdAt, updatedAt: r.updatedAt, messages: r.comments?.length || 0,
        }))}
        filters={
          <>
            <FilterSelect label="Priority" value={t.filters.priority} onChange={(v) => t.setFilter('priority', v)} options={PRIORITIES} />
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
        onRowClick={(r) => navigate(hrefFor('requests', r.id))}
        selectable={can('requests', 'update')}
        selected={selected} onSelected={setSelected}
        emptyIcon={Inbox} emptyTitle="No requests in this view"
        bulkBar={(ids) => (
          <>
            <Button size="xs" variant="secondary" onClick={() => bulk.update.mutate({ ids, patch: { status: 'in_progress' } })}>Start work</Button>
            <Button size="xs" variant="secondary" icon={CheckCircle2} onClick={() => bulk.update.mutate({ ids, patch: { status: 'resolved' } })}>Resolve</Button>
          </>
        )}
      />

      <RequestForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null) }} initial={editing} />
      <RequestThread request={liveThread} onClose={() => setThread(null)} canManage={can('requests', 'update')} />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Delete this request?"
        body={`${confirm?.ref}, ${confirm?.subject}. The conversation thread will also be removed.`}
        confirmLabel="Delete request"
        onConfirm={() => del.mutate(confirm.id)}
      />
    </>
  )
}
