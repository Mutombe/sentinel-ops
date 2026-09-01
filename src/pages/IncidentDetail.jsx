import React, { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, MapPin, Building2, Clock, DollarSign, ShieldAlert, UserCheck, Send,
  FileDown, Trash2, Pencil, AlertTriangle, CheckCircle2, Circle, Siren, Printer, FileText,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, Badge, Button, Avatar, Skeleton, EmptyState, Textarea, Select, SeverityDot } from '@/components/ui/primitives'
import { ConfirmDialog } from '@/components/ui/Modal'
import { useOne, useList, useUpdate, useDelete, useLookups, qk } from '@/lib/hooks'
import { api } from '@/lib/api'
import { fmtDateTime, timeAgo, money, titleCase, cn, download, toCSV } from '@/lib/utils'
import { EvidencePanel, ActionsPanel } from '@/features/IncidentPanels'
import { useAuth } from '@/auth/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { store } from '@/lib/db'
import { incidentPdf } from '@/lib/pdf'

const FLOW = ['open', 'investigating', 'resolved', 'closed']

function StatusStepper({ status, onChange, disabled }) {
  const idx = FLOW.indexOf(status)
  return (
    <div className="flex items-center gap-1">
      {FLOW.map((s, i) => {
        const done = i < idx
        const active = i === idx
        return (
          <React.Fragment key={s}>
            {i > 0 && <span className={cn('h-px w-5', i <= idx ? 'bg-accent' : 'bg-line')} />}
            <button
              disabled={disabled}
              onClick={() => onChange(s)}
              title={`Set to ${titleCase(s)}`}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition',
                active ? 'border-accent bg-accent/12 text-accent'
                  : done ? 'border-ok/30 bg-ok/10 text-ok'
                  : 'border-line text-faint hover:border-faint/60 hover:text-muted',
                disabled && 'pointer-events-none opacity-60'
              )}
            >
              {done ? <CheckCircle2 size={11} /> : <Circle size={11} />}
              {titleCase(s)}
            </button>
          </React.Fragment>
        )
      })}
    </div>
  )
}

function MetaRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-2.5 py-2">
      <Icon size={14} className="mt-0.5 shrink-0 text-faint" />
      <span className="w-[92px] shrink-0 text-[12px] text-faint">{label}</span>
      <span className="min-w-0 flex-1 text-[12.5px] text-ink">{children}</span>
    </div>
  )
}

