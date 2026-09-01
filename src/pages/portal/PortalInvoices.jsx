import React, { useMemo, useState } from 'react'
import { Receipt, TrendingUp, Clock, AlertTriangle, Printer, FileDown, CheckCircle2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { DataTable } from '@/components/ui/DataTable'
import { Toolbar, FilterSelect } from '@/components/ui/Toolbar'
import { Modal } from '@/components/ui/Modal'
import { Badge, Button, StatCard, Card, Tabs } from '@/components/ui/primitives'
import { RevenueChart } from '@/components/charts/Charts'
import { useList, useTableState } from '@/lib/hooks'
import { fmtDate, money, money2, num, titleCase, download, toCSV, cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'

const STATUSES = ['sent', 'paid', 'overdue', 'draft']

export default function PortalInvoices() {
  const t = useTableState({ sort: 'issueDate', dir: 'desc' })
  const [tab, setTab] = useState('all')
  const [open, setOpen] = useState(null)
  const toast = useToast()

  const filters = { ...t.filters, ...(tab === 'all' ? {} : { status: tab }) }
  const query = useList('invoices', { ...t.params, filters, facet: 'status' })
  const allQ = useList('invoices', { all: true, pageSize: 300 })

  const all = allQ.data?.rows || []
  const billed = all.reduce((a, i) => a + i.total, 0)
  const paid = all.filter((i) => i.status === 'paid')
  const outstanding = all.filter((i) => i.status === 'sent' || i.status === 'overdue')
  const overdue = all.filter((i) => i.status === 'overdue')

  const revenue = useMemo(() => Object.values(
    all.reduce((acc, i) => {
      acc[i.period] = acc[i.period] || { period: i.period, billed: 0, collected: 0 }
      acc[i.period].billed += i.total
      if (i.status === 'paid') acc[i.period].collected += i.total
      return acc
    }, {})
  ).sort((a, b) => a.period.localeCompare(b.period)), [all])

  const facets = query.data?.facets || {}
  const tabs = [
    { value: 'all', label: 'All invoices', count: Object.values(facets).reduce((a, b) => a + b, 0) },
    ...STATUSES.map((s) => ({ value: s, label: titleCase(s), count: facets[s] || 0 })),
  ]

  const columns = [
    { key: 'number', header: 'Invoice', width: 160, render: (r) => <span className="mono text-[12.5px] font-semibold text-ink">{r.number}</span> },
    { key: 'period', header: 'Period', width: 110, render: (r) => <span className="mono text-[12.5px] text-muted">{r.period}</span> },
    { key: 'issueDate', header: 'Issued', width: 130, render: (r) => <span className="text-[12.5px] text-muted">{fmtDate(r.issueDate)}</span> },
    {
      key: 'dueDate', header: 'Due', width: 140,
      render: (r) => {
        const late = r.status !== 'paid' && new Date(r.dueDate) < Date.now()
        return (
          <div>
            <p className={cn('text-[12.5px]', late ? 'font-semibold text-critical' : 'text-muted')}>{fmtDate(r.dueDate)}</p>
            {late && <p className="text-[10.5px] text-critical">{Math.round((Date.now() - new Date(r.dueDate)) / 86400000)} days overdue</p>}
          </div>
        )
      },
    },
    { key: 'lineItems', header: 'Lines', sortable: false, align: 'right', width: 80, render: (r) => <span className="mono text-[12.5px] text-muted">{r.lineItems.length}</span> },
    { key: 'total', header: 'Total', align: 'right', width: 130, render: (r) => <span className="mono text-[12.5px] font-bold text-ink">{money2(r.total)}</span> },
    { key: 'status', header: 'Status', width: 124, render: (r) => <Badge value={r.status} /> },
  ]

  return (
    <>
      <PageHeader
        title="Billing"
        subtitle="Invoices for guarding services on your contract, with a full line-item breakdown."
        tabs={<Tabs tabs={tabs} value={tab} onChange={(v) => { setTab(v); t.setPage(1) }} className="mt-4" />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total billed" value={money(billed)} icon={Receipt} tone="accent" loading={allQ.isLoading} hint={`${all.length} invoices issued`} />
        <StatCard label="Paid" value={money(paid.reduce((a, i) => a + i.total, 0))} icon={CheckCircle2} tone="ok" loading={allQ.isLoading} hint={`${paid.length} settled`} />
        <StatCard label="Outstanding" value={money(outstanding.reduce((a, i) => a + i.total, 0))} icon={Clock} tone="warn" loading={allQ.isLoading} hint={`${outstanding.length} awaiting payment`} />
        <StatCard label="Overdue" value={overdue.length} icon={AlertTriangle} tone="critical" loading={allQ.isLoading} hint={money(overdue.reduce((a, i) => a + i.total, 0))} />
      </div>

      {revenue.length > 1 && (
        <Card className="mb-4" title="Billing history" subtitle="Billed vs settled by period">
          <RevenueChart data={revenue} formatter={(v) => money(v)} />
        </Card>
      )}

      <Toolbar
        q={t.q} onQ={t.setQ}
        placeholder="Search invoice number or period…"
        activeFilters={t.activeFilters} onReset={t.reset}
        exportName="my-invoices"
        exportRows={() => (query.data?.rows || []).map((r) => ({
          number: r.number, period: r.period, issueDate: r.issueDate, dueDate: r.dueDate,
          subtotal: r.subtotal, tax: r.tax, total: r.total, status: r.status, paidAt: r.paidAt,
        }))}
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
        emptyIcon={Receipt} emptyTitle="No invoices to show"
      />

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        size="xl"
        title={open?.number}
        subtitle={open ? `Billing period ${open.period}` : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(null)}>Close</Button>
            <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print</Button>
            <Button
              variant="primary"
              icon={FileDown}
              onClick={() => { download(`${open.number}.csv`, toCSV(open.lineItems)); toast.success('Invoice downloaded') }}
            >
              Download
            </Button>
          </>
        }
      >
        {open && (
          <div className="rounded-xl border border-line bg-surface2/30 p-6">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-[17px] font-bold text-ink">Sentinel Ops (Pvt) Ltd</p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">
                  14 Josiah Tongogara Ave<br />Harare, Zimbabwe<br />VAT 10024578
                </p>
              </div>
              <div className="text-right">
                <p className="mono text-[19px] font-bold text-ink">{open.number}</p>
                <div className="mt-1"><Badge value={open.status} /></div>
                <p className="mt-2 text-[12px] text-muted">Issued {fmtDate(open.issueDate)}</p>
                <p className="text-[12px] text-muted">Due {fmtDate(open.dueDate)}</p>
              </div>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[520px]">
                <thead>
                  <tr className="border-b border-line">
                    <th className="th">Description</th>
                    <th className="th text-right">Qty</th>
                    <th className="th text-right">Rate</th>
                    <th className="th text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {open.lineItems.map((li) => (
                    <tr key={li.id} className="border-b border-line/50">
                      <td className="td text-[12.5px] text-ink">{li.description}</td>
                      <td className="td mono text-right text-[12.5px] text-muted">{num(li.qty)} {li.unit}</td>
                      <td className="td mono text-right text-[12.5px] text-muted">{money2(li.rate)}</td>
                      <td className="td mono text-right text-[12.5px] font-semibold text-ink">{money2(li.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-end">
              <div className="w-64 space-y-1.5 text-[13px]">
                <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="mono text-ink">{money2(open.subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-muted">VAT (15%)</span><span className="mono text-ink">{money2(open.tax)}</span></div>
                <div className="flex justify-between border-t border-line pt-2 text-[15px]">
                  <span className="font-bold text-ink">Total due</span>
                  <span className="mono font-bold text-accent">{money2(open.total)}</span>
                </div>
              </div>
            </div>

            {open.paidAt && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-ok/25 bg-ok/[.08] px-3 py-2">
                <CheckCircle2 size={15} className="text-ok" />
                <p className="text-[12.5px] text-ink">Payment received {fmtDate(open.paidAt)} via {open.paymentMethod}. Thank you.</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}
