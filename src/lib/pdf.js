/* ------------------------------------------------------------------ *
 * PDF documents.
 *
 * jsPDF is loaded on first use so it never lands in the initial bundle.
 * Everything here draws onto a shared A4 layout: a branded header, a
 * consistent grid, and a footer carrying the page number and a generated
 * stamp, so a payslip, an invoice and an inspection report all look like
 * they came out of the same system.
 * ------------------------------------------------------------------ */

let jsPDFPromise = null
async function getJsPDF() {
  if (!jsPDFPromise) jsPDFPromise = import('jspdf').then((m) => m.jsPDF)
  return jsPDFPromise
}

const A4 = { w: 210, h: 297 }
const M = { left: 16, right: 16, top: 16, bottom: 18 }
const INK = [24, 32, 45]
const MUTED = [110, 122, 140]
const LINE = [214, 221, 231]
const ACCENT = [12, 110, 168]

const money = (n, cur = 'USD') =>
  (cur === 'USD' ? '$' : cur + ' ') +
  (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const dateStr = (v) =>
  v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''

/** Thin wrapper that tracks the cursor and paginates for you. */
class Doc {
  constructor(pdf, { org = 'Sentinel Ops (Pvt) Ltd', title = '', subtitle = '', reference = '' } = {}) {
    this.pdf = pdf
    this.meta = { org, title, subtitle, reference }
    this.y = M.top
    this.page = 1
    this.header()
  }

  get width() { return A4.w - M.left - M.right }

  header() {
    const p = this.pdf
    p.setFillColor(...ACCENT)
    p.rect(0, 0, A4.w, 3, 'F')

    p.setTextColor(...INK)
    p.setFont('helvetica', 'bold').setFontSize(13)
    p.text(this.meta.org, M.left, 15)

    p.setFont('helvetica', 'normal').setFontSize(8)
    p.setTextColor(...MUTED)
    p.text('14 Josiah Tongogara Avenue, Harare, Zimbabwe', M.left, 20)
    p.text('Registered under the Private Investigators and Security Guards (Control) Act', M.left, 24)

    if (this.meta.title) {
      p.setFont('helvetica', 'bold').setFontSize(15).setTextColor(...INK)
      p.text(this.meta.title, A4.w - M.right, 15, { align: 'right' })
    }
    if (this.meta.reference) {
      p.setFont('courier', 'normal').setFontSize(9).setTextColor(...MUTED)
      p.text(this.meta.reference, A4.w - M.right, 20, { align: 'right' })
    }
    if (this.meta.subtitle) {
      p.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED)
      p.text(this.meta.subtitle, A4.w - M.right, 24, { align: 'right' })
    }

    p.setDrawColor(...LINE).setLineWidth(0.3)
    p.line(M.left, 28, A4.w - M.right, 28)
    this.y = 36
  }

  footer() {
    const p = this.pdf
    p.setDrawColor(...LINE).setLineWidth(0.3)
    p.line(M.left, A4.h - M.bottom + 4, A4.w - M.right, A4.h - M.bottom + 4)
    p.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED)
    p.text(
      'Generated ' + new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }),
      M.left, A4.h - M.bottom + 9
    )
    p.text('Page ' + this.page, A4.w - M.right, A4.h - M.bottom + 9, { align: 'right' })
  }

  space(n = 4) { this.y += n }

  need(h) {
    if (this.y + h > A4.h - M.bottom) {
      this.footer()
      this.pdf.addPage()
      this.page += 1
      this.header()
    }
  }

  heading(text, size = 10.5) {
    this.need(12)
    this.pdf.setFont('helvetica', 'bold').setFontSize(size).setTextColor(...INK)
    this.pdf.text(text, M.left, this.y)
    this.y += 2
    this.pdf.setDrawColor(...LINE).setLineWidth(0.25)
    this.pdf.line(M.left, this.y, A4.w - M.right, this.y)
    this.y += 5
  }

  paragraph(text, { size = 9, color = MUTED, gap = 4 } = {}) {
    if (!text) return
    const p = this.pdf
    p.setFont('helvetica', 'normal').setFontSize(size).setTextColor(...color)
    const lines = p.splitTextToSize(String(text), this.width)
    lines.forEach((ln) => {
      this.need(5)
      p.text(ln, M.left, this.y)
      this.y += size * 0.5
    })
    this.y += gap
  }

  /** Two column key/value block. */
  facts(pairs, { columns = 2 } = {}) {
    const p = this.pdf
    const colW = this.width / columns
    const rows = Math.ceil(pairs.length / columns)
    for (let r = 0; r < rows; r++) {
      this.need(9)
      for (let c = 0; c < columns; c++) {
        const item = pairs[c * rows + r]
        if (!item) continue
        const x = M.left + c * colW
        p.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED)
        p.text(String(item[0]).toUpperCase(), x, this.y)
        p.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...INK)
        const val = p.splitTextToSize(String(item[1] ?? ''), colW - 4)
        p.text(val[0] || '', x, this.y + 4.5)
      }
      this.y += 11
    }
    this.y += 1
  }

  /**
   * columns: [{ header, key, width (mm), align }]
   */
  table(columns, rows, { zebra = true, totalRow = null } = {}) {
    const p = this.pdf
    const declared = columns.reduce((a, c) => a + (c.width || 0), 0)
    const flexCount = columns.filter((c) => !c.width).length
    const flexW = flexCount ? Math.max(18, (this.width - declared) / flexCount) : 0
    const widths = columns.map((c) => c.width || flexW)

    const drawHead = () => {
      this.need(10)
      p.setFillColor(243, 246, 250)
      p.rect(M.left, this.y - 4.5, this.width, 7, 'F')
      p.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...MUTED)
      let x = M.left
      columns.forEach((c, i) => {
        const tx = c.align === 'right' ? x + widths[i] - 2 : x + 2
        p.text(String(c.header).toUpperCase(), tx, this.y, { align: c.align === 'right' ? 'right' : 'left' })
        x += widths[i]
      })
      this.y += 6
    }

    drawHead()

    rows.forEach((row, ri) => {
      const cells = columns.map((c) => (c.get ? c.get(row) : row[c.key]))
      const wrapped = columns.map((c, i) => p.splitTextToSize(String(cells[i] ?? ''), widths[i] - 4))
      const lines = Math.max(...wrapped.map((w) => w.length), 1)
      const h = 4.6 * lines + 2.2

      if (this.y + h > A4.h - M.bottom) {
        this.footer(); p.addPage(); this.page += 1; this.header(); drawHead()
      }

      if (zebra && ri % 2 === 1) {
        p.setFillColor(249, 250, 252)
        p.rect(M.left, this.y - 4, this.width, h, 'F')
      }

      let x = M.left
      columns.forEach((c, i) => {
        p.setFont('helvetica', c.bold ? 'bold' : 'normal').setFontSize(8.5)
        p.setTextColor(...(c.muted ? MUTED : INK))
        const tx = c.align === 'right' ? x + widths[i] - 2 : x + 2
        wrapped[i].forEach((ln, li) => {
          p.text(ln, tx, this.y + li * 4.4, { align: c.align === 'right' ? 'right' : 'left' })
        })
        x += widths[i]
      })
      this.y += h
    })

    p.setDrawColor(...LINE).setLineWidth(0.25)
    p.line(M.left, this.y - 2, A4.w - M.right, this.y - 2)

    if (totalRow) {
      this.y += 4
      this.need(9)
      p.setFillColor(238, 243, 249)
      p.rect(M.left, this.y - 4.5, this.width, 8, 'F')
      let x = M.left
      columns.forEach((c, i) => {
        const v = totalRow[c.key]
        if (v != null) {
          p.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...INK)
          const tx = c.align === 'right' ? x + widths[i] - 2 : x + 2
          p.text(String(v), tx, this.y, { align: c.align === 'right' ? 'right' : 'left' })
        }
        x += widths[i]
      })
      this.y += 8
    }
    this.y += 4
  }

  /** Big right aligned figure, used for the net pay / total due line. */
  totalBox(label, value, { tone = ACCENT } = {}) {
    const p = this.pdf
    this.need(20)
    const w = 78
    const x = A4.w - M.right - w
    p.setFillColor(...tone)
    p.rect(x, this.y, w, 16, 'F')
    p.setFont('helvetica', 'normal').setFontSize(8).setTextColor(255, 255, 255)
    p.text(label.toUpperCase(), x + 5, this.y + 6)
    p.setFont('helvetica', 'bold').setFontSize(14)
    p.text(String(value), x + w - 5, this.y + 12.5, { align: 'right' })
    this.y += 22
  }

  note(text) {
    this.need(12)
    const p = this.pdf
    p.setDrawColor(...LINE).setLineWidth(0.25)
    const lines = p.splitTextToSize(text, this.width - 8)
    const h = lines.length * 4 + 6
    p.setFillColor(248, 250, 252)
    p.rect(M.left, this.y - 3, this.width, h, 'F')
    p.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED)
    lines.forEach((ln, i) => p.text(ln, M.left + 4, this.y + 2 + i * 4))
    this.y += h + 3
  }

  signatures(labels) {
    this.need(24)
    const p = this.pdf
    const colW = this.width / labels.length
    labels.forEach((l, i) => {
      const x = M.left + i * colW
      p.setDrawColor(...LINE).setLineWidth(0.4)
      p.line(x, this.y + 12, x + colW - 10, this.y + 12)
      p.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED)
      p.text(l, x, this.y + 16)
    })
    this.y += 24
  }

  save(filename) {
    this.footer()
    this.pdf.save(filename)
  }

  blob() {
    this.footer()
    return this.pdf.output('blob')
  }
}

