import React, { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ShieldAlert, Plus, Camera, X, Send, ImagePlus, Trash2, CheckCircle2, MapPin, Clock,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Drawer, Modal } from '@/components/ui/Modal'
import {
  Card, Badge, Button, Field, Input, Select, Textarea, EmptyState, Skeleton,
  SeverityDot, Avatar, Switch,
} from '@/components/ui/primitives'
import { EvidencePanel, ActionsPanel } from '@/features/IncidentPanels'
import { useMyDuty, useList, useForm, useLookups } from '@/lib/hooks'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { fmtDateTime, timeAgo, titleCase, cn } from '@/lib/utils'
import { NotLinked } from './OfficerDuty'

const TYPES = ['Unauthorised Access', 'Theft', 'Vandalism', 'Trespassing', 'Assault', 'Suspicious Activity', 'Fire Alarm', 'Medical Emergency', 'Equipment Failure', 'Perimeter Breach', 'Armed Robbery', 'Vehicle Incident', 'Alarm Activation', 'Policy Violation', 'Lost Property']
const SEVERITIES = ['low', 'medium', 'high', 'critical']

const MAX_PHOTO_KB = 4096

/* ------------------------- report with photos ------------------------- */
function ReportDrawer({ open, onClose, duty }) {
  const toast = useToast()
  const qc = useQueryClient()
  const { data: lk } = useLookups()
  const fileRef = useRef(null)
  const [photos, setPhotos] = useState([])
  const [saving, setSaving] = useState(false)

  const blank = {
    title: '', type: TYPES[5], severity: 'medium',
    siteId: duty?.site?.id || duty?.guard?.siteId || '',
    occurredAt: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
    description: '', visibleToClient: true,
  }
  const f = useForm(blank)

  useEffect(() => {
    if (!open) return
    f.reset({ ...blank })
    setPhotos([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, duty?.site?.id])

  const addFiles = (fileList) => {
    const next = []
    Array.from(fileList).forEach((file) => {
      if (!file.type.startsWith('image/')) {
        toast.warning('Only photos can be attached', { body: `${file.name} was skipped.` })
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        const sizeKb = Math.round(file.size / 1024)
        if (sizeKb > MAX_PHOTO_KB) {
          toast.warning('Photo too large', { body: `${file.name} is ${(sizeKb / 1024).toFixed(1)} MB. The limit is 4 MB.` })
          return
        }
        setPhotos((p) => [...p, { id: 'p' + Date.now() + Math.random(), name: file.name, url: reader.result, sizeKb }])
      }
      reader.readAsDataURL(file)
    })
    return next
  }

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const site = duty?.site?.id === f.values.siteId
        ? duty.site
        : (lk?.sites || []).find((s2) => s2.id === f.values.siteId) || null
      const created = await api.create('incidents', {
        ...f.values,
        clientId: site?.clientId || null,
        occurredAt: new Date(f.values.occurredAt).toISOString(),
        reportedAt: new Date().toISOString(),
        reportedBy: duty?.guard?.id || null,
        assignedTo: duty?.guard?.id || null,
        status: 'open',
        lossValue: 0,
        injuries: 0,
        policeRef: null,
        ref: `INC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 8999)}`,
        tags: [],
        timeline: [{
          at: new Date().toISOString(),
          actor: duty?.guard?.name || 'Officer',
          action: 'Reported',
          note: 'Filed from the officer mobile portal',
        }],
        evidence: [],
        actions: [],
      })

      for (const p of photos) {
        await api.addEvidence(created.id, {
          type: 'photo',
          name: p.name,
          mime: 'image/jpeg',
          sizeKb: p.sizeKb,
          url: p.url,
          source: 'Mobile app',
        })
      }

      toast.success('Incident filed', {
        body: photos.length ? `${photos.length} photo${photos.length === 1 ? '' : 's'} attached and hashed.` : 'Control room notified.',
      })
      qc.invalidateQueries({ queryKey: ['incidents'] })
      qc.invalidateQueries({ queryKey: ['my-duty'] })
      onClose()
    } catch (err) {
      f.applyServerError(err)
      if (!err.fields) toast.error('Could not file the report', { body: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Report an incident"
      subtitle="Goes straight to the control room with your name, time and location"
      width="max-w-xl"
      footer={
        <>
          <span className="mr-auto text-[12px] text-faint">
            {photos.length ? `${photos.length} photo${photos.length === 1 ? '' : 's'} attached` : 'No photos yet'}
          </span>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Send} loading={saving} onClick={submit}>File report</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4 p-5">
        <Field label="What happened?" required error={f.errors.title}>
          <Input {...f.bind('title')} placeholder="Short headline, for example: door found open at the rear entrance" autoFocus />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" required error={f.errors.type}>
            <Select {...f.bind('type')}>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select>
          </Field>
          <Field label="Severity" required error={f.errors.severity}>
            <Select {...f.bind('severity')}>{SEVERITIES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
          </Field>
        </div>

        <Field
          label="Site"
          required
          error={f.errors.siteId}
          hint={duty?.site ? 'Pre-filled from the site you are posted at today.' : 'Pick the site where it happened.'}
        >
          <Select {...f.bind('siteId')}>
            <option value="">Select a site…</option>
            {(lk?.sites || []).map((s2) => (
              <option key={s2.id} value={s2.id}>
                {s2.name}{s2.id === duty?.site?.id ? ' (your post today)' : ''}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="When did it happen?" required>
          <Input type="datetime-local" {...f.bind('occurredAt')} />
        </Field>

        <Field label="Full account" hint="What you saw, what you did, who else was involved.">
          <Textarea rows={5} {...f.bind('description')} placeholder="Describe it in your own words…" />
        </Field>

        {/* ------------------------- photo evidence ------------------------- */}
        <div>
          <p className="label">Photographs</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="sr-only"
            onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
          />

          {photos.length > 0 && (
            <div className="mb-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.map((p) => (
                <figure key={p.id} className="group relative overflow-hidden rounded-lg border border-line">
                  <img src={p.url} alt={p.name} className="aspect-square w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhotos((list) => list.filter((x) => x.id !== p.id))}
                    className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-md bg-black/60 text-white transition hover:bg-critical"
                    title="Remove"
                  >
                    <X size={12} />
                  </button>
                  <figcaption className="truncate bg-surface2 px-1.5 py-1 text-[10px] text-faint">
                    {(p.sizeKb / 1024).toFixed(1)} MB
                  </figcaption>
                </figure>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line bg-surface2/40 px-4 py-6 transition hover:border-accent/50 hover:bg-surface2"
          >
            <span className="grid h-10 w-10 place-items-center rounded-full border border-accent/25 bg-accent/10 text-accent">
              <Camera size={18} />
            </span>
            <span className="text-[12.5px] font-semibold text-ink">Take or attach a photo</span>
            <span className="text-[11px] text-faint">Opens the camera on a phone · up to 4 MB each</span>
          </button>
        </div>

        <div className="rounded-lg border border-line bg-surface2/50 p-3.5">
          <Switch
            checked={!!f.values.visibleToClient}
            onChange={(v) => f.set('visibleToClient', v)}
            label="Share with the client"
            hint="The client sees this report and its photographs in their portal."
          />
        </div>
      </form>
    </Drawer>
  )
}

/* ------------------------------- the page ------------------------------ */
export default function OfficerIncidents() {
  const { data: duty, isLoading: dutyLoading, error } = useMyDuty()
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState(null)

  const gid = duty?.guard?.id
  const query = useList(
    'incidents',
    { pageSize: 50, sort: 'occurredAt', dir: 'desc', filters: { reportedBy: gid } },
    { enabled: !!gid }
  )

  useEffect(() => {
    if (params.get('new') === '1') { setOpen(true); params.delete('new'); setParams(params, { replace: true }) }
  }, [params, setParams])

  const rows = query.data?.rows || []
  const live = detail ? rows.find((r) => r.id === detail.id) || detail : null

  if (error?.status === 403) return <NotLinked />

  return (
    <>
      <PageHeader
        title="My incident reports"
        subtitle="Everything you have filed, with the photographs you attached."
        actions={<Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>Report incident</Button>}
      />

      {dutyLoading || query.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={ShieldAlert}
            title="You have not filed any reports"
            body="Anything you report from your phone or here appears in this list."
            action={<Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>Report an incident</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-2.5">
          {rows.map((i) => (
            <button
              key={i.id}
              onClick={() => setDetail(i)}
              className="card flex w-full items-start gap-3 p-4 text-left transition hover:border-accent/40"
            >
              <SeverityDot level={i.severity} className="mt-1.5" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-[13px] font-semibold text-ink">{i.title}</p>
                  <span className="mono text-[11px] text-faint">{i.ref}</span>
                </div>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11.5px] text-faint">
                  <span className="flex items-center gap-1"><MapPin size={10} />{i._site?.name}</span>
                  <span className="flex items-center gap-1"><Clock size={10} />{timeAgo(i.occurredAt)}</span>
                  {i.visibleToClient && <span className="text-accent">shared with client</span>}
                </p>

                {i.evidence?.length > 0 && (
                  <div className="mt-2.5 flex gap-1.5">
                    {i.evidence.filter((e) => e.url).slice(0, 5).map((e) => (
                      <img key={e.id} src={e.url} alt="" className="h-12 w-12 rounded border border-line object-cover" loading="lazy" />
                    ))}
                    {i.evidence.length > 5 && (
                      <span className="mono grid h-12 w-12 place-items-center rounded border border-line bg-surface2 text-[11px] font-semibold text-muted">
                        +{i.evidence.length - 5}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="shrink-0 text-right">
                <Badge value={i.status} size="sm" dot />
                <p className="mt-1.5"><Badge value={i.severity} size="sm" /></p>
              </div>
            </button>
          ))}
        </div>
      )}

      <ReportDrawer open={open} onClose={() => setOpen(false)} duty={duty} />

      <Drawer
        open={!!live}
        onClose={() => setDetail(null)}
        title={live ? live.title : ''}
        subtitle={live ? `${live.ref} · ${live._site?.name}` : ''}
        badge={live && <Badge value={live.severity} size="sm" />}
        width="max-w-2xl"
        footer={<Button variant="ghost" onClick={() => setDetail(null)}>Close</Button>}
      >
        {live && (
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge value={live.status} dot />
              {live.visibleToClient && <Badge value="active" label="Shared with client" />}
            </div>

            <Card title="Your report">
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted">{live.description}</p>
              <p className="mt-3 border-t border-line pt-3 text-[11.5px] text-faint">
                Filed {fmtDateTime(live.reportedAt)} · occurred {fmtDateTime(live.occurredAt)}
              </p>
            </Card>

            <EvidencePanel incident={live} canEdit={false} />
            <ActionsPanel incident={live} canEdit={false} />

            <Card title="What happened next" subtitle={`${live.timeline.length} entries`}>
              <ol className="relative space-y-0 border-l border-line pl-5">
                {live.timeline.map((t, i) => (
                  <li key={i} className="relative pb-4 last:pb-0">
                    <span className={cn(
                      'absolute -left-[26px] top-0.5 h-4 w-4 rounded-full border-2 border-surface',
                      i === live.timeline.length - 1 ? 'bg-accent' : 'bg-line'
                    )} />
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <p className="text-[12.5px] font-semibold text-ink">{t.action}</p>
                      <p className="text-[11px] text-faint">{t.actor} · {fmtDateTime(t.at)}</p>
                    </div>
                    {t.note && <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{t.note}</p>}
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        )}
      </Drawer>
    </>
  )
}
