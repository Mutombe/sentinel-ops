import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Route as RouteIcon, ScanLine, Play, Flag, CheckCircle2, AlertTriangle,
  Clock, MapPin, Nfc,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, Badge, Button, Progress, Skeleton, EmptyState, StatCard, Select } from '@/components/ui/primitives'
import { ConfirmDialog } from '@/components/ui/Modal'
import { useMyDuty, useList } from '@/lib/hooks'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { fmtDateTime, timeAgo, duration, titleCase, cn } from '@/lib/utils'
import { NotLinked } from './OfficerDuty'

const ROUTES = ['Perimeter Loop', 'Internal Sweep', 'Roof & Plant', 'Parking Levels', 'Full Site Round']

export default function OfficerPatrols() {
  const { data: duty, isLoading, error } = useMyDuty()
  const qc = useQueryClient()
  const toast = useToast()
  const [route, setRoute] = useState(ROUTES[0])
  const [closing, setClosing] = useState(false)

  const gid = duty?.guard?.id
  const history = useList(
    'patrols',
    { pageSize: 20, sort: 'startedAt', dir: 'desc', filters: { guardId: gid } },
    { enabled: !!gid }
  )

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['my-duty'] })
    qc.invalidateQueries({ queryKey: ['patrols'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const live = duty?.livePatrol
  const onDuty = !!duty?.attendance?.clockIn && !duty?.attendance?.clockOut

  const start = useMutation({
    mutationFn: () => api.startPatrol({ siteId: duty.site.id, route }),
    onSuccess: () => { toast.success('Patrol started', { body: 'Scan each checkpoint as you reach it.' }); refresh() },
    onError: (err) => toast.error('Could not start the patrol', { body: err.message }),
  })

  const scan = useMutation({
    mutationFn: () => api.scanCheckpoint(live.id),
    // optimistic: the tag reads instantly on a real device, so the UI should too
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['my-duty'] })
      const prev = qc.getQueryData(['my-duty'])
      qc.setQueryData(['my-duty'], (o) =>
        o?.livePatrol
          ? { ...o, livePatrol: { ...o.livePatrol, checkpointsScanned: o.livePatrol.checkpointsScanned + 1 } }
          : o
      )
      return { prev }
    },
    onError: (err, _v, ctx) => {
      qc.setQueryData(['my-duty'], ctx.prev)
      toast.error('Checkpoint not recorded', { body: err.message })
    },
    onSettled: refresh,
  })

  const complete = useMutation({
    mutationFn: () => api.completePatrol(live.id),
    onSuccess: (p) => {
      toast[p.status === 'complete' ? 'success' : 'warning'](
        p.status === 'complete' ? 'Patrol closed with all checkpoints scanned' : `Patrol closed with ${p.exceptions} missed checkpoint${p.exceptions === 1 ? '' : 's'}`,
        { body: `${duration(p.durationMins)} on the route.` }
      )
      refresh()
    },
    onError: (err) => toast.error('Could not close the patrol', { body: err.message }),
  })

  if (error?.status === 403) return <NotLinked />
  if (isLoading) return <div className="space-y-4"><Skeleton className="h-56 w-full rounded-2xl" /><Skeleton className="h-64 w-full" /></div>

  const rows = history.data?.rows || []
  const done = rows.filter((p) => p.status !== 'in_progress')
  const clean = done.filter((p) => p.status === 'complete').length
  const compliance = done.length ? Math.round((clean / done.length) * 100) : 100
  const remaining = live ? live.checkpointsTotal - live.checkpointsScanned : 0

  return (
    <>
      <PageHeader
        title="Patrols"
        subtitle="Scan every checkpoint on your round. Each tag is timestamped against your name."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="My compliance" value={`${compliance}%`} icon={CheckCircle2} tone={compliance >= 95 ? 'ok' : 'warn'} hint={`${done.length} tours closed`} />
        <StatCard label="Clean tours" value={clean} icon={RouteIcon} tone="accent" hint="Every checkpoint scanned" />
        <StatCard label="Exceptions" value={done.length - clean} icon={AlertTriangle} tone="critical" hint="Tours with a missed tag" />
        <StatCard label="Checkpoints scanned" value={done.reduce((a, p) => a + p.checkpointsScanned, 0)} icon={Nfc} tone="accent2" hint="Lifetime" />
      </div>

      {/* ------------------------- live patrol / start ------------------------ */}
      {live ? (
        <section className="relative overflow-hidden rounded-2xl border border-accent/35 bg-accent/[.06] p-5">
          <div className="grid-bg pointer-events-none absolute inset-0 opacity-25" />
          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
                </span>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[.1em] text-accent">Patrol in progress</p>
                  <h2 className="mt-0.5 text-[17px] font-bold tracking-tight text-ink">
                    {live.route} <span className="mono text-[13px] font-semibold text-faint">{live.ref}</span>
                  </h2>
                </div>
              </div>
              <p className="flex items-center gap-3 text-[12px] text-muted">
                <span className="flex items-center gap-1.5"><MapPin size={12} className="text-faint" />{live._site?.name}</span>
                <span className="flex items-center gap-1.5"><Clock size={12} className="text-faint" />started {timeAgo(live.startedAt)}</span>
              </p>
            </div>

            <div className="mt-5 flex items-end justify-between gap-4">
              <div>
                <p className="mono text-[34px] font-bold leading-none tracking-tight text-ink">
                  {live.checkpointsScanned}
                  <span className="text-[20px] text-faint"> / {live.checkpointsTotal}</span>
                </p>
                <p className="mt-1.5 text-[11.5px] text-faint">
                  {remaining > 0 ? `${remaining} checkpoint${remaining === 1 ? '' : 's'} still to scan` : 'Every checkpoint scanned'}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="lg"
                  variant="primary"
                  icon={ScanLine}
                  disabled={remaining <= 0}
                  loading={scan.isPending}
                  onClick={() => scan.mutate()}
                >
                  Scan checkpoint
                </Button>
                <Button size="lg" variant="secondary" icon={Flag} onClick={() => setClosing(true)}>
                  End patrol
                </Button>
              </div>
            </div>

            <Progress
              value={live.checkpointsScanned}
              max={live.checkpointsTotal}
              tone={remaining === 0 ? 'ok' : 'accent'}
              className="mt-4"
            />

            <div className="mt-4 flex flex-wrap gap-1.5">
              {Array.from({ length: live.checkpointsTotal }).map((_, i) => (
                <span
                  key={i}
                  title={`Checkpoint ${i + 1}`}
                  className={cn(
                    'mono grid h-8 w-8 place-items-center rounded-lg border text-[11px] font-bold transition',
                    i < live.checkpointsScanned
                      ? 'border-ok/30 bg-ok/12 text-ok'
                      : 'border-line bg-surface2 text-faint'
                  )}
                >
                  {i < live.checkpointsScanned ? <CheckCircle2 size={13} /> : String(i + 1).padStart(2, '0')}
                </span>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <Card title="Start a patrol" subtitle={duty?.site ? duty.site.name : 'You need to be posted to a site'}>
          {!duty?.site ? (
            <EmptyState icon={RouteIcon} title="No site assigned today" body="Patrols start from the site you are rostered to." />
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1">
                <p className="label">Route</p>
                <Select value={route} onChange={(e) => setRoute(e.target.value)}>
                  {ROUTES.map((r) => <option key={r} value={r}>{r}</option>)}
                </Select>
              </div>
              <div className="min-w-[160px]">
                <p className="label">Checkpoints on this site</p>
                <p className="mono text-[22px] font-bold leading-none text-ink">{duty.site.checkpoints}</p>
              </div>
              <Button
                size="lg"
                variant="primary"
                icon={Play}
                disabled={!onDuty}
                loading={start.isPending}
                onClick={() => start.mutate()}
              >
                Start patrol
              </Button>
              {!onDuty && (
                <p className="w-full text-[11.5px] text-warn">Clock in on the duty screen before starting a patrol.</p>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ------------------------------ history ------------------------------ */}
      <Card className="mt-4" title="My patrol history" subtitle={`${rows.length} recent tours`} noPad>
        {history.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={RouteIcon} title="No patrols yet" body="Your completed tours will be listed here." />
        ) : (
          <ul className="divide-y divide-line/60">
            {rows.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <span className={cn(
                  'grid h-8 w-8 shrink-0 place-items-center rounded-lg border',
                  p.status === 'complete' ? 'border-ok/25 bg-ok/10 text-ok'
                    : p.status === 'in_progress' ? 'border-accent/25 bg-accent/10 text-accent'
                    : 'border-warn/25 bg-warn/10 text-warn'
                )}>
                  {p.status === 'complete' ? <CheckCircle2 size={14} /> : p.status === 'in_progress' ? <RouteIcon size={14} /> : <AlertTriangle size={14} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold text-ink">{p.route}</p>
                  <p className="mono truncate text-[11px] text-faint">{p.ref} · {p._site?.name}</p>
                </div>
                <div className="hidden w-36 shrink-0 sm:block">
                  <Progress
                    value={p.checkpointsScanned}
                    max={p.checkpointsTotal}
                    tone={p.checkpointsScanned === p.checkpointsTotal ? 'ok' : 'warn'}
                  />
                  <p className="mono mt-1 text-right text-[10.5px] text-faint">{p.checkpointsScanned}/{p.checkpointsTotal}</p>
                </div>
                <span className="mono w-16 shrink-0 text-right text-[11.5px] text-muted">{duration(p.durationMins)}</span>
                <span className="w-20 shrink-0 text-right text-[11px] text-faint">{timeAgo(p.startedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={closing}
        onClose={() => setClosing(false)}
        title={remaining > 0 ? 'End the patrol with missed checkpoints?' : 'End this patrol?'}
        body={
          remaining > 0
            ? `${remaining} of ${live?.checkpointsTotal} checkpoints have not been scanned. Closing now records ${remaining} exception${remaining === 1 ? '' : 's'} against this tour, which your supervisor will see.`
            : 'All checkpoints are scanned. The tour will be closed and recorded as compliant.'
        }
        confirmLabel="End patrol"
        variant={remaining > 0 ? 'danger' : 'primary'}
        onConfirm={() => complete.mutateAsync()}
      />
    </>
  )
}
