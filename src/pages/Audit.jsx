import React, { useState } from 'react'
import { ScrollText, Shield, AlertTriangle, Activity, LogIn } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { DataTable } from '@/components/ui/DataTable'
import { Toolbar, FilterSelect } from '@/components/ui/Toolbar'
import { Modal } from '@/components/ui/Modal'
import { Badge, Avatar, StatCard, Card } from '@/components/ui/primitives'
import { useNavigate } from 'react-router-dom'
import { useList, useTableState } from '@/lib/hooks'
import { fmtDateTime, timeAgo, titleCase, ROLE_LABEL, cn } from '@/lib/utils'
import { hrefFor } from '@/lib/records'

const ACTIONS = ['login', 'logout', 'failed_login', 'create', 'update', 'delete', 'approve', 'export', 'role_change', 'view', 'bulk_update', 'bulk_delete', 'note', 'password_change']
const ENTITIES = ['auth', 'incident', 'shift', 'payroll', 'report', 'asset', 'client', 'invoice', 'user', 'client_portal', 'site', 'officer', 'profile']
const SEVERITIES = ['info', 'warning', 'critical']

export default function Audit() {
  const navigate = useNavigate()
  const t = useTableState({ sort: 'at', dir: 'desc' })
  const [open, setOpen] = useState(null)

  const query = useList('audit', { ...t.params, facet: 'severity' })
  const allQ = useList('audit', { all: true, pageSize: 2000 })

  const all = allQ.data?.rows || []
  const day = all.filter((a) => Date.now() - new Date(a.at) < 86400000)
  const failed = all.filter((a) => a.action === 'failed_login')
  const critical = all.filter((a) => a.severity === 'critical')

  const columns = [
    {
      key: 'at', header: 'When', width: 150,
      render: (r) => (
        <div>
          <p className="mono text-[12px] text-ink">{fmtDateTime(r.at)}</p>
          <p className="text-[10.5px] text-faint">{timeAgo(r.at)}</p>
        </div>
      ),
    },
    {
      key: 'actorName', header: 'Actor', width: 200,
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={r.actorName} size={26} />
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-semibold text-ink">{r.actorName}</p>
            <p className="truncate text-[11px] text-faint">{ROLE_LABEL[r.actorRole] || r.actorRole}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'action', header: 'Action', width: 150,
      render: (r) => (
        <span className={cn(
          'chip',
          r.severity === 'critical' ? 'border-critical/30 bg-critical/10 text-critical'
            : r.severity === 'warning' ? 'border-warn/25 bg-warn/10 text-warn'
            : 'border-line bg-surface2 text-muted'
        )}>
          {titleCase(r.action)}
        </span>
      ),
    },
    { key: 'entity', header: 'Entity', width: 140, render: (r) => <span className="text-[12.5px] text-muted">{titleCase(r.entity)}</span> },
    { key: 'entityId', header: 'Record', width: 130, render: (r) => <span className="mono text-[11.5px] text-faint">{r.entityId}</span> },
    { key: 'ip', header: 'IP', width: 120, render: (r) => <span className="mono text-[11.5px] text-muted">{r.ip}</span> },
    { key: 'agent', header: 'Client', render: (r) => <span className="truncate text-[11.5px] text-faint">{r.agent}</span> },
  ]

  return (
    <>
      <PageHeader
        title="Audit Trail"
        subtitle="Immutable record of every privileged action taken in the platform."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Events logged" value={all.length} icon={ScrollText} tone="accent" loading={allQ.isLoading} hint="Retained for 7 years" />
        <StatCard label="Last 24 hours" value={day.length} icon={Activity} tone="accent2" loading={allQ.isLoading} hint="Across all users" />
        <StatCard label="Failed sign-ins" value={failed.length} icon={LogIn} tone="warn" loading={allQ.isLoading} hint="Monitored for brute force" />
        <StatCard label="Critical events" value={critical.length} icon={AlertTriangle} tone="critical" loading={allQ.isLoading} hint="Role changes and escalations" />
      </div>

      <Toolbar
        q={t.q} onQ={t.setQ}
        placeholder="Search actor, action, entity, IP…"
        activeFilters={t.activeFilters} onReset={t.reset}
        exportName="audit-trail"
        exportRows={() => (query.data?.rows || []).map((r) => ({
          at: r.at, actor: r.actorName, role: r.actorRole, action: r.action,
          entity: r.entity, entityId: r.entityId, severity: r.severity, ip: r.ip, agent: r.agent,
        }))}
        filters={
          <>
            <FilterSelect label="Action" value={t.filters.action} onChange={(v) => t.setFilter('action', v)} options={ACTIONS} />
            <FilterSelect label="Entity" value={t.filters.entity} onChange={(v) => t.setFilter('entity', v)} options={ENTITIES} />
            <FilterSelect label="Severity" value={t.filters.severity} onChange={(v) => t.setFilter('severity', v)} options={SEVERITIES} />
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={query.data?.rows || []}
        loading={query.isLoading} fetching={query.isFetching}
        sort={query.data?.sort} dir={query.data?.dir} onSort={t.toggleSort}
        page={query.data?.page} pageCount={query.data?.pageCount} pageSize={t.pageSize}
        total={query.data?.total} from={query.data?.from} to={query.data?.to}
        onPage={t.setPage} onPageSize={t.setPageSize}
        onRowClick={(r) => navigate(hrefFor('audit', r.id))}
        dense
        emptyIcon={ScrollText} emptyTitle="No audit events match this filter"
      />

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        size="md"
        title="Audit event"
        subtitle={open ? `${titleCase(open.action)} · ${titleCase(open.entity)}` : ''}
      >
        {open && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg border border-line bg-surface2/50 p-3">
              <Avatar name={open.actorName} size={36} />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-ink">{open.actorName}</p>
                <p className="truncate text-[11.5px] text-faint">{ROLE_LABEL[open.actorRole] || open.actorRole}</p>
              </div>
              <div className="ml-auto"><Badge value={open.severity} /></div>
            </div>

            <div className="space-y-2 text-[12.5px]">
              {[
                ['Event ID', open.id],
                ['Timestamp', fmtDateTime(open.at)],
                ['Action', titleCase(open.action)],
                ['Entity type', titleCase(open.entity)],
                ['Record ID', open.entityId],
                ['Source IP', open.ip],
                ['User agent', open.agent],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-line/50 pb-2 last:border-0">
                  <span className="text-muted">{k}</span>
                  <span className="mono truncate text-right text-ink">{v}</span>
                </div>
              ))}
            </div>

            {open.meta && (
              <div>
                <p className="label">Change payload</p>
                <pre className="mono max-h-52 overflow-auto rounded-lg border border-line bg-bg p-3 text-[11.5px] leading-relaxed text-muted">
                  {JSON.stringify(open.meta, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex items-start gap-2 rounded-lg border border-accent/20 bg-accent/[.06] px-3 py-2">
              <Shield size={14} className="mt-0.5 shrink-0 text-accent" />
              <p className="text-[11.5px] leading-relaxed text-muted">
                Audit records are append-only. They cannot be edited or deleted from the interface.
              </p>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