export async function createDoc(meta) {
  const JsPDF = await getJsPDF()
  const pdf = new JsPDF({ unit: 'mm', format: 'a4', compress: true })
  pdf.setProperties({
    title: meta.title || 'Sentinel Ops document',
    author: meta.org || 'Sentinel Ops',
    creator: 'Sentinel Ops',
  })
  return new Doc(pdf, meta)
}

/* ------------------------------------------------------------------ *
 * Documents
 * ------------------------------------------------------------------ */

export async function payslipPdf(slip, { guard, ytd, org, currency = 'USD' }) {
  const doc = await createDoc({
    org,
    title: 'Payslip',
    reference: slip.period,
    subtitle: guard ? guard.employeeNo : '',
  })

  doc.facts([
    ['Employee', guard ? guard.name : ''],
    ['Employee number', guard ? guard.employeeNo : ''],
    ['Rank', guard ? guard.rank : ''],
    ['Pay period', slip.period],
    ['Pay date', dateStr(slip.payDate)],
    ['Payment method', slip.paymentMethod || 'Pending'],
  ], { columns: 3 })

  doc.heading('Earnings')
  doc.table(
    [
      { header: 'Code', key: 'code', width: 20, muted: true },
      { header: 'Description', key: 'label' },
      { header: 'Qty', key: 'qty', width: 20, align: 'right' },
      { header: 'Rate', key: 'rate', width: 24, align: 'right', get: (r) => money(r.rate, currency) },
      { header: 'Amount', key: 'amount', width: 28, align: 'right', bold: true, get: (r) => money(r.amount, currency) },
    ],
    slip.earnings || [],
    { totalRow: { label: 'Gross pay', amount: money(slip.gross, currency) } }
  )

  doc.heading('Deductions')
  doc.table(
    [
      { header: 'Code', key: 'code', width: 20, muted: true },
      { header: 'Description', key: 'label' },
      { header: 'Amount', key: 'amount', width: 28, align: 'right', bold: true, get: (r) => money(r.amount, currency) },
    ],
    slip.deductionLines || [],
    { totalRow: { label: 'Total deductions', amount: money(slip.deductionsTotal, currency) } }
  )

  doc.totalBox('Net pay', money(slip.net, currency))

  if (ytd) {
    doc.heading('Year to date')
    doc.facts([
      ['Periods paid', ytd.periods],
      ['Gross', money(ytd.gross, currency)],
      ['PAYE', money(ytd.paye, currency)],
      ['NSSA', money(ytd.nssa, currency)],
      ['Total deductions', money(ytd.deductions, currency)],
      ['Net paid', money(ytd.net, currency)],
    ], { columns: 3 })
  }

  if (slip.employer && slip.employer.length) {
    doc.heading('Employer contributions')
    doc.table(
      [
        { header: 'Description', key: 'label' },
        { header: 'Amount', key: 'amount', width: 28, align: 'right', get: (r) => money(r.amount, currency) },
      ],
      slip.employer,
      { zebra: false, totalRow: { label: 'Cost to company', amount: money(slip.costToCompany, currency) } }
    )
  }

  doc.note(
    'This payslip is issued electronically and is valid without a signature. PAYE is assessed on taxable earnings after the NSSA deduction. ' +
    'Queries must be raised with the payroll office within 30 days of the pay date.'
  )

  doc.save(`payslip-${guard ? guard.employeeNo : 'officer'}-${slip.period}.pdf`)
}

