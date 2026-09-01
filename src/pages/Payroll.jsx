import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Wallet, Banknote, CheckCircle2, Clock, TrendingUp, TrendingDown, Users, Download,
  FileDown, Building2, Landmark, ChevronRight, Percent,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { DataTable } from '@/components/ui/DataTable'
import { Toolbar, FilterSelect } from '@/components/ui/Toolbar'
import { ConfirmDialog } from '@/components/ui/Modal'
import {
  Badge, Button, Avatar, StatCard, Card, Segmented, Skeleton, EmptyState,
} from '@/components/ui/primitives'
import { BarsChart, DonutChart, Legend2 } from '@/components/charts/Charts'
import { useList, useTableState } from '@/lib/hooks'
import { api } from '@/lib/api'
import { payrollRegisterPdf, payslipPdf } from '@/lib/pdf'
import { store } from '@/lib/db'
import { PAYROLL_RUN_FLOW } from '@/lib/payroll'
import { hrefFor } from '@/lib/records'
import { money, money2, titleCase, num, fmtDate, cn, download, toCSV } from '@/lib/utils'
import { useAuth } from '@/auth/AuthContext'
import { useToast } from '@/components/ui/Toast'

function RunFlow({ status }) {
  const idx = PAYROLL_RUN_FLOW.indexOf(status)
  return (
    <div className="flex flex-wrap items-center gap-1">
      {PAYROLL_RUN_FLOW.map((s, i) => (
        <React.Fragment key={s}>
          {i > 0 && <span className={cn('h-px w-5', i <= idx ? 'bg-accent' : 'bg-line')} />}
          <span className={cn(
            'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold',
            i === idx ? 'border-accent bg-accent/12 text-accent'
              : i < idx ? 'border-ok/30 bg-ok/10 text-ok'
              : 'border-line text-faint'
          )}>
            {i < idx ? <CheckCircle2 size={11} /> : null}
            {titleCase(s)}
          </span>
        </React.Fragment>
      ))}
    </div>
  )
}

function Delta({ value }) {
  if (!value) return <span className="text-[11.5px] text-faint">no change</span>
  const up = value > 0
  return (
    <span className={cn('mono inline-flex items-center gap-1 text-[11.5px] font-bold', up ? 'text-warn' : 'text-ok')}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {up ? '+' : ''}{value}%
    </span>
  )
}

