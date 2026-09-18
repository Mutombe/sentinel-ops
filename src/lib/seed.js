import { R, pick, pickN, int, float, chance, weighted } from './rng'
import {
  buildPosts, buildInspections, buildLeave, buildDiscipline,
  buildTraining, buildDocuments, attachIncidentDetail,
} from './seedOps'
import { buildRealIncidents } from './seedReal'
import { computePayslip } from './payroll'

const FIRST = ['Tendai','Tinashe','Rutendo','Farai','Nyasha','Takudzwa','Munashe','Chipo','Rufaro','Panashe','Simbarashe','Vimbai','Tapiwa','Tsitsi','Kudakwashe','Chiedza','Fungai','Garikai','Rumbidzai','Lovemore','Tawanda','Nokutenda','Netsai','Chenai','Sekai','Zvikomborero','Munyaradzi','Tichaona','Tarisai','Shamiso','Chido','Rudo','Vongai','Kundai','Tonderai','Taurai','Anesu','Makanaka','Ngonidzashe','Blessing','Precious','Talent','Wisdom','Sipho','Sibongile','Thabani','Nkosana','Bongani','Nokuthula','Themba','Sandile','Lungile','Mthokozisi','Nqobile','Zanele','Sibusiso','Nkosilathi','Melusi','Nkululeko','Thandiwe','Busisiwe','Mandla','Nomalanga','Nomsa','Khanyisile']
const LAST = ['Moyo','Ncube','Sibanda','Dube','Ndlovu','Mpofu','Nyoni','Mlambo','Chikwanha','Marufu','Mutasa','Mangwiro','Mhlanga','Zhou','Shumba','Nyathi','Muchena','Gumbo','Mubaiwa','Chibanda','Makoni','Zvobgo','Mavhunga','Chigumba','Musarurwa','Mabhena','Mkandla','Nkomo','Masuku','Tshuma','Mguni','Sithole','Chirimuuta','Madzima','Chidzero','Gwanzura','Mutambara','Nherera','Chikafu','Maposa','Mabika','Chihota','Mudenda','Mangoma','Chivasa','Muzenda','Bhebhe','Chiweshe','Mutandwa','Kanyemba','Zimuto','Rusike','Manyika','Mhembere','Nyandoro','Marecha','Mudzingwa','Mahachi','Chinyama','Zhuwao','Matibiri','Chimuti','Ruzvidzo','Bere']

const CLIENT_NAMES = [
  ['Zambezi Financial Holdings', 'Banking'],
  ['Msasa Data Centres', 'Technology'],
  ['Westgate Shopping Precinct', 'Retail'],
  ['Avenues Private Hospital', 'Healthcare'],
  ['Great Dyke Mining Corporation', 'Mining'],
  ['Borrowdale Brooke Estates', 'Residential'],
  ['Willowvale Logistics Hub', 'Logistics'],
  ['Chitepo Legal Chambers', 'Legal'],
  ['Nyanga Grand Hotel', 'Hospitality'],
  ['Southerton Manufacturing', 'Industrial'],
  ['Chisipite International School', 'Education'],
  ['Samora Tower Offices', 'Commercial'],
  ['Kariba Harbour Marina', 'Maritime'],
  ['Ruwa Pharmaceuticals', 'Pharma'],
  ['Redcliff Energy Plant', 'Energy'],
  ['Harare Convention Centre', 'Events'],
  ['Belvedere Auto Group', 'Automotive'],
  ['Chishawasha Museum Trust', 'Cultural'],
  ['Mazowe Telecom Exchange', 'Telecoms'],
  ['Chinhoyi Agri Holdings', 'Agriculture'],
  ['Marange Diamond Vault', 'Luxury'],
  ['Highfield Sports Arena', 'Sports'],
  ['Beitbridge Cold Storage', 'Cold Chain'],
  ['Highlands Media House', 'Media'],
]

