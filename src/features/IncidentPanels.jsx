import React, { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Image as ImageIcon, Video, FileAudio, FileText, Plus, Trash2,
  ShieldCheck, ListChecks, CheckCircle2, Clock, Camera, X,
  ChevronLeft, ChevronRight, Download, Maximize2,
} from 'lucide-react'
import { Card, Badge, Button, Field, Input, Select, Textarea, EmptyState } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { api } from '@/lib/api'
import { qk } from '@/lib/hooks'
import { fmtDate, fmtDateTime, timeAgo, titleCase, cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'

const KIND = {
  photo: { icon: ImageIcon, tone: 'accent', label: 'Photo' },
  video: { icon: Video, tone: 'accent2', label: 'Video' },
  audio: { icon: FileAudio, tone: 'warn', label: 'Audio' },
  document: { icon: FileText, tone: 'muted', label: 'Document' },
}

const fmtSize = (kb) => (kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`)

/* ------------------------------ lightbox ------------------------------ */
function Lightbox({ items, index, onClose, onIndex }) {
  useEffect(() => {
    if (index == null) return
    const h = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onIndex((index + 1) % items.length)
      if (e.key === 'ArrowLeft') onIndex((index - 1 + items.length) % items.length)
    }
    window.addEventListener('keydown', h)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', h)
      document.body.style.overflow = prev
    }
  }, [index, items.length, onClose, onIndex])

  if (index == null) return null
  const item = items[index]
  if (!item) return null

  return (
    <div className="fixed inset-0 z-[170] flex flex-col bg-black/92 animate-in">
      <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="mono truncate text-[12.5px] font-semibold text-white">{item.name}</p>
          <p className="truncate text-[11px] text-white/50">
            {item.source} · captured by {item.capturedBy} · {fmtDateTime(item.capturedAt)}
            {item.sizeKb ? ` · ${fmtSize(item.sizeKb)}` : ''}
          </p>
        </div>
        <span className="mono shrink-0 rounded-md bg-white/10 px-2 py-1 text-[11.5px] font-semibold text-white/80">
          {index + 1} / {items.length}
        </span>
        {item.url && (
          <a
            href={item.url}
            download={item.name}
            className="btn btn-sm border border-white/15 text-white hover:bg-white/10"
            title="Download original"
          >
            <Download size={14} />
          </a>
        )}
        <button onClick={onClose} className="rounded-lg p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white">
          <X size={18} />
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
        {items.length > 1 && (
          <button
            onClick={() => onIndex((index - 1 + items.length) % items.length)}
            className="absolute left-3 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            aria-label="Previous"
          >
            <ChevronLeft size={20} />
          </button>
        )}

        {item.url ? (
          <img src={item.url} alt={item.name} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
        ) : (
          <div className="grid h-56 w-full max-w-md place-items-center rounded-xl border border-white/15 text-center">
            <div>
              {React.createElement(KIND[item.type]?.icon || FileText, { size: 34, className: 'mx-auto text-white/60' })}
              <p className="mt-2 text-[12px] text-white/50">No preview available for this item</p>
            </div>
          </div>
        )}

        {items.length > 1 && (
          <button
            onClick={() => onIndex((index + 1) % items.length)}
            className="absolute right-3 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            aria-label="Next"
          >
            <ChevronRight size={20} />
          </button>
        )}
      </div>

      <footer className="shrink-0 border-t border-white/10 px-4 py-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          {items.map((it, i) => (
            <button
              key={it.id}
              onClick={() => onIndex(i)}
              className={cn(
                'h-12 w-16 shrink-0 overflow-hidden rounded border-2 transition',
                i === index ? 'border-accent' : 'border-transparent opacity-55 hover:opacity-100'
              )}
            >
              {it.url ? (
                <img src={it.url} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <span className="grid h-full w-full place-items-center bg-white/10 text-white/60">
                  {React.createElement(KIND[it.type]?.icon || FileText, { size: 14 })}
                </span>
              )}
            </button>
          ))}
        </div>
        <p className="mono mt-2 text-[10.5px] text-white/35">Integrity hash {item.hash}</p>
      </footer>
    </div>
  )
}

/* ----------------------------- evidence ------------------------------ */
export function EvidencePanel({ incident, canEdit }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [addOpen, setAddOpen] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [form, setForm] = useState({ type: 'photo', name: '', source: 'Mobile app' })

  const key = qk.one('incidents', incident.id)

  const add = useMutation({
    mutationFn: (file) => api.addEvidence(incident.id, file),
    onMutate: async (file) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData(key)
      qc.setQueryData(key, (o) => o ? {
        ...o,
        evidence: [...(o.evidence || []), { ...file, id: '__tmp', capturedAt: new Date().toISOString(), capturedBy: 'You', __optimistic: true }],
      } : o)
      return { prev }
    },
    onError: (err, _v, ctx) => { qc.setQueryData(key, ctx.prev); toast.error('Evidence not attached', { body: err.message }) },
    onSuccess: () => { toast.success('Evidence attached'); setAddOpen(false) },
    onSettled: () => qc.invalidateQueries({ queryKey: ['incidents'] }),
  })

  const remove = useMutation({
    mutationFn: (id) => api.removeEvidence(incident.id, id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData(key)
      qc.setQueryData(key, (o) => (o ? { ...o, evidence: (o.evidence || []).filter((e) => e.id !== id) } : o))
      return { prev }
    },
    onError: (err, _v, ctx) => { qc.setQueryData(key, ctx.prev); toast.error('Could not remove', { body: err.message }) },
    onSettled: () => qc.invalidateQueries({ queryKey: ['incidents'] }),
  })

  const evidence = incident.evidence || []
  const photos = evidence.filter((e) => e.type === 'photo' || e.type === 'video')
  const files = evidence.filter((e) => e.type !== 'photo' && e.type !== 'video')
  const counts = Object.keys(KIND)
    .map((k) => ({ k, n: evidence.filter((e) => e.type === k).length }))
    .filter((x) => x.n)

  return (
    <>
      <Card
        title="Evidence"
        subtitle={evidence.length ? `${evidence.length} item${evidence.length === 1 ? '' : 's'} · chain of custody preserved` : 'Nothing attached yet'}
        actions={canEdit && (
          <Button size="sm" variant="secondary" icon={Plus} onClick={() => { setForm({ type: 'photo', name: '', source: 'Mobile app' }); setAddOpen(true) }}>
            Attach
          </Button>
        )}
        noPad
      >
        {evidence.length === 0 ? (
          <EmptyState
            icon={Camera}
            title="No evidence attached"
            body="Photos, body-cam clips, statements and CCTV exports attached here are hashed and timestamped."
          />
        ) : (
          <>
            <div className="flex flex-wrap gap-2 border-b border-line px-4 py-2.5">
              {counts.map(({ k, n }) => {
                const K = KIND[k]
                return (
                  <span key={k} className={cn('chip', `border-${K.tone}/25 bg-${K.tone}/10 text-${K.tone}`)}>
                    <K.icon size={11} /> {n} {K.label.toLowerCase()}{n === 1 ? '' : 's'}
                  </span>
                )
              })}
            </div>

            {photos.length > 0 && (
              <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 lg:grid-cols-4">
                {photos.map((e, i) => (
                  <figure key={e.id} className={cn('group relative overflow-hidden rounded-lg border border-line bg-surface2', e.__optimistic && 'opacity-60')}>
                    <button
                      onClick={() => setLightbox(i)}
                      className="block aspect-[4/3] w-full"
                      title={e.name}
                    >
                      {e.url ? (
                        <img
                          src={e.url}
                          alt={e.name}
                          loading="lazy"
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
                        />
                      ) : (
                        <span className="grid h-full w-full place-items-center text-faint">
                          {React.createElement(KIND[e.type]?.icon || ImageIcon, { size: 22 })}
                        </span>
                      )}
                      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
                      <span className="pointer-events-none absolute bottom-1.5 left-2 right-2 truncate text-left text-[10.5px] font-medium text-white opacity-0 transition group-hover:opacity-100">
                        {timeAgo(e.capturedAt)} · {e.source}
                      </span>
                      <span className="pointer-events-none absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-md bg-black/55 text-white opacity-0 transition group-hover:opacity-100">
                        <Maximize2 size={12} />
                      </span>
                    </button>
                    {canEdit && (
                      <button
                        onClick={() => remove.mutate(e.id)}
                        className="absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-md bg-black/55 text-white opacity-0 transition hover:bg-critical group-hover:opacity-100"
                        title="Remove"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </figure>
                ))}
              </div>
            )}

            {files.length > 0 && (
              <ul className={cn('divide-y divide-line/60', photos.length > 0 && 'border-t border-line')}>
                {files.map((e) => {
                  const K = KIND[e.type] || KIND.document
                  const idx = photos.length + files.indexOf(e)
                  return (
                    <li key={e.id} className={cn('flex items-center gap-3 px-4 py-2.5', e.__optimistic && 'opacity-60')}>
                      <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg border', `border-${K.tone}/25 bg-${K.tone}/10 text-${K.tone}`)}>
                        <K.icon size={15} />
                      </span>
                      <button onClick={() => setLightbox(idx)} className="min-w-0 flex-1 text-left">
                        <p className="truncate text-[12.5px] font-medium text-ink">{e.name}</p>
                        <p className="truncate text-[11px] text-faint">
                          {e.source} · {e.capturedBy} · {timeAgo(e.capturedAt)}{e.sizeKb ? ` · ${fmtSize(e.sizeKb)}` : ''}
                        </p>
                      </button>
                      {canEdit && (
                        <button className="btn btn-ghost h-7 w-7 shrink-0 px-0 text-critical" onClick={() => remove.mutate(e.id)} title="Remove">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </Card>

      <Lightbox
        items={[...photos, ...files]}
        index={lightbox}
        onClose={() => setLightbox(null)}
        onIndex={setLightbox}
      />

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        size="sm"
        title="Attach evidence"
        subtitle="Records the item against the incident with a hash and timestamp"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={add.isPending}
              disabled={!form.name.trim()}
              onClick={() => add.mutate({
                type: form.type,
                name: form.name.trim(),
                source: form.source,
                mime: { photo: 'image/jpeg', video: 'video/mp4', audio: 'audio/mpeg', document: 'application/pdf' }[form.type],
                sizeKb: form.type === 'video' ? 18400 : form.type === 'audio' ? 2200 : 860,
              })}
            >
              Attach
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Evidence type">
            <Select value={form.type} onChange={(e) => setForm((s) => ({ ...s, type: e.target.value }))}>
              {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </Field>
          <Field label="File name" hint="In production this is a real upload from the mobile app or a CCTV export.">
            <Input
              value={form.name}
              onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
              placeholder="e.g. point-of-entry.jpg"
              autoFocus
            />
          </Field>
          <Field label="Source">
            <Select value={form.source} onChange={(e) => setForm((s) => ({ ...s, source: e.target.value }))}>
              {['Mobile app', 'Body camera', 'CCTV export', 'Control room', 'Client supplied'].map((x) => <option key={x}>{x}</option>)}
            </Select>
          </Field>
        </div>
      </Modal>
    </>
  )
}

/* ------------------------- corrective actions ------------------------- */
export function ActionsPanel({ incident, canEdit }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ description: '', owner: 'Site Supervisor', priority: 'normal', dueAt: '' })

  const key = qk.one('incidents', incident.id)
  const actions = incident.actions || []
  const open = actions.filter((a) => a.status === 'open')
  const overdue = open.filter((a) => new Date(a.dueAt) < Date.now())

  const patchOne = (fn) => {
    const prev = qc.getQueryData(key)
    qc.setQueryData(key, (o) => (o ? { ...o, actions: fn(o.actions || []) } : o))
    return prev
  }

  const toggle = useMutation({
    mutationFn: ({ id, status }) => api.setActionStatus(incident.id, id, status),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = patchOne((list) => list.map((a) => (a.id === id ? { ...a, status } : a)))
      return { prev }
    },
    onError: (err, _v, ctx) => { qc.setQueryData(key, ctx.prev); toast.error('Action not updated', { body: err.message }) },
    onSettled: () => qc.invalidateQueries({ queryKey: ['incidents'] }),
  })

  const add = useMutation({
    mutationFn: (body) => api.addCorrectiveAction(incident.id, body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = patchOne((list) => [...list, { ...body, id: '__tmp', status: 'open', createdAt: new Date().toISOString(), __optimistic: true }])
      return { prev }
    },
    onError: (err, _v, ctx) => { qc.setQueryData(key, ctx.prev); toast.error('Could not add action', { body: err.message }) },
    onSuccess: () => { toast.success('Corrective action added'); setAddOpen(false) },
    onSettled: () => qc.invalidateQueries({ queryKey: ['incidents'] }),
  })

  return (
    <>
      <Card
        title="Corrective actions"
        subtitle={actions.length
          ? `${open.length} of ${actions.length} open${overdue.length ? ` · ${overdue.length} overdue` : ''}`
          : 'Nothing raised yet'}
        actions={canEdit && (
          <Button
            size="sm" variant="secondary" icon={Plus}
            onClick={() => {
              setForm({ description: '', owner: 'Site Supervisor', priority: 'normal', dueAt: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) })
              setAddOpen(true)
            }}
          >
            Add action
          </Button>
        )}
        noPad
      >
        {actions.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="No corrective actions"
            body="Record what will stop this happening again, with an owner and a date."
          />
        ) : (
          <ul className="divide-y divide-line/60">
            {actions.map((a) => {
              const late = a.status === 'open' && new Date(a.dueAt) < Date.now()
              return (
                <li key={a.id} className={cn('flex items-start gap-3 px-4 py-3', a.__optimistic && 'opacity-60')}>
                  {canEdit ? (
                    <button
                      onClick={() => toggle.mutate({ id: a.id, status: a.status === 'done' ? 'open' : 'done' })}
                      className={cn(
                        'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border transition',
                        a.status === 'done' ? 'border-ok bg-ok text-bg' : 'border-line hover:border-faint'
                      )}
                      title={a.status === 'done' ? 'Reopen' : 'Mark complete'}
                    >
                      {a.status === 'done' && <CheckCircle2 size={12} />}
                    </button>
                  ) : (
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', a.status === 'done' ? 'bg-ok' : late ? 'bg-critical' : 'bg-warn')} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-[12.5px] leading-relaxed', a.status === 'done' ? 'text-faint line-through' : 'text-ink')}>
                      {a.description}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2.5 text-[11px] text-faint">
                      <span>{a.owner}</span>
                      <span className="flex items-center gap-1"><Clock size={9} />due {fmtDate(a.dueAt)}</span>
                      {late && <span className="font-semibold text-critical">overdue</span>}
                      {a.completedAt && <span className="text-ok">completed {fmtDate(a.completedAt)}</span>}
                    </p>
                  </div>
                  <Badge value={a.priority === 'urgent' ? 'critical' : a.priority === 'high' ? 'high' : 'low'} label={titleCase(a.priority)} size="sm" />
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        size="md"
        title="Add a corrective action"
        subtitle="What will prevent a recurrence, who owns it, and by when"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={add.isPending} disabled={!form.description.trim()} onClick={() => add.mutate(form)}>
              Add action
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Action" required>
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
              placeholder="e.g. Increase patrol frequency on the east perimeter to twice hourly for 14 days."
              autoFocus
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Owner">
              <Select value={form.owner} onChange={(e) => setForm((s) => ({ ...s, owner: e.target.value }))}>
                {['Site Supervisor', 'Area Manager', 'Operations Manager', 'Client Facilities', 'Training Officer'].map((o) => <option key={o}>{o}</option>)}
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={form.priority} onChange={(e) => setForm((s) => ({ ...s, priority: e.target.value }))}>
                {['normal', 'high', 'urgent'].map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
              </Select>
            </Field>
            <Field label="Due date">
              <Input type="date" value={form.dueAt} onChange={(e) => setForm((s) => ({ ...s, dueAt: e.target.value }))} />
            </Field>
          </div>
        </div>
      </Modal>
    </>
  )
}

export { KIND as EVIDENCE_KINDS }
