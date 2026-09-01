import React, { useState } from 'react'
import { ShieldAlert, FileDown, Clock, CheckCircle2, DollarSign, MapPin, Printer, Image as ImageIcon } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { DataTable } from '@/components/ui/DataTable'
import { Toolbar, FilterSelect } from '@/components/ui/Toolbar'
import { Modal } from '@/components/ui/Modal'
import { Badge, Button, StatCard, Card, Tabs, SeverityDot, Avatar } from '@/components/ui/primitives'
import { useList, useTableState } from '@/lib/hooks'
import { EvidencePanel } from '@/features/IncidentPanels'
import { fmtDateTime, timeAgo, money, titleCase, download, toCSV } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'

const SEVERITIES = ['low', 'medium', 'high', 'critical']
const STATUSES = ['open', 'investigating', 'resolved', 'closed']

export default function PortalIncidents() {
  const t = useTableState({ sort: 'occurredAt', dir: 'desc' })
  const [tab, setTab] = useState('all')
  const [open, setOpen] = useState(null)
  const toast = useToast()

  const filters = { ...t.filters, ...(tab === 'all' ? {} : { status: tab }) }
  const query = useList('incidents', { ...t.params, filters, facet: 'status' })
  const allQ = useList('incidents', { all: true, pageSize: 500 })

  const all = allQ.data?.rows || []
  const openInc = all.filter((i) => i.status === 'open' || i.status === 'investigating')
  const resolved = all.filter((i) => i.status === 'resolved' || i.status === 'closed')
  const loss = all.reduce((a, i) => a + (i.lossValue || 0), 0)

  const facets = query.data?.facets || {}
  const tabs = [
    { value: 'all', label: 'All reports', count: Object.values(facets).reduce((a, b) => a + b, 0) },
    ...STATUSES.map((s) => ({ value: s, label: titleCase(s), count: facets[s] || 0 })),
  ]

  const columns = [
    {
      key: 'ref', header: 'Ref', width: 130,
      render: (r) => (
        <div className="flex items-center gap-2">
          <SeverityDot level={r.severity} />
          <div className="min-w-0">
            <p className="mono truncate text-[12px] font-semibold text-ink">{r.ref}</p>
            <p className="truncate text-[11px] text-faint">{r.type}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'title', header: 'Incident',
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-medium text-ink">{r.title}</p>
          <p className="truncate text-[11px] text-faint">{r._site?.name}</p>
        </div>
      ),
    },
    { key: 'severity', header: 'Severity', width: 105, render: (r) => <Badge value={r.severity} /> },
    { key: 'status', header: 'Status', width: 125, render: (r) => <Badge value={r.status} dot /> },
    {
      key: 'evidence', header: 'Photos', align: 'center', sortable: false, width: 90,
      render: (r) => {
        const n = (r.evidence || []).filter((e) => e.type === 'photo').length
        return n
          ? <span className="mono inline-flex items-center gap-1 text-[12.5px] text-accent"><ImageIcon size={12} />{n}</span>
          : <span className="text-[12px] text-faint"></span>
      },
    },
    { key: 'lossValue', header: 'Loss', align: 'right', width: 100, render: (r) => r.lossValue ? <span className="mono text-[12.5px] text-warn">{money(r.lossValue)}</span> : <span className="text-faint"></span> },
    { key: 'occurredAt', header: 'Occurred', width: 140, render: (r) => <span className="text-[12.5px] text-muted">{fmtDateTime(r.occurredAt).split(' · ')[0]}</span> },
  ]

  return (
    <>
      <PageHeader
        title="Incident Reports"
        subtitle="Every event recorded at your sites, with the actions our officers took."
        tabs={<Tabs tabs={tabs} value={tab} onChange={(v) => { setTab(v); t.setPage(1) }} className="mt-4" />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total reports" value={all.length} icon={ShieldAlert} tone="accent" loading={allQ.isLoading} />
        <StatCard label="Open" value={openInc.length} icon={Clock} tone="critical" loading={allQ.isLoading} hint="Under investigation" />
        <StatCard label="Resolved" value={resolved.length} icon={CheckCircle2} tone="ok" loading={allQ.isLoading}
          hint={`${Math.round((resolved.length / (all.length || 1)) * 100)}% closure rate`} />
        <StatCard label="Loss exposure" value={money(loss)} icon={DollarSign} tone="warn" loading={allQ.isLoading} hint="Recorded across all reports" />
      </div>

      <Toolbar
        q={t.q} onQ={t.setQ}
        placeholder="Search reference, type, description…"
        activeFilters={t.activeFilters} onReset={t.reset}
        exportName="my-incident-reports"
        exportRows={() => (query.data?.rows || []).map((r) => ({
          ref: r.ref, site: r._site?.name, type: r.type, severity: r.severity,
          status: r.status, occurredAt: r.occurredAt, resolvedAt: r.resolvedAt, loss: r.lossValue,
        }))}
        filters={<FilterSelect label="Severity" value={t.filters.severity} onChange={(v) => t.setFilter('severity', v)} options={SEVERITIES} />}
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
        emptyIcon={ShieldAlert} emptyTitle="No incident reports" emptyBody="Nothing has been recorded at your sites for this filter."
      />

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        size="lg"
        title={open ? `${open.type} ${open.ref}` : ''}
        subtitle={open?._site?.name}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(null)}>Close</Button>
            <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print</Button>
            <Button
              variant="primary"
              icon={FileDown}
              onClick={() => {
                download(`${open.ref}.csv`, toCSV(open.timeline))
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
            <div className="flex flex-wrap items-center gap-2">
              <Badge value={open.severity} />
              <Badge value={open.status} dot />
              {open.policeRef && <span className="chip border-line bg-surface2 text-muted">Police ref {open.policeRef}</span>}
              {open.lossValue > 0 && <span className="chip border-warn/25 bg-warn/10 text-warn">Loss {money(open.lossValue)}</span>}
            </div>

            <Card title="What happened">
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted">{open.description}</p>
            </Card>

            <EvidencePanel incident={open} canEdit={false} />

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['Site', open._site?.name],
                ['Occurred', fmtDateTime(open.occurredAt)],
                ['Reported', fmtDateTime(open.reportedAt)],
                ['Resolved', open.resolvedAt ? fmtDateTime(open.resolvedAt) : 'Still open'],
                ['Injuries', open.injuries || 'None'],
                ['Reported by', open._reporter?.name || 'Control room'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-line bg-surface2/40 px-3 py-2.5">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">{k}</p>
                  <p className="mt-0.5 truncate text-[12.5px] font-medium text-ink">{v}</p>
                </div>
              ))}
            </div>

            <Card title="Response timeline">
              <ol className="relative space-y-0 border-l border-line pl-5">
                {open.timeline.map((tl, i) => (
                  <li key={i} className="relative pb-4 last:pb-0">
                    <span className={`absolute -left-[26px] top-0.5 h-4 w-4 rounded-full border-2 border-surface ${i === open.timeline.length - 1 ? 'bg-accent' : 'bg-line'}`} />
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <p className="text-[12.5px] font-semibold text-ink">{tl.action}</p>
                      <p className="text-[11px] text-faint">{tl.actor} · {fmtDateTime(tl.at)}</p>
                    </div>
                    {tl.note && <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{tl.note}</p>}
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        )}
      </Modal>
    </>
  )
}
