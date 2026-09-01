import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Fingerprint, LogOut, MapPin, Clock, ShieldAlert, Route as RouteIcon, ScrollText,
  CheckCircle2, AlertTriangle, Sun, Moon, Radio, CalendarRange, GraduationCap,
  FileWarning, ChevronRight, Play, Eye,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, Badge, Button, Avatar, Progress, Skeleton, EmptyState, StatCard, SeverityDot } from '@/components/ui/primitives'
import { useMyDuty } from '@/lib/hooks'
import { api } from '@/lib/api'
import { useAuth } from '@/auth/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { fmtTime, fmtDate, timeAgo, titleCase, cn, num } from '@/lib/utils'

/** Live H:MM:SS since a timestamp. */
function useElapsed(since) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!since) return
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [since])
  if (!since) return null
  const s = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000))
  const h = String(Math.floor(s / 3600)).padStart(2, '0')
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const sec = String(s % 60).padStart(2, '0')
  return `${h}:${m}:${sec}`
}

export function NotLinked() {
  const { canImpersonate } = useAuth()
  return (
    <EmptyState
      icon={Eye}
      title="This is the officer portal"
      body={
        canImpersonate
          ? 'Your account is not linked to an officer record, so there is no duty to show. Use “View as another user” (⇧V) and pick an officer to see this portal exactly as they do.'
          : 'Your account is not linked to an officer record. Contact your supervisor.'
      }
    />
  )
}