export default function IncidentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const { can, user } = useAuth()
  const { data: inc, isLoading, error } = useOne('incidents', id)
  const { data: lk } = useLookups()
  const update = useUpdate('incidents', { label: 'Incident' })
  const del = useDelete('incidents', { label: 'Incident', onSuccess: () => navigate('/incidents') })
  const [note, setNote] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)

  const related = useList(
    'incidents',
    { pageSize: 5, filters: { siteId: inc?.siteId }, sort: 'occurredAt', dir: 'desc' },
    { enabled: !!inc?.siteId }
  )

  const addNote = useMutation({
    mutationFn: (body) => api.addIncidentNote(id, body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: qk.one('incidents', id) })
      const prev = qc.getQueryData(qk.one('incidents', id))
      qc.setQueryData(qk.one('incidents', id), (o) =>
        o ? { ...o, timeline: [...o.timeline, { at: new Date().toISOString(), actor: user.name, ...body, __optimistic: true }] } : o
      )
      return { prev }
    },
    onError: (err, _v, ctx) => {
      qc.setQueryData(qk.one('incidents', id), ctx.prev)
      toast.error('Note not saved', { body: err.message })
    },
    onSuccess: () => { setNote(''); toast.success('Timeline updated') },
    onSettled: () => qc.invalidateQueries({ queryKey: ['incidents'] }),
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-96 lg:col-span-2" />
          <Skeleton className="h-96" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Incident unavailable"
        body={error.message}
        action={<Button variant="secondary" icon={ArrowLeft} onClick={() => navigate('/incidents')}>Back to incidents</Button>}
      />
    )
  }

  const setStatus = (status) => {
    const patch = { status }
    if (status === 'resolved' && !inc.resolvedAt) patch.resolvedAt = new Date().toISOString()
    if (status === 'open') patch.resolvedAt = null
    update.mutate({ id, patch })
    addNote.mutate({ action: `Status → ${titleCase(status)}`, note: 'Updated from the incident console' })
  }

  const downloadPdf = async () => {
    setPdfBusy(true)
    try {
      await incidentPdf(inc, { org: store.getSettings().orgName + ' (Pvt) Ltd' })
      toast.success('Incident report downloaded', { body: 'Saved to your downloads folder.' })
    } catch (e) {
      toast.error('Could not build the report', { body: e.message })
    } finally {
      setPdfBusy(false)
    }
  }

  const exportReport = () => {
    const rows = inc.timeline.map((t) => ({ at: t.at, actor: t.actor, action: t.action, note: t.note }))
    download(`${inc.ref}-timeline.csv`, toCSV(rows))
    toast.success('Incident report exported')
  }

  const slaMins = Math.round((new Date(inc.reportedAt) - new Date(inc.occurredAt)) / 60000)
  const slaBreach = slaMins > 30

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            <SeverityDot level={inc.severity} className="h-3 w-3" />
            {inc.type}
            <span className="mono text-[15px] font-semibold text-faint">{inc.ref}</span>
          </span>
        }
        subtitle={inc.title}
        actions={
          <>
            <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate('/incidents')}>Back</Button>
            <Button variant="secondary" icon={FileText} loading={pdfBusy} onClick={downloadPdf}>Report PDF</Button>
            <Button variant="secondary" icon={FileDown} onClick={exportReport}>Export</Button>
            <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print</Button>
            {can('incidents', 'delete') && (
              <Button variant="danger" icon={Trash2} onClick={() => setConfirm(true)}>Delete</Button>
            )}
          </>
        }
      >
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <StatusStepper status={inc.status} onChange={setStatus} disabled={!can('incidents', 'update')} />
          <Badge value={inc.severity} />
          {inc.visibleToClient ? <Badge value="active" label="Client-visible" /> : <Badge value="inactive" label="Internal only" />}
          {slaBreach && <Badge value="critical" label={`SLA breach · reported after ${slaMins}m`} />}
          {(inc.evidence || []).length > 0 && (
            <Badge value="info" tone="accent" label={`${inc.evidence.length} evidence item${inc.evidence.length === 1 ? '' : 's'}`} />
          )}
          {(inc.actions || []).filter((a) => a.status === 'open').length > 0 && (
            <Badge value="medium" label={`${inc.actions.filter((a) => a.status === 'open').length} action${inc.actions.filter((a) => a.status === 'open').length === 1 ? '' : 's'} open`} />
          )}
          {update.isPending && <span className="text-[11.5px] text-faint">saving…</span>}
        </div>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ------------------------------ main ------------------------------ */}
        <div className="space-y-4 lg:col-span-2">
          <Card title="Report">
            <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-muted">{inc.description}</p>
            {inc.tags?.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {inc.tags.map((tg) => (
                  <span key={tg} className="chip border-line bg-surface2 text-muted">{tg}</span>
                ))}
              </div>
            )}
          </Card>

          <Card title="Investigation timeline" subtitle={`${inc.timeline.length} entries`}>
            <ol className="relative space-y-0 border-l border-line pl-5">
              {inc.timeline.map((t, i) => (
                <li key={i} className={cn('relative pb-5 last:pb-0', t.__optimistic && 'opacity-60')}>
                  <span className={cn(
                    'absolute -left-[26px] top-0.5 grid h-4 w-4 place-items-center rounded-full border-2 border-surface',
                    i === inc.timeline.length - 1 ? 'bg-accent' : 'bg-line'
                  )} />
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <p className="text-[13px] font-semibold text-ink">{t.action}</p>
                    <p className="text-[11.5px] text-faint">{t.actor} · {fmtDateTime(t.at)}</p>
                  </div>
                  {t.note && <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{t.note}</p>}
                </li>
              ))}
            </ol>

            {can('incidents', 'update') && (
              <form
                className="mt-4 border-t border-line pt-4"
                onSubmit={(e) => { e.preventDefault(); if (note.trim()) addNote.mutate({ action: 'Note added', note: note.trim() }) }}
              >
                <div className="flex items-start gap-2.5">
                  <Avatar name={user.name} size={30} />
                  <div className="min-w-0 flex-1">
                    <Textarea
                      rows={2}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Add an investigation note, action taken or evidence reference…"
                    />
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-[11px] text-faint">Notes are permanent and appear in the audit trail.</p>
                      <Button type="submit" size="sm" variant="primary" icon={Send} loading={addNote.isPending} disabled={!note.trim()}>
                        Post
                      </Button>
                    </div>
                  </div>
                </div>
              </form>
            )}
          </Card>

          <EvidencePanel incident={inc} canEdit={can('incidents', 'update')} />

          <ActionsPanel incident={inc} canEdit={can('incidents', 'update')} />

          <Card title="Other incidents at this site" subtitle={inc._site?.name} noPad>
            {related.isLoading ? (
              <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
            ) : (related.data?.rows || []).filter((r) => r.id !== inc.id).length === 0 ? (
              <EmptyState icon={CheckCircle2} title="No other incidents" body="This site has a clean record in the current window." />
            ) : (
              <ul className="divide-y divide-line/60">
                {related.data.rows.filter((r) => r.id !== inc.id).map((r) => (
                  <li key={r.id}>
                    <Link to={`/incidents/${r.id}`} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-surface2/60">
                      <SeverityDot level={r.severity} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium text-ink">{r.type}</p>
                        <p className="mono truncate text-[11px] text-faint">{r.ref}</p>
                      </div>
                      <Badge value={r.status} size="sm" />
                      <span className="w-16 shrink-0 text-right text-[11px] text-faint">{timeAgo(r.occurredAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* ------------------------------ side ------------------------------ */}
        <div className="space-y-4">
          <Card title="Details">
            <div className="divide-y divide-line/50">
              <MetaRow icon={MapPin} label="Site">
                <Link to={`/sites/${inc.siteId}`} className="font-medium text-accent hover:underline">{inc._site?.name || ''}</Link>
              </MetaRow>
              <MetaRow icon={Building2} label="Client">
                <Link to={`/clients/${inc.clientId}`} className="font-medium text-accent hover:underline">{inc._client?.name || ''}</Link>
              </MetaRow>
              <MetaRow icon={Clock} label="Occurred">{fmtDateTime(inc.occurredAt)}</MetaRow>
              <MetaRow icon={Clock} label="Reported">{fmtDateTime(inc.reportedAt)}</MetaRow>
              {inc.resolvedAt && <MetaRow icon={CheckCircle2} label="Resolved">{fmtDateTime(inc.resolvedAt)}</MetaRow>}
              <MetaRow icon={DollarSign} label="Loss value">
                {inc.lossValue ? <span className="mono font-semibold text-warn">{money(inc.lossValue)}</span> : 'None recorded'}
              </MetaRow>
              <MetaRow icon={Siren} label="Police ref">
                {inc.policeRef ? <span className="mono">{inc.policeRef}</span> : 'Not reported'}
              </MetaRow>
              <MetaRow icon={AlertTriangle} label="Injuries">{inc.injuries || 'None'}</MetaRow>
            </div>
          </Card>

          <Card title="People">
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-[11.5px] font-semibold text-faint">Reported by</p>
                {inc._reporter ? (
                  <Link to={`/guards/${inc.reportedBy}`} className="flex items-center gap-2.5 rounded-lg border border-line bg-surface2/50 p-2.5 transition hover:border-faint/50">
                    <Avatar name={inc._reporter.name} size={30} />
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-semibold text-ink">{inc._reporter.name}</p>
                      <p className="truncate text-[11px] text-faint">{inc._reporter.rank}</p>
                    </div>
                  </Link>
                ) : <p className="text-[12.5px] text-faint">Unknown</p>}
              </div>

              <div>
                <p className="mb-1.5 text-[11.5px] font-semibold text-faint">Assigned to</p>
                {can('incidents', 'update') ? (
                  <Select
                    value={inc.assignedTo || ''}
                    onChange={(e) => update.mutate({ id, patch: { assignedTo: e.target.value || null } })}
                  >
                    <option value="">Unassigned</option>
                    {lk?.guards.filter((g) => g.status === 'active').map((g) => (
                      <option key={g.id} value={g.id}>{g.name} ({g.rank})</option>
                    ))}
                  </Select>
                ) : (
                  <p className="text-[12.5px] text-ink">{inc._assignee?.name || 'Unassigned'}</p>
                )}
              </div>
            </div>
          </Card>

          <Card title="Client visibility">
            <p className="text-[12.5px] leading-relaxed text-muted">
              {inc.visibleToClient
                ? 'This report is published to the client portal. The client can read the description, status and resolution notes.'
                : 'This report is internal. It will not appear in the client portal.'}
            </p>
            {can('incidents', 'update') && (
              <Button
                className="mt-3 w-full"
                variant="secondary"
                icon={UserCheck}
                onClick={() => update.mutate({ id, patch: { visibleToClient: !inc.visibleToClient } })}
              >
                {inc.visibleToClient ? 'Make internal only' : 'Publish to client'}
              </Button>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Delete this incident report?"
        body={`${inc.ref} and its ${inc.timeline.length}-entry timeline will be permanently removed.`}
        confirmLabel="Delete report"
        requireText={inc.ref}
        onConfirm={() => del.mutate(id)}
      />
    </>
  )
}
