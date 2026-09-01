import React, { useMemo, useState } from 'react'
import { CalendarRange, Sun, Moon, MapPin, Clock, CheckCircle2, AlertTriangle } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, Badge, Button, Segmented, Skeleton, EmptyState, StatCard, Progress } from '@/components/ui/primitives'
import { useMyDuty, useList } from '@/lib/hooks'
import { fmtDate, fmtTime, timeAgo, titleCase, cn, num } from '@/lib/utils'
import { NotLinked } from './OfficerDuty'

export default function OfficerShifts() {
  const { data: duty, error } = useMyDuty()
  const [range, setRange] = useState('upcoming')

  const gid = duty?.guard?.id
  const shiftsQ = useList(
    'shifts',
    { all: true, pageSize: 300, sort: 'start', dir: 'asc', filters: { guardId: gid } },
    { enabled: !!gid }
  )
  const attQ = useList(
    'attendance',
    { all: true, pageSize: 300, sort: 'date', dir: 'desc', filters: { guardId: gid } },
    { enabled: !!gid }
  )

  const all = shiftsQ.data?.rows || []
  const attendance = attQ.data?.rows || []
  const attByShift = useMemo(() => {
    const m = {}
    attendance.forEach((a) => { if (a.shiftId) m[a.shiftId] = a })
    return m
  }, [attendance])

  const now = Date.now()
  const shown = useMemo(() => {
    const list = range === 'upcoming'
      ? all.filter((s) => new Date(s.start).getTime() >= now - 12 * 3600000)
      : [...all].filter((s) => new Date(s.start).getTime() < now).reverse()
    return list
  }, [all, range, now])

  const month = new Date().toISOString().slice(0, 7)
  const thisMonth = all.filter((s) => s.date.slice(0, 7) === month)
  const worked = thisMonth.filter((s) => s.status === 'completed')
  const hours = worked.reduce((a, s) => a + s.hours + (s.overtime || 0), 0)
  const overtime = worked.reduce((a, s) => a + (s.overtime || 0), 0)
  const late = attendance.filter((a) => a.status === 'late').length
  const punctuality = attendance.length
    ? Math.round(((attendance.length - late - attendance.filter((a) => a.status === 'absent').length) / attendance.length) * 100)
    : 100

  if (error?.status === 403) return <NotLinked />

  return (
    <>
      <PageHeader
        title="My shifts"
        subtitle="Your roster, the hours recorded against it, and your punctuality record."
        actions={
          <Segmented
            value={range}
            onChange={setRange}
            options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Worked' }]}
          />
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Shifts this month" value={num(thisMonth.length)} icon={CalendarRange} tone="accent" hint={`${worked.length} completed`} />
        <StatCard label="Hours worked" value={num(hours)} icon={Clock} tone="ok" hint={`${overtime} hours overtime`} />
        <StatCard label="Punctuality" value={`${punctuality}%`} icon={CheckCircle2} tone={punctuality >= 90 ? 'ok' : 'warn'} hint={`${late} late arrival${late === 1 ? '' : 's'} on record`} />
        <StatCard label="Upcoming" value={num(all.filter((s) => new Date(s.start) > now && s.status !== 'cancelled').length)} icon={CalendarRange} tone="accent2" hint="Rostered ahead" />
      </div>

      <Card
        title={range === 'upcoming' ? 'Rostered ahead' : 'Shifts worked'}
        subtitle={`${shown.length} shift${shown.length === 1 ? '' : 's'}`}
        noPad
      >
        {shiftsQ.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : shown.length === 0 ? (
          <EmptyState
            icon={CalendarRange}
            title={range === 'upcoming' ? 'Nothing rostered' : 'No shifts worked yet'}
            body={range === 'upcoming' ? 'Your supervisor has not rostered you for any upcoming shifts.' : 'Completed shifts appear here with the hours recorded.'}
          />
        ) : (
          <ul className="divide-y divide-line/60">
            {shown.map((s) => {
              const a = attByShift[s.id]
              const start = new Date(s.start)
              const isToday = s.date === new Date().toISOString().slice(0, 10)
              return (
                <li key={s.id} className={cn('flex items-center gap-3 px-4 py-3', isToday && 'bg-accent/[.05]')}>
                  <div className={cn(
                    'grid h-11 w-11 shrink-0 place-items-center rounded-xl border text-center',
                    isToday ? 'border-accent/40 bg-accent/10' : 'border-line bg-surface2'
                  )}>
                    <span className={cn('mono text-[13px] font-bold leading-none', isToday ? 'text-accent' : 'text-ink')}>
                      {start.getDate()}
                    </span>
                    <span className="text-[9px] uppercase tracking-wide text-faint">
                      {start.toLocaleDateString('en', { month: 'short' })}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-ink">{s._site?.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-faint">
                      <span className="flex items-center gap-1">
                        {s.type === 'night' ? <Moon size={10} className="text-accent2" /> : <Sun size={10} className="text-warn" />}
                        {titleCase(s.type)}
                      </span>
                      <span className="mono">{fmtTime(s.start)}-{fmtTime(s.end)}</span>
                      <span>{s.hours}h{s.overtime ? ` +${s.overtime} OT` : ''}</span>
                      {s._site?.city && <span className="flex items-center gap-1"><MapPin size={9} />{s._site.city}</span>}
                    </p>
                  </div>

                  {a && (
                    <div className="hidden shrink-0 text-right sm:block">
                      <p className="mono text-[11.5px] text-ink">
                        {a.clockIn ? fmtTime(a.clockIn) : ''} → {a.clockOut ? fmtTime(a.clockOut) : ''}
                      </p>
                      <p className={cn('text-[10.5px]', a.lateMins ? 'text-warn' : 'text-faint')}>
                        {a.lateMins ? `${a.lateMins}m late` : a.hours ? `${a.hours}h recorded` : 'on duty'}
                      </p>
                    </div>
                  )}

                  <Badge value={s.status} size="sm" dot />
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </>
  )
}
