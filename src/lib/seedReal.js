import manifest from './evidenceManifest.json'

/* ------------------------------------------------------------------ *
 * Real incidents.
 *
 * These three carry actual photographs taken on site, served as static
 * assets from /public/evidence rather than stuffed into the database.
 * Each write-up describes what is genuinely visible in its photo set:
 * a dawn terrace sweep, a door left open with the keys still in it, and
 * fire equipment off its bracket blocking an escape route.
 * ------------------------------------------------------------------ */

const DAY = 86400000
const iso = (t) => new Date(t).toISOString()
const pad = (n, w = 3) => String(n).padStart(w, '0')

const REAL = [
  {
    ref: 'INC-2026-9001',
    folder: 'inc-9001',
    type: 'Suspicious Activity',
    severity: 'low',
    status: 'resolved',
    hoursAgo: 27,
    title: 'Reported movement on the communal terrace, dawn sweep found nothing',
    description:
      'Control room logged a resident report of movement on the second-floor communal terrace at 05:41. The officer on the external round swept the terrace, the seating area and the boundary line at first light.\n\n' +
      'No persons were found. The privacy screens, outdoor furniture and balustrade were intact, with no sign of forcing or damage. The boundary wall and treeline were checked from the terrace elevation. There was no sign of scaling and no disturbance to the ground below.\n\n' +
      'Photographs were taken of the terrace, the screen line and the garden elevation so the condition of the area at the time of the sweep is on record. The reporting resident was updated by the control room.',
    tags: ['after-hours'],
    timeline: [
      ['System', 'Incident occurred', 'Resident reported movement on the communal terrace'],
      ['Officer', 'Reported', 'Logged by the control room from the resident call at 05:41'],
      ['Officer', 'Terrace swept', 'Terrace, seating area and screen line checked at first light. Nothing found'],
      ['Officer', 'Boundary checked', 'Boundary wall and treeline observed from the terrace; no sign of scaling'],
      ['Control Room', 'Resident updated', 'Outcome relayed to the reporting resident'],
      ['Ops Manager', 'Resolved', 'Nil find recorded, with a photographic record of the site condition'],
    ],
    actions: [
      ['Add the communal terrace to the hourly night checkpoint route for 14 days.', 'Site Supervisor', 'normal', 6, 'open'],
    ],
  },
  {
    ref: 'INC-2026-9002',
    folder: 'inc-9002',
    type: 'Unauthorised Access',
    severity: 'high',
    status: 'resolved',
    hoursAgo: 21,
    title: 'Unit door found ajar with the keys still in the lock',
    description:
      'On the 06:00 internal round the officer found a unit door standing ajar with a set of keys still hanging in the exterior lock. The unit was unattended.\n\n' +
      'The officer announced at the threshold, received no answer, and did not enter beyond the doorway. From the threshold the living area was visible and appeared undisturbed, with furniture in place, television and wall sockets intact and nothing obviously removed.\n\n' +
      'The door was pulled to and secured, and the keys were recovered and booked into the control room key safe against a signed entry. Photographs were taken of the door, the lock with the keys in place, and the interior visible from the doorway, to record that nothing had been interfered with.',
    tags: ['after-hours', 'repeat-offender'],
    timeline: [
      ['System', 'Incident occurred', 'Door left unsecured with the keys in the lock'],
      ['Officer', 'Reported', 'Found on the 06:00 internal round and reported immediately'],
      ['Officer', 'Threshold announcement', 'Announced at the door; no answer received and the officer did not enter'],
      ['Officer', 'Premises secured', 'Door pulled to and secured; keys recovered from the lock'],
      ['Control Room', 'Keys booked in', 'Keys logged into the control room key safe against a signed entry'],
      ['Ops Manager', 'Resolved', 'Occupant contacted; keys collected against signature'],
    ],
    actions: [
      ['Contact the occupant and confirm the keys were collected against signature.', 'Site Supervisor', 'urgent', 1, 'done'],
      ['Rebrief the site team on the found-keys procedure and key-safe booking.', 'Site Supervisor', 'high', 5, 'open'],
      ['Raise with the managing agent. This is the third unsecured door report on this block this quarter.', 'Area Manager', 'normal', 10, 'open'],
    ],
  },
  {
    ref: 'INC-2026-9003',
    folder: 'inc-9003',
    type: 'Equipment Failure',
    severity: 'medium',
    status: 'investigating',
    hoursAgo: 9,
    title: 'Fire extinguisher off its bracket, obstructing the terrace fire exit',
    description:
      'The weekly fire equipment check found the CO2 extinguisher at the terrace exit standing loose on the floor instead of on its wall bracket, with the discharge horn resting against the screen panel and the body of the unit part-blocking the doorway.\n\n' +
      'A refuse bag had also been left on the floor at the same doorway, inside the marked escape path.\n\n' +
      'Both obstruct a designated escape route. The extinguisher itself is in date and shows no sign of discharge. The refuse bag was removed immediately. The extinguisher was left in position and photographed pending the bracket being refitted. The mounting appears to have been taken off the wall rather than to have failed.',
    tags: ['sla-breach'],
    timeline: [
      ['System', 'Incident occurred', 'Fire equipment found off its mounting at the terrace exit'],
      ['Officer', 'Reported', 'Raised from the weekly fire equipment check'],
      ['Officer', 'Escape route cleared', 'Refuse bag removed from the escape path'],
      ['Control Room', 'Escalated to investigation', 'Severity set to medium for obstruction of a designated escape route'],
    ],
    actions: [
      ['Refit the extinguisher wall bracket at the terrace exit and remount the unit.', 'Client Facilities', 'high', 3, 'open'],
      ['Confirm no other extinguishers on the block have been unmounted.', 'Site Supervisor', 'normal', 7, 'open'],
      ['Issue a written defect notice to the managing agent.', 'Area Manager', 'normal', 5, 'done'],
    ],
  },
]

