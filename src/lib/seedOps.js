import { pick, pickN, int, float, chance, weighted } from './rng'

/* ------------------------------------------------------------------ *
 * Second-stage seed: the operational depth that sits on top of the
 * core registers: posts and post orders, supervisor inspections,
 * leave, discipline, training, personnel documents, plus incident
 * evidence and corrective actions.
 * ------------------------------------------------------------------ */

const DAY = 86400000
const iso = (t) => new Date(t).toISOString()
const pad = (n, w = 4) => String(n).padStart(w, '0')

/* ------------------------------- posts ------------------------------ */
const POST_TYPES = [
  'Main Gatehouse', 'Control Room', 'Roving Patrol', 'Reception Desk',
  'Loading Bay', 'Perimeter Tower', 'Staff Entrance', 'Car Park',
  'Cash Office', 'Server Room', 'Emergency Exit', 'Executive Floor',
]

const ORDERS = {
  'Main Gatehouse': [
    'Verify photographic ID for every visitor before raising the boom.',
    'Log all vehicle registrations, driver names and destination in the gate register.',
    'Search all outbound commercial vehicles against the gate pass.',
    'No unaccompanied contractor may pass without a signed works order.',
    'Boom remains down at all times between vehicle movements.',
  ],
  'Control Room': [
    'Maintain continuous CCTV observation; log every camera fault immediately.',
    'Answer all radio calls within 10 seconds and confirm receipt.',
    'Test the panic and duress alarms at the start of every shift.',
    'Escalate any level 3 alarm to the duty supervisor within 2 minutes.',
    'The occurrence book must be written up in ink and signed at handover.',
  ],
  'Roving Patrol': [
    'Complete the full checkpoint route once per hour; never in a fixed pattern.',
    'Scan every NFC tag. A missed tag is recorded as a patrol exception.',
    'Test all door and gate locks on each round and report defects.',
    'Report suspicious persons or vehicles to the control room before approaching.',
    'Carry a charged torch and a functioning radio at all times.',
  ],
  'Reception Desk': [
    'Issue and reconcile visitor badges; recover every badge on exit.',
    'Do not disclose staff movements, contact details or diary information.',
    'Escort all visitors to the lift lobby; visitors are never left unattended.',
    'Keep the reception area clear of unattended bags at all times.',
  ],
  'Loading Bay': [
    'Match every delivery to a purchase order before goods leave the vehicle.',
    'Seal numbers must be checked and recorded against the manifest.',
    'No personal vehicles are permitted in the bay during operating hours.',
    'Report any discrepancy in quantity or seal integrity immediately.',
  ],
  'Cash Office': [
    'Dual control applies. The room is never occupied by one person alone.',
    'The door remains locked; entry only against the authorised access list.',
    'Any cash-in-transit collection must be verified against the crew roster.',
    'Duress procedure: comply, observe, report. Do not intervene.',
  ],
  default: [
    'Remain at post until formally relieved by the incoming officer.',
    'Record all events in the occurrence book as they happen.',
    'Report any equipment defect to the control room without delay.',
    'Challenge and identify any person without a visible access badge.',
    'Follow the site emergency evacuation plan displayed at the post.',
  ],
}

export function buildPosts(sites) {
  const posts = []
  sites.forEach((s) => {
    const n = Math.max(1, Math.min(5, Math.round(s.guardsRequired / 2.6)))
    const types = pickN(POST_TYPES, n)
    types.forEach((type, i) => {
      const required = Math.max(1, Math.round(s.guardsRequired / n))
      posts.push({
        id: 'po_' + pad(posts.length + 1, 4),
        siteId: s.id,
        clientId: s.clientId,
        code: `${s.code}-P${i + 1}`,
        name: type,
        type,
        requiredGuards: required,
        coverage: i === 0 ? s.coverage : pick(['24/7', '12h Day', '12h Night', 'Business Hours']),
        armed: type === 'Cash Office' || type === 'Main Gatehouse' ? chance(0.5) : chance(0.12),
        criticality: weighted([['routine', 40], ['important', 38], ['critical', 22]]),
        orders: ORDERS[type] || ORDERS.default,
        instructions:
          `Post ${i + 1} of ${n} at ${s.name}. Relief is provided at shift change only. ` +
          `Escalation runs post → site supervisor → area manager → control room. ` +
          `${s.riskLevel === 'critical' || s.riskLevel === 'high'
            ? 'This is a high-risk post: armed response is on standby and reaction time is 12 minutes.'
            : 'Standard reaction protocol applies; armed response reaction time is 20 minutes.'}`,
        status: s.status === 'active' ? weighted([['active', 90], ['suspended', 10]]) : 'inactive',
        createdAt: s.openedAt,
      })
    })
  })
  return posts
}

