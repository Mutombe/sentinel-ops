/* ------------------------------------------------------------------ *
 * Payroll engine.
 *
 * One place that turns hours and rates into a payslip, used by both the
 * seed generator and the API so a recalculated run always agrees with a
 * stored one. Rates and bands are declared as constants at the top so
 * they can be checked against the current statutory tables.
 *
 * Figures here are indicative monthly USD values for a Zimbabwean
 * employer. Treat the bands as configuration, not tax advice.
 * ------------------------------------------------------------------ */

/** Indicative monthly PAYE bands (USD). Tax = amount * rate - deduct. */
export const PAYE_BANDS = [
  { upTo: 100, rate: 0, deduct: 0 },
  { upTo: 300, rate: 0.20, deduct: 20 },
  { upTo: 1000, rate: 0.25, deduct: 35 },
  { upTo: 2000, rate: 0.30, deduct: 85 },
  { upTo: 3000, rate: 0.35, deduct: 185 },
  { upTo: Infinity, rate: 0.40, deduct: 335 },
]

export const RATES = {
  overtimeMultiplier: 1.5,
  publicHolidayMultiplier: 2,
  nightAllowancePerShift: 1.75,
  transportAllowance: 28,
  standbyAllowance: 15,
  aidsLevy: 0.03,          // levied on the PAYE figure
  nssaEmployee: 0.045,
  nssaEmployer: 0.045,
  nssaCeiling: 700,        // insurable earnings ceiling
  wcif: 0.023,             // Workers Compensation Insurance Fund, employer only
  unionDues: 2.5,
}

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100

export function payeFor(taxable) {
  if (taxable <= 0) return 0
  const band = PAYE_BANDS.find((b) => taxable <= b.upTo) || PAYE_BANDS[PAYE_BANDS.length - 1]
  return Math.max(0, r2(taxable * band.rate - band.deduct))
}

export function bandFor(taxable) {
  const i = PAYE_BANDS.findIndex((b) => taxable <= b.upTo)
  const idx = i === -1 ? PAYE_BANDS.length - 1 : i
  const from = idx === 0 ? 0 : PAYE_BANDS[idx - 1].upTo
  return { ...PAYE_BANDS[idx], from, index: idx }
}

/**
 * Build a full payslip from the hours worked.
 * Everything downstream reads these named lines, so a payslip, a PDF and
 * the payroll register never disagree about what makes up the total.
 */
