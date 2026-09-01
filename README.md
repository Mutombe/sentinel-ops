# Sentinel Ops, Security Operations Management System

A front end ERP for a Zimbabwean manned guarding company: rostering, incident command,
patrol assurance, supervisor inspections, attendance, leave, discipline, training, payroll,
equipment, contract billing, analytics, role based access, a **client portal**, an **officer
portal**, and a rules based **Operations Intelligence** layer. It runs entirely in the
browser against a mock API that behaves like a real one.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm run preview
```

---

## Sign in

| Role | Email | Password | MFA |
|---|---|---|---|
| Administrator | `admin@sentinelops.co.zw` | `admin123` | yes |
| Operations Manager | `ops@sentinelops.co.zw` | `ops123` | yes |
| Supervisor | `supervisor@sentinelops.co.zw` | `super123` | no |
| Finance | `finance@sentinelops.co.zw` | `finance123` | yes |
| Client portal | `client@zambezi.co.zw` | `client123` | no |
| Officer portal | any officer email on the Users page | `guard123` | no |

The MFA code in this demo is **`000000`**. The login screen has a one click button for each
demo account.

A client account lands in the client portal and an officer account lands in the officer
portal. From an administrator account you can open both without signing out. See **View as**
below.

---

## Modules

**Command and control.** Command Centre with a live duty board, KPI strip, incident trend,
hot sites, patrol gauge, coverage gaps and the day's intelligence briefing.

**Operations.** Incidents from first report through investigation to sign off, with a full
timeline, notes, hashed photo evidence and corrective actions carrying owners and due dates.
Roster and shifts as a week board or a table. Patrol tours with checkpoint scan logs and
missed checkpoint exceptions. Supervisor operations: site visits scored live against a
sixteen point checklist, officer spot checks, findings and the actions they raise.
Attendance with biometric, QR and NFC clock ins, late minutes and geofence verification.

**Workforce.** Officer files with deployment, certifications and performance, plus per
officer tabs for shifts, incidents, attendance, leave, conduct, training and documents.
Leave management with an approval workflow and cover nomination. Training and personnel
files tracking certification currency, mandatory document completeness and ZRP registration.
Discipline and recognition, where each rung of the progressive ladder is presented on its
own terms: warnings as a table showing where the officer sits on the ladder, suspensions as
cards with the sanction and the return to duty date, dismissals as a permanent register, and
commendations as certificates. Payroll runs from draft to calculated, approved and paid, with
PAYE bands, the AIDS levy, NSSA to the insurable ceiling, employer NSSA and WCIF, period on
period variance, a bank transfer file and a downloadable payslip for every officer. An
equipment register.

**Commercial.** Clients with contracts, tiers, SLA and satisfaction. Sites broken down into
posts, each with its own standing post orders. A service desk for threaded client requests.
Invoicing with a line item editor, VAT and a printable invoice.

**Insight.** Analytics for throughput, report latency, loss exposure, top officers and client
performance. An append only audit trail of every privileged action.

**Administration.** Users and roles with a permission matrix, and settings for profile,
password, theme, organisation, simulation and data.

---

## Client portal

At `/portal`: overview, incident reports with the photographs attached to them, sites,
deployment and attendance, patrol assurance, inspection reports, service requests, billing,
and a monthly performance report scoring delivery against six contracted service levels.

## Officer portal

At `/me`, built for the guard on the ground:

* **My Duty** shows the shift they are on, a live clock in and clock out with a running
  timer, the post orders for their post, their compliance warnings and a one tap incident
  report.
* **Patrols** start a tour and scan each checkpoint. The grid fills in as they go, and
  closing early records the exceptions their supervisor will see.
* **Incident Reports** file a report and attach photographs straight from the phone camera.
* **My Shifts** roster ahead, shifts worked and their punctuality record.
* **My File** training currency, personnel documents, conduct record and payslips.
* **My Leave** request leave and track the decision.

Client and officer accounts that reach an internal URL are redirected to their own portal
equivalent rather than shown a dead end.

---

## View as

Administrators and operations managers can see exactly what any client or officer sees.
Press **Shift+V**, or use *View as* from the user menu, the Users table, or the "Open their
portal" button on a client or officer record.

The swap happens at the API boundary, so permissions, row scoping, navigation and the home
redirect all follow that account for real rather than the UI pretending. A banner stays
pinned to the top of the shell for the whole session, and every action taken while viewing
as someone else is written to the audit trail against both accounts. One click returns the
operator to their own account.

---

## Operations Intelligence

The system reads the operational data and tells management what needs attention, instead of
leaving them to read hundreds of reports:

> **17 sites require attention this morning.**
> One incident was reported overnight, one of them high or critical severity. Five patrol
> tours closed with nine missed checkpoints. Fifteen officers arrived late. Ten officers are
> deployed on an expired ZRP registration and three more expire within thirty days.

It is a rules and per entity baseline anomaly engine in `src/lib/intelligence.js`. It is not
a language model, and the UI says so. Fifteen detectors run over the live dataset:

| Detector | Fires when |
|---|---|
| Incident spike | A site's 14 day incident count exceeds its own 90 day baseline rate |
| Repeat pattern | The same incident category recurs 3 or more times at one site in 21 days |
| Patrol failure | A site closes 35% or more of its tours with missed checkpoints |
| Attendance anomaly | An officer's lateness exceeds 2.2 times the team rate, or 2 absences in 30 days |
| Staffing gap | A site falls below 80% of contracted strength |
| Uncovered post | An active post has nobody on today's roster |
| Open critical | A critical incident stays open past 24 hours |
| SLA trend | Reporting latency breaches rise 8 points or more versus the prior fortnight |
| Inspection fail or drop | Latest score below 70%, or 18 points below the site's average |
| Registration, documents, training | Expired or missing compliance items |
| Overdue actions | Corrective actions past their due date |
| Leave clash | Approved leave overlapping a rostered shift |

Every signal carries the metric that triggered it, the baseline it was compared against and
a recommended action, so "why is this on my list?" always has an answer. The page also ranks
a site and officer watchlist by composite risk score, charts the 14 day operating picture
and exports the whole briefing to CSV. Managers, supervisors and administrators see it.
Client accounts do not.

---

## How it works

### Mock API (`src/lib/api.js`)

Not a stub. It is a request layer that does what a server does:

* **Latency and jitter** on every call, tunable in Settings, Simulation.
* **Server side pagination, sorting, search, filtering and faceted counts.** Tables send
  `{ page, pageSize, sort, dir, q, filters, facet }` and get back
  `{ rows, total, page, pageCount, from, to, facets }`. The tab counts above each table are
  server facets, not client side `.filter()` calls.
* **Role based access.** `PERMISSIONS` per role, enforced with `assertCan()` on every read
  and write. A finance user calling `create` on incidents gets a 403 with a readable
  message. Routing adds a second check, because client accounts share some read permissions
  with staff, so internal consoles redirect them to the portal equivalent.
* **Row scoping.** Client and officer accounts get a filtered dataset at the API boundary in
  `scopeFilter`, not hidden in the UI. A client cannot fetch another client's data.
* **Validation.** Required fields, email format and numeric ranges, returning `422` with a
  `fields` map that the forms render inline.
* **Referential integrity.** Deleting a client with live sites, or a site with upcoming
  shifts, returns `409` with the reason.
* **Audit logging.** Every mutation appends to the audit trail with actor, IP and payload.
* **Relation expansion.** List responses come back with `_client`, `_site`, `_guard` and
  `_reporter` joined in, the way a real API would.

### Optimistic UI (`src/lib/hooks.js`)

`useCreate`, `useUpdate`, `useDelete` and `useBulk` patch every cached page of a resource the
instant you act, snapshot what they replaced, and restore that exact snapshot if the server
rejects the write, with a toast explaining why. Pagination uses `keepPreviousData`, so
changing page or sort keeps the old rows on screen behind a progress bar instead of flashing
empty.

To see the rollback path, open Settings, Simulation, and set the write failure rate to 100%,
then create or edit anything.

### Storage (`src/lib/db.js`, `src/lib/idb.js`)

The dataset lives in **IndexedDB**, not localStorage. localStorage caps an origin at roughly
5 MB and throws `QuotaExceededError` once you cross it, which this dataset does. IndexedDB
has a quota in the hundreds of megabytes and stores structured values without a JSON round
trip.

The whole dataset is held in memory and flushed to IndexedDB on a debounce, so every module
still reads it synchronously. Only the boot is async: `initStore()` is awaited in `main.jsx`
before React mounts. Legacy localStorage payloads are cleared on first boot to give the
origin its quota back. If IndexedDB is unavailable, in a private window or with site data
blocked, the app still runs in memory and says so.

### Every record has a page

Any row you can see, you can open. Guards, sites, clients, incidents, shifts and payslips
have purpose built pages. Everything else, attendance, patrols, leave, discipline, training,
personnel documents, equipment, service requests, invoices, inspections, posts, users, payroll
runs and audit events, is served by one universal record page at `/records/:resource/:id`,
driven by a registry in `src/lib/records.js` that declares the title, the badges, the facts
grid and the linked records for each resource. Resources that need more than facts, a patrol's
checkpoint log, an inspection's scored checklist, an invoice's line items, a post's standing
orders, contribute a body component of their own.

A shift opens onto its own page at `/shifts/:id`: the roster detail, the attendance record
against it, the post orders in force, and a merged timeline of everything that happened on
that shift, clock in, late arrival, patrol tours, checkpoint exceptions, incidents,
supervisor visits and occurrence book entries, with an entry form to write the book up and a
drawer to edit the shift.

### Documents (`src/lib/pdf.js`)

Payslips, payroll registers, invoices, incident reports, inspection reports, disciplinary
notices, letters of commendation and training record extracts all generate as real A4 PDFs.
jsPDF is dynamically imported so it costs nothing until somebody asks for a document. A
shared `Doc` class handles the letterhead, the fact blocks, the tables that paginate, the
totals box, the notes and the signature blocks, so every document looks like it came out of
the same office.

### Tables

Every table fits its container, so nothing scrolls sideways. Column widths are treated as
ratios rather than fixed pixels, cell content truncates, and columns carrying secondary
detail drop out as the viewport narrows. A column can pick its own breakpoint with
`hide: 'md' | 'lg' | 'xl'` or opt out with `hide: false`.

### Data (`src/lib/seed.js`, `src/lib/seedOps.js`, `src/lib/seedReal.js`)

A deterministic seeded generator builds around 7,500 interlinked records: 24 clients, 50 odd
sites and their posts, 140 officers, roughly 2,200 shifts, 264 incidents with timelines,
evidence and corrective actions, 210 patrols, 168 scored supervisor inspections, attendance,
leave, disciplinary records, training and personnel documents, invoices with line items,
payroll runs, equipment, service requests, users and audit events.

Names, cities, streets, suburbs and company names are Zimbabwean. Officers register with the
Zimbabwe Republic Police under the Private Investigators and Security Guards (Control) Act,
and payroll deducts PAYE and NSSA.

Officers are allocated to sites against each site's contracted requirement rather than at
random, so the estate looks like a real one: most posts covered, a handful genuinely short.
Those real gaps are what the intelligence engine surfaces.

Three incidents carry **real photographs** taken on site. The 25 images live in
`public/evidence` and are served as static assets rather than stored in the database. Each
write up describes what is genuinely in its photo set: a dawn terrace sweep that found
nothing, a unit door left ajar with the keys still in the lock, and a fire extinguisher off
its bracket obstructing an escape route. They are attached to a client that has a portal
login, so the same photographs are visible from the client side.

Settings, Data exports the dataset as JSON or reseeds it.

---

## Stack

React 18, Vite, React Router 6, TanStack Query 5, Tailwind CSS 3, Recharts, lucide-react,
jsPDF (dynamically imported, for the printable documents).
No backend and no network calls. The whole dataset lives in your browser.

Theming uses CSS custom properties redefined under `[data-theme='light']`, with Tailwind
colours bound to those tokens, so light and dark are one palette rather than two
stylesheets. Recharts reads the same tokens out of the DOM and re-reads them when the theme
flips.

---

## Layout

```
src/
  lib/          rng, seed + seedOps + seedReal, idb + db (IndexedDB persistence),
                api (the mock server), intelligence (the signal engine), payroll (PAYE,
                NSSA, the AIDS levy), pdf (A4 document builders), records (the universal
                record registry), hooks, utils
  auth/         AuthContext: session, role checks, view as
  components/
    ui/         Button, Field, Badge, Avatar, Card, Tabs, Modal, Drawer, ConfirmDialog,
                DataTable + Pagination, Toolbar, Toast, StatCard, primitives
    charts/     themed Recharts wrappers
    layout/     AppShell (sidebar, topbar, command palette, notifications), nav config
  features/     composed panels: posts and orders, incident evidence and actions, view as
  pages/        one file per module
    portal/     the client experience
    officer/    the officer experience
```

Keyboard: **Ctrl+K** or **Cmd+K** opens the command palette, which searches officers, sites,
incidents, invoices and every page. **Shift+V** opens View as. **N** opens the report
incident form on the Incidents page.
