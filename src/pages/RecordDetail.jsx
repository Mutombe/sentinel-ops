import React, { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, AlertTriangle, Trash2, FileDown, Printer, ChevronRight, Send, FileText,
  CheckCircle2, XCircle, MinusCircle, MessageSquare, Clock, ListChecks, ScrollText,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import {
  Card, Badge, Button, Avatar, Skeleton, EmptyState, Select, Textarea, Field,
  Progress, SeverityDot,
} from '@/components/ui/primitives'
import { ConfirmDialog } from '@/components/ui/Modal'
import { EvidencePanel, ActionsPanel } from '@/features/IncidentPanels'
import { useOne, useList, useUpdate, useDelete } from '@/lib/hooks'
import { api } from '@/lib/api'
import { metaFor, hrefFor, FMT } from '@/lib/records'
import { useAuth } from '@/auth/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { fmtDate, fmtDateTime, timeAgo, money2, titleCase, duration, cn, download, toCSV, num } from '@/lib/utils'
import { store } from '@/lib/db'
import { disciplinePdf, certificatePdf, invoicePdf, inspectionPdf } from '@/lib/pdf'

/* Which records are worth handing to somebody on paper, and which builder
   produces them. A commendation prints as a letter, everything else on the
   discipline ladder prints as a formal notice with appeal rights. */
const PDF_DOCS = {
  discipline: (r, org) => ({
    label: r.type === 'commendation' ? 'Commendation PDF' : 'Notice PDF',
    run: () => disciplinePdf(r, { guard: r._guard, org }),
  }),
  training: (r, org) =>
    r.completedAt ? { label: 'Record PDF', run: () => certificatePdf(r, { guard: r._guard, org }) } : null,
  invoices: (r, org, currency) => ({ label: 'Invoice PDF', run: () => invoicePdf(r, { client: r._client, org, currency }) }),
  inspections: (r, org) => ({ label: 'Report PDF', run: () => inspectionPdf(r, { org, guardName: r._guard?.name }) }),
}

/* ------------------------------------------------------------------ *
 * Resource specific bodies.
 * The generic page handles the header, the facts grid and the links.
 * These add what only that record type has.
 * ------------------------------------------------------------------ */
const BODIES = {
  patrols: (r) => (
    <Card title="Checkpoint scan log" subtitle={`${r.checkpointsScanned} of ${r.checkpointsTotal} scanned`} noPad>
      <ul className="divide-y divide-line/60">
        {Array.from({ length: r.checkpointsTotal }).map((_, i) => {
          const done = i < r.checkpointsScanned
          const at = new Date(new Date(r.startedAt).getTime() + i * 4.5 * 60000)
          return (
            <li key={i} className="flex items-center gap-3 px-4 py-2.5">
              <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full', done ? 'bg-ok/12 text-ok' : 'bg-critical/10 text-critical')}>
                {done ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
              </span>
              <span className="flex-1 text-[12.5px] text-ink">Checkpoint {String(i + 1).padStart(2, '0')}</span>
              <span className="mono text-[11.5px] text-faint">
                {done ? at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'Missed'}
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  ),

  inspections: (r) => (
    <>
      {(r.sections || []).map((sec) => {
        const scored = sec.items.filter((i) => i.result !== 'na')
        const pct = scored.length ? Math.round((scored.filter((i) => i.result === 'pass').length / scored.length) * 100) : 100
        return (
          <Card
            key={sec.name}
            title={sec.name}
            actions={<span className={cn('mono rounded-md px-2 py-1 text-[12px] font-bold', pct >= 90 ? 'bg-ok/10 text-ok' : pct >= 75 ? 'bg-warn/10 text-warn' : 'bg-critical/10 text-critical')}>{pct}%</span>}
            noPad
          >
            <ul className="divide-y divide-line/60">
              {sec.items.map((it) => (
                <li key={it.q} className="flex items-start gap-3 px-4 py-2.5">
                  <span className={cn('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full',
                    it.result === 'pass' ? 'bg-ok/12 text-ok' : it.result === 'fail' ? 'bg-critical/12 text-critical' : 'bg-surface2 text-faint')}>
                    {it.result === 'pass' ? <CheckCircle2 size={12} /> : it.result === 'fail' ? <XCircle size={12} /> : <MinusCircle size={12} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-[12.5px]', it.result === 'fail' ? 'font-medium text-ink' : 'text-muted')}>{it.q}</p>
                    {it.note && <p className="mt-0.5 text-[11.5px] leading-relaxed text-critical">{it.note}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )
      })}
      {r.actionsRequired?.length > 0 && (
        <Card title="Corrective actions" subtitle={`${r.actionsRequired.filter((a) => a.status === 'open').length} still open`} noPad>
          <ul className="divide-y divide-line/60">
            {r.actionsRequired.map((a) => (
              <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', a.status === 'done' ? 'bg-ok' : 'bg-warn')} />
                <div className="min-w-0 flex-1">
                  <p className={cn('text-[12.5px]', a.status === 'done' ? 'text-faint line-through' : 'text-ink')}>{a.description}</p>
                  <p className="mt-0.5 text-[11px] text-faint">{a.owner} · due {fmtDate(a.dueAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  ),

  invoices: (r) => (
    <Card title="Line items" subtitle={`${r.lineItems?.length || 0} lines`} noPad>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-surface2/60">
            <tr>
              <th className="th">Description</th>
              <th className="th text-right">Qty</th>
              <th className="th text-right">Rate</th>
              <th className="th text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(r.lineItems || []).map((li) => (
              <tr key={li.id} className="border-t border-line/70">
                <td className="td text-[12.5px] text-ink">{li.description}</td>
                <td className="td mono text-right text-[12.5px] text-muted">{num(li.qty)} {li.unit}</td>
                <td className="td mono text-right text-[12.5px] text-muted">{money2(li.rate)}</td>
                <td className="td mono text-right text-[12.5px] font-semibold text-ink">{money2(li.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end border-t border-line px-4 py-3">
        <div className="w-56 space-y-1.5 text-[13px]">
          <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="mono text-ink">{money2(r.subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-muted">VAT at 15%</span><span className="mono text-ink">{money2(r.tax)}</span></div>
          <div className="flex justify-between border-t border-line pt-2 text-[15px]">
            <span className="font-bold text-ink">Total due</span>
            <span className="mono font-bold text-accent">{money2(r.total)}</span>
          </div>
        </div>
      </div>
    </Card>
  ),

  posts: (r) => (
    <Card title="Post orders" subtitle={`${(r.orders || []).length} standing orders`}>
      {(r.orders || []).length === 0 ? (
        <EmptyState icon={ScrollText} title="No standing orders" body="Nothing has been published for this post." />
      ) : (
        <ol className="space-y-2">
          {r.orders.map((o, i) => (
            <li key={i} className="flex gap-2.5 text-[12.5px] leading-relaxed text-muted">
              <span className="mono mt-px shrink-0 text-[11px] font-bold text-accent">{String(i + 1).padStart(2, '0')}</span>
              {o}
            </li>
          ))}
        </ol>
      )}
    </Card>
  ),

  audit: (r) => (
    r.meta ? (
      <Card title="Change payload">
        <pre className="mono max-h-80 overflow-auto rounded-lg border border-line bg-bg p-3 text-[11.5px] leading-relaxed text-muted">
          {JSON.stringify(r.meta, null, 2)}
        </pre>
      </Card>
    ) : null
  ),
}

/* ------------------------- request conversation ----------------------- */
function RequestThreadCard({ record }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { user, can } = useAuth()
  const [body, setBody] = useState('')

  const comment = useMutation({
    mutationFn: (text) => api.addRequestComment(record.id, text),
    onSuccess: () => { setBody(''); qc.invalidateQueries({ queryKey: ['requests'] }) },
    onError: (err) => toast.error('Message not sent', { body: err.message }),
  })

  return (
    <Card title="Conversation" subtitle={`${record.comments?.length || 0} messages`}>
      {(record.comments || []).length === 0 ? (
        <EmptyState icon={MessageSquare} title="No messages yet" body="Start the conversation below." />
      ) : (
        <ul className="space-y-3">
          {record.comments.map((c) => (
            <li key={c.id} className="flex gap-2.5">
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
      {can('requests', 'update') && (
        <form
          className="mt-4 border-t border-line pt-4"
          onSubmit={(e) => { e.preventDefault(); if (body.trim()) comment.mutate(body.trim()) }}
        >
          <div className="flex items-start gap-2.5">
            <Avatar name={user.name} size={28} />
            <div className="min-w-0 flex-1">
              <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a reply" />
              <div className="mt-2 flex justify-end">
                <Button type="submit" size="sm" variant="primary" icon={Send} loading={comment.isPending} disabled={!body.trim()}>Send</Button>
              </div>
            </div>
          </div>
        </form>
      )}
    </Card>
  )
}

/* --------------------------- related records -------------------------- */
function RelatedList({ resource, record }) {
  const gid = record.guardId
  const enabled = !!gid && ['attendance', 'leave', 'discipline', 'training', 'documents', 'patrols'].includes(resource)
  const q = useList(
    resource,
    { pageSize: 6, filters: { guardId: gid }, sort: 'id', dir: 'desc' },
    { enabled }
  )
  if (!enabled) return null
  const rows = (q.data?.rows || []).filter((r) => r.id !== record.id)
  if (!rows.length) return null
  const meta = metaFor(resource)
  return (
    <Card title={`Other ${meta.plural.toLowerCase()} for this officer`} noPad>
      <ul className="divide-y divide-line/60">
        {rows.map((r) => (
          <li key={r.id}>
            <Link to={hrefFor(resource, r.id)} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-surface2/60">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-medium text-ink">{meta.title(r)}</p>
                {meta.subtitle && <p className="truncate text-[11px] text-faint">{meta.subtitle(r)}</p>}
              </div>
              {r.status && <Badge value={r.status} size="sm" dot />}
              <ChevronRight size={13} className="shrink-0 text-faint" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/* ------------------------------- the page ----------------------------- */
export default function RecordDetail() {
  const { resource, id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { can } = useAuth()
  const [confirm, setConfirm] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)

  const meta = metaFor(resource)
  const { data: record, isLoading, error } = useOne(resource, id, { enabled: !!meta })
  const update = useUpdate(resource, { label: meta?.label })
  const del = useDelete(resource, { label: meta?.label, onSuccess: () => navigate(meta?.listPath || '/dashboard') })

  if (!meta) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Unknown record type"
        body={`There is no detail view registered for "${resource}".`}
        action={<Button variant="secondary" icon={ArrowLeft} onClick={() => navigate('/dashboard')}>Back to the dashboard</Button>}
      />
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-80 lg:col-span-2" /><Skeleton className="h-80" /></div>
      </div>
    )
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title={`${meta.label} unavailable`}
        body={error.message}
        action={<Button variant="secondary" icon={ArrowLeft} onClick={() => navigate(meta.listPath)}>Back</Button>}
      />
    )
  }

  const facts = (meta.facts || [])
    .map(([key, label, fmt]) => [label, FMT[fmt || 'text'](record[key])])
    .filter(([, v]) => v !== '' && v != null)

  const related = meta.related ? meta.related(record) : []
  const Body = BODIES[resource]
  const canEdit = can(resource, 'update')

  const exportCsv = () => {
    const flat = {}
    Object.entries(record).forEach(([k, v]) => {
      if (k.startsWith('_') || Array.isArray(v) || (v && typeof v === 'object')) return
      flat[k] = v
    })
    download(`${resource}-${id}.csv`, toCSV([flat]))
    toast.success('Record exported')
  }

  const settings = store.getSettings()
  const pdfDoc = PDF_DOCS[resource]?.(record, settings.orgName + ' (Pvt) Ltd', settings.currency)
  const downloadPdf = async () => {
    setPdfBusy(true)
    try {
      await pdfDoc.run()
      toast.success('Document downloaded', { body: 'Saved to your downloads folder.' })
    } catch (e) {
      toast.error('Could not build the document', { body: e.message })
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title={meta.title(record)}
        subtitle={meta.subtitle ? meta.subtitle(record) : meta.label}
        actions={
          <>
            <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate(meta.listPath)}>Back</Button>
            {pdfDoc && (
              <Button variant="secondary" icon={FileText} loading={pdfBusy} onClick={downloadPdf}>{pdfDoc.label}</Button>
            )}
            <Button variant="secondary" icon={FileDown} onClick={exportCsv}>Export</Button>
            <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print</Button>
            {can(resource, 'delete') && <Button variant="danger" icon={Trash2} onClick={() => setConfirm(true)}>Delete</Button>}
          </>
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(meta.badges ? meta.badges(record) : []).filter(Boolean).map((b, i) => (
            <Badge key={i} value={b.value} label={b.label} tone={b.tone} dot={i === 0} />
          ))}
          <span className="mono chip border-line bg-surface2 text-faint">{record.id}</span>
        </div>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Details" subtitle={meta.label}>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {facts.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 border-b border-line/50 pb-2">
                  <dt className="text-[12.5px] text-muted">{label}</dt>
                  <dd className="truncate text-right text-[12.5px] font-medium text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {(meta.prose || []).map(([key, label]) =>
            record[key] ? (
              <Card key={key} title={label}>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted">{record[key]}</p>
              </Card>
            ) : null
          )}

          {Body ? Body(record) : null}
          {resource === 'requests' && <RequestThreadCard record={record} />}
          {resource === 'incidents' && <EvidencePanel incident={record} canEdit={canEdit} />}
        </div>

        <div className="space-y-4">
          {related.length > 0 && (
            <Card title="Linked records" subtitle="Everything this record connects to" noPad>
              <ul className="divide-y divide-line/60">
                {related.map((l) => (
                  <li key={l.type + l.id}>
                    <Link to={hrefFor(l.resource, l.id)} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface2/60">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-surface2 text-faint">
                        <l.icon size={14} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">{l.type}</p>
                        <p className="truncate text-[12.5px] font-medium text-ink">{l.name || 'Open record'}</p>
                        {l.meta && <p className="mono truncate text-[11px] text-faint">{l.meta}</p>}
                      </div>
                      <ChevronRight size={14} className="shrink-0 text-faint" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {canEdit && meta.statusField && (
            <Card title="Quick update" subtitle="Changes are written to the audit trail">
              <Field label="Status">
                <Select
                  value={record[meta.statusField]}
                  onChange={(e) => update.mutate({ id, patch: { [meta.statusField]: e.target.value } })}
                >
                  {meta.statusOptions.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                </Select>
              </Field>
              {update.isPending && <p className="mt-2 text-[11.5px] text-faint">Saving</p>}
            </Card>
          )}

          <RelatedList resource={resource} record={record} />
        </div>
      </div>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Delete this ${meta.label.toLowerCase()}?`}
        body={`${meta.title(record)} will be permanently removed. The deletion is recorded in the audit trail.`}
        confirmLabel="Delete"
        onConfirm={() => del.mutate(id)}
      />
    </>
  )
}