export default function Payroll() {
  const { can, isGuard } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const settings = store.getSettings()

  const runsQ = useList('payrollRuns', { all: true, pageSize: 24, sort: 'period', dir: 'desc' }, { enabled: !isGuard })
  const runs = runsQ.data?.rows || []
  const [period, setPeriod] = useState(null)
  const active = period || runs[0]?.period

  const detail = useQuery({
    queryKey: ['payroll-run', active],
    queryFn: () => api.payrollRun(active),
    enabled: !!active && !isGuard,
    retry: false,
  })

  const t = useTableState({ sort: 'net', dir: 'desc', pageSize: 25 })
  const mine = useList('payroll', { ...t.params }, { enabled: isGuard })

  const [confirmRun, setConfirmRun] = useState(null)
  const [busy, setBusy] = useState(false)

  const setStatus = useMutation({
    mutationFn: ({ runId, status }) => api.setPayrollRunStatus(runId, status),
    onSuccess: (r) => {
      toast.success(`Run ${r.period} marked ${titleCase(r.status).toLowerCase()}`)
      qc.invalidateQueries({ queryKey: ['payroll'] })
      qc.invalidateQueries({ queryKey: ['payroll-run'] })
      qc.invalidateQueries({ queryKey: ['payrollRuns'] })
    },
    onError: (err) => toast.error('Could not update the run', { body: err.message }),
  })

  const run = detail.data?.run
  const slips = detail.data?.slips || []
  const variance = detail.data?.variance || {}
  const history = detail.data?.history || []
  const byCost = detail.data?.byCost || []

  const filtered = useMemo(() => {
    const q = t.q.trim().toLowerCase()
    let rows = slips
    if (q) {
      rows = rows.filter((s) =>
        (s._guard?.name || '').toLowerCase().includes(q) || (s._guard?.employeeNo || '').toLowerCase().includes(q))
    }
    if (t.filters.status && t.filters.status !== 'all') rows = rows.filter((s) => s.status === t.filters.status)
    const dir = t.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => dir * ((a[t.sort] ?? 0) > (b[t.sort] ?? 0) ? 1 : -1))
  }, [slips, t.q, t.filters, t.sort, t.dir])

  /* ---------------------- officer view: my payslips ---------------------- */
  if (isGuard) {
    const rows = mine.data?.rows || []
    return (
      <>
        <PageHeader title="My payslips" subtitle="Every payslip issued to you, with a downloadable copy." />
        <DataTable
          columns={[
            { key: 'period', header: 'Period', width: 110, render: (r) => <span className="mono text-[12.5px] font-semibold text-ink">{r.period}</span> },
            { key: 'baseHours', header: 'Base hrs', align: 'right', width: 100, render: (r) => <span className="mono text-[12.5px]">{r.baseHours}</span> },
            { key: 'otHours', header: 'OT hrs', align: 'right', width: 90, render: (r) => <span className="mono text-[12.5px] text-warn">{r.otHours || ''}</span> },
            { key: 'gross', header: 'Gross', align: 'right', width: 115, render: (r) => <span className="mono text-[12.5px]">{money2(r.gross)}</span> },
            { key: 'deductionsTotal', header: 'Deductions', align: 'right', width: 120, render: (r) => <span className="mono text-[12.5px] text-critical">-{money2(r.deductionsTotal)}</span> },
            { key: 'net', header: 'Net pay', align: 'right', width: 125, render: (r) => <span className="mono text-[12.5px] font-bold text-ok">{money2(r.net)}</span> },
            { key: 'status', header: 'Status', width: 124, render: (r) => <Badge value={r.status} /> },
          ]}
          rows={rows}
          loading={mine.isLoading}
          sort={mine.data?.sort} dir={mine.data?.dir} onSort={t.toggleSort}
          page={mine.data?.page} pageCount={mine.data?.pageCount} pageSize={t.pageSize}
          total={mine.data?.total} from={mine.data?.from} to={mine.data?.to}
          onPage={t.setPage} onPageSize={t.setPageSize}
          onRowClick={(r) => navigate(hrefFor('payroll', r.id))}
          emptyIcon={Wallet} emptyTitle="No payslips yet"
        />
      </>
    )
  }

  const split = run ? [
    { name: 'Net pay', value: Math.round(run.net) },
    { name: 'PAYE and levy', value: Math.round(run.paye + run.aidsLevy) },
    { name: 'NSSA', value: Math.round(run.nssa) },
    { name: 'Other deductions', value: Math.max(0, Math.round(run.deductionsTotal - run.paye - run.aidsLevy - run.nssa)) },
  ] : []
  const SPLIT_COLOURS = { 'Net pay': 'ok', 'PAYE and levy': 'critical', NSSA: 'warn', 'Other deductions': 'accent2' }

  const downloadRegister = async () => {
    setBusy(true)
    try {
      const guardsById = {}
      slips.forEach((s) => { if (s._guard) guardsById[s.guardId] = s._guard })
      await payrollRegisterPdf(run, slips, guardsById, { org: settings.orgName + ' (Pvt) Ltd', currency: settings.currency })
      toast.success('Payroll register downloaded')
    } catch (err) {
      toast.error('Could not build the register', { body: String(err.message || err) })
    } finally { setBusy(false) }
  }

  const downloadBankFile = async () => {
    try {
      const rows = await api.bankFile(active)
      download(`bank-transfer-${active}.csv`, toCSV(rows))
      toast.success('Bank transfer file exported', { body: `${rows.length} payment instructions.` })
    } catch (err) {
      toast.error('Could not build the bank file', { body: err.message })
    }
  }

  const downloadAllPayslips = async () => {
    setBusy(true)
    try {
      const batch = slips.slice(0, 25)
      for (const s of batch) {
        // eslint-disable-next-line no-await-in-loop
        await payslipPdf(s, { guard: s._guard, ytd: null, org: settings.orgName + ' (Pvt) Ltd', currency: settings.currency })
      }
      toast.success(`Downloaded ${batch.length} payslips`, {
        body: slips.length > 25 ? 'Capped at 25 files in one batch.' : undefined,
      })
    } catch (err) {
      toast.error('Could not build the payslips', { body: String(err.message || err) })
    } finally { setBusy(false) }
  }

  const columns = [
    {
      key: 'guardId', header: 'Officer', sortable: false,
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={r._guard?.name || 'Unassigned'} size={26} />
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-semibold text-ink">{r._guard?.name}</p>
            <p className="mono truncate text-[11px] text-faint">{r._guard?.employeeNo}</p>
          </div>
        </div>
      ),
    },
    { key: 'baseHours', header: 'Base', align: 'right', width: 76, render: (r) => <span className="mono text-[12.5px]">{r.baseHours}</span> },
    { key: 'otHours', header: 'OT', align: 'right', width: 66, render: (r) => <span className="mono text-[12.5px] text-warn">{r.otHours || ''}</span> },
    { key: 'gross', header: 'Gross', align: 'right', width: 106, render: (r) => <span className="mono text-[12.5px] text-ink">{money2(r.gross)}</span> },
    { key: 'paye', header: 'PAYE', align: 'right', width: 96, render: (r) => <span className="mono text-[12.5px] text-critical">{money2(r.paye)}</span> },
    { key: 'nssa', header: 'NSSA', align: 'right', width: 90, render: (r) => <span className="mono text-[12.5px] text-critical">{money2(r.nssa)}</span> },
    { key: 'deductionsTotal', header: 'Deductions', align: 'right', width: 112, render: (r) => <span className="mono text-[12.5px] text-critical">-{money2(r.deductionsTotal)}</span> },
    { key: 'net', header: 'Net pay', align: 'right', width: 116, render: (r) => <span className="mono text-[12.5px] font-bold text-ok">{money2(r.net)}</span> },
    { key: 'status', header: 'Status', width: 110, render: (r) => <Badge value={r.status} /> },
    { key: 'open', header: '', sortable: false, width: 40, align: 'right', render: () => <ChevronRight size={14} className="ml-auto text-faint" /> },
  ]

  return (
    <>
      <PageHeader
        title="Payroll"
        subtitle="Monthly runs, statutory deductions, employer contributions and disbursement."
        actions={
          <>
            <Button variant="secondary" icon={Landmark} onClick={downloadBankFile} disabled={!run}>Bank file</Button>
            <Button variant="secondary" icon={FileDown} loading={busy} onClick={downloadRegister} disabled={!run}>Register PDF</Button>
            <Button variant="primary" icon={Download} loading={busy} onClick={downloadAllPayslips} disabled={!slips.length}>Payslips</Button>
          </>
        }
      />

      {runsQ.isLoading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : runs.length === 0 ? (
        <Card><EmptyState icon={Wallet} title="No payroll runs" body="Nothing has been calculated yet." /></Card>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Segmented
              value={active}
              onChange={setPeriod}
              options={runs.slice(0, 6).reverse().map((r) => ({ value: r.period, label: r.period.slice(5) + '/' + r.period.slice(2, 4) }))}
            />
            {run && <RunFlow status={run.status} />}
          </div>

          {detail.isLoading || !run ? (
            <Skeleton className="h-64 w-full rounded-xl" />
          ) : (
            <>
              <section className="mb-4 rounded-2xl border border-line bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-[17px] font-bold tracking-tight text-ink">Run {run.period}</h2>
                    <p className="mt-1 text-[12.5px] text-muted">
                      {run.headcount} officers, calculated {fmtDate(run.calculatedAt)}
                      {run.approvedBy ? `, approved by ${run.approvedBy}` : ''}
                      {run.paidAt ? `, paid ${fmtDate(run.paidAt)}` : ''}
                    </p>
                  </div>
                  {can('payroll', 'update') && (
                    <div className="flex flex-wrap gap-2">
                      {run.status === 'calculated' && (
                        <Button variant="primary" icon={CheckCircle2} loading={setStatus.isPending}
                          onClick={() => setConfirmRun({ runId: run.id, status: 'approved' })}>
                          Approve run
                        </Button>
                      )}
                      {run.status === 'approved' && (
                        <Button variant="primary" icon={Banknote} loading={setStatus.isPending}
                          onClick={() => setConfirmRun({ runId: run.id, status: 'paid' })}>
                          Mark paid
                        </Button>
                      )}
                      {run.status === 'paid' && (
                        <span className="chip border-ok/25 bg-ok/10 text-ok"><CheckCircle2 size={11} /> Disbursed</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 lg:grid-cols-5">
                  {[
                    ['Gross', money(run.gross), variance.gross],
                    ['Deductions', money(run.deductionsTotal), null],
                    ['Net payable', money(run.net), variance.net],
                    ['Employer cost', money(run.employerTotal), null],
                    ['Cost to company', money(run.costToCompany), variance.costToCompany],
                  ].map(([k, v, d]) => (
                    <div key={k} className="rounded-lg border border-line bg-surface2/40 p-3">
                      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">{k}</p>
                      <p className="mono mt-1 text-[19px] font-bold leading-none text-ink">{v}</p>
                      {d != null && <div className="mt-1.5"><Delta value={d} /></div>}
                    </div>
                  ))}
                </div>
              </section>

              <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Headcount" value={run.headcount} icon={Users} tone="accent"
                  hint={variance.headcount ? `${variance.headcount > 0 ? '+' : ''}${variance.headcount} on the last run` : 'Unchanged on the last run'} />
                <StatCard label="Overtime hours" value={num(run.otHours)} icon={Clock} tone="warn" hint={`${num(run.baseHours)} base hours`} />
                <StatCard label="PAYE and levy" value={money(run.paye + run.aidsLevy)} icon={Percent} tone="critical"
                  hint={`${Math.round(((run.paye + run.aidsLevy) / (run.gross || 1)) * 100)}% of gross`} />
                <StatCard label="NSSA" value={money(run.nssa)} icon={Building2} tone="accent2" hint="Employee contribution" />
              </div>

              <div className="mb-4 grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2" title="Payroll cost by period" subtitle="Net, gross and employer contributions">
                  <BarsChart
                    data={history.map((h) => ({ name: h.period.slice(5) + '/' + h.period.slice(2, 4), gross: h.gross, net: h.net, employer: h.employer }))}
                    height={230}
                    bars={[
                      { key: 'net', label: 'Net pay', color: 'ok' },
                      { key: 'gross', label: 'Gross', color: 'accent' },
                      { key: 'employer', label: 'Employer', color: 'accent2' },
                    ]}
                    formatter={(v) => money(v)}
                  />
                </Card>
                <Card title="Where the gross goes" subtitle={`Run ${run.period}`}>
                  <DonutChart
                    data={split}
                    colorMap={SPLIT_COLOURS}
                    centerLabel="Gross"
                    centerValue={money(run.gross)}
                    formatter={(v) => money(v)}
                  />
                  <Legend2
                    className="mt-3 justify-center"
                    items={split.map((s) => ({ label: s.name, value: money(s.value), color: SPLIT_COLOURS[s.name] }))}
                  />
                </Card>
              </div>

              <Toolbar
                q={t.q} onQ={t.setQ}
                placeholder="Search officer or employee number"
                activeFilters={t.activeFilters} onReset={t.reset}
                exportName={`payroll-register-${run.period}`}
                exportRows={() => filtered.map((r) => ({
                  employeeNo: r._guard?.employeeNo, officer: r._guard?.name, period: r.period,
                  baseHours: r.baseHours, otHours: r.otHours, gross: r.gross, paye: r.paye,
                  aidsLevy: r.aidsLevy, nssa: r.nssa, advances: r.advances,
                  deductions: r.deductionsTotal, net: r.net, employer: r.employerTotal, status: r.status,
                }))}
                filters={<FilterSelect label="Status" value={t.filters.status} onChange={(v) => t.setFilter('status', v)} options={['pending', 'approved', 'paid']} />}
              />

              <DataTable
                columns={columns}
                rows={filtered}
                loading={detail.isLoading}
                sort={t.sort} dir={t.dir} onSort={t.toggleSort}
                onRowClick={(r) => navigate(hrefFor('payroll', r.id))}
                emptyIcon={Wallet} emptyTitle="No payslips in this run"
              />

              {byCost.length > 0 && (
                <Card className="mt-4" title="Highest cost officers" subtitle="Cost to company on this run">
                  <BarsChart
                    data={byCost.map((b) => ({ name: b.name, value: b.value }))}
                    layout="vertical"
                    height={230}
                    bars={[{ key: 'value', label: 'Cost to company', color: 'accent2' }]}
                    formatter={(v) => money(v)}
                  />
                </Card>
              )}
            </>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!confirmRun}
        onClose={() => setConfirmRun(null)}
        title={confirmRun?.status === 'approved' ? 'Approve this payroll run?' : 'Mark this run as paid?'}
        body={
          confirmRun?.status === 'approved'
            ? `All ${run?.headcount} payslips in ${run?.period} will be locked for approval and released to the payment run. Your name is recorded against the approval.`
            : `${run?.headcount} payments totalling ${money(run?.net || 0)} will be marked as disbursed. Payslips become read only.`
        }
        confirmLabel={confirmRun?.status === 'approved' ? 'Approve run' : 'Mark paid'}
        variant="primary"
        onConfirm={() => setStatus.mutateAsync(confirmRun)}
      />
    </>
  )
}
