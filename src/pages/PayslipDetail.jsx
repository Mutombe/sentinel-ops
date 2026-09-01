import React, { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Download, Printer, Wallet, Banknote, TrendingUp, Percent, Clock,
  AlertTriangle, Calculator, Users, CheckCircle2, Building2, FileDown,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import {
  Card, Badge, Button, Avatar, Skeleton, EmptyState, StatCard, Progress,
  Field, Input, Segmented,
} from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { BarsChart } from '@/components/charts/Charts'
import { api } from '@/lib/api'
import { payslipPdf } from '@/lib/pdf'
import { store } from '@/lib/db'
import { RATES } from '@/lib/payroll'
import { useAuth } from '@/auth/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { fmtDate, money, money2, titleCase, cn, num, download, toCSV } from '@/lib/utils'

function Line({ label, code, qty, unit, rate, amount, strong, negative }) {
  return (
    <tr className="border-t border-line/70">
      <td className="td w-16 text-[11px]">
        <span className="mono text-faint">{code}</span>
      </td>
      <td className="td text-[12.5px] text-ink">{label}</td>
      <td className="td mono text-right text-[12px] text-muted">{qty ? `${num(qty)} ${unit || ''}` : ''}</td>
      <td className="td mono text-right text-[12px] text-muted">{rate ? money2(rate) : ''}</td>
      <td className={cn('td mono text-right text-[12.5px]', strong ? 'font-bold text-ink' : negative ? 'text-critical' : 'text-ink')}>
        {negative ? '-' : ''}{money2(amount)}
      </td>
    </tr>
  )
}

export default function PayslipDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const { can, isGuard } = useAuth()
  const [editOpen, setEditOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['payslip', id],
    queryFn: () => api.payslipDetail(id),
    enabled: !!id,
    retry: false,
  })

  const [edit, setEdit] = useState(null)

  const recalc = useMutation({
    mutationFn: (patch) => api.recalculatePayslip(id, patch),
    onSuccess: () => {
      toast.success('Payslip recalculated', { body: 'The run totals were updated to match.' })
      setEditOpen(false)
      qc.invalidateQueries({ queryKey: ['payslip'] })
      qc.invalidateQueries({ queryKey: ['payroll'] })
      qc.invalidateQueries({ queryKey: ['payroll-run'] })
    },
    onError: (err) => toast.error('Could not recalculate', { body: err.message }),
  })

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-96 w-full" /></div>
  }
  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Payslip unavailable"
        body={error.message}
        action={<Button variant="secondary" icon={ArrowLeft} onClick={() => navigate('/payroll')}>Back to payroll</Button>}
      />
    )
  }

  const { slip, guard, run, ytd, history } = data
  const settings = store.getSettings()
  const locked = slip.status === 'paid'

  const openEdit = () => {
    setEdit({
      baseHours: slip.baseHours,
      otHours: slip.otHours,
      holidayHours: slip.holidayHours || 0,
      nightShifts: slip.nightShifts || 0,
      standbyDays: slip.standbyDays || 0,
      advances: slip.advances || 0,
      uniformDeduction: slip.uniformDeduction || 0,
      otherDeduction: slip.otherDeduction || 0,
    })
    setEditOpen(true)
  }

  const downloadPdf = async () => {
    setBusy(true)
    try {
      await payslipPdf(slip, { guard, ytd, org: settings.orgName + ' (Pvt) Ltd', currency: settings.currency })
      toast.success('Payslip downloaded')
    } catch (err) {
      toast.error('Could not build the PDF', { body: String(err.message || err) })
    } finally {
      setBusy(false)
    }
  }

  const grossPct = slip.gross ? Math.round((slip.net / slip.gross) * 100) : 0

  return (
    <>
      <PageHeader
        title={`Payslip ${slip.period}`}
        subtitle={guard ? `${guard.name} · ${guard.employeeNo} · ${guard.rank}` : ''}
        actions={
          <>
            <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate('/payroll')}>Back</Button>
            <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print</Button>
            <Button
              variant="secondary"
              icon={FileDown}
              onClick={() => {
                download(`payslip-${guard?.employeeNo}-${slip.period}.csv`, toCSV([
                  ...slip.earnings.map((e) => ({ section: 'Earning', code: e.code, description: e.label, qty: e.qty, rate: e.rate, amount: e.amount })),
                  ...(slip.deductionLines || []).map((d) => ({ section: 'Deduction', code: d.code, description: d.label, qty: '', rate: '', amount: d.amount })),
                ]))
                toast.success('Payslip exported')
              }}
            >
              CSV
            </Button>
            <Button variant="primary" icon={Download} loading={busy} onClick={downloadPdf}>Download PDF</Button>
          </>
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge value={slip.status} dot />
          {run && <Link to={`/records/payrollRuns/${run.id}`} className="chip border-line bg-surface2 text-muted transition hover:text-ink">
            <Wallet size={11} /> Run {run.period}
          </Link>}
          {guard && <Link to={`/guards/${guard.id}`} className="chip border-line bg-surface2 text-muted transition hover:text-ink">
            <Users size={11} /> Officer file
          </Link>}
          {slip.bankRef && <span className="mono chip border-line bg-surface2 text-faint">Ref {slip.bankRef}</span>}
          {locked && <Badge value="active" label="Locked, already paid" />}
        </div>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Gross pay" value={money2(slip.gross)} icon={TrendingUp} tone="accent" hint={`${slip.baseHours} base hours`} />
        <StatCard label="Deductions" value={money2(slip.deductionsTotal)} icon={Calculator} tone="critical" hint={`${slip.effectiveTaxRate}% effective tax rate`} />
        <StatCard label="Net pay" value={money2(slip.net)} icon={Banknote} tone="ok" hint={`${grossPct}% of gross`} />
        <StatCard label="Cost to company" value={money2(slip.costToCompany)} icon={Building2} tone="accent2" hint={`${money2(slip.employerTotal)} employer contributions`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card
            title="Earnings"
            subtitle="Every line that makes up the gross"
            actions={can('payroll', 'update') && !locked && (
              <Button size="sm" variant="secondary" icon={Calculator} onClick={openEdit}>Recalculate</Button>
            )}
            noPad
          >
            <table className="w-full">
              <thead className="bg-surface2/60">
                <tr>
                  <th className="th w-16">Code</th>
                  <th className="th">Description</th>
                  <th className="th text-right">Qty</th>
                  <th className="th text-right">Rate</th>
                  <th className="th text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {slip.earnings.map((e) => <Line key={e.code} {...e} />)}
                <tr className="border-t-2 border-line bg-surface2/40">
                  <td className="td" />
                  <td className="td text-[12.5px] font-bold text-ink">Gross pay</td>
                  <td className="td" /><td className="td" />
                  <td className="td mono text-right text-[13px] font-bold text-ink">{money2(slip.gross)}</td>
                </tr>
              </tbody>
            </table>
          </Card>

          <Card title="Deductions" subtitle="Statutory first, then agreed recoveries" noPad>
            <table className="w-full">
              <thead className="bg-surface2/60">
                <tr>
                  <th className="th w-16">Code</th>
                  <th className="th">Description</th>
                  <th className="th text-right">Qty</th>
                  <th className="th text-right">Rate</th>
                  <th className="th text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(slip.deductionLines || []).map((d) => <Line key={d.code} {...d} negative />)}
                <tr className="border-t-2 border-line bg-surface2/40">
                  <td className="td" />
                  <td className="td text-[12.5px] font-bold text-ink">Total deductions</td>
                  <td className="td" /><td className="td" />
                  <td className="td mono text-right text-[13px] font-bold text-critical">-{money2(slip.deductionsTotal)}</td>
                </tr>
              </tbody>
            </table>
          </Card>

          <div className="flex items-center justify-between rounded-xl border border-ok/30 bg-ok/[.08] px-5 py-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[.1em] text-ok">Net pay</p>
              <p className="mt-0.5 text-[12px] text-muted">
                {slip.paidAt ? `Paid ${fmtDate(slip.paidAt)} by ${slip.paymentMethod}` : 'Awaiting the payment run'}
              </p>
            </div>
            <p className="mono text-[28px] font-bold leading-none text-ok">{money2(slip.net)}</p>
          </div>

          <Card title="How the tax was worked out" subtitle="So the officer can check it themselves">
            <ol className="space-y-2.5 text-[12.5px]">
              {[
                ['Taxable earnings', money2(slip.taxableGross), 'Gross less any non taxable allowance'],
                ['Less NSSA at 4.5%', '-' + money2(slip.nssa), `On insurable earnings of ${money2(slip.insurable)}, capped at ${money2(RATES.nssaCeiling)}`],
                ['Amount assessed', money2(slip.taxable), `Falls in the ${(slip.band?.rate * 100).toFixed(0)}% band`],
                ['PAYE', money2(slip.paye), `${(slip.band?.rate * 100).toFixed(0)}% of the assessed amount less ${money2(slip.band?.deduct)}`],
                ['AIDS levy', money2(slip.aidsLevy), '3% of the PAYE figure'],
              ].map(([k, v, why]) => (
                <li key={k} className="flex items-start justify-between gap-4 border-b border-line/50 pb-2 last:border-0">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{k}</p>
                    <p className="mt-0.5 text-[11.5px] text-faint">{why}</p>
                  </div>
                  <span className="mono shrink-0 font-semibold text-ink">{v}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Year to date" subtitle={`${ytd.periods} periods in ${slip.period.slice(0, 4)}`}>
            <div className="space-y-2 text-[12.5px]">
              {[
                ['Gross', money2(ytd.gross)],
                ['PAYE', money2(ytd.paye)],
                ['AIDS levy', money2(ytd.aidsLevy)],
                ['NSSA', money2(ytd.nssa)],
                ['Total deductions', money2(ytd.deductions)],
                ['Net paid', money2(ytd.net)],
                ['Hours worked', num(ytd.baseHours)],
                ['Overtime hours', num(ytd.otHours)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-line/50 pb-2 last:border-0">
                  <span className="text-muted">{k}</span>
                  <span className="mono font-medium text-ink">{v}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Employer contributions" subtitle="Not deducted from the officer" noPad>
            <ul className="divide-y divide-line/60">
              {(slip.employer || []).map((e) => (
                <li key={e.code} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-[12.5px] text-muted">{e.label}</span>
                  <span className="mono text-[12.5px] font-semibold text-ink">{money2(e.amount)}</span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 bg-surface2/40 px-4 py-2.5">
                <span className="text-[12.5px] font-semibold text-ink">Cost to company</span>
                <span className="mono text-[13px] font-bold text-ink">{money2(slip.costToCompany)}</span>
              </li>
            </ul>
          </Card>

          {history.length > 1 && (
            <Card title="Net pay history" subtitle="This officer, by period">
              <BarsChart
                data={history.map((h) => ({ name: h.period.slice(5), value: h.net }))}
                height={180}
                bars={[{ key: 'value', label: 'Net', color: 'ok' }]}
                formatter={(v) => money(v)}
              />
            </Card>
          )}

          {guard && (
            <Card title="Officer">
              <Link to={`/guards/${guard.id}`} className="flex items-center gap-3 rounded-lg border border-line bg-surface2/50 p-3 transition hover:border-accent/40">
                <Avatar name={guard.name} size={38} />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-ink">{guard.name}</p>
                  <p className="mono truncate text-[11px] text-faint">{guard.employeeNo} · {money2(guard.hourlyRate)}/hr</p>
                </div>
              </Link>
            </Card>
          )}
        </div>
      </div>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        size="md"
        title="Recalculate this payslip"
        subtitle="Change the inputs and the whole slip is recomputed by the payroll engine"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button variant="primary" icon={Calculator} loading={recalc.isPending} onClick={() => recalc.mutate(edit)}>
              Recalculate
            </Button>
          </>
        }
      >
        {edit && (
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ['baseHours', 'Base hours'],
              ['otHours', 'Overtime hours'],
              ['holidayHours', 'Public holiday hours'],
              ['nightShifts', 'Night shifts'],
              ['standbyDays', 'Standby days'],
              ['advances', 'Salary advance'],
              ['uniformDeduction', 'Uniform recovery'],
              ['otherDeduction', 'Other deduction'],
            ].map(([k, label]) => (
              <Field key={k} label={label}>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={edit[k]}
                  onChange={(e) => setEdit((s) => ({ ...s, [k]: e.target.value }))}
                />
              </Field>
            ))}
          </div>
        )}
      </Modal>
    </>
  )
}