const CITIES = ['Harare','Bulawayo','Chitungwiza','Mutare','Gweru','Kwekwe','Kadoma','Masvingo','Chinhoyi','Marondera','Bindura','Norton','Ruwa','Zvishavane','Victoria Falls','Hwange','Rusape','Chiredzi','Beitbridge','Redcliff']
const SITE_TYPES = ['Corporate HQ','Warehouse','Retail Mall','Data Centre','Residential Estate','Construction Site','Hospital Campus','Cash Centre','Industrial Park','Transport Depot']
const RANKS = ['Security Officer','Senior Officer','Patrol Officer','Control Room Operator','Shift Supervisor','Site Supervisor','K9 Handler','Armed Response','Access Controller','Detection Officer']
const CERTS = ['ZRP Registration Grade A','ZRP Registration Grade B','ZRP Registration Grade C','Firearm Competency','First Aid Level 3','Fire Marshal','CCTV Operations','Crowd Control','Armed Escort','K9 Handling','Cash-in-Transit','Control Room Cert']
const INCIDENT_TYPES = ['Unauthorised Access','Theft','Vandalism','Trespassing','Assault','Suspicious Activity','Fire Alarm','Medical Emergency','Equipment Failure','Perimeter Breach','Armed Robbery','Vehicle Incident','Alarm Activation','Policy Violation','Lost Property']
const ASSET_CATS = ['Radio','Body Camera','Firearm','Vehicle','Metal Detector','Uniform Set','Torch','Baton','Handcuffs','Tablet','Patrol Scanner','K9 Unit']
const REQ_TYPES = ['Additional Coverage','Incident Follow-up','Site Assessment','Guard Replacement','Access List Update','Equipment Request','Complaint','Contract Amendment']
const STREETS = ['Samora Machel','Julius Nyerere','Leopold Takawira','Herbert Chitepo','Jason Moyo','George Silundika','Kwame Nkrumah','Nelson Mandela','Borrowdale','Enterprise','Chiremba','Josiah Tongogara','Second Street','Angwa Street','Baker Avenue','Fife Avenue']

const DAY = 86400000

/* The whole dataset is laid out relative to NOW: the roster runs three weeks
   back and two forward, attendance fills the recent past, invoices age into
   their due dates. Pinning NOW to a fixed calendar date meant the demo aged,
   until "this week" on the roster fell off the end of the data and the app
   looked broken. It now tracks the current day, with the time of day held
   constant so a reseed on the same day still produces the same dataset. */
const seedAnchor = new Date()
seedAnchor.setUTCHours(9, 12, 0, 0)
export const NOW = seedAnchor.getTime()
const iso = (t) => new Date(t).toISOString()
const pad = (n, w = 4) => String(n).padStart(w, '0')
const slugPart = (s) => s.toLowerCase().replace(/[^a-z]/g, '')
const personEmail = (f, l, dom) => slugPart(f) + '.' + slugPart(l) + '@' + dom

