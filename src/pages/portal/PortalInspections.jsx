import React, { useMemo, useState } from 'react'
import { ClipboardCheck, Gauge, AlertTriangle, CheckCircle2, XCircle, MinusCircle, Printer, FileDown, ListChecks } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { DataTable } from '@/components/ui/DataTable'
import { Toolbar, FilterSelect } from '@/components/ui/Toolbar'
import { Modal } from '@/components/ui/Modal'
import { Badge, Button, StatCard, Card, Progress, Avatar, EmptyState } from '@/components/ui/primitives'
import { TrendChart, BarsChart } from '@/components/charts/Charts'
import { useList, useTableState } from '@/lib/hooks'
import { fmtDate, fmtDateTime, timeAgo, titleCase, duration, cn, download, toCSV } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'

const TYPE_LABEL = {
  routine: 'Routine visit',
  spot_check: 'Spot check',
  night_visit: 'Night visit',
  client_joint: 'Joint visit with you',
}

export default function PortalInspections() {
  const t = useTableState({ sort: 'at', dir: 'desc' })
  const [open, setOpen] = useState(null)
  const toast = useToast()

  const query = useList('inspections', { ...t.params })
  const allQ = useList('inspections', { all: true, pageSize: 300 })

  const all = allQ.data?.rows || []
  const last90 = all.filter((i) => Date.now() - new Date(i.at) < 90 * 86400000)
  const avg = last90.length ? Math.round(last90.reduce((a, i) => a + i.score, 0) / last90.length) : 0
  const findings = all.reduce((a, i) => a + (i.findings?.length || 0), 0)
  const openActions = all.flatMap((i) => i.actionsRequired || []).filter((a) => a.status === 'open')

  const trend = useMemo(() => {
    const m = {}
    last90.forEach((i) => {
      const k = i.at.slice(0, 7)
      m[k] = m[k] || { week: k, total: 0, sum: 0 }
      m[k].total++
      m[k].sum += i.score
    })
    return Object.values(m)
      .sort((a, b) => a.week.localeCompare(b.week))
      .map((x) => ({ week: x.week, score: Math.round(x.sum / x.total), visits: x.total }))
  }, [last90])

  const bySite = useMemo(() => {
    const m = {}
    last90.forEach((i) => {
      const k = i._site?.name || i.siteId
      m[k] = m[k] || { name: k, total: 0, sum: 0 }
      m[k].total++
      m[k].sum += i.score
    })
    return Object.values(m).map((x) => ({ name: x.name, value: Math.round(x.sum / x.total) })).sort((a, b) => b.value - a.value)
  }, [last90])

  const columns = [
    { key: 'ref', header: 'Ref', width: 110, render: (r) => <span className="mono text-[12px] font-semibold text-ink">{r.ref}</span> },
    { key: 'siteId', header: 'Site', sortable: false, render: (r) => <span className="truncate text-[12.5px] font-medium text-ink">{r._site?.name}</span> },
    { key: 'type', header: 'Visit type', width: 165, render: (r) => <span className="text-[12.5px] text-muted">{TYPE_LABEL[r.type] || titleCase(r.type)}</span> },
    {
      key: 'score', header: 'Score', width: 160,
      render: (r) => (
        <div className="flex items-center gap-2">
          <Progress value={r.score} tone={r.score >= 90 ? 'ok' : r.score >= 75 ? 'warn' : 'critical'} className="w-24" />
          <span className="mono text-[12.5px] font-semibold text-ink">{r.score}%</span>
        </div>
      ),
    },
    {
      key: 'findings', header: 'Issues', align: 'center', sortable: false, width: 80,
      render: (r) => r.findings?.length
        ? <span className="mono text-[12.5px] font-semibold text-warn">{r.findings.length}</span>
        : <span className="text-[12px] text-ok">Clear</span>,
    },
    { key: 'at', header: 'Visited', width: 115, render: (r) => <span className="text-[12.5px] text-muted">{fmtDate(r.at)}</span> },
  ]

  return (
    <>
      <PageHeader
        title="Inspection Reports"
        subtitle="Independent supervisor visits to your sites, scored against a fixed compliance checklist."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Compliance score" value={`${avg}%`} icon={Gauge} tone={avg >= 90 ? 'ok' : avg >= 75 ? 'warn' : 'critical'} loading={allQ.isLoading} hint="90-day average across your sites" />
        <StatCard label="Visits (90 days)" value={last90.length} icon={ClipboardCheck} tone="accent" loading={allQ.isLoading} hint={`${all.length} published in total`} />
        <StatCard label="Findings raised" value={findings} icon={AlertTriangle} tone="warn" loading={allQ.isLoading} hint="Non-conformances we identified" />
        <StatCard label="Actions in progress" value={openActions.length} icon={ListChecks} tone="accent2" loading={allQ.isLoading} hint="Corrective work still open" />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Compliance trend" subtitle="Average inspection score by month">
          {trend.length ? (
            <TrendChart data={trend} height={220} keys={[{ key: 'score', label: 'Score %', color: 'ok' }]} formatter={(v) => `${v}%`} />
          ) : (
            <EmptyState icon={Gauge} title="Not enough history yet" body="Scores appear here once two or more visits have been published." />
          )}
        </Card>
        <Card title="By site" subtitle="90-day average score">
          {bySite.length ? (
            <BarsChart data={bySite.slice(0, 6)} layout="vertical" height={220} bars={[{ key: 'value', label: 'Score %', color: 'accent' }]} formatter={(v) => `${v}%`} />
          ) : (
            <EmptyState icon={ClipboardCheck} title="No visits yet" />
          )}
        </Card>
      </div>

      <Toolbar
        q={t.q} onQ={t.setQ}
        placeholder="Search reference or summary…"
        activeFilters={t.activeFilters} onReset={t.reset}
        exportName="inspection-reports"
        exportRows={() => (query.data?.rows || []).map((r) => ({
          ref: r.ref, site: r._site?.name, type: r.type, at: r.at,
          score: r.score, findings: r.findings?.length || 0, summary: r.summary,
        }))}
        filters={<FilterSelect label="Type" value={t.filters.type} onChange={(v) => t.setFilter('type', v)} options={Object.keys(TYPE_LABEL)} />}
      />

      <DataTable
        columns={columns}
        rows={query.data?.rows || []}
        loading={query.isLoading} fetching={query.isFetching}
        sort={query.data?.sort} dir={query.data?.dir} onSort={t.toggleSort}
        page={query.data?.page} pageCount={query.data?.pageCount} pageSize={t.pageSize}
        total={query.data?.total} from={query.data?.from} to={query.data?.to}
        onPage={t.setPage} onPageSize={t.setPageSize}
        onRowClick={setOpen}
        emptyIcon={ClipboardCheck}
        emptyTitle="No inspection reports published yet"
        emptyBody="Supervisor visits appear here once they have been signed off."
      />

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        size="lg"
        title={open ? `${open.ref} at ${open._site?.name}` : ''}
        subtitle={open ? `${TYPE_LABEL[open.type]} · ${fmtDateTime(open.at)} · ${duration(open.durationMins)} on site` : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(null)}>Close</Button>
            <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print</Button>
            <Button
              variant="primary"
              icon={FileDown}
              onClick={() => {
                download(`${open.ref}.csv`, toCSV(open.sections.flatMap((s) => s.items.map((i) => ({ section: s.name, item: i.q, result: i.result, note: i.note })))))
                toast.success('Report downloaded')
              }}
            >
              Download
            </Button>
          </>
        }
      >
        {open && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface2/40 p-4">
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">Compliance score</p>
                <p className={cn('mono text-[30px] font-bold leading-none',
                  open.score >= 90 ? 'text-ok' : open.score >= 75 ? 'text-warn' : 'text-critical')}>
                  {open.score}%
                </p>
              </div>
              <div className="h-10 w-px bg-line" />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] leading-relaxed text-muted">{open.summary}</p>
                <p className="mt-1.5 text-[11px] text-faint">
                  Inspected by {open._supervisor?.name || open.supervisorName || 'our supervisor'} · {timeAgo(open.at)}
                </p>
              </div>
            </div>

            {open.sections.map((sec) => {
              const scored = sec.items.filter((i) => i.result !== 'na')
              const s = scored.length ? Math.round((scored.filter((i) => i.result === 'pass').length / scored.length) * 100) : 100
              return (
                <Card key={sec.name} title={sec.name} actions={
                  <span className={cn('mono rounded-md px-2 py-1 text-[12px] font-bold',
                    s >= 90 ? 'bg-ok/10 text-ok' : s >= 75 ? 'bg-warn/10 text-warn' : 'bg-critical/10 text-critical')}>
                    {s}%
                  </span>
                } noPad>
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

            {open.actionsRequired?.length > 0 && (
              <Card title="What we are doing about it" subtitle={`${open.actionsRequired.filter((a) => a.status === 'open').length} of ${open.actionsRequired.length} still open`} noPad>
                <ul className="divide-y divide-line/60">
                  {open.actionsRequired.map((a) => (
                    <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                      <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', a.status === 'done' ? 'bg-ok' : 'bg-warn')} />
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-[12.5px]', a.status === 'done' ? 'text-faint line-through' : 'text-ink')}>{a.description}</p>
                        <p className="mt-0.5 text-[11px] text-faint">{a.owner} · target {fmtDate(a.dueAt)}</p>
                      </div>
                      <Badge value={a.status === 'done' ? 'resolved' : 'open'} label={a.status === 'done' ? 'Complete' : 'In progress'} size="sm" />
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}