export default function OfficerDuty() {
  const { data, isLoading, error } = useMyDuty()
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  const att = data?.attendance
  const onDuty = !!att?.clockIn && !att?.clockOut
  const elapsed = useElapsed(onDuty ? att.clockIn : null)

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['my-duty'] })
    qc.invalidateQueries({ queryKey: ['attendance'] })
    qc.invalidateQueries({ queryKey: ['shifts'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const clock = useMutation({
    mutationFn: () => (onDuty ? api.clockOut(att.id) : api.clockIn(data.shift.id)),
    onSuccess: (row) => {
      if (onDuty) toast.success('Clocked out', { body: `${row.hours} hours recorded for this shift.` })
      else toast.success(row.status === 'late' ? `Clocked in ${row.lateMins} minutes late` : 'Clocked in', {
        body: 'Location verified inside the site geofence.',
      })
      refresh()
    },
    onError: (err) => toast.error(onDuty ? 'Could not clock out' : 'Could not clock in', { body: err.message }),
  })

  const startPatrol = useMutation({
    mutationFn: () => api.startPatrol({ siteId: data.site.id, route: 'Perimeter Loop' }),
    onSuccess: () => { toast.success('Patrol started'); refresh(); navigate('/me/patrols') },
    onError: (err) => toast.error('Could not start the patrol', { body: err.message }),
  })

  if (error?.status === 403) return <NotLinked />
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" /><Skeleton className="h-64" />
        </div>
      </div>
    )
  }
  if (!data) return <NotLinked />

  const { guard, site, shift, posts, counts, upcoming, livePatrol } = data
  const compliance = [
    counts.licenceDays != null && counts.licenceDays < 30 && {
      tone: counts.licenceDays < 0 ? 'critical' : 'warn',
      icon: FileWarning,
      text: counts.licenceDays < 0
        ? 'Your ZRP registration has expired. You cannot be deployed until it is renewed.'
        : `Your ZRP registration expires in ${counts.licenceDays} days.`,
    },
    counts.trainingExpired > 0 && {
      tone: 'warn', icon: GraduationCap,
      text: `${counts.trainingExpired} of your training certificates ${counts.trainingExpired === 1 ? 'has' : 'have'} lapsed.`,
    },
    counts.docsMissing > 0 && {
      tone: 'warn', icon: FileWarning,
      text: `${counts.docsMissing} mandatory document${counts.docsMissing === 1 ? '' : 's'} missing from your file.`,
    },
  ].filter(Boolean)

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <Avatar name={guard?.name || 'Officer'} size={40} />
            {guard?.name}
          </span>
        }
        subtitle={guard ? `${guard.rank} · ${guard.employeeNo} · Grade ${guard.grade}` : ''}
        actions={
          <>
            <Button variant="secondary" icon={ShieldAlert} onClick={() => navigate('/me/incidents?new=1')}>
              Report incident
            </Button>
          </>
        }
      />

      {/* ------------------------- duty / clock card ------------------------- */}
      <section
        className={cn(
          'relative overflow-hidden rounded-2xl border p-5',
          onDuty ? 'border-ok/30 bg-ok/[.06]' : 'border-line bg-surface'
        )}
      >
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-25" />
        <div className="relative flex flex-wrap items-center gap-x-6 gap-y-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {onDuty ? (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-ok" />
                </span>
              ) : (
                <span className="h-2.5 w-2.5 rounded-full bg-faint" />
              )}
              <p className={cn('text-[12px] font-bold uppercase tracking-[.1em]', onDuty ? 'text-ok' : 'text-faint')}>
                {onDuty ? 'On duty' : att?.clockOut ? 'Shift complete' : shift ? 'Not yet clocked in' : 'No shift today'}
              </p>
            </div>

            {shift ? (
              <>
                <h2 className="mt-2 text-[19px] font-bold leading-tight tracking-tight text-ink">
                  {site?.name || 'Site'}
                </h2>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
                  <span className="flex items-center gap-1.5">
                    {shift.type === 'night' ? <Moon size={12} className="text-accent2" /> : <Sun size={12} className="text-warn" />}
                    {titleCase(shift.type)} shift
                  </span>
                  <span className="mono flex items-center gap-1.5">
                    <Clock size={12} className="text-faint" />{fmtTime(shift.start)}-{fmtTime(shift.end)}
                  </span>
                  {site && (
                    <span className="flex items-center gap-1.5">
                      <MapPin size={12} className="text-faint" />{site.city}
                    </span>
                  )}
                </p>
              </>
            ) : (
              <p className="mt-2 text-[13px] text-muted">
                You are not rostered today. Your next shift is shown below.
              </p>
            )}

            {att?.lateMins > 0 && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-warn/12 px-2 py-1 text-[11.5px] font-semibold text-warn">
                <AlertTriangle size={11} /> Clocked in {att.lateMins} minutes late
              </p>
            )}
          </div>

          <div className="flex items-center gap-4">
            {onDuty && (
              <div className="text-right">
                <p className="mono text-[30px] font-bold leading-none tracking-tight text-ink">{elapsed}</p>
                <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-wide text-faint">Time on post</p>
              </div>
            )}
            {shift && !att?.clockOut && (
              <Button
                size="lg"
                variant={onDuty ? 'danger' : 'primary'}
                icon={onDuty ? LogOut : Fingerprint}
                loading={clock.isPending}
                onClick={() => clock.mutate()}
              >
                {onDuty ? 'Clock out' : 'Clock in'}
              </Button>
            )}
            {att?.clockOut && (
              <div className="rounded-xl border border-line bg-surface px-4 py-3 text-right">
                <p className="mono text-[20px] font-bold leading-none text-ok">{att.hours}h</p>
                <p className="mt-1 text-[10.5px] uppercase tracking-wide text-faint">recorded</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {compliance.length > 0 && (
        <div className="mt-3 space-y-2">
          {compliance.map((c, i) => (
            <div key={i} className={cn('flex items-start gap-2.5 rounded-xl border px-4 py-2.5', `border-${c.tone}/25 bg-${c.tone}/[.07]`)}>
              <c.icon size={15} className={cn('mt-0.5 shrink-0', `text-${c.tone}`)} />
              <p className="flex-1 text-[12.5px] text-ink">{c.text}</p>
              <Link to="/me/record" className="shrink-0 text-[12px] font-semibold text-accent hover:underline">My file</Link>
            </div>
          ))}
        </div>
      )}

      {/* ------------------------------ stats ------------------------------ */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Shifts this month" value={num(counts.shiftsThisMonth)} icon={CalendarRange} tone="accent" hint={`${counts.hoursThisMonth} hours worked`} />
        <StatCard label="Patrols completed" value={num(counts.patrolsCompleted)} icon={RouteIcon} tone="ok" hint="All checkpoints scanned" />
        <StatCard label="Incidents reported" value={num(counts.incidentsReported)} icon={ShieldAlert} tone="warn" hint={`${counts.openIncidents} still open`} />
        <StatCard label="Leave approved" value={num(counts.leaveApproved)} icon={CheckCircle2} tone="accent2" hint={`${counts.pendingLeave} awaiting a decision`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* --------------------------- post orders --------------------------- */}
        <Card
          className="lg:col-span-2"
          title="Your post orders"
          subtitle={site ? `What you are held to at ${site.name}` : 'No post assigned today'}
          noPad
        >
          {!site ? (
            <EmptyState icon={ScrollText} title="No post orders to show" body="Post orders appear once you are rostered to a site." />
          ) : posts.length === 0 ? (
            <EmptyState icon={ScrollText} title="No posts defined at this site" body="Ask your supervisor to publish the post orders." />
          ) : (
            <div className="divide-y divide-line/60">
              {posts.slice(0, 2).map((p) => (
                <div key={p.id} className="px-4 py-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13px] font-semibold text-ink">{p.name}</p>
                    <span className="mono text-[11px] text-faint">{p.code}</span>
                    {p.armed && <span className="chip border-warn/25 bg-warn/10 text-warn">Armed post</span>}
                    <Badge value={p.criticality === 'critical' ? 'critical' : p.criticality === 'important' ? 'medium' : 'low'} label={titleCase(p.criticality)} size="sm" />
                  </div>
                  <ol className="mt-2.5 space-y-1.5">
                    {(p.orders || []).map((o, i) => (
                      <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-muted">
                        <span className="mono mt-px shrink-0 text-[11px] font-bold text-accent">{String(i + 1).padStart(2, '0')}</span>
                        {o}
                      </li>
                    ))}
                  </ol>
                  {p.instructions && (
                    <p className="mt-2.5 rounded-lg border border-line bg-surface2/50 px-3 py-2 text-[12px] leading-relaxed text-muted">
                      {p.instructions}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          {/* ---------------------------- patrol ---------------------------- */}
          <Card title="Patrol" subtitle={livePatrol ? 'Tour in progress' : 'Start your round'}>
            {livePatrol ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="mono text-[12.5px] font-semibold text-ink">{livePatrol.ref}</span>
                  <Badge value="in_progress" label="Live" dot size="sm" />
                </div>
                <p className="mt-1 text-[11.5px] text-faint">{livePatrol.route} · started {timeAgo(livePatrol.startedAt)}</p>
                <div className="mt-3 flex items-center gap-2">
                  <Progress value={livePatrol.checkpointsScanned} max={livePatrol.checkpointsTotal} tone="accent" className="flex-1" />
                  <span className="mono text-[11.5px] text-muted">
                    {livePatrol.checkpointsScanned}/{livePatrol.checkpointsTotal}
                  </span>
                </div>
                <Button as={Link} to="/me/patrols" className="mt-3 w-full" variant="primary" iconRight={ChevronRight}>
                  Scan checkpoints
                </Button>
              </>
            ) : (
              <>
                <p className="text-[12.5px] leading-relaxed text-muted">
                  {site
                    ? `${site.name} has ${data.site?.checkpoints ?? 0} checkpoints on the route. Every tag you scan is timestamped against your name.`
                    : 'You need to be rostered to a site before you can start a patrol.'}
                </p>
                <Button
                  className="mt-3 w-full"
                  variant="primary"
                  icon={Play}
                  disabled={!site || !onDuty}
                  loading={startPatrol.isPending}
                  onClick={() => startPatrol.mutate()}
                >
                  Start patrol
                </Button>
                {!onDuty && site && (
                  <p className="mt-2 text-center text-[11px] text-faint">Clock in first to start a patrol.</p>
                )}
              </>
            )}
          </Card>

          {/* --------------------------- upcoming --------------------------- */}
          <Card title="Next shifts" subtitle={`${upcoming.length} scheduled`} noPad>
            {upcoming.length === 0 ? (
              <EmptyState icon={CalendarRange} title="Nothing rostered" body="You have no upcoming shifts." />
            ) : (
              <ul className="divide-y divide-line/60">
                {upcoming.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-surface2 text-center">
                      <span className="mono text-[11px] font-bold leading-none text-ink">{new Date(s.start).getDate()}</span>
                      <span className="text-[8.5px] uppercase text-faint">{new Date(s.start).toLocaleDateString('en', { month: 'short' })}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium text-ink">{s._site?.name}</p>
                      <p className="mono text-[11px] text-faint">{fmtTime(s.start)}-{fmtTime(s.end)} · {s.type}</p>
                    </div>
                    <Badge value={s.status} size="sm" />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* --------------------------- my incidents --------------------------- */}
      <Card
        className="mt-4"
        title="My incident reports"
        subtitle="Reports you filed or were assigned"
        actions={<Link to="/me/incidents" className="text-[12px] font-semibold text-accent hover:underline">View all</Link>}
        noPad
      >
        {data.myIncidents.length === 0 ? (
          <EmptyState icon={ShieldAlert} title="No reports yet" body="Anything you file appears here." />
        ) : (
          <ul className="divide-y divide-line/60">
            {data.myIncidents.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-4 py-3">
                <SeverityDot level={i.severity} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold text-ink">{i.title}</p>
                  <p className="mono truncate text-[11px] text-faint">
                    {i.ref} · {i._site?.name}
                    {i.evidence?.length ? ` · ${i.evidence.length} photo${i.evidence.length === 1 ? '' : 's'}` : ''}
                  </p>
                </div>
                <Badge value={i.status} size="sm" dot />
                <span className="w-16 shrink-0 text-right text-[11px] text-faint">{timeAgo(i.occurredAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