/* ---------------------------- inspections --------------------------- */
const CHECKLIST = [
  {
    name: 'Presentation & Discipline',
    items: [
      'Uniform complete, clean and correctly worn',
      'Officer alert, standing and correctly posted',
      'Appointment certificate and ZRP registration card carried',
      'Radio present, charged and on the correct channel',
    ],
  },
  {
    name: 'Access Control',
    items: [
      'Visitor register complete and legible',
      'Outbound vehicle searches being conducted',
      'All access points manned or secured',
      'Identification verified before entry granted',
    ],
  },
  {
    name: 'Post & Documentation',
    items: [
      'Occurrence book written up and current',
      'Post orders available and understood at the post',
      'Emergency contact list displayed',
      'Handover conducted and signed',
    ],
  },
  {
    name: 'Site Condition',
    items: [
      'Perimeter fence and gates intact',
      'Security lighting fully operational',
      'CCTV cameras functional and unobstructed',
      'Fire equipment in date and accessible',
    ],
  },
]

const FINDING_TEXT = [
  'Occurrence book had not been written up since the start of shift.',
  'Perimeter lighting on the east elevation is out. Reported to the client facilities team.',
  'Officer could not locate the post orders file at the gatehouse.',
  'Visitor register showed three entries without exit times recorded.',
  'Two CCTV cameras on level 2 are showing a black image.',
  'Officer was seated at the post and slow to respond to challenge.',
  'Radio battery flat; spare battery not available at the post.',
  'Outbound vehicles were not being searched during the observation period.',
  'Fire extinguisher at the loading bay is past its service date.',
  'Handover between the night and day shift was not signed by either officer.',
]

const ACTION_TEXT = [
  'Retrain the officer on occurrence book discipline; re-inspect within 7 days.',
  'Raise a defect notice with the client and confirm a repair date.',
  'Reprint and laminate the post orders; supervisor to confirm placement.',
  'Issue a verbal warning and record it against the officer file.',
  'Escalate the CCTV fault to the client technical contact in writing.',
  'Replace the radio battery and add a spare to the post inventory.',
  'Brief the full site team at the next parade on search procedure.',
  'Schedule an unannounced night visit within the next 14 days.',
]