export async function payrollRegisterPdf(run, slips, guardsById, { org, currency = 'USD' }) {
  const doc = await createDoc({
    org,
    title: 'Payroll register',
    reference: run.period,
    subtitle: `${run.headcount} officers`,
  })

  doc.facts([
    ['Period', run.period],
    ['Status', run.status],
    ['Headcount', run.headcount],
    ['Gross', money(run.gross, currency)],
    ['Deductions', money(run.deductionsTotal, currency)],
    ['Net payable', money(run.net, currency)],
    ['Employer cost', money(run.employerTotal, currency)],
    ['Cost to company', money(run.costToCompany, currency)],
    ['Approved by', run.approvedBy || 'Not yet approved'],
  ], { columns: 3 })

  doc.heading('Register')
  doc.table(
    [
      { header: 'Employee', key: 'no', width: 26, get: (r) => guardsById[r.guardId]?.employeeNo || '' },
      { header: 'Name', key: 'name', get: (r) => guardsById[r.guardId]?.name || '' },
      { header: 'Hrs', key: 'baseHours', width: 14, align: 'right' },
      { header: 'OT', key: 'otHours', width: 12, align: 'right' },
      { header: 'Gross', key: 'gross', width: 24, align: 'right', get: (r) => money(r.gross, currency) },
      { header: 'PAYE', key: 'paye', width: 22, align: 'right', get: (r) => money(r.paye, currency) },
      { header: 'NSSA', key: 'nssa', width: 20, align: 'right', get: (r) => money(r.nssa, currency) },
      { header: 'Net', key: 'net', width: 26, align: 'right', bold: true, get: (r) => money(r.net, currency) },
    ],
    slips,
    { totalRow: { name: 'Totals', gross: money(run.gross, currency), paye: money(run.paye, currency), nssa: money(run.nssa, currency), net: money(run.net, currency) } }
  )

  doc.signatures(['Prepared by', 'Checked by', 'Approved by'])
  doc.save(`payroll-register-${run.period}.pdf`)
}

