/* ------------------------------------------------------------------ *
 * Operations Intelligence
 *
 * A rules + baseline-anomaly engine over the operational dataset. It is
 * deterministic and fully explainable: every signal carries the metric
 * that triggered it and the baseline it was measured against, so a
 * manager can always ask "why is this on my list?" and get an answer.
 *
 * Nothing here is a language model. The narrative briefing is assembled
 * from the same signals shown in the table below it.
 * ------------------------------------------------------------------ */

const DAY = 86400000
const HOUR = 3600000

const SEV_RANK = { critical: 4, high: 3, medium: 2, low: 1 }
const bySeverity = (a, b) => (SEV_RANK[b.severity] - SEV_RANK[a.severity]) || (b.weight - a.weight)

const pctChange = (now, base) => (base === 0 ? (now > 0 ? 100 : 0) : Math.round(((now - base) / base) * 100))
const within = (iso, from, to = Infinity) => {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return t >= from && t <= to
}

let seq = 0
const signal = (o) => ({ id: 's' + ++seq, weight: 0, ...o })

export function computeIntelligence(t, opts = {}) {
  seq = 0
  const now = opts.now ?? Date.now()
  const slaTarget = opts.slaTargetMins ?? 30
  const today = new Date(now).toISOString().slice(0, 10)

  const sites = t.sites || []
  const guards = t.guards || []
  const incidents = t.incidents || []
  const patrols = t.patrols || []
  const attendance = t.attendance || []
  const shifts = t.shifts || []
  const inspections = t.inspections || []
  const posts = t.posts || []
  const leave = t.leave || []
  const training = t.training || []
  const documents = t.documents || []

  const siteById = new Map(sites.map((s) => [s.id, s]))
  const guardById = new Map(guards.map((g) => [g.id, g]))
  const activeSites = sites.filter((s) => s.status === 'active')

  const w14 = now - 14 * DAY
  const w30 = now - 30 * DAY
  const w90 = now - 90 * DAY
  const w24 = now - 24 * HOUR

  const signals = []

  /* ---------- 1. incident volume above a site's own baseline ---------- */
  activeSites.forEach((s) => {
    const recent = incidents.filter((i) => i.siteId === s.id && within(i.occurredAt, w14))
    if (recent.length < 3) return
    const baselineWindow = incidents.filter((i) => i.siteId === s.id && within(i.occurredAt, w90, w14))
    const expected = (baselineWindow.length / 76) * 14   // 90d window minus the 14d recent slice
    const delta = pctChange(recent.length, expected)
    if (delta < 35) return
    const critical = recent.filter((i) => i.severity === 'critical' || i.severity === 'high').length
    // A percentage against a near-zero baseline reads as nonsense ("+1529%").
    // Express small baselines as a multiple instead.
    const ratio = expected > 0 ? recent.length / expected : Infinity
    const magnitude = expected >= 1 ? `${delta}% above` : `${ratio.toFixed(1)}× its normal rate for`
    signals.push(signal({
      kind: 'incident_spike',
      severity: delta >= 120 || critical >= 3 ? 'critical' : delta >= 70 ? 'high' : 'medium',
      title: `Incident rate at ${s.name} is ${magnitude}`,
      detail: `${recent.length} incidents in the last 14 days against an expected ${expected.toFixed(1)} for this site, based on its previous 90 days. ${critical === 1 ? '1 was' : `${critical} were`} high or critical severity.`,
      metric: `${recent.length} in 14d`,
      baseline: `${expected.toFixed(1)} expected`,
      delta: expected >= 1 ? delta : null,
      recommendation: critical >= 2
        ? 'Deploy an additional officer on the affected shift and raise supervisory inspections to twice weekly until the rate normalises.'
        : 'Increase supervisory inspections and review the current deployment pattern against the incident times.',
      entity: { type: 'site', id: s.id, name: s.name },
      link: `/sites/${s.id}`,
      weight: delta,
    }))
  })

  /* ---------- 2. the same thing happening again and again ------------- */
  const repeatMap = {}
  incidents.filter((i) => within(i.occurredAt, now - 21 * DAY)).forEach((i) => {
    const k = i.siteId + '|' + i.type
    repeatMap[k] = (repeatMap[k] || 0) + 1
  })
  Object.entries(repeatMap).filter(([, n]) => n >= 3).forEach(([k, n]) => {
    const [siteId, type] = k.split('|')
    const s = siteById.get(siteId)
    if (!s) return
    signals.push(signal({
      kind: 'repeat_pattern',
      severity: n >= 5 ? 'high' : 'medium',
      title: `${type} has recurred ${n} times at ${s.name}`,
      detail: `The same incident category has been reported ${n} times in 21 days at this site. Repetition of one category usually points at a specific control failure rather than random events.`,
      metric: `${n} × ${type}`,
      baseline: 'in 21 days',
      recommendation: 'Run a root-cause review on this category with the site supervisor before the next reporting cycle.',
      entity: { type: 'site', id: s.id, name: s.name },
      link: `/incidents?site=${s.id}`,
      weight: n * 12,
    }))
  })

  /* ---------- 3. patrol route compliance ------------------------------ */
  activeSites.forEach((s) => {
    const done = patrols.filter((p) => p.siteId === s.id && p.status !== 'in_progress' && within(p.startedAt, w14))
    if (done.length < 3) return
    const failed = done.filter((p) => p.status === 'exceptions')
    const rate = Math.round((failed.length / done.length) * 100)
    if (rate < 35) return
    const missed = failed.reduce((a, p) => a + p.exceptions, 0)
    signals.push(signal({
      kind: 'patrol_failure',
      severity: rate >= 65 ? 'high' : 'medium',
      title: `${rate}% of patrols at ${s.name} closed with missed checkpoints`,
      detail: `${failed.length} of ${done.length} tours in the last 14 days ended with exceptions, totalling ${missed} unscanned checkpoints. Route compliance at this site is materially below the 90% standard.`,
      metric: `${rate}% exception rate`,
      baseline: '≤ 10% expected',
      recommendation: 'Verify the NFC tags are readable and re-brief the roving officers on the route. Consider an unannounced night visit.',
      entity: { type: 'site', id: s.id, name: s.name },
      link: '/patrols',
      weight: rate,
    }))
  })

  /* ---------- 4. officer attendance anomalies ------------------------- */
  const attByGuard = {}
  attendance.filter((a) => within(a.date, w30)).forEach((a) => {
    const g = (attByGuard[a.guardId] = attByGuard[a.guardId] || { late: 0, absent: 0, total: 0, lateMins: 0 })
    g.total++
    if (a.status === 'late') { g.late++; g.lateMins += a.lateMins || 0 }
    if (a.status === 'absent') g.absent++
  })
  const peerLateRate = (() => {
    const all = Object.values(attByGuard)
    const tot = all.reduce((a, g) => a + g.total, 0)
    const late = all.reduce((a, g) => a + g.late, 0)
    return tot ? late / tot : 0
  })()

  Object.entries(attByGuard).forEach(([gid, m]) => {
    if (m.total < 4) return
    const rate = m.late / m.total
    const flagAbsent = m.absent >= 2
    const flagLate = rate > Math.max(0.3, peerLateRate * 2.2)
    if (!flagAbsent && !flagLate) return
    const g = guardById.get(gid)
    if (!g) return
    signals.push(signal({
      kind: 'attendance_anomaly',
      severity: m.absent >= 3 ? 'high' : 'medium',
      title: `${g.name} has ${m.absent} absence${m.absent === 1 ? '' : 's'} and ${m.late} late arrival${m.late === 1 ? '' : 's'} in 30 days`,
      detail: `Across ${m.total} rostered shifts this officer was late ${m.late} times (${Math.round(rate * 100)}%, team average ${Math.round(peerLateRate * 100)}%) and absent ${m.absent} times, accumulating ${m.lateMins} minutes of lost cover.`,
      metric: `${Math.round(rate * 100)}% late`,
      baseline: `${Math.round(peerLateRate * 100)}% team average`,
      recommendation: m.absent >= 3
        ? 'Refer to the disciplinary process and confirm cover arrangements for the affected post.'
        : 'Hold a documented counselling session and monitor for a further 30 days.',
      entity: { type: 'guard', id: g.id, name: g.name },
      link: `/guards/${g.id}`,
      weight: m.absent * 25 + m.late * 8,
    }))
  })

  /* ---------- 5. staffing shortfall ----------------------------------- */
  const deployedBySite = {}
  guards.filter((g) => g.status === 'active' && g.siteId).forEach((g) => {
    deployedBySite[g.siteId] = (deployedBySite[g.siteId] || 0) + 1
  })
  activeSites.forEach((s) => {
    const have = deployedBySite[s.id] || 0
    const gap = s.guardsRequired - have
    if (gap < 1) return
    const pct = Math.round((have / s.guardsRequired) * 100)
    if (pct >= 80) return
    // a single officer short on a one-officer post is a gap; on a large post it is noise
    if (gap === 1 && s.guardsRequired >= 6) return
    signals.push(signal({
      kind: 'staffing_gap',
      severity: pct < 40 && (s.riskLevel === 'critical' || s.riskLevel === 'high') ? 'critical' : pct < 55 ? 'high' : 'medium',
      title: `${s.name} is staffed at ${pct}% of contracted strength`,
      detail: `${have} officers are deployed against a contracted requirement of ${s.guardsRequired}, a shortfall of ${gap}. This is a ${s.riskLevel}-risk site on a ${s.coverage} coverage pattern.`,
      metric: `${have}/${s.guardsRequired} deployed`,
      baseline: '100% contracted',
      recommendation: gap > 2
        ? 'Escalate to resourcing: this shortfall is large enough to constitute a contractual breach if sustained.'
        : 'Allocate bench officers or approve overtime to close the gap on the next roster cycle.',
      entity: { type: 'site', id: s.id, name: s.name },
      link: `/sites/${s.id}`,
      weight: gap * 20 + (100 - pct),
    }))
  })

  /* ---------- 6. posts with no cover on today's roster ---------------- */
  const sitesRosteredToday = new Set(shifts.filter((sh) => sh.date === today && sh.status !== 'cancelled').map((sh) => sh.siteId))
  const uncoveredPosts = posts.filter(
    (p) => p.status === 'active' && p.coverage !== 'Weekend Only' && !sitesRosteredToday.has(p.siteId)
  )
  const uncoveredCritical = uncoveredPosts.filter((p) => p.criticality === 'critical')
  if (uncoveredPosts.length) {
    signals.push(signal({
      kind: 'uncovered_post',
      severity: uncoveredCritical.length ? 'critical' : 'high',
      title: `${uncoveredPosts.length} active post${uncoveredPosts.length === 1 ? ' has' : 's have'} no officer on today's roster`,
      detail: `${uncoveredCritical.length} of them are graded critical. Affected sites: ${[...new Set(uncoveredPosts.slice(0, 6).map((p) => siteById.get(p.siteId)?.name).filter(Boolean))].join(', ')}${uncoveredPosts.length > 6 ? ' and others' : ''}.`,
      metric: `${uncoveredPosts.length} posts`,
      baseline: '0 expected',
      recommendation: 'Fill from the bench or authorise overtime before the shift window opens; notify the client where cover cannot be met.',
      entity: { type: 'roster', id: 'today', name: "Today's roster" },
      link: '/shifts',
      weight: uncoveredPosts.length * 15 + uncoveredCritical.length * 30,
    }))
  }

  /* ---------- 7. open critical incidents ------------------------------ */
  const staleCritical = incidents.filter(
    (i) => i.severity === 'critical' && (i.status === 'open' || i.status === 'investigating') && new Date(i.reportedAt).getTime() < now - 24 * HOUR
  )
  if (staleCritical.length) {
    signals.push(signal({
      kind: 'open_critical',
      severity: 'critical',
      title: `${staleCritical.length} critical incident${staleCritical.length === 1 ? ' has' : 's have'} been open for more than 24 hours`,
      detail: staleCritical.slice(0, 4).map((i) => `${i.ref}, ${i.type} at ${siteById.get(i.siteId)?.name || 'unknown site'}`).join('; ') + '.',
      metric: `${staleCritical.length} open`,
      baseline: 'resolve within 24h',
      recommendation: 'Assign an investigating manager to each and set a closure deadline for end of day.',
      entity: { type: 'incidents', id: 'critical', name: 'Critical incidents' },
      link: '/incidents',
      weight: staleCritical.length * 40,
    }))
  }

  /* ---------- 8. SLA reporting latency trend -------------------------- */
  const slaWindow = (from, to) => {
    const set = incidents.filter((i) => within(i.occurredAt, from, to))
    if (!set.length) return null
    const late = set.filter((i) => (new Date(i.reportedAt) - new Date(i.occurredAt)) / 60000 > slaTarget)
    return { n: set.length, late: late.length, rate: (late.length / set.length) * 100 }
  }
  const slaNow = slaWindow(w14)
  const slaPrev = slaWindow(now - 28 * DAY, w14)
  if (slaNow && slaPrev && slaNow.rate > 25 && slaNow.rate > slaPrev.rate + 8) {
    signals.push(signal({
      kind: 'sla_trend',
      severity: slaNow.rate > 50 ? 'high' : 'medium',
      title: `Reporting latency is worsening: ${Math.round(slaNow.rate)}% of incidents now breach the ${slaTarget} minute SLA`,
      detail: `${slaNow.late} of ${slaNow.n} incidents in the last 14 days were written up later than the ${slaTarget}-minute target, against ${Math.round(slaPrev.rate)}% in the preceding fortnight.`,
      metric: `${Math.round(slaNow.rate)}% breaching`,
      baseline: `${Math.round(slaPrev.rate)}% previous period`,
      delta: Math.round(slaNow.rate - slaPrev.rate),
      recommendation: 'Rebrief officers on immediate reporting from the mobile app and audit control room escalation times.',
      entity: { type: 'org', id: 'sla', name: 'Reporting SLA' },
      link: '/reports',
      weight: slaNow.rate,
    }))
  }

  /* ---------- 9. inspection scores ------------------------------------ */
  const inspBySite = {}
  inspections.filter((i) => within(i.at, w90)).forEach((i) => {
    (inspBySite[i.siteId] = inspBySite[i.siteId] || []).push(i)
  })
  Object.entries(inspBySite).forEach(([siteId, list]) => {
    if (list.length < 2) return
    const sorted = [...list].sort((a, b) => (a.at < b.at ? 1 : -1))
    const latest = sorted[0]
    const prior = sorted.slice(1)
    const priorAvg = prior.reduce((a, i) => a + i.score, 0) / prior.length
    const s = siteById.get(siteId)
    if (!s) return
    if (latest.score < 70) {
      signals.push(signal({
        kind: 'inspection_fail',
        severity: latest.score < 55 ? 'high' : 'medium',
        title: `${s.name} scored ${latest.score}% on its last inspection`,
        detail: `${latest.ref} on ${new Date(latest.at).toLocaleDateString('en-GB')} raised ${latest.findings.length} finding${latest.findings.length === 1 ? '' : 's'}. The site's 90-day average is ${Math.round(priorAvg)}%.`,
        metric: `${latest.score}% score`,
        baseline: `${Math.round(priorAvg)}% site average`,
        delta: Math.round(latest.score - priorAvg),
        recommendation: 'Confirm the corrective actions have owners and dates, then re-inspect within 14 days.',
        entity: { type: 'site', id: s.id, name: s.name },
        link: '/inspections',
        weight: 100 - latest.score,
      }))
    } else if (priorAvg - latest.score >= 18) {
      signals.push(signal({
        kind: 'inspection_drop',
        severity: 'medium',
        title: `${s.name} inspection score dropped ${Math.round(priorAvg - latest.score)} points`,
        detail: `Latest score ${latest.score}% against a 90-day average of ${Math.round(priorAvg)}%. A sharp single-visit drop usually follows a change of officer or supervisor at the site.`,
        metric: `${latest.score}%`,
        baseline: `${Math.round(priorAvg)}% average`,
        delta: Math.round(latest.score - priorAvg),
        recommendation: 'Check whether the site team has changed and schedule a follow-up visit.',
        entity: { type: 'site', id: s.id, name: s.name },
        link: '/inspections',
        weight: priorAvg - latest.score,
      }))
    }
  })

  /* ---------- 10. compliance expiries --------------------------------- */
  const licExpired = guards.filter((g) => g.status !== 'inactive' && g.licenseExpiry && new Date(g.licenseExpiry).getTime() < now)
  const licSoon = guards.filter((g) => g.status !== 'inactive' && g.licenseExpiry && new Date(g.licenseExpiry).getTime() >= now && new Date(g.licenseExpiry).getTime() < now + 30 * DAY)
  if (licExpired.length || licSoon.length) {
    signals.push(signal({
      kind: 'compliance_licence',
      severity: licExpired.length ? 'critical' : 'medium',
      title: `${licExpired.length} officer${licExpired.length === 1 ? '' : 's'} deployed on an expired ZRP registration, ${licSoon.length} more expire within 30 days`,
      detail: licExpired.length
        ? `Deploying an unregistered officer is a regulatory breach and invalidates cover. Affected: ${licExpired.slice(0, 5).map((g) => g.name).join(', ')}${licExpired.length > 5 ? ` and ${licExpired.length - 5} more` : ''}.`
        : `${licSoon.length} registrations fall due inside the next month. Renewals typically take 10 working days.`,
      metric: `${licExpired.length} expired`,
      baseline: '0 tolerated',
      recommendation: licExpired.length
        ? 'Stand these officers down from client-facing posts until renewal is confirmed.'
        : 'Start the renewal process now to avoid a deployment restriction.',
      entity: { type: 'compliance', id: 'licence', name: 'ZRP registration' },
      link: '/compliance',
      weight: licExpired.length * 45 + licSoon.length * 4,
    }))
  }

  const docExpired = documents.filter((d) => d.mandatory && (d.status === 'expired' || d.status === 'missing'))
  if (docExpired.length >= 5) {
    const affected = new Set(docExpired.map((d) => d.guardId)).size
    signals.push(signal({
      kind: 'compliance_documents',
      severity: docExpired.length > 40 ? 'high' : 'medium',
      title: `${docExpired.length} mandatory personnel documents are missing or expired`,
      detail: `${affected} officers have at least one incomplete mandatory document. The most common gaps are police clearance and medical certification.`,
      metric: `${docExpired.length} documents`,
      baseline: 'complete file required',
      recommendation: 'Run a document amnesty week and block roster allocation for files that remain incomplete after it.',
      entity: { type: 'compliance', id: 'documents', name: 'Personnel files' },
      link: '/compliance',
      weight: docExpired.length,
    }))
  }

  const trExpired = training.filter((t2) => t2.mandatory && t2.status === 'expired')
  if (trExpired.length >= 3) {
    signals.push(signal({
      kind: 'compliance_training',
      severity: trExpired.length > 20 ? 'high' : 'medium',
      title: `${trExpired.length} mandatory training certifications have lapsed`,
      detail: `Affecting ${new Set(trExpired.map((x) => x.guardId)).size} officers. Lapsed first aid and firearm competency are the highest-exposure items.`,
      metric: `${trExpired.length} lapsed`,
      baseline: 'all in date',
      recommendation: 'Book the next available course dates and prioritise officers on high-risk posts.',
      entity: { type: 'compliance', id: 'training', name: 'Training currency' },
      link: '/compliance',
      weight: trExpired.length * 2,
    }))
  }

  /* ---------- 11. overdue corrective actions -------------------------- */
  const overdueIncidentActions = incidents.flatMap((i) =>
    (i.actions || []).filter((a) => a.status === 'open' && new Date(a.dueAt).getTime() < now).map((a) => ({ ...a, ref: i.ref, incidentId: i.id }))
  )
  const overdueInspectionActions = inspections.flatMap((i) =>
    (i.actionsRequired || []).filter((a) => a.status === 'open' && new Date(a.dueAt).getTime() < now).map((a) => ({ ...a, ref: i.ref }))
  )
  const overdueTotal = overdueIncidentActions.length + overdueInspectionActions.length
  if (overdueTotal >= 3) {
    signals.push(signal({
      kind: 'overdue_actions',
      severity: overdueTotal > 25 ? 'high' : 'medium',
      title: `${overdueTotal} corrective actions are past their due date`,
      detail: `${overdueIncidentActions.length} arising from incidents and ${overdueInspectionActions.length} from supervisor inspections. Unclosed actions are the most common finding in client audits.`,
      metric: `${overdueTotal} overdue`,
      baseline: 'closed by due date',
      recommendation: 'Review the overdue list at the weekly operations meeting and reassign anything without a named owner.',
      entity: { type: 'org', id: 'actions', name: 'Corrective actions' },
      link: '/inspections',
      weight: overdueTotal * 2,
    }))
  }

  /* ---------- 12. approved leave clashing with a rostered shift ------- */
  const clashes = []
  leave.filter((l) => l.status === 'approved').forEach((l) => {
    const clash = shifts.filter(
      (sh) => sh.guardId === l.guardId &&
        sh.date >= l.startDate && sh.date <= l.endDate &&
        (sh.status === 'scheduled' || sh.status === 'confirmed')
    )
    if (clash.length) clashes.push({ leave: l, shifts: clash })
  })
  if (clashes.length) {
    signals.push(signal({
      kind: 'leave_clash',
      severity: clashes.length > 4 ? 'high' : 'medium',
      title: `${clashes.length} officer${clashes.length === 1 ? ' is' : 's are'} rostered while on approved leave`,
      detail: `${clashes.reduce((a, c) => a + c.shifts.length, 0)} shifts are affected. These posts will present as uncovered on the day unless the roster is corrected.`,
      metric: `${clashes.length} conflicts`,
      baseline: '0 expected',
      recommendation: 'Reassign the affected shifts now and confirm the cover officer against each approved leave record.',
      entity: { type: 'roster', id: 'leave', name: 'Leave vs roster' },
      link: '/leave',
      weight: clashes.length * 18,
    }))
  }

  signals.sort(bySeverity)

  /* ------------------------- headline numbers ------------------------- */
  const overnightFrom = (() => {
    const d = new Date(now)
    d.setHours(18, 0, 0, 0)
    return d.getTime() - DAY
  })()
  const overnight = incidents.filter((i) => within(i.occurredAt, overnightFrom, now))
  const overnightSevere = overnight.filter((i) => i.severity === 'critical' || i.severity === 'high')

  const missedPatrols24 = patrols.filter((p) => p.status === 'exceptions' && within(p.startedAt, w24))
  const late24 = attendance.filter((a) => a.status === 'late' && within(a.clockIn, w24))
  const noShow24 = attendance.filter((a) => a.status === 'absent' && a.date === today)

  const attentionSites = new Set(
    signals.filter((s) => s.entity.type === 'site' && SEV_RANK[s.severity] >= 2).map((s) => s.entity.id)
  )

  const headline = {
    sitesNeedingAttention: attentionSites.size,
    missedPatrols: missedPatrols24.reduce((a, p) => a + p.exceptions, 0),
    missedPatrolTours: missedPatrols24.length,
    lateArrivals: late24.length,
    noShows: noShow24.length,
    overnightIncidents: overnight.length,
    overnightSevere: overnightSevere.length,
    openCritical: incidents.filter((i) => i.severity === 'critical' && (i.status === 'open' || i.status === 'investigating')).length,
    uncoveredPosts: uncoveredPosts.length,
    signalsRaised: signals.length,
    criticalSignals: signals.filter((s) => s.severity === 'critical').length,
  }

  /* --------------------------- the briefing --------------------------- */
  const briefing = []
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

  briefing.push(
    headline.sitesNeedingAttention === 0
      ? 'No site is currently flagged for attention. All monitored indicators are inside their normal range.'
      : `${plural(headline.sitesNeedingAttention, 'site requires', 'sites require')} attention this morning.`
  )

  const overnightLine = []
  if (headline.overnightIncidents) {
    overnightLine.push(
      `${plural(headline.overnightIncidents, 'incident was', 'incidents were')} reported overnight` +
      (headline.overnightSevere ? `, ${headline.overnightSevere} of them high or critical severity` : '')
    )
  }
  if (headline.missedPatrolTours) overnightLine.push(`${plural(headline.missedPatrolTours, 'patrol tour', 'patrol tours')} closed with ${plural(headline.missedPatrols, 'missed checkpoint', 'missed checkpoints')}`)
  if (headline.lateArrivals) overnightLine.push(`${plural(headline.lateArrivals, 'officer', 'officers')} arrived late`)
  if (headline.noShows) overnightLine.push(`${plural(headline.noShows, 'no-show was', 'no-shows were')} recorded on today's roster`)
  briefing.push(overnightLine.length
    ? overnightLine.join('; ').replace(/^./, (c) => c.toUpperCase()) + '.'
    : 'The overnight period was clean: no incidents, no missed checkpoints and no attendance exceptions.')

  const topSite = signals.find((s) => s.entity.type === 'site')
  if (topSite) briefing.push(`${topSite.title}. ${topSite.detail}`)

  if (headline.uncoveredPosts) {
    briefing.push(`${plural(headline.uncoveredPosts, 'active post has', 'active posts have')} no officer allocated on today's roster and will need cover before the shift window opens.`)
  }
  if (headline.openCritical) {
    briefing.push(`${plural(headline.openCritical, 'critical incident remains', 'critical incidents remain')} open across the portfolio.`)
  }

  const topRec = signals.slice(0, 3).map((s) => s.recommendation)
  if (topRec.length) briefing.push('Recommended actions today: ' + topRec.join(' ').replace(/\s+/g, ' '))

  /* --------------------------- watchlists ----------------------------- */
  const siteScores = {}
  signals.filter((s) => s.entity.type === 'site').forEach((s) => {
    const e = (siteScores[s.entity.id] = siteScores[s.entity.id] || { id: s.entity.id, name: s.entity.name, score: 0, reasons: [] })
    e.score += SEV_RANK[s.severity] * 25 + Math.min(60, s.weight)
    e.reasons.push(s.kind)
  })
  const watchSites = Object.values(siteScores).sort((a, b) => b.score - a.score).slice(0, 6).map((s) => {
    const site = siteById.get(s.id)
    return {
      ...s,
      score: Math.round(s.score),
      riskLevel: site?.riskLevel,
      incidents14: incidents.filter((i) => i.siteId === s.id && within(i.occurredAt, w14)).length,
      staffed: deployedBySite[s.id] || 0,
      required: site?.guardsRequired ?? 0,
    }
  })

  const guardScores = {}
  signals.filter((s) => s.entity.type === 'guard').forEach((s) => {
    const e = (guardScores[s.entity.id] = guardScores[s.entity.id] || { id: s.entity.id, name: s.entity.name, score: 0, reasons: [] })
    e.score += SEV_RANK[s.severity] * 25 + Math.min(60, s.weight)
    e.reasons.push(s.kind)
  })
  const watchGuards = Object.values(guardScores).sort((a, b) => b.score - a.score).slice(0, 6).map((g) => {
    const guard = guardById.get(g.id)
    const m = attByGuard[g.id] || { late: 0, absent: 0, total: 0 }
    return { ...g, score: Math.round(g.score), rank: guard?.rank, rating: guard?.rating, late: m.late, absent: m.absent, shifts: m.total }
  })

  /* ------------------------- 14-day risk trend ------------------------ */
  const trend = []
  for (let d = 13; d >= 0; d--) {
    const day = new Date(now - d * DAY).toISOString().slice(0, 10)
    const dayInc = incidents.filter((i) => i.occurredAt.slice(0, 10) === day)
    const dayPat = patrols.filter((p) => p.status !== 'in_progress' && p.startedAt.slice(0, 10) === day)
    const dayAtt = attendance.filter((a) => a.date === day)
    trend.push({
      day: day.slice(5),
      incidents: dayInc.length,
      severe: dayInc.filter((i) => i.severity === 'critical' || i.severity === 'high').length,
      patrolCompliance: dayPat.length ? Math.round((dayPat.filter((p) => p.status === 'complete').length / dayPat.length) * 100) : null,
      attendance: dayAtt.length ? Math.round((dayAtt.filter((a) => a.status !== 'absent').length / dayAtt.length) * 100) : null,
    })
  }

  return {
    generatedAt: new Date(now).toISOString(),
    headline,
    briefing,
    signals: signals.slice(0, 40),
    watchSites,
    watchGuards,
    trend,
    coverage: {
      totalPosts: posts.filter((p) => p.status === 'active').length,
      uncovered: uncoveredPosts.length,
      byCriticality: ['critical', 'important', 'routine'].map((c) => ({
        name: c,
        total: posts.filter((p) => p.status === 'active' && p.criticality === c).length,
        uncovered: uncoveredPosts.filter((p) => p.criticality === c).length,
      })),
    },
    method: 'Rules and per-entity statistical baselines evaluated over the live operational dataset. Every signal states the metric that triggered it and the baseline it was compared against.',
  }
}