export function buildInspections(sites, guards, users, NOW) {
  const activeSites = sites.filter((s) => s.status === 'active')
  const supervisors = guards.filter(
    (g) => g.status === 'active' && /Supervisor|Control Room/.test(g.rank)
  )
  const pool = supervisors.length ? supervisors : guards.filter((g) => g.status === 'active')
  const inspections = []

  for (let i = 0; i < 168; i++) {
    const site = pick(activeSites)
    const supervisor = pick(pool)
    const at = NOW - int(0, 75) * DAY - int(0, 80000) * 1000
    const type = weighted([
      ['routine', 44], ['spot_check', 26], ['night_visit', 18], ['client_joint', 12],
    ])

    // A site's own risk grading biases how well it inspects.
    const bias = { low: 0.93, medium: 0.87, high: 0.78, critical: 0.7 }[site.riskLevel] ?? 0.85
    const sections = CHECKLIST.map((sec) => ({
      name: sec.name,
      items: sec.items.map((q) => {
        const na = chance(0.06)
        return {
          q,
          result: na ? 'na' : chance(bias) ? 'pass' : 'fail',
          note: '',
        }
      }),
    }))
    const flat = sections.flatMap((s) => s.items)
    const scored = flat.filter((it) => it.result !== 'na')
    const passes = scored.filter((it) => it.result === 'pass').length
    const score = scored.length ? Math.round((passes / scored.length) * 100) : 100
    const fails = scored.filter((it) => it.result === 'fail')
    fails.forEach((f) => { f.note = pick(FINDING_TEXT) })

    const guardsChecked = pickN(
      guards.filter((g) => g.siteId === site.id && g.status === 'active'),
      int(0, 3)
    ).map((g) => ({
      guardId: g.id,
      uniform: chance(0.9) ? 'pass' : 'fail',
      alertness: chance(0.88) ? 'pass' : 'fail',
      knowledge: chance(0.8) ? 'pass' : 'fail',
      documentation: chance(0.85) ? 'pass' : 'fail',
      note: chance(0.25) ? pick(FINDING_TEXT) : '',
    }))

    const findings = fails.slice(0, 3).map((f, n) => ({
      id: `fd_${i}_${n}`,
      area: f.q,
      detail: f.note,
      severity: weighted([['low', 34], ['medium', 42], ['high', 20], ['critical', 4]]),
    }))

    const status = score >= 90
      ? weighted([['closed', 74], ['submitted', 26]])
      : weighted([['actioned', 42], ['submitted', 30], ['closed', 28]])

    inspections.push({
      id: 'ins_' + pad(i + 1, 4),
      ref: 'INSP-' + pad(i + 1, 4),
      siteId: site.id,
      clientId: site.clientId,
      supervisorId: supervisor.id,
      type,
      at: iso(at),
      durationMins: int(18, 75),
      score,
      maxScore: 100,
      sections,
      guardsChecked,
      findings,
      actionsRequired: findings.length
        ? findings.map((f, n) => ({
          id: `ia_${i}_${n}`,
          description: pick(ACTION_TEXT),
          owner: pick(['Site Supervisor', 'Area Manager', 'Client Facilities', 'Training Officer']),
          dueAt: iso(at + int(2, 21) * DAY),
          status: at + 14 * DAY < NOW ? weighted([['done', 66], ['open', 34]]) : weighted([['open', 72], ['done', 28]]),
        }))
        : [],
      summary: '',
      clientVisible: chance(0.8),
      status,
    })
  }

  inspections.forEach((ins) => {
    ins.summary =
      ins.score >= 95 ? 'Site inspected and found fully compliant. No corrective action required.'
        : ins.score >= 85 ? 'Site broadly compliant. Minor observations raised with the site supervisor on the day.'
        : ins.score >= 70 ? 'Several non-conformances observed. Corrective actions issued with dated deadlines.'
        : 'Significant non-compliance found. Escalated to the area manager; re-inspection scheduled.'
  })

  return inspections.sort((a, b) => (a.at < b.at ? 1 : -1))
}

/* ------------------------------- leave ------------------------------ */
const LEAVE_TYPES = ['annual', 'sick', 'unpaid', 'compassionate', 'study', 'maternity']
const LEAVE_REASON = {
  annual: ['Family holiday', 'Rest days accrued', 'Personal time', 'Wedding'],
  sick: ['Medical certificate submitted', 'Hospital admission', 'Flu, 3 days', 'Injury on duty follow-up'],
  unpaid: ['Personal matter', 'Extended family obligation'],
  compassionate: ['Bereavement in the immediate family', 'Funeral attendance'],
  study: ['ZRP Grade B examination', 'First aid recertification course'],
  maternity: ['Statutory maternity leave'],
}

export function buildLeave(guards, NOW) {
  const leave = []
  const eligible = guards.filter((g) => g.status !== 'inactive')

  for (let i = 0; i < 132; i++) {
    const g = pick(eligible)
    const type = weighted([
      ['annual', 42], ['sick', 30], ['unpaid', 10], ['compassionate', 9], ['study', 6], ['maternity', 3],
    ])
    const offset = int(-70, 45)
    const days = type === 'maternity' ? int(60, 98) : type === 'annual' ? int(3, 21) : int(1, 6)
    const start = NOW + offset * DAY
    const requested = start - int(3, 30) * DAY
    const future = start > NOW
    const status = future
      ? weighted([['pending', 42], ['approved', 46], ['rejected', 12]])
      : weighted([['approved', 74], ['taken', 0], ['rejected', 12], ['cancelled', 14]])

    leave.push({
      id: 'lv_' + pad(i + 1, 4),
      ref: 'LV-' + pad(i + 1, 4),
      guardId: g.id,
      type,
      startDate: iso(start).slice(0, 10),
      endDate: iso(start + days * DAY).slice(0, 10),
      days,
      reason: pick(LEAVE_REASON[type]),
      status,
      requestedAt: iso(requested),
      approvedBy: status === 'approved' || status === 'rejected' ? pick(['Rutendo Chikafu', 'Tapiwa Mutasa', 'Tendai Marangwanda']) : null,
      decidedAt: status === 'approved' || status === 'rejected' ? iso(requested + int(1, 6) * DAY) : null,
      coveredBy: status === 'approved' && chance(0.62) ? pick(eligible).id : null,
      notes: status === 'rejected' ? pick(['Insufficient cover available for that period.', 'Clashes with an approved request from the same post.', 'Notice period not met.']) : '',
      balanceBefore: int(6, 26),
    })
  }
  return leave.sort((a, b) => (a.startDate < b.startDate ? 1 : -1))
}

