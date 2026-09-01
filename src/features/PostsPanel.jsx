import React, { useEffect, useState } from 'react'
import { Plus, Trash2, Pencil, ScrollText, Shield, Clock, Users, AlertTriangle, ListChecks } from 'lucide-react'
import { Card, Badge, Button, Field, Input, Select, Textarea, EmptyState, Skeleton, Switch, Progress } from '@/components/ui/primitives'
import { Drawer, ConfirmDialog } from '@/components/ui/Modal'
import { useList, useCreate, useUpdate, useDelete, useForm } from '@/lib/hooks'
import { titleCase, cn } from '@/lib/utils'
import { useAuth } from '@/auth/AuthContext'
import { useToast } from '@/components/ui/Toast'

const POST_TYPES = [
  'Main Gatehouse', 'Control Room', 'Roving Patrol', 'Reception Desk',
  'Loading Bay', 'Perimeter Tower', 'Staff Entrance', 'Car Park',
  'Cash Office', 'Server Room', 'Emergency Exit', 'Executive Floor',
]
const COVERAGE = ['24/7', '12h Day', '12h Night', 'Business Hours', 'Weekend Only']
const CRITICALITY = ['routine', 'important', 'critical']

function PostForm({ open, onClose, initial, site }) {
  const isEdit = !!initial
  const toast = useToast()
  const create = useCreate('posts', { label: 'Post', onSuccess: onClose })
  const update = useUpdate('posts', { label: 'Post', onSuccess: onClose })
  const busy = create.isPending || update.isPending

  const blank = {
    name: POST_TYPES[0], type: POST_TYPES[0], requiredGuards: 1, coverage: '24/7',
    criticality: 'important', armed: false, status: 'active',
    ordersText: '', instructions: '',
  }
  const f = useForm(blank)

  useEffect(() => {
    if (!open) return
    f.reset(initial
      ? { ...initial, ordersText: (initial.orders || []).join('\n') }
      : blank)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id])

  const submit = async (e) => {
    e.preventDefault()
    const payload = {
      ...f.values,
      siteId: site.id,
      clientId: site.clientId,
      code: isEdit ? initial.code : `${site.code}-P${Math.floor(1 + Math.random() * 9)}`,
      requiredGuards: +f.values.requiredGuards || 1,
      orders: f.values.ordersText.split('\n').map((x) => x.trim()).filter(Boolean),
    }
    delete payload.ordersText
    try {
      if (isEdit) await update.mutateAsync({ id: initial.id, patch: payload })
      else await create.mutateAsync(payload)
    } catch (err) {
      f.applyServerError(err)
      if (!err.fields) toast.error('Could not save post', { body: err.message })
    }
  }

  return (
    <Drawer
      open={open} onClose={onClose}
      title={isEdit ? `Edit ${initial.name}` : 'New post'}
      subtitle={`${site.name} · post orders are what the officer is held to`}
      width="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={submit}>{isEdit ? 'Save post' : 'Create post'}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Post name" required error={f.errors.name}>
            <Select value={f.values.name} onChange={(e) => { f.set('name', e.target.value); f.set('type', e.target.value) }}>
              {POST_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
          <Field label="Coverage pattern">
            <Select {...f.bind('coverage')}>{COVERAGE.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
          </Field>
          <Field label="Officers required"><Input type="number" min="1" max="20" {...f.bind('requiredGuards')} /></Field>
          <Field label="Criticality" hint="Critical posts are escalated first when cover fails.">
            <Select {...f.bind('criticality')}>{CRITICALITY.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</Select>
          </Field>
          <Field label="Status">
            <Select {...f.bind('status')}>{['active', 'suspended', 'inactive'].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
          </Field>
        </div>

        <div className="rounded-lg border border-line bg-surface2/50 p-3.5">
          <Switch
            checked={!!f.values.armed}
            onChange={(v) => f.set('armed', v)}
            label="Armed post"
            hint="Only officers with a current firearm competency may be rostered here."
          />
        </div>

        <Field label="Post orders" hint="One instruction per line. These appear on the officer's mobile app at the post.">
          <Textarea rows={7} {...f.bind('ordersText')} placeholder={'Verify photographic ID for every visitor.\nLog all vehicle registrations in the gate register.\n…'} />
        </Field>

        <Field label="Site instructions" hint="Standing context: relief, escalation route, reaction times.">
          <Textarea rows={4} {...f.bind('instructions')} />
        </Field>
      </form>
    </Drawer>
  )
}

export default function PostsPanel({ site }) {
  const { can } = useAuth()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [expanded, setExpanded] = useState(null)

  const query = useList('posts', { all: true, pageSize: 100, filters: { siteId: site.id }, sort: 'code', dir: 'asc' })
  const del = useDelete('posts', { label: 'Post' })

  const posts = query.data?.rows || []
  const active = posts.filter((p) => p.status === 'active')
  const totalRequired = active.reduce((a, p) => a + p.requiredGuards, 0)
  const armed = active.filter((p) => p.armed).length
  const critical = active.filter((p) => p.criticality === 'critical').length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Active posts', value: active.length, icon: Shield, tone: 'accent' },
          { label: 'Officers required', value: totalRequired, icon: Users, tone: 'accent2', hint: `Site contract: ${site.guardsRequired}` },
          { label: 'Critical posts', value: critical, icon: AlertTriangle, tone: 'critical' },
          { label: 'Armed posts', value: armed, icon: Shield, tone: 'warn' },
        ].map((m) => (
          <div key={m.label} className="card p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-semibold uppercase tracking-wide text-faint">{m.label}</span>
              <m.icon size={14} className={`text-${m.tone}`} />
            </div>
            <p className="mono mt-2 text-[24px] font-bold leading-none text-ink">{m.value}</p>
            {m.hint && <p className="mt-1.5 text-[11.5px] text-faint">{m.hint}</p>}
          </div>
        ))}
      </div>

      {totalRequired !== site.guardsRequired && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warn/25 bg-warn/[.07] px-4 py-3">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />
          <p className="text-[12.5px] leading-relaxed text-muted">
            Post requirements total <span className="mono font-semibold text-ink">{totalRequired}</span> officers,
            but the site contract specifies <span className="mono font-semibold text-ink">{site.guardsRequired}</span>.
            Reconcile the post breakdown with the contracted headcount.
          </p>
        </div>
      )}

      <Card
        title="Posts & post orders"
        subtitle={`${posts.length} position${posts.length === 1 ? '' : 's'} defined at this site`}
        actions={can('posts', 'create') && (
          <Button size="sm" variant="primary" icon={Plus} onClick={() => { setEditing(null); setFormOpen(true) }}>Add post</Button>
        )}
        noPad
      >
        {query.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : posts.length === 0 ? (
          <EmptyState
            icon={Shield}
            title="No posts defined"
            body="Break the site down into posts so officers know exactly where they stand and what they are held to."
            action={can('posts', 'create') && <Button variant="primary" icon={Plus} onClick={() => setFormOpen(true)}>Add the first post</Button>}
          />
        ) : (
          <ul className="divide-y divide-line/60">
            {posts.map((p) => {
              const open = expanded === p.id
              return (
                <li key={p.id} className={cn(p.__optimistic && 'opacity-60')}>
                  <div className="flex items-start gap-3 px-4 py-3">
                    <button
                      onClick={() => setExpanded(open ? null : p.id)}
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    >
                      <span className={cn(
                        'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border',
                        p.criticality === 'critical' ? 'border-critical/25 bg-critical/10 text-critical'
                          : p.criticality === 'important' ? 'border-warn/25 bg-warn/10 text-warn'
                          : 'border-line bg-surface2 text-faint'
                      )}>
                        <Shield size={14} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-[13px] font-semibold text-ink">{p.name}</p>
                          <span className="mono text-[11px] text-faint">{p.code}</span>
                          {p.armed && <span className="chip border-warn/25 bg-warn/10 text-warn">Armed</span>}
                        </div>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11.5px] text-faint">
                          <span className="flex items-center gap-1"><Users size={10} />{p.requiredGuards} officer{p.requiredGuards === 1 ? '' : 's'}</span>
                          <span className="flex items-center gap-1"><Clock size={10} />{p.coverage}</span>
                          <span className="flex items-center gap-1"><ListChecks size={10} />{(p.orders || []).length} standing orders</span>
                        </p>
                      </div>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge value={p.status} size="sm" dot />
                      {can('posts', 'update') && (
                        <button className="btn btn-ghost h-7 w-7 px-0" onClick={() => { setEditing(p); setFormOpen(true) }}><Pencil size={13} /></button>
                      )}
                      {can('posts', 'delete') && (
                        <button className="btn btn-ghost h-7 w-7 px-0 text-critical" onClick={() => setConfirm(p)}><Trash2 size={13} /></button>
                      )}
                    </div>
                  </div>

                  {open && (
                    <div className="border-t border-line/60 bg-surface2/30 px-4 py-4 animate-in">
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div>
                          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.1em] text-faint">
                            <ScrollText size={12} /> Post orders
                          </p>
                          {(p.orders || []).length === 0 ? (
                            <p className="text-[12px] text-faint">No standing orders recorded for this post.</p>
                          ) : (
                            <ol className="space-y-1.5">
                              {p.orders.map((o, i) => (
                                <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-muted">
                                  <span className="mono mt-px shrink-0 text-[11px] font-bold text-accent">{String(i + 1).padStart(2, '0')}</span>
                                  {o}
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                        <div>
                          <p className="mb-2 text-[11px] font-bold uppercase tracking-[.1em] text-faint">Site instructions</p>
                          <p className="text-[12.5px] leading-relaxed text-muted">{p.instructions || 'No additional instructions.'}</p>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            {[
                              ['Criticality', titleCase(p.criticality)],
                              ['Coverage', p.coverage],
                              ['Officers', p.requiredGuards],
                              ['Armed', p.armed ? 'Yes' : 'No'],
                            ].map(([k, v]) => (
                              <div key={k} className="rounded-lg border border-line bg-surface px-2.5 py-2">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-faint">{k}</p>
                                <p className="mt-0.5 text-[12px] font-medium text-ink">{v}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <PostForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null) }} initial={editing} site={site} />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Delete this post?"
        body={`${confirm?.name} (${confirm?.code}) and its ${(confirm?.orders || []).length} standing orders will be removed from the site.`}
        confirmLabel="Delete post"
        onConfirm={() => del.mutate(confirm.id)}
      />
    </div>
  )
}