export async function invoicePdf(invoice, { client, org, currency = 'USD' }) {
  const doc = await createDoc({
    org,
    title: 'Invoice',
    reference: invoice.number,
    subtitle: 'Period ' + invoice.period,
  })

  doc.facts([
    ['Bill to', client ? client.name : ''],
    ['Account', client ? client.code : ''],
    ['Issued', dateStr(invoice.issueDate)],
    ['Due', dateStr(invoice.dueDate)],
    ['Status', invoice.status],
    ['Currency', invoice.currency || currency],
  ], { columns: 3 })

  doc.heading('Services')
  doc.table(
    [
      { header: 'Description', key: 'description' },
      { header: 'Qty', key: 'qty', width: 22, align: 'right', get: (r) => `${r.qty} ${r.unit}` },
      { header: 'Rate', key: 'rate', width: 24, align: 'right', get: (r) => money(r.rate, currency) },
      { header: 'Amount', key: 'amount', width: 28, align: 'right', bold: true, get: (r) => money(r.amount, currency) },
    ],
    invoice.lineItems || []
  )

  doc.facts([
    ['Subtotal', money(invoice.subtotal, currency)],
    ['VAT at 15%', money(invoice.tax, currency)],
  ], { columns: 2 })
  doc.totalBox('Total due', money(invoice.total, currency))

  doc.note(
    invoice.paidAt
      ? `Paid ${dateStr(invoice.paidAt)} by ${invoice.paymentMethod}. Thank you.`
      : 'Payment is due within the terms shown above. Please quote the invoice number on your remittance.'
  )
  doc.save(`${invoice.number}.pdf`)
}

