import React, { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Pencil, Trash2, Clock, MapPin, Sun, Moon, Fingerprint, Route as RouteIcon,
  ShieldAlert, ClipboardCheck, BookOpen, AlertTriangle, CheckCircle2, Send, ScrollText,
  UserX, Radio, FileDown, Building2,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import {
  Card, Badge, Button, Avatar, Skeleton, EmptyState, StatCard, Progress,
  Field, Select, Textarea, SeverityDot,
} from '@/components/ui/primitives'
import { Drawer, ConfirmDialog, Modal } from '@/components/ui/Modal'
import { api } from '@/lib/api'
import { useUpdate, useDelete, useLookups, useForm } from '@/lib/hooks'
import { useAuth } from '@/auth/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { fmtDate, fmtDateTime, fmtTime, timeAgo, titleCase, duration, cn, download, toCSV } from '@/lib/utils'

const STATUSES = ['scheduled', 'confirmed', 'in_progress', 'completed', 'no_show', 'cancelled', 'swapped']
const ENTRY_KINDS = ['handover', 'patrol', 'access', 'observation', 'radio', 'visitor', 'maintenance', 'incident']

const KIND_STYLE = {
  shift: { icon: Clock, tone: 'muted' },
  clock: { icon: Fingerprint, tone: 'ok' },
  late: { icon: AlertTriangle, tone: 'warn' },
  noshow: { icon: UserX, tone: 'critical' },
  book: { icon: BookOpen, tone: 'accent' },
  patrol: { icon: RouteIcon, tone: 'accent2' },
  patrolDone: { icon: CheckCircle2, tone: 'ok' },
  exception: { icon: AlertTriangle, tone: 'warn' },
  incident: { icon: ShieldAlert, tone: 'critical' },
  inspection: { icon: ClipboardCheck, tone: 'accent' },
}

/* --------------------------- edit the shift --------------------------- */
function EditShift({ open, onClose, shift }) {
  const { data: lk } = useLookups()
  const toast = useToast()
  const qc = useQueryClient()
  const update = useUpdate('shifts', {
    label: 'Shift',
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shift-detail'] }); onClose() },
  })

  const f = useForm({
    guardId: shift.guardId,
    siteId: shift.siteId,
    date: shift.date,
    startTime: new Date(shift.start).toTimeString().slice(0, 5),
    hours: shift.hours,
    overtime: shift.overtime || 0,
    type: shift.type,
    status: shift.status,
    notes: shift.notes || '',
  })

  React.useEffect(() => {
    if (!open) return
    f.reset({
      guardId: shift.guardId,
      siteId: shift.siteId,
      date: shift.date,
      startTime: new Date(shift.start).toTimeString().slice(0, 5),
      hours: shift.hours,
      overtime: shift.overtime || 0,
      type: shift.type,
      status: shift.status,
      notes: shift.notes || '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shift.id])

  const submit = async (e) => {
    e.preventDefault()
    const site = lk?.sites.find((s) => s.id === f.values.siteId)
    const start = new Date(`${f.values.date}T${f.values.startTime || '07:00'}:00`)
    const hours = +f.values.hours || 12
    try {
      await update.mutateAsync({
        id: shift.id,
        patch: {
          guardId: f.values.guardId,
          siteId: f.values.siteId,
          clientId: site?.clientId || shift.clientId,
          date: f.values.date,
          start: start.toISOString(),
          end: new Date(start.getTime() + hours * 3600000).toISOString(),
          hours,
          overtime: +f.values.overtime || 0,
          type: f.values.type,
          status: f.values.status,
          notes: f.values.notes,
        },
      })
    } catch (err) {
      f.applyServerError(err)
      if (!err.fields) toast.error('Could not save the shift', { body: err.message })
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Edit shift"
      subtitle={`${shift._guard?.name || 'Officer'} at ${shift._site?.name || 'site'}`}
      width="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={update.isPending} onClick={submit}>Save changes</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4 p-5">
        <Field label="Officer" required error={f.errors.guardId}>
          <Select {...f.bind('guardId')}>
            {lk?.guards.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.rank})</option>)}
          </Select>
        </Field>
        <Field label="Site" required error={f.errors.siteId}>
          <Select {...f.bind('siteId')}>
            {lk?.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" required error={f.errors.date}><input type="date" className="input" {...f.bind('date')} /></Field>
          <Field label="Start time"><input type="time" className="input" {...f.bind('startTime')} /></Field>
          <Field label="Duration (hours)"><input type="number" min="1" max="24" className="input" {...f.bind('hours')} /></Field>
          <Field label="Overtime (hours)"><input type="number" min="0" max="12" className="input" {...f.bind('overtime')} /></Field>
          <Field label="Shift type">
            <Select {...f.bind('type')}><option value="day">Day</option><option value="night">Night</option></Select>
          </Field>
          <Field label="Status">
            <Select {...f.bind('status')}>{STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
          </Field>
        </div>
        <Field label="Handover notes">
          <Textarea rows={3} {...f.bind('notes')} placeholder="Keys, access codes, standing instructions" />
        </Field>
      </form>
    </Drawer>
  )
}

/* ------------------------------- the page ------------------------------ */
export default function ShiftDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const { can } = useAuth()
  const [edit, setEdit] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [entryOpen, setEntryOpen] = useState(false)
  const [entry, setEntry] = useState({ kind: 'observation', note: '' })

  const { data, isLoading, error } = useQuery({
    queryKey: ['shift-detail', id],
    queryFn: () => api.shiftDetail(id),
    enabled: !!id,
    retry: false,
  })

  const del = useDelete('shifts', { label: 'Shift', onSuccess: () => navigate('/shifts') })
  const update = useUpdate('shifts', {
    label: 'Shift',
    silent: true,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shift-detail'] }),
  })

  const addLog = useMutation({
    mutationFn: (body) => api.addShiftLog(id, body),
    onSuccess: () => {
      toast.success('Occurrence book updated')
      setEntry({ kind: 'observation', note: '' })
      setEntryOpen(false)
      qc.invalidateQueries({ queryKey: ['shift-detail'] })
      qc.invalidateQueries({ queryKey: ['shifts'] })
    },
    onError: (err) => toast.error('Entry not saved', { body: err.message }),
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-96 lg:col-span-2" /><Skeleton className="h-96" /></div>
      </div>
    )
  }
  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Shift unavailable"
        body={error.message}
        action={<Button variant="secondary" icon={ArrowLeft} onClick={() => navigate('/shifts')}>Back to the roster</Button>}
      />
    )
  }

  const { shift, guard, attendance, posts, patrols, incidents, inspections, timeline, stats } = data
  const scanned = stats.checkpointsTotal ? Math.round((stats.checkpointsScanned / stats.checkpointsTotal) * 100) : null

  const exportLog = () => {
    download(
      `${shift.date}-${guard?.employeeNo || 'shift'}-log.csv`,
      toCSV(timeline.map((t) => ({ at: t.at, event: t.title, detail: t.note || '', reference: t.ref || '' })))
    )
    toast.success('Shift log exported')
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <Avatar name={guard?.name || 'Unassigned'} size={38} />
            {guard?.name || 'Unassigned officer'}
          </span>
        }
        subtitle={
          <>
            {fmtDate(shift.start)} at {shift._site?.name}
            {guard ? ` · ${guard.rank} · ${guard.employeeNo}` : ''}
          </>
        }
        actions={
          <>
            <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate('/shifts')}>Back</Button>
            <Button variant="secondary" icon={FileDown} onClick={exportLog}>Export log</Button>
            {can('shifts', 'update') && <Button variant="secondary" icon={Pencil} onClick={() => setEdit(true)}>Edit shift</Button>}
            {can('shifts', 'delete') && <Button variant="danger" icon={Trash2} onClick={() => setConfirm(true)}>Remove</Button>}
          </>
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge value={shift.status} dot />
          <span className="chip border-line bg-surface2 text-muted">
            {shift.type === 'night' ? <Moon size={11} className="text-accent2" /> : <Sun size={11} className="text-warn" />}
            {titleCase(shift.type)} shift
          </span>
          <span className="mono chip border-line bg-surface2 text-muted">
            <Clock size={11} />{fmtTime(shift.start)}-{fmtTime(shift.end)}
          </span>
          <span className="chip border-line bg-surface2 text-muted">{shift.hours}h{shift.overtime ? ` +${shift.overtime} OT` : ''}</span>
          {attendance?.lateMins > 0 && <Badge value="medium" label={`${attendance.lateMins} min late`} />}
          {shift.status === 'no_show' && <Badge value="critical" label="No show" />}
          <Link to={`/sites/${shift.siteId}`} className="chip border-line bg-surface2 text-muted transition hover:text-ink">
            <MapPin size={11} />{shift._site?.name}
          </Link>
          <Link to={`/clients/${shift.clientId}`} className="chip border-line bg-surface2 text-muted transition hover:text-ink">
            <Building2 size={11} />{shift._client?.name}
          </Link>
        </div>
      </PageHeader>

      {/* --------------------------- quick actions --------------------------- */}
      {can('shifts', 'update') && shift.status !== 'completed' && shift.status !== 'cancelled' && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface2/40 px-4 py-3">
          <span className="text-[12.5px] font-medium text-muted">Change the status:</span>
          {['confirmed', 'in_progress', 'completed', 'no_show', 'cancelled']
            .filter((s) => s !== shift.status)
            .map((s) => (
              <Button
                key={s}
                size="xs"
                variant="secondary"
                loading={update.isPending}
                onClick={() => update.mutate({ id: shift.id, patch: { status: s } })}
              >
                {titleCase(s)}
              </Button>
            ))}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Hours recorded" value={stats.hoursWorked || 0} icon={Clock} tone="accent"
          hint={attendance?.clockIn ? `On post ${fmtTime(attendance.clockIn)}` : 'Not clocked in'}
        />
        <StatCard
          label="Checkpoints" value={stats.checkpointsTotal ? `${stats.checkpointsScanned}/${stats.checkpointsTotal}` : 'None'}
          icon={RouteIcon} tone={scanned == null ? 'muted' : scanned === 100 ? 'ok' : 'warn'}
          hint={`${patrols.length} patrol tours on this shift`}
        />
        <StatCard label="Incidents" value={stats.incidents} icon={ShieldAlert} tone={stats.incidents ? 'critical' : 'ok'} hint="Reported at this site during the shift" />
        <StatCard label="Book entries" value={stats.entries} icon={BookOpen} tone="accent2" hint="Written up by the officer" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ------------------------------ log ------------------------------ */}
        <div className="space-y-4 lg:col-span-2">
          <Card
            title="Shift log"
            subtitle={`${timeline.length} events, from booking on to handover`}
            actions={can('shifts', 'update') && (
              <Button size="sm" variant="secondary" icon={ScrollText} onClick={() => setEntryOpen(true)}>
                Add entry
              </Button>
            )}
          >
            {timeline.length === 0 ? (
              <EmptyState icon={BookOpen} title="Nothing logged" body="No activity was recorded against this shift." />
            ) : (
              <ol className="relative space-y-0 border-l border-line pl-5">
                {timeline.map((t, i) => {
                  const st = KIND_STYLE[t.kind] || KIND_STYLE.book
                  const Inner = (
                    <>
                      <span className={cn(
                        'absolute -left-[27px] top-0 grid h-[18px] w-[18px] place-items-center rounded-full border-2 border-surface',
                        `bg-${st.tone}/20 text-${st.tone}`
                      )}>
                        <st.icon size={10} />
                      </span>
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <p className="text-[13px] font-semibold text-ink">{t.title}</p>
                        {t.ref && <span className="mono text-[11px] text-accent">{t.ref}</span>}
                        <p className="text-[11px] text-faint">{fmtDateTime(t.at)}</p>
                      </div>
                      {t.note && <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{t.note}</p>}
                      {t.author && (
                        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-faint">
                          <Avatar name={t.author} size={16} /> {t.author}
                          {t.entryKind && <span className="chip border-line bg-surface2 text-faint">{titleCase(t.entryKind)}</span>}
                        </p>
                      )}
                    </>
                  )
                  return (
                    <li key={i} className="relative pb-5 last:pb-0">
                      {t.link ? (
                        <Link to={t.link} className="block rounded-lg transition hover:bg-surface2/50">{Inner}</Link>
                      ) : Inner}
                    </li>
                  )
                })}
              </ol>
            )}
          </Card>

          {incidents.length > 0 && (
            <Card title="Incidents during this shift" subtitle={`${incidents.length} at ${shift._site?.name}`} noPad>
              <ul className="divide-y divide-line/60">
                {incidents.map((i) => (
                  <li key={i.id}>
                    <Link to={`/incidents/${i.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface2/60">
                      <SeverityDot level={i.severity} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold text-ink">{i.title}</p>
                        <p className="mono truncate text-[11px] text-faint">{i.ref} · {timeAgo(i.occurredAt)}</p>
                      </div>
                      <Badge value={i.status} size="sm" dot />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {patrols.length > 0 && (
            <Card title="Patrol tours" subtitle={`${patrols.length} walked on this shift`} noPad>
              <ul className="divide-y divide-line/60">
                {patrols.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                    <span className={cn(
                      'grid h-8 w-8 shrink-0 place-items-center rounded-lg border',
                      p.status === 'complete' ? 'border-ok/25 bg-ok/10 text-ok' : 'border-warn/25 bg-warn/10 text-warn'
                    )}>
                      <RouteIcon size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold text-ink">{p.route}</p>
                      <p className="mono truncate text-[11px] text-faint">{p.ref} · {duration(p.durationMins)}</p>
                    </div>
                    <div className="w-28 shrink-0">
                      <Progress value={p.checkpointsScanned} max={p.checkpointsTotal} tone={p.checkpointsScanned === p.checkpointsTotal ? 'ok' : 'warn'} />
                      <p className="mono mt-1 text-right text-[10.5px] text-faint">{p.checkpointsScanned}/{p.checkpointsTotal}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* ------------------------------ side ------------------------------ */}
        <div className="space-y-4">
          <Card title="Attendance">
            {attendance ? (
              <div className="space-y-2 text-[12.5px]">
                {[
                  ['Clocked in', attendance.clockIn ? fmtTime(attendance.clockIn) : 'Did not book on'],
                  ['Clocked out', attendance.clockOut ? fmtTime(attendance.clockOut) : 'Still on post'],
                  ['Hours', attendance.hours || 0],
                  ['Late by', attendance.lateMins ? `${attendance.lateMins} minutes` : 'On time'],
                  ['Verified by', titleCase(attendance.method)],
                  ['Geofence', attendance.geoVerified ? 'Inside the site' : 'Outside the site'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 border-b border-line/50 pb-2 last:border-0">
                    <span className="text-muted">{k}</span>
                    <span className="text-right font-medium text-ink">{v}</span>
                  </div>
                ))}
                <div className="pt-1"><Badge value={attendance.status} dot /></div>
              </div>
            ) : (
              <EmptyState icon={Fingerprint} title="No clock record" body="The officer has not booked on for this shift." />
            )}
          </Card>

          {guard && (
            <Card title="Officer">
              <Link to={`/guards/${guard.id}`} className="flex items-center gap-3 rounded-lg border border-line bg-surface2/50 p-3 transition hover:border-accent/40">
                <Avatar name={guard.name} size={38} />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-ink">{guard.name}</p>
                  <p className="mono truncate text-[11px] text-faint">{guard.employeeNo} · {guard.rank}</p>
                </div>
              </Link>
              <div className="mt-3 space-y-2 text-[12.5px]">
                {[
                  ['Grade', guard.grade],
                  ['Rating', `${guard.rating} / 5.0`],
                  ['Armed', guard.armed ? 'Authorised' : 'No'],
                  ['Phone', guard.phone],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 border-b border-line/50 pb-2 last:border-0">
                    <span className="text-muted">{k}</span>
                    <span className="truncate text-right font-medium text-ink">{v}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {posts.length > 0 && (
            <Card title="Post orders" subtitle={`${posts.length} posts at this site`} noPad>
              <ul className="divide-y divide-line/60">
                {posts.slice(0, 3).map((p) => (
                  <li key={p.id} className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink">{p.name}</p>
                      <Badge value={p.criticality === 'critical' ? 'critical' : p.criticality === 'important' ? 'medium' : 'low'} label={titleCase(p.criticality)} size="sm" />
                    </div>
                    <ol className="mt-1.5 space-y-1">
                      {(p.orders || []).slice(0, 3).map((o, i) => (
                        <li key={i} className="flex gap-1.5 text-[11.5px] leading-relaxed text-muted">
                          <span className="mono shrink-0 text-[10px] font-bold text-accent">{String(i + 1).padStart(2, '0')}</span>
                          {o}
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {shift.notes && (
            <Card title="Handover notes">
              <p className="text-[12.5px] leading-relaxed text-muted">{shift.notes}</p>
            </Card>
          )}

          {inspections.length > 0 && (
            <Card title="Supervisor visits" noPad>
              <ul className="divide-y divide-line/60">
                {inspections.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className={cn('mono grid h-8 w-11 shrink-0 place-items-center rounded-lg text-[11.5px] font-bold',
                      i.score >= 90 ? 'bg-ok/10 text-ok' : i.score >= 75 ? 'bg-warn/10 text-warn' : 'bg-critical/10 text-critical')}>
                      {i.score}%
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="mono truncate text-[12px] font-semibold text-ink">{i.ref}</p>
                      <p className="truncate text-[11px] text-faint">{timeAgo(i.at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <EditShift open={edit} onClose={() => setEdit(false)} shift={shift} />

      <Modal
        open={entryOpen}
        onClose={() => setEntryOpen(false)}
        size="md"
        title="Occurrence book entry"
        subtitle="Written into the shift log with your name and the time"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEntryOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              icon={Send}
              loading={addLog.isPending}
              disabled={!entry.note.trim()}
              onClick={() => addLog.mutate(entry)}
            >
              Write entry
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Entry type">
            <Select value={entry.kind} onChange={(e) => setEntry((s) => ({ ...s, kind: e.target.value }))}>
              {ENTRY_KINDS.map((k) => <option key={k} value={k}>{titleCase(k)}</option>)}
            </Select>
          </Field>
          <Field label="Entry" required hint="Entries are permanent and appear in the client's shift record.">
            <Textarea
              rows={4}
              autoFocus
              value={entry.note}
              onChange={(e) => setEntry((s) => ({ ...s, note: e.target.value }))}
              placeholder="What happened, when, and what you did about it"
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Remove this shift?"
        body={`${guard?.name || 'This officer'} will be taken off the roster for ${fmtDate(shift.start)} at ${shift._site?.name}. The occurrence book entries go with it.`}
        confirmLabel="Remove shift"
        onConfirm={() => del.mutate(shift.id)}
      />
    </>
  )
}