export function buildSeed() {
  /* ------------------------------ clients ------------------------------ */
  const clients = CLIENT_NAMES.map(([name, industry], i) => {
    const start = NOW - int(120, 1500) * DAY
    const cf = pick(FIRST)
    const cl = pick(LAST)
    const domain = slugPart(name.split(/\s+/)[0]) + '.co.zw'
    return {
      id: 'cl_' + pad(i + 1, 3),
      name,
      industry,
      code: name.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase() + pad(i + 1, 2),
      contactName: cf + ' ' + cl,
      contactEmail: personEmail(cf, cl, domain),
      contactPhone: '+263 7' + int(1, 8) + ' ' + int(100, 999) + ' ' + int(1000, 9999),
      city: pick(CITIES),
      address: int(1, 240) + ' ' + pick(STREETS) + ' ' + pick(['Ave', 'Rd', 'St', 'Drive']),
      status: weighted([['active', 78], ['onboarding', 10], ['suspended', 6], ['churned', 6]]),
      tier: weighted([['platinum', 18], ['gold', 30], ['silver', 34], ['bronze', 18]]),
      contractValue: int(4, 92) * 1000,
      contractStart: iso(start),
      contractEnd: iso(start + int(365, 1460) * DAY),
      slaResponseMins: pick([15, 20, 30, 45, 60]),
      satisfaction: float(3.1, 5, 1),
      notes: '',
      createdAt: iso(start),
    }
  })

  /* ------------------------------- sites ------------------------------- */
  const sites = []
  clients.forEach((c) => {
    const n = weighted([[1, 34], [2, 30], [3, 22], [4, 14]])
    for (let s = 0; s < n; s++) {
      const suffix = pick(['North', 'South', 'East', 'West', 'Central', 'Annex', 'Depot', 'Gate ' + (s + 1)])
      sites.push({
        id: 'st_' + pad(sites.length + 1, 3),
        clientId: c.id,
        name: n === 1
          ? c.name.split(/\s+/).slice(0, 2).join(' ') + ' Main'
          : c.name.split(/\s+/)[0] + ' ' + suffix,
        code: c.code + '-S' + (s + 1),
        type: pick(SITE_TYPES),
        city: chance(0.75) ? c.city : pick(CITIES),
        address: int(1, 300) + ' ' + pick(['Industrial', 'Airport', 'Lomagundi', 'Seke', 'Second', 'Union']) + ' ' + pick(['Rd', 'Ave', 'Way']),
        riskLevel: weighted([['low', 26], ['medium', 40], ['high', 24], ['critical', 10]]),
        guardsRequired: int(1, 5),
        coverage: pick(['24/7', '12h Day', '12h Night', 'Business Hours', 'Weekend Only']),
        checkpoints: int(4, 18),
        lat: float(-26.5, -17.6, 4),
        lng: float(25.8, 32.6, 4),
        status: c.status === 'churned' ? 'inactive' : weighted([['active', 88], ['inactive', 6], ['pending', 6]]),
        openedAt: iso(NOW - int(30, 1200) * DAY),
      })
    }
  })

  /* ------------------------------ guards ------------------------------- */
  const guards = []
  const activeSitesEarly = sites.filter((s) => s.status === 'active')
  for (let i = 0; i < 140; i++) {
    const f = pick(FIRST)
    const l = pick(LAST)
    const hire = NOW - int(30, 2600) * DAY
    const status = weighted([['active', 74], ['on_leave', 9], ['training', 7], ['suspended', 4], ['inactive', 6]])
    guards.push({
      id: 'gd_' + pad(i + 1, 3),
      employeeNo: 'SG-' + pad(1000 + i, 4),
      firstName: f,
      lastName: l,
      name: f + ' ' + l,
      email: personEmail(f, l, 'sentinelops.co.zw'),
      phone: '+263 7' + int(1, 8) + ' ' + int(100, 999) + ' ' + int(1000, 9999),
      rank: pick(RANKS),
      grade: pick(['A', 'B', 'C', 'C', 'D']),
      licenseNo: 'ZRP' + int(100000, 999999),
      licenseExpiry: iso(NOW + int(-60, 700) * DAY),
      siteId: null,   // deployment is allocated deliberately below
      hourlyRate: float(3.2, 11.5, 2),
      hireDate: iso(hire),
      status,
      certifications: pickN(CERTS, int(1, 5)),
      rating: float(2.6, 5, 1),
      incidentsHandled: int(0, 64),
      shiftsCompleted: int(12, 720),
      armed: chance(0.28),
      emergencyContact: pick(FIRST) + ' ' + pick(LAST),
      address: int(1, 90) + ' ' + pick(['Mbare', 'Highfield', 'Glen View', 'Waterfalls', 'Kuwadzana', 'Budiriro', 'Warren Park', 'Mufakose', 'Dzivarasekwa', 'Mabvuku', 'Tafara', 'Sunningdale']),
      createdAt: iso(hire),
    })
  }

  /* ---------------------------- deployment -----------------------------
   * Allocate officers to sites against each site's contracted requirement
   * rather than at random, so the estate looks like a real one: most posts
   * covered, a handful genuinely short, a small bench in reserve. Those
   * real gaps are what the intelligence engine should surface.
   * -------------------------------------------------------------------- */
  {
    const pool = guards.filter((g) => g.status === 'active')
    const order = pickN(activeSitesEarly, activeSitesEarly.length)
    let gi = 0
    order.forEach((site, idx) => {
      // deliberately under-staff roughly one site in seven
      const shortfall = idx % 7 === 3 ? Math.min(2, site.guardsRequired - 1) : 0
      const target = Math.max(0, site.guardsRequired - shortfall)
      for (let n = 0; n < target && gi < pool.length; n++) pool[gi++].siteId = site.id
    })
    // whatever is left stays on the bench, available for cover
    while (gi < pool.length) pool[gi++].siteId = null
  }

  /* ------------------- shifts (roster: -21d .. +14d) -------------------- */
  const shifts = []
  const activeGuards = guards.filter((g) => g.status === 'active')
  const activeSites = sites.filter((s) => s.status === 'active')
  let sid = 1
  for (let d = -21; d <= 14; d++) {
    const day = NOW + d * DAY
    const dayStart = new Date(day)
    dayStart.setUTCHours(0, 0, 0, 0)
    let staffed = pickN(activeGuards, int(48, 74))
    // The first ten officers own the demo logins, so always roster them today and
    // the officer portal has a live shift to clock into.
    if (d === 0) {
      const demo = activeGuards.filter((g) => guards.indexOf(g) < 10)
      demo.forEach((g) => { if (!staffed.includes(g)) staffed.push(g) })
    }
    staffed.forEach((g) => {
      const site = sites.find((s) => s.id === g.siteId) || pick(activeSites)
      const type = weighted([['day', 58], ['night', 42]])
      const startH = type === 'day' ? pick([6, 7, 8]) : pick([18, 19, 20])
      const hours = pick([8, 10, 12, 12])
      const st = dayStart.getTime() + startH * 3600000
      const status = d < 0
        ? weighted([['completed', 86], ['no_show', 5], ['cancelled', 4], ['swapped', 5]])
        : d === 0
          ? (guards.indexOf(g) < 10
            ? weighted([['scheduled', 60], ['in_progress', 40]])
            : weighted([['in_progress', 55], ['scheduled', 30], ['completed', 15]]))
          : weighted([['scheduled', 72], ['confirmed', 28]])
      const OB = [
        'Booked on and took over the post from the outgoing officer. Keys and radio signed for.',
        'Perimeter walk completed. All gates secure, lighting working.',
        'Contractor vehicle admitted against a works order and escorted to the loading bay.',
        'Visitor register reconciled. All badges recovered.',
        'Delivery received and checked against the manifest. No discrepancy.',
        'Client duty manager did a walk round. No issues raised.',
        'Radio check with the control room. Signal good.',
        'Reported a faulty light on the east elevation to the control room.',
        'Handover completed and signed with the relieving officer.',
        'Quiet shift. Nothing further to report.',
      ]
      const obCount = status === 'no_show' ? 0 : int(1, 3)
      const book = []
      for (let b = 0; b < obCount; b++) {
        book.push({
          id: 'ob_' + sid + '_' + b,
          at: iso(st + (b + 1) * Math.floor((hours * 3600000) / (obCount + 1))),
          author: g.name,
          kind: b === 0 ? 'handover' : pick(['patrol', 'access', 'observation', 'radio']),
          note: OB[(sid + b) % OB.length],
        })
      }

      shifts.push({
        id: 'sh_' + pad(sid++, 5),
        occurrenceBook: book,
        guardId: g.id,
        siteId: site.id,
        clientId: site.clientId,
        date: iso(dayStart.getTime()).slice(0, 10),
        start: iso(st),
        end: iso(st + hours * 3600000),
        type,
        hours,
        overtime: chance(0.14) ? int(1, 4) : 0,
        status,
        payRate: g.hourlyRate,
        notes: '',
      })
    })
  }

  /* ----------------------------- incidents ----------------------------- */
  const OBSERVERS = ['Officer on patrol observed', 'Control room flagged', 'Client representative reported', 'Automated alarm detected', 'Routine inspection uncovered']
  const PLACES = ['near the north perimeter', 'at the loading bay', 'in the visitor car park', 'on level 2', 'at the main gate', 'in the server room corridor', 'along the east fence line']
  const ACTIONS = ['Response team dispatched within SLA.', 'Area secured and cordoned.', 'Police notified and case number logged.', 'Client duty manager informed immediately.', 'CCTV footage retrieved and archived.']

  const incidents = []
  for (let i = 0; i < 264; i++) {
    const site = pick(sites)
    const g = pick(guards)
    const occurred = NOW - int(0, 180) * DAY - int(0, 86399) * 1000
    const severity = weighted([['low', 34], ['medium', 38], ['high', 20], ['critical', 8]])
    const age = (NOW - occurred) / DAY
    const status = age > 30
      ? weighted([['closed', 78], ['resolved', 18], ['open', 4]])
      : age > 7
        ? weighted([['resolved', 46], ['closed', 26], ['investigating', 18], ['open', 10]])
        : weighted([['open', 40], ['investigating', 34], ['resolved', 20], ['closed', 6]])
    const type = pick(INCIDENT_TYPES)
    const resolvedAt = status === 'resolved' || status === 'closed' ? occurred + int(1, 96) * 3600000 : null
    incidents.push({
      id: 'in_' + pad(i + 1, 4),
      ref: 'INC-' + new Date(occurred).getUTCFullYear() + '-' + pad(i + 1, 4),
      siteId: site.id,
      clientId: site.clientId,
      reportedBy: g.id,
      assignedTo: chance(0.82) ? pick(guards).id : null,
      type,
      severity,
      status,
      title: type + ' at ' + site.name,
      description: pick(OBSERVERS) + ' ' + type.toLowerCase() + ' ' + pick(PLACES) + '. ' + pick(ACTIONS),
      occurredAt: iso(occurred),
      reportedAt: iso(occurred + int(2, 90) * 60000),
      resolvedAt: resolvedAt ? iso(resolvedAt) : null,
      lossValue: chance(0.3) ? int(50, 24000) : 0,
      policeRef: chance(0.22) ? 'CR' + int(100, 999) + '/' + int(1, 12) + '/26' : null,
      injuries: chance(0.09) ? int(1, 3) : 0,
      visibleToClient: chance(0.85),
      tags: pickN(['cctv-evidence', 'sla-breach', 'repeat-offender', 'after-hours', 'weekend', 'high-value', 'insurance'], int(0, 3)),
      timeline: [],
    })
  }
  incidents.forEach((inc) => {
    const t0 = new Date(inc.reportedAt).getTime()
    const reporter = guards.find((g) => g.id === inc.reportedBy)
    const tl = [
      { at: inc.occurredAt, actor: 'System', action: 'Incident occurred', note: inc.type },
      { at: inc.reportedAt, actor: reporter ? reporter.name : 'Officer', action: 'Reported', note: 'Initial report filed from the mobile app' },
    ]
    if (inc.status !== 'open') {
      tl.push({ at: iso(t0 + int(10, 240) * 60000), actor: 'Control Room', action: 'Escalated to investigation', note: 'Severity set to ' + inc.severity })
    }
    if (inc.resolvedAt) {
      tl.push({ at: inc.resolvedAt, actor: 'Ops Manager', action: 'Resolved', note: 'Corrective action completed and signed off' })
    }
    if (inc.status === 'closed') {
      tl.push({ at: iso(new Date(inc.resolvedAt || inc.reportedAt).getTime() + 12 * 3600000), actor: 'Quality Assurance', action: 'Closed', note: 'Post-incident review complete' })
    }
    inc.timeline = tl
  })

  /* ------------------------------ patrols ------------------------------ */
  const patrols = []
  for (let i = 0; i < 210; i++) {
    const site = pick(activeSites)
    const g = pick(activeGuards)
    const started = NOW - int(0, 21) * DAY - int(0, 82000) * 1000
    const total = site.checkpoints
    const scanned = weighted([
      [total, 62],
      [Math.max(1, total - 1), 16],
      [Math.max(1, total - 2), 12],
      [Math.max(1, Math.floor(total * 0.6)), 10],
    ])
    const done = started + int(22, 95) * 60000
    const live = done > NOW
    patrols.push({
      id: 'pt_' + pad(i + 1, 4),
      ref: 'PTR-' + pad(i + 1, 4),
      siteId: site.id,
      clientId: site.clientId,
      guardId: g.id,
      startedAt: iso(started),
      completedAt: live ? null : iso(done),
      checkpointsTotal: total,
      checkpointsScanned: live ? int(1, total) : scanned,
      status: live ? 'in_progress' : scanned === total ? 'complete' : 'exceptions',
      exceptions: live ? 0 : total - scanned,
      route: pick(['Perimeter Loop', 'Internal Sweep', 'Roof & Plant', 'Parking Levels', 'Full Site Round']),
      durationMins: live ? null : Math.round((done - started) / 60000),
    })
  }

  /* ---------------------------- attendance ----------------------------- */
  const attendance = []
  let aid = 1
  shifts
    .filter((s) => s.status === 'completed' || s.status === 'in_progress' || s.status === 'no_show')
    .forEach((s) => {
      const planned = new Date(s.start).getTime()
      const late = chance(0.17)
      const absent = s.status === 'no_show'
      const inT = absent ? null : planned + (late ? int(11, 65) : int(-18, 8)) * 60000
      const outT = absent || s.status === 'in_progress'
        ? null
        : planned + (s.hours + s.overtime) * 3600000 + int(-14, 40) * 60000
      attendance.push({
        id: 'at_' + pad(aid++, 5),
        shiftId: s.id,
        guardId: s.guardId,
        siteId: s.siteId,
        clientId: s.clientId,
        date: s.date,
        clockIn: inT ? iso(inT) : null,
        clockOut: outT ? iso(outT) : null,
        hours: outT ? +((outT - inT) / 3600000).toFixed(2) : 0,
        status: absent ? 'absent' : late ? 'late' : s.status === 'in_progress' ? 'on_duty' : 'present',
        lateMins: !absent && late ? Math.round((inT - planned) / 60000) : 0,
        geoVerified: !absent && chance(0.9),
        method: pick(['biometric', 'qr-scan', 'nfc-tag', 'supervisor']),
      })
    })

  /* ----------------------------- invoices ------------------------------ */
  const invoices = []
  let ivn = 1
  clients
    .filter((c) => c.status !== 'churned')
    .forEach((c) => {
      const cSites = sites.filter((s) => s.clientId === c.id)
      for (let m = 5; m >= 0; m--) {
        const issue = NOW - m * 30 * DAY
        const due = issue + 30 * DAY
        const lineItems = cSites.map((s, li) => ({
          id: 'li_' + s.id + '_' + m + '_' + li,
          description: 'Manned guarding at ' + s.name,
          qty: int(320, 1450),
          unit: 'hrs',
          rate: float(4.4, 9.8, 2),
          amount: 0,
        }))
        if (chance(0.4)) {
          lineItems.push({
            id: 'li_x_' + c.id + '_' + m,
            description: pick(['Emergency response call-outs', 'Additional weekend coverage', 'Equipment hire for body cameras', 'Control room monitoring']),
            qty: int(1, 30),
            unit: 'ea',
            rate: float(20, 240, 2),
            amount: 0,
          })
        }
        lineItems.forEach((li) => { li.amount = +(li.qty * li.rate).toFixed(2) })
        const subtotal = +lineItems.reduce((a, li) => a + li.amount, 0).toFixed(2)
        const tax = +(subtotal * 0.15).toFixed(2)
        const overdue = due < NOW
        const status = m === 0
          ? weighted([['draft', 30], ['sent', 70]])
          : overdue
            ? weighted([['paid', 68], ['overdue', 24], ['sent', 8]])
            : weighted([['paid', 50], ['sent', 50]])
        invoices.push({
          id: 'iv_' + pad(ivn, 4),
          number: 'INV-2026-' + pad(ivn++, 4),
          clientId: c.id,
          issueDate: iso(issue),
          dueDate: iso(due),
          period: new Date(issue).toISOString().slice(0, 7),
          lineItems,
          subtotal,
          tax,
          total: +(subtotal + tax).toFixed(2),
          currency: 'USD',
          status,
          paidAt: status === 'paid' ? iso(due - int(0, 26) * DAY) : null,
          paymentMethod: status === 'paid' ? pick(['EFT', 'Card', 'Cash', 'Cheque']) : null,
          notes: '',
        })
      }
    })

  /* ------------------------------ payroll ------------------------------ *
   * Six monthly runs so year to date figures mean something. Every payslip
   * is produced by the same engine the API uses, so a recalculation always
   * reproduces the stored figures.
   * -------------------------------------------------------------------- */
  const payroll = []
  const payrollRuns = []
  let pid = 1
  const periods = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']
  const payable = guards.filter((g) => g.status !== 'inactive')

  periods.forEach((period, pi) => {
    const isCurrent = pi === periods.length - 1
    const runStatus = isCurrent
      ? weighted([['calculated', 45], ['approved', 55]])
      : 'paid'
    const runId = 'pr_run_' + period.replace('-', '')
    const cutoff = new Date(period + '-25T00:00:00Z').getTime()

    payable.forEach((g) => {
      const base = int(120, 208)
      const ot = chance(0.55) ? int(2, 34) : 0
      const holiday = chance(0.18) ? int(4, 12) : 0
      const nights = chance(0.5) ? int(2, 14) : 0
      const standby = chance(0.22) ? int(1, 6) : 0
      const adv = chance(0.15) ? int(20, 180) : 0
      const uniform = chance(0.1) ? int(5, 45) : 0

      const calc = computePayslip({
        hourlyRate: g.hourlyRate,
        baseHours: base,
        otHours: ot,
        holidayHours: holiday,
        nightShifts: nights,
        standbyDays: standby,
        advances: adv,
        unionMember: chance(0.8),
        uniformDeduction: uniform,
      })

      payroll.push({
        id: 'pr_' + pad(pid++, 5),
        runId,
        guardId: g.id,
        period,
        payDate: iso(cutoff),
        baseHours: base,
        otHours: ot,
        holidayHours: holiday,
        nightShifts: nights,
        standbyDays: standby,
        hourlyRate: g.hourlyRate,
        ...calc,
        // flat fields kept for the register and older list views
        deductions: calc.deductionsTotal,
        status: isCurrent ? (runStatus === 'approved' ? 'approved' : 'pending') : 'paid',
        paidAt: isCurrent ? null : iso(cutoff + 2 * DAY),
        paymentMethod: isCurrent ? null : pick(['EFT', 'EcoCash', 'Cash']),
        bankRef: isCurrent ? null : 'TRF' + int(1000000, 9999999),
      })
    })

    const slips = payroll.filter((x) => x.runId === runId)
    const sum = (k) => +slips.reduce((a, x) => a + (x[k] || 0), 0).toFixed(2)
    payrollRuns.push({
      id: runId,
      period,
      status: runStatus,
      headcount: slips.length,
      gross: sum('gross'),
      paye: sum('paye'),
      aidsLevy: sum('aidsLevy'),
      nssa: sum('nssa'),
      deductionsTotal: sum('deductionsTotal'),
      net: sum('net'),
      employerTotal: sum('employerTotal'),
      costToCompany: sum('costToCompany'),
      baseHours: slips.reduce((a, x) => a + x.baseHours, 0),
      otHours: slips.reduce((a, x) => a + x.otHours, 0),
      createdAt: iso(cutoff - 4 * DAY),
      calculatedAt: iso(cutoff - 2 * DAY),
      approvedBy: runStatus === 'calculated' ? null : pick(['Rutendo Chikafu', 'Tendai Marangwanda']),
      approvedAt: runStatus === 'calculated' ? null : iso(cutoff - DAY),
      paidAt: runStatus === 'paid' ? iso(cutoff + 2 * DAY) : null,
      notes: '',
    })
  })

  /* ------------------------------- assets ------------------------------ */
  const assets = []
  for (let i = 0; i < 168; i++) {
    const cat = pick(ASSET_CATS)
    const assigned = chance(0.62)
    const g = assigned ? pick(activeGuards) : null
    assets.push({
      id: 'as_' + pad(i + 1, 4),
      tag: 'AST-' + pad(i + 1, 4),
      name: cat + ' ' + pick(['Mk II', 'Pro', 'X1', 'Standard', 'HD', 'Compact']),
      category: cat,
      serial: cat.slice(0, 2).toUpperCase() + int(10000000, 99999999),
      assignedTo: g ? g.id : null,
      siteId: g ? g.siteId : chance(0.5) ? pick(activeSites).id : null,
      status: weighted([['in_service', 68], ['in_store', 18], ['maintenance', 8], ['lost', 3], ['retired', 3]]),
      condition: weighted([['excellent', 30], ['good', 42], ['fair', 20], ['poor', 8]]),
      purchaseDate: iso(NOW - int(60, 1900) * DAY),
      value: int(35, 4200),
      lastServiced: iso(NOW - int(5, 400) * DAY),
      warrantyEnd: iso(NOW + int(-300, 900) * DAY),
    })
  }

  /* ------------------- client portal service requests ------------------ */
  const REQ_TAIL = ['urgent review needed', 'for next month', 'following recent events', 'as discussed on Tuesday', 'Q3 planning', 'weekend cover']
  const REQ_LEAD = ['Please arrange', 'We would like to request', 'Following our call, kindly action', 'Our facilities team requires']
  const REQ_END = ['at the earliest convenience.', 'before the end of the week.', 'with a written response.', 'and confirm costing.']
  const REQ_REPLY = ['Acknowledged. Assigning to the regional supervisor.', 'Site assessment scheduled, report to follow.', 'Costing prepared and sent to your procurement contact.', 'Additional officer allocated from tomorrow night shift.']

  const requests = []
  const activeClients = clients.filter((x) => x.status === 'active')
  for (let i = 0; i < 74; i++) {
    const c = pick(activeClients)
    const cSites = sites.filter((s) => s.clientId === c.id)
    const created = NOW - int(0, 90) * DAY
    const type = pick(REQ_TYPES)
    requests.push({
      id: 'rq_' + pad(i + 1, 4),
      ref: 'REQ-' + pad(i + 1, 4),
      clientId: c.id,
      siteId: cSites.length ? pick(cSites).id : null,
      type,
      priority: weighted([['low', 26], ['normal', 40], ['high', 24], ['urgent', 10]]),
      subject: type + ', ' + pick(REQ_TAIL),
      description: pick(REQ_LEAD) + ' ' + type.toLowerCase() + ' ' + pick(REQ_END),
      status: weighted([['open', 30], ['in_progress', 24], ['awaiting_client', 12], ['resolved', 22], ['closed', 12]]),
      createdAt: iso(created),
      updatedAt: iso(created + int(1, 200) * 3600000),
      createdBy: c.contactName,
      assignedTo: chance(0.7) ? 'Ops Desk' : null,
      comments: chance(0.55)
        ? [{ id: 'cm_' + i, at: iso(created + 4 * 3600000), author: 'Ops Desk', body: pick(REQ_REPLY) }]
        : [],
    })
  }

  /* -------------------------------- users ------------------------------ */
  const users = [
    { id: 'us_001', name: 'Tendai Marangwanda', email: 'admin@sentinelops.co.zw', password: 'admin123', role: 'admin', title: 'Director of Operations', status: 'active', mfa: true },
    { id: 'us_002', name: 'Rutendo Chikafu', email: 'ops@sentinelops.co.zw', password: 'ops123', role: 'ops_manager', title: 'Operations Manager', status: 'active', mfa: true },
    { id: 'us_003', name: 'Tapiwa Mutasa', email: 'supervisor@sentinelops.co.zw', password: 'super123', role: 'supervisor', title: 'Regional Supervisor', status: 'active', mfa: false },
    { id: 'us_004', name: 'Precious Nyoni', email: 'finance@sentinelops.co.zw', password: 'finance123', role: 'finance', title: 'Finance Controller', status: 'active', mfa: true },
    { id: 'us_005', name: clients[0].contactName, email: 'client@zambezi.co.zw', password: 'client123', role: 'client', clientId: clients[0].id, title: 'Facilities Director', status: 'active', mfa: false },
    { id: 'us_006', name: clients[1].contactName, email: 'client@msasa.co.zw', password: 'client123', role: 'client', clientId: clients[1].id, title: 'Head of Site Security', status: 'active', mfa: false },
  ]
  guards.slice(0, 10).forEach((g, i) => {
    users.push({
      id: 'us_1' + pad(i, 2),
      name: g.name,
      email: g.email,
      password: 'guard123',
      role: 'guard',
      guardId: g.id,
      title: g.rank,
      status: g.status === 'active' ? 'active' : 'disabled',
      mfa: false,
    })
  })
  users.forEach((u) => {
    u.lastLogin = iso(NOW - int(0, 260) * 3600000)
    u.createdAt = iso(NOW - int(40, 900) * DAY)
    u.avatarHue = int(0, 359)
  })

  /* -------------------------------- audit ------------------------------ */
  const AUD = [
    ['login', 'auth'], ['create', 'incident'], ['update', 'shift'], ['approve', 'payroll'],
    ['export', 'report'], ['delete', 'asset'], ['update', 'client'], ['create', 'invoice'],
    ['role_change', 'user'], ['failed_login', 'auth'], ['view', 'client_portal'], ['update', 'site'],
  ]
  const audit = []
  for (let i = 0; i < 260; i++) {
    const entry = pick(AUD)
    const u = pick(users)
    audit.push({
      id: 'au_' + pad(i + 1, 4),
      at: iso(NOW - int(0, 60) * DAY - int(0, 86400) * 1000),
      actorId: u.id,
      actorName: u.name,
      actorRole: u.role,
      action: entry[0],
      entity: entry[1],
      entityId: entry[1].slice(0, 2) + '_' + pad(int(1, 400), 4),
      severity: entry[0] === 'failed_login' || entry[0] === 'delete' ? 'warning' : entry[0] === 'role_change' ? 'critical' : 'info',
      ip: int(41, 197) + '.' + int(0, 255) + '.' + int(0, 255) + '.' + int(1, 254),
      agent: pick(['Chrome/128 · Windows', 'Safari/17 · macOS', 'SentinelOps Mobile/3.4 · Android', 'Edge/127 · Windows', 'Firefox/130 · Linux']),
    })
  }
  audit.sort((a, b) => (a.at < b.at ? 1 : -1))

  /* ---------------------------- notifications -------------------------- */
  const critical = incidents.find((i) => i.severity === 'critical')
  const notifications = [
    { id: 'nt_1', type: 'critical', title: 'Critical incident escalated', body: critical ? critical.title : 'Perimeter breach detected', at: iso(NOW - 12 * 60000), read: false, link: '/incidents' },
    { id: 'nt_2', type: 'warning', title: '3 officers flagged as no-show', body: 'Night roster, action required before 18:00', at: iso(NOW - 55 * 60000), read: false, link: '/shifts' },
    { id: 'nt_3', type: 'info', title: 'Invoice INV-2026-0031 paid', body: 'Payment of $18,420.50 received via EFT', at: iso(NOW - 3 * 3600000), read: false, link: '/invoices' },
    { id: 'nt_4', type: 'warning', title: '7 ZRP registrations expire within 30 days', body: 'Renew to avoid deployment restrictions', at: iso(NOW - 9 * 3600000), read: true, link: '/guards' },
    { id: 'nt_5', type: 'info', title: 'New client request received', body: 'Westgate Shopping Precinct wants additional coverage', at: iso(NOW - 26 * 3600000), read: true, link: '/requests' },
  ]

  /* ------------------ operational depth (seedOps.js) ------------------ */
  const posts = buildPosts(sites)
  const inspections = buildInspections(sites, guards, users, NOW)
  const leave = buildLeave(guards, NOW)
  const discipline = buildDiscipline(guards, incidents, NOW)
  const training = buildTraining(guards, NOW)
  const documents = buildDocuments(guards, NOW)
  // Real, photographed incidents sit at the top of the register.
  buildRealIncidents(sites, guards, NOW, [clients[0].id, clients[1].id]).forEach((inc) => incidents.unshift(inc))
  attachIncidentDetail(incidents, guards, NOW)

  return {
    clients, sites, guards, shifts, incidents, patrols, attendance,
    invoices, payroll, payrollRuns, assets, requests, users, audit, notifications,
    posts, inspections, leave, discipline, training, documents,
  }
}