export async function incidentPdf(incident, { org }) {
  const doc = await createDoc({
    org,
    title: 'Incident report',
    reference: incident.ref,
    subtitle: incident._site ? incident._site.name : '',
  })

  doc.facts([
    ['Category', incident.type],
    ['Severity', incident.severity],
    ['Status', incident.status],
    ['Site', incident._site ? incident._site.name : ''],
    ['Client', incident._client ? incident._client.name : ''],
    ['Occurred', dateStr(incident.occurredAt)],
    ['Reported', dateStr(incident.reportedAt)],
    ['Reported by', incident._reporter ? incident._reporter.name : ''],
    ['Police reference', incident.policeRef || 'Not reported'],
  ], { columns: 3 })

  doc.heading('Report')
  doc.paragraph(incident.description, { size: 9 })

  if (incident.timeline?.length) {
    doc.heading('Investigation timeline')
    doc.table(
      [
        { header: 'When', key: 'at', width: 34, muted: true, get: (r) => new Date(r.at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) },
        { header: 'Actor', key: 'actor', width: 36 },
        { header: 'Action', key: 'action', width: 42, bold: true },
        { header: 'Note', key: 'note' },
      ],
      incident.timeline
    )
  }

  if (incident.evidence?.length) {
    doc.heading('Evidence')
    doc.table(
      [
        { header: 'Item', key: 'name' },
        { header: 'Type', key: 'type', width: 22 },
        { header: 'Source', key: 'source', width: 32 },
        { header: 'Captured', key: 'capturedAt', width: 30, muted: true, get: (r) => dateStr(r.capturedAt) },
      ],
      incident.evidence
    )
  }

  if (incident.actions?.length) {
    doc.heading('Corrective actions')
    doc.table(
      [
        { header: 'Action', key: 'description' },
        { header: 'Owner', key: 'owner', width: 34 },
        { header: 'Due', key: 'dueAt', width: 26, get: (r) => dateStr(r.dueAt) },
        { header: 'Status', key: 'status', width: 20 },
      ],
      incident.actions
    )
  }

  doc.signatures(['Reporting officer', 'Reviewed by'])
  doc.save(`${incident.ref}.pdf`)
}