/* ---------------------------- discipline ---------------------------- */
const DISC_TYPES = ['verbal_warning', 'written_warning', 'final_warning', 'suspension', 'dismissal', 'commendation']
const DISC_CATEGORIES = [
  'Late arrival', 'Absence without leave', 'Sleeping on duty', 'Uniform non-compliance',
  'Post abandonment', 'Failure to complete patrol', 'Insubordination', 'Occurrence book neglect',
  'Mobile phone use on post', 'Client complaint', 'Negligence of duty', 'Alcohol on duty',
]
const COMMEND_CATEGORIES = [
  'Prevented theft in progress', 'Excellent client feedback', 'Perfect attendance quarter',
  'Apprehended intruder', 'First aid intervention', 'Exemplary inspection score',
]

export function buildDiscipline(guards, incidents, NOW) {
  const records = []
  const pool = guards.filter((g) => g.status !== 'inactive')

  for (let i = 0; i < 74; i++) {
    const g = pick(pool)
    const isCommendation = chance(0.22)
    const type = isCommendation ? 'commendation' : weighted([
      ['verbal_warning', 40], ['written_warning', 32], ['final_warning', 15], ['suspension', 9], ['dismissal', 4],
    ])
    const at = NOW - int(2, 420) * DAY
    const validity = { verbal_warning: 90, written_warning: 180, final_warning: 365, suspension: 365, dismissal: 3650, commendation: 3650 }[type]
    const expires = at + validity * DAY

    records.push({
      id: 'dp_' + pad(i + 1, 4),
      ref: (isCommendation ? 'COM-' : 'DR-') + pad(i + 1, 4),
      guardId: g.id,
      type,
      category: isCommendation ? pick(COMMEND_CATEGORIES) : pick(DISC_CATEGORIES),
      description: isCommendation
        ? pick([
          'Recognised by the client for outstanding conduct during an incident.',
          'Maintained a perfect attendance and punctuality record across the quarter.',
          'Acted decisively to prevent a loss and secured the scene before response arrived.',
          'Scored 100% on two consecutive unannounced supervisor inspections.',
        ])
        : pick([
          'Officer reported for duty 45 minutes after shift start without notifying the control room.',
          'Post found unattended during an unannounced supervisor visit.',
          'Failed to scan six consecutive checkpoints across two patrol rounds.',
          'Client duty manager submitted a written complaint regarding conduct at reception.',
          'Occurrence book not written up for the duration of a 12-hour shift.',
          'Observed using a personal mobile phone while manning the access control point.',
        ]),
      incidentId: !isCommendation && chance(0.2) ? pick(incidents).id : null,
      issuedBy: pick(['Rutendo Chikafu', 'Tapiwa Mutasa', 'Tendai Marangwanda']),
      issuedAt: iso(at),
      expiresAt: iso(expires),
      status: expires < NOW ? 'expired' : weighted([['active', 84], ['appealed', 10], ['overturned', 6]]),
      acknowledged: chance(0.82),
      sanction: type === 'suspension' ? `${int(1, 5)} days without pay` : type === 'dismissal' ? 'Contract terminated' : null,
    })
  }
  return records.sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1))
}