export function computePayslip({
  hourlyRate,
  baseHours = 0,
  otHours = 0,
  holidayHours = 0,
  nightShifts = 0,
  standbyDays = 0,
  advances = 0,
  unionMember = true,
  uniformDeduction = 0,
  otherDeduction = 0,
}) {
  const rate = +hourlyRate || 0

  const basic = r2(baseHours * rate)
  const overtime = r2(otHours * rate * RATES.overtimeMultiplier)
  const holiday = r2(holidayHours * rate * RATES.publicHolidayMultiplier)
  const nightAllowance = r2(nightShifts * RATES.nightAllowancePerShift)
  const transportAllowance = baseHours > 0 ? RATES.transportAllowance : 0
  const standbyAllowance = r2(standbyDays * RATES.standbyAllowance)

  const earnings = [
    { code: 'BASIC', label: 'Basic pay', qty: baseHours, unit: 'hrs', rate, amount: basic, taxable: true },
    { code: 'OT15', label: 'Overtime at 1.5x', qty: otHours, unit: 'hrs', rate: r2(rate * RATES.overtimeMultiplier), amount: overtime, taxable: true },
    { code: 'PH20', label: 'Public holiday at 2x', qty: holidayHours, unit: 'hrs', rate: r2(rate * RATES.publicHolidayMultiplier), amount: holiday, taxable: true },
    { code: 'NIGHT', label: 'Night shift allowance', qty: nightShifts, unit: 'shifts', rate: RATES.nightAllowancePerShift, amount: nightAllowance, taxable: true },
    { code: 'TRANS', label: 'Transport allowance', qty: transportAllowance ? 1 : 0, unit: 'month', rate: RATES.transportAllowance, amount: transportAllowance, taxable: false },
    { code: 'STBY', label: 'Standby allowance', qty: standbyDays, unit: 'days', rate: RATES.standbyAllowance, amount: standbyAllowance, taxable: true },
  ].filter((e) => e.amount > 0)

  const gross = r2(earnings.reduce((a, e) => a + e.amount, 0))
  const taxableGross = r2(earnings.filter((e) => e.taxable).reduce((a, e) => a + e.amount, 0))

  const insurable = Math.min(taxableGross, RATES.nssaCeiling)
  const nssa = r2(insurable * RATES.nssaEmployee)

  // NSSA is deductible before PAYE is assessed
  const taxable = r2(Math.max(0, taxableGross - nssa))
  const paye = payeFor(taxable)
  const aidsLevy = r2(paye * RATES.aidsLevy)
  const union = unionMember ? RATES.unionDues : 0

  const deductions = [
    { code: 'PAYE', label: 'PAYE', amount: paye },
    { code: 'AIDS', label: 'AIDS levy at 3% of PAYE', amount: aidsLevy },
    { code: 'NSSA', label: 'NSSA at 4.5%', amount: nssa },
    { code: 'UNION', label: 'Union dues', amount: union },
    { code: 'ADV', label: 'Salary advance', amount: r2(advances) },
    { code: 'UNIF', label: 'Uniform recovery', amount: r2(uniformDeduction) },
    { code: 'OTHER', label: 'Other deductions', amount: r2(otherDeduction) },
  ].filter((d) => d.amount > 0)

  const totalDeductions = r2(deductions.reduce((a, d) => a + d.amount, 0))
  const net = r2(gross - totalDeductions)

  const employer = [
    { code: 'ENSSA', label: 'NSSA employer contribution', amount: r2(insurable * RATES.nssaEmployer) },
    { code: 'WCIF', label: 'Workers compensation (WCIF)', amount: r2(taxableGross * RATES.wcif) },
  ]
  const employerTotal = r2(employer.reduce((a, e) => a + e.amount, 0))

  return {
    earnings,
    deductionLines: deductions,
    employer,
    basic,
    overtime,
    holiday,
    nightAllowance,
    transportAllowance,
    standbyAllowance,
    gross,
    taxableGross,
    taxable,
    insurable,
    paye,
    aidsLevy,
    nssa,
    union,
    advances: r2(advances),
    uniformDeduction: r2(uniformDeduction),
    otherDeduction: r2(otherDeduction),
    deductionsTotal: totalDeductions,
    net,
    employerTotal,
    costToCompany: r2(gross + employerTotal),
    band: bandFor(taxable),
    effectiveTaxRate: taxableGross ? r2(((paye + aidsLevy) / taxableGross) * 100) : 0,
  }
}

/** Year to date totals for one officer across the runs already paid. */
export function ytdFor(payslips, upToPeriod) {
  const year = upToPeriod.slice(0, 4)
  const rows = payslips
    .filter((p) => p.period.slice(0, 4) === year && p.period <= upToPeriod)
    .sort((a, b) => a.period.localeCompare(b.period))
  const sum = (k) => r2(rows.reduce((a, p) => a + (p[k] || 0), 0))
  return {
    periods: rows.length,
    gross: sum('gross'),
    paye: sum('paye'),
    aidsLevy: sum('aidsLevy'),
    nssa: sum('nssa'),
    deductions: sum('deductionsTotal'),
    net: sum('net'),
    baseHours: rows.reduce((a, p) => a + (p.baseHours || 0), 0),
    otHours: rows.reduce((a, p) => a + (p.otHours || 0), 0),
  }
}

export const PAYROLL_RUN_FLOW = ['draft', 'calculated', 'approved', 'paid']