export function buildRealIncidents(sites, guards, NOW, portalClientIds = []) {
  const usable = sites.filter((s) => s.status === 'active')
  // Prefer sites belonging to clients that actually have a portal login, so the
  // photographs are visible from the client side of the demo too.
  const portalSites = usable.filter((s) => portalClientIds.includes(s.clientId))
  const preferred = portalSites.length ? portalSites : usable.filter((s) => s.type === 'Residential Estate')
  const officers = guards.filter((g) => g.status === 'active')
  const out = []

  REAL.forEach((r, idx) => {
    const site = preferred[idx % Math.max(1, preferred.length)] || usable[idx] || usable[0]
    if (!site) return

    const reporter = officers.length ? officers[(idx * 7) % officers.length] : null
    const occurred = NOW - r.hoursAgo * 3600000
    const reported = occurred + (idx === 1 ? 4 : 9) * 60000
    const photos = manifest[r.folder] || []

    out.push({
      id: 'in_9' + pad(idx + 1),
      ref: r.ref,
      siteId: site.id,
      clientId: site.clientId,
      reportedBy: reporter ? reporter.id : null,
      assignedTo: reporter ? reporter.id : null,
      type: r.type,
      severity: r.severity,
      status: r.status,
      title: r.title,
      description: r.description,
      occurredAt: iso(occurred),
      reportedAt: iso(reported),
      resolvedAt: r.status === 'resolved' ? iso(reported + 3 * 3600000) : null,
      lossValue: 0,
      policeRef: null,
      injuries: 0,
      visibleToClient: true,
      tags: r.tags,
      timeline: r.timeline.map(([actor, action, note], i) => ({
        at: iso(reported + i * 22 * 60000),
        actor: actor === 'Officer' && reporter ? reporter.name : actor,
        action,
        note,
      })),
      evidence: photos.map((p, i) => ({
        id: 'ev_' + r.folder + '_' + i,
        type: 'photo',
        name: r.ref + '_' + p.name,
        mime: 'image/jpeg',
        sizeKb: p.sizeKb,
        url: '/evidence/' + r.folder + '/' + p.name,
        capturedAt: iso(reported + i * 40000),
        capturedBy: reporter ? reporter.name : 'Officer',
        source: 'Mobile app',
        hash: 'sha256:' + r.folder.replace(/[^a-z0-9]/g, '') + pad(i, 2),
      })),
      actions: r.actions.map(([description, owner, priority, dueDays, status], i) => ({
        id: 'ca_' + r.folder + '_' + i,
        description,
        owner,
        priority,
        dueAt: iso(reported + dueDays * DAY),
        status,
        completedAt: status === 'done' ? iso(reported + Math.max(1, dueDays - 1) * DAY) : null,
        createdAt: iso(reported + 30 * 60000),
      })),
    })
  })

  return out
}