/* ----------------------------- training ----------------------------- */
const COURSES = [
  { name: 'Guard Registration Grade C', provider: 'Zimbabwe Security Training Institute', months: 60 },
  { name: 'Guard Registration Grade B', provider: 'Zimbabwe Security Training Institute', months: 60 },
  { name: 'Guard Registration Grade A', provider: 'Zimbabwe Security Training Institute', months: 60 },
  { name: 'Firearm Competency (Handgun)', provider: 'Borrowdale Range Services', months: 24 },
  { name: 'First Aid Level 3', provider: 'St John Ambulance Zimbabwe', months: 24 },
  { name: 'Fire Marshal & Evacuation', provider: 'FireSafe Zimbabwe', months: 12 },
  { name: 'CCTV Control Room Operations', provider: 'Sentinel Academy', months: 36 },
  { name: 'Conflict De-escalation', provider: 'Sentinel Academy', months: 24 },
  { name: 'Cash-in-Transit Procedures', provider: 'Armour Cash Services', months: 12 },
  { name: 'K9 Handling Level 2', provider: 'Canine Unit Trust', months: 36 },
  { name: 'Access Control Systems', provider: 'Sentinel Academy', months: 24 },
  { name: 'Occupational Health & Safety', provider: 'SafeWork Zimbabwe', months: 24 },
  { name: 'Customer Service for Security', provider: 'Sentinel Academy', months: 36 },
  { name: 'Report Writing & Statements', provider: 'Sentinel Academy', months: 36 },
]

export function buildTraining(guards, NOW) {
  const training = []
  guards.forEach((g) => {
    const courses = pickN(COURSES, int(2, 6))
    courses.forEach((c, i) => {
      const scheduled = chance(0.08)
      const completed = NOW - int(20, Math.min(1400, c.months * 26)) * DAY
      const expires = completed + c.months * 30.44 * DAY
      const daysLeft = (expires - NOW) / DAY
      training.push({
        id: 'tr_' + pad(training.length + 1, 5),
        guardId: g.id,
        course: c.name,
        provider: c.provider,
        completedAt: scheduled ? null : iso(completed),
        scheduledFor: scheduled ? iso(NOW + int(3, 60) * DAY) : null,
        expiresAt: scheduled ? null : iso(expires),
        score: scheduled ? null : int(58, 100),
        certificateNo: scheduled ? null : 'CERT-' + int(100000, 999999),
        hours: pick([8, 16, 24, 40, 80]),
        status: scheduled ? 'scheduled' : daysLeft < 0 ? 'expired' : daysLeft < 60 ? 'expiring' : 'valid',
        mandatory: i === 0 || c.name.startsWith('ZRP') || c.name.startsWith('First Aid'),
      })
    })
  })
  return training
}

/* ---------------------------- documents ----------------------------- */
const DOC_TYPES = [
  { type: 'National ID', expires: false, mandatory: true },
  { type: 'Employment Contract', expires: false, mandatory: true },
  { type: 'ZRP Guard Registration', expires: true, mandatory: true },
  { type: 'Police Clearance', expires: true, mandatory: true },
  { type: 'Medical Certificate', expires: true, mandatory: true },
  { type: 'Firearm Competency Certificate', expires: true, mandatory: false },
  { type: 'Bank Details Confirmation', expires: false, mandatory: true },
  { type: 'Curriculum Vitae', expires: false, mandatory: false },
  { type: 'Proof of Residence', expires: true, mandatory: false },
  { type: 'Next of Kin Form', expires: false, mandatory: true },
]

export function buildDocuments(guards, NOW) {
  const documents = []
  guards.forEach((g) => {
    DOC_TYPES.forEach((d) => {
      const missing = !d.mandatory ? chance(0.35) : chance(0.06)
      if (missing) {
        documents.push({
          id: 'dc_' + pad(documents.length + 1, 5),
          guardId: g.id,
          type: d.type,
          name: `${d.type} ${g.employeeNo}`,
          mandatory: d.mandatory,
          uploadedAt: null,
          expiresAt: null,
          status: 'missing',
          sizeKb: 0,
          mime: null,
          verifiedBy: null,
        })
        return
      }
      const uploaded = NOW - int(10, 1500) * DAY
      const expires = d.expires ? uploaded + int(180, 1100) * DAY : null
      const daysLeft = expires ? (expires - NOW) / DAY : Infinity
      documents.push({
        id: 'dc_' + pad(documents.length + 1, 5),
        guardId: g.id,
        type: d.type,
        name: `${d.type.toLowerCase().replace(/\s+/g, '-')}-${g.employeeNo}.pdf`,
        mandatory: d.mandatory,
        uploadedAt: iso(uploaded),
        expiresAt: expires ? iso(expires) : null,
        status: daysLeft < 0 ? 'expired' : daysLeft < 45 ? 'expiring' : 'valid',
        sizeKb: int(46, 4800),
        mime: pick(['application/pdf', 'image/jpeg', 'image/png']),
        verifiedBy: chance(0.8) ? pick(['Rutendo Chikafu', 'Precious Nyoni', 'HR Desk']) : null,
      })
    })
  })
  return documents
}