export async function inspectionPdf(inspection, { org, guardName }) {
  const doc = await createDoc({
    org,
    title: 'Inspection report',
    reference: inspection.ref,
    subtitle: inspection._site ? inspection._site.name : '',
  })

  doc.facts([
    ['Site', inspection._site ? inspection._site.name : ''],
    ['Client', inspection._client ? inspection._client.name : ''],
    ['Visit type', inspection.type],
    ['Supervisor', inspection._supervisor ? inspection._supervisor.name : inspection.supervisorName || ''],
    ['Date', dateStr(inspection.at)],
    ['Score', inspection.score + '%'],
  ], { columns: 3 })

  doc.paragraph(inspection.summary, { size: 9 })

  ;(inspection.sections || []).forEach((sec) => {
    doc.heading(sec.name, 9.5)
    doc.table(
      [
        { header: 'Check', key: 'q' },
        { header: 'Result', key: 'result', width: 22, bold: true, get: (r) => r.result.toUpperCase() },
        { header: 'Observation', key: 'note', width: 62, muted: true },
      ],
      sec.items,
      { zebra: false }
    )
  })

  if (inspection.actionsRequired?.length) {
    doc.heading('Corrective actions')
    doc.table(
      [
        { header: 'Action', key: 'description' },
        { header: 'Owner', key: 'owner', width: 34 },
        { header: 'Due', key: 'dueAt', width: 26, get: (r) => dateStr(r.dueAt) },
        { header: 'Status', key: 'status', width: 20 },
      ],
      inspection.actionsRequired
    )
  }

  doc.signatures(['Supervisor', 'Site representative'])
  doc.save(`${inspection.ref}.pdf`)
}

export async function disciplinePdf(record, { guard, org }) {
  const isCommendation = record.type === 'commendation'
  const doc = await createDoc({
    org,
    title: isCommendation ? 'Letter of commendation' : 'Disciplinary record',
    reference: record.ref,
    subtitle: guard ? guard.employeeNo : '',
  })

  doc.facts([
    ['Officer', guard ? guard.name : ''],
    ['Employee number', guard ? guard.employeeNo : ''],
    ['Rank', guard ? guard.rank : ''],
    [isCommendation ? 'Recognition' : 'Category', record.category],
    ['Type', String(record.type).replace(/_/g, ' ')],
    ['Issued', dateStr(record.issuedAt)],
    ['Issued by', record.issuedBy],
    ['Held on file until', dateStr(record.expiresAt)],
    ['Status', record.status],
  ], { columns: 3 })

  doc.heading(isCommendation ? 'Citation' : 'Account of events')
  doc.paragraph(record.description, { size: 9.5 })

  if (record.sanction) {
    doc.heading('Sanction')
    doc.paragraph(record.sanction, { size: 9.5, color: INK })
  }

  if (!isCommendation) {
    doc.note(
      'You have the right to appeal this record in writing to the Operations Director within five working days of receipt. ' +
      'A record that lapses is disregarded for the purposes of any future disciplinary process.'
    )
  }

  doc.signatures(isCommendation ? ['Issued by', 'Received by'] : ['Issued by', 'Officer signature', 'Witness'])
  doc.save(`${record.ref}.pdf`)
}

export async function certificatePdf(record, { guard, org }) {
  const doc = await createDoc({
    org,
    title: 'Training record',
    reference: record.certificateNo || record.course,
    subtitle: guard ? guard.employeeNo : '',
  })

  doc.facts([
    ['Officer', guard ? guard.name : ''],
    ['Employee number', guard ? guard.employeeNo : ''],
    ['Course', record.course],
    ['Provider', record.provider],
    ['Completed', dateStr(record.completedAt) || 'Not yet taken'],
    ['Expires', dateStr(record.expiresAt) || 'No expiry'],
    ['Score', record.score != null ? record.score + '%' : 'Not recorded'],
    ['Certificate', record.certificateNo || 'Pending'],
    ['Status', record.status],
  ], { columns: 3 })

  doc.note(
    'This is a record extract from the training register. It confirms what the employer holds on file and is not a substitute ' +
    'for the certificate issued by the training provider.'
  )
  doc.signatures(['Training officer', 'Officer signature'])
  doc.save(`training-${(record.course || 'record').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`)
}

export { money as pdfMoney, dateStr as pdfDate }