/* ----------------- incident evidence & corrective actions ----------- */
const EVIDENCE_KINDS = [
  { type: 'photo', mime: 'image/jpeg', names: ['scene-wide.jpg', 'damage-detail.jpg', 'point-of-entry.jpg', 'vehicle-plate.jpg', 'recovered-items.jpg'] },
  { type: 'video', mime: 'video/mp4', names: ['cctv-cam04-clip.mp4', 'bodycam-officer.mp4', 'gate-approach.mp4'] },
  { type: 'document', mime: 'application/pdf', names: ['officer-statement.pdf', 'police-report.pdf', 'client-acknowledgement.pdf', 'occurrence-book-extract.pdf'] },
  { type: 'audio', mime: 'audio/mpeg', names: ['radio-log.mp3', 'witness-interview.mp3'] },
]

const CORRECTIVE = [
  'Increase patrol frequency on the affected route to twice hourly for 14 days.',
  'Repair and re-test the perimeter beam sensor; confirm with the client in writing.',
  'Rebrief the full site team on access control procedure at the next parade.',
  'Deploy an additional officer to the post during the identified vulnerable window.',
  'Install supplementary lighting at the point of entry.',
  'Review and reissue the post orders for this position.',
  'Recover CCTV footage and lodge it with the investigating officer.',
  'Conduct an unannounced night inspection within seven days.',
  'Recover losses through the client insurance claim process.',
  'Refer the responsible officer for retraining and record it on file.',
]

export function attachIncidentDetail(incidents, guards, NOW) {
  incidents.forEach((inc, i) => {
    // real incidents ship with their own photographs and actions
    if (inc.evidence && inc.evidence.length) return

    const t0 = new Date(inc.reportedAt).getTime()

    // evidence: severity drives how much was collected
    const n = weighted(
      inc.severity === 'critical' ? [[4, 30], [5, 30], [6, 25], [3, 15]]
        : inc.severity === 'high' ? [[2, 30], [3, 35], [4, 25], [1, 10]]
        : inc.severity === 'medium' ? [[1, 35], [2, 40], [3, 25]]
        : [[0, 30], [1, 45], [2, 25]]
    )
    const reporter = guards.find((g) => g.id === inc.reportedBy)
    inc.evidence = Array.from({ length: n }).map((_, e) => {
      const kind = pick(EVIDENCE_KINDS)
      return {
        id: `ev_${i}_${e}`,
        type: kind.type,
        name: pick(kind.names),
        mime: kind.mime,
        sizeKb: kind.type === 'video' ? int(2400, 48000) : kind.type === 'audio' ? int(400, 6000) : int(180, 5200),
        capturedAt: iso(t0 + int(-20, 180) * 60000),
        capturedBy: reporter ? reporter.name : 'Control Room',
        source: pick(['Mobile app', 'Body camera', 'CCTV export', 'Control room', 'Client supplied']),
        hash: 'sha256:' + int(100000, 999999).toString(16) + int(100000, 999999).toString(16),
      }
    })

    // corrective actions, only where the incident warranted them
    const wantsActions = inc.severity === 'critical' || inc.severity === 'high' || chance(0.35)
    inc.actions = wantsActions
      ? pickN(CORRECTIVE, int(1, 3)).map((description, a) => {
        const dueAt = t0 + int(2, 30) * DAY
        const overdue = dueAt < NOW
        return {
          id: `ca_${i}_${a}`,
          description,
          owner: pick(['Site Supervisor', 'Area Manager', 'Operations Manager', 'Client Facilities', 'Training Officer']),
          priority: inc.severity === 'critical' ? 'urgent' : weighted([['normal', 50], ['high', 35], ['urgent', 15]]),
          dueAt: iso(dueAt),
          status: inc.status === 'closed'
            ? 'done'
            : overdue ? weighted([['done', 55], ['open', 45]]) : weighted([['open', 70], ['done', 30]]),
          completedAt: null,
          createdAt: iso(t0 + int(30, 600) * 60000),
        }
      })
      : []
    inc.actions.forEach((a) => {
      if (a.status === 'done') a.completedAt = iso(new Date(a.createdAt).getTime() + int(1, 20) * DAY)
    })
  })
  return incidents
}
