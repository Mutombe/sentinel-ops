import React, { useState } from 'react'
import { Plus, LifeBuoy, MessageSquare, CheckCircle2, Clock, AlertTriangle } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { DataTable } from '@/components/ui/DataTable'
import { Toolbar, FilterSelect } from '@/components/ui/Toolbar'
import { Badge, Button, StatCard, Tabs, Card } from '@/components/ui/primitives'
import { useList, useTableState } from '@/lib/hooks'
import { RequestForm, RequestThread } from '@/pages/Requests'
import { timeAgo, titleCase } from '@/lib/utils'
import { useAuth } from '@/auth/AuthContext'

const PRIORITIES = ['low', 'normal', 'high', 'urgent']
const STATUSES = ['open', 'in_progress', 'awaiting_client', 'resolved', 'closed']

export default function PortalRequests() {
  const { user } = useAuth()
  const t = useTableState({ sort: 'updatedAt', dir: 'desc' })
  const [tab, setTab] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [thread, setThread] = useState(null)

  const filters = { ...t.filters, ...(tab === 'all' ? {} : { status: tab }) }
  const query = useList('requests', { ...t.params, filters, facet: 'status' })
  const allQ = useList('requests', { all: true, pageSize: 300 })

  const liveThread = thread ? (query.data?.rows || []).find((r) => r.id === thread.id) || thread : null
  const all = allQ.data?.rows || []
  const facets = query.data?.facets || {}

  const tabs = [
    { value: 'all', label: 'All', count: Object.values(facets).reduce((a, b) => a + b, 0) },
    ...STATUSES.map((s) => ({ value: s, label: titleCase(s), count: facets[s] || 0 })),
  ]

  const columns = [
    { key: 'ref', header: 'Ref', width: 115, render: (r) => <span className="mono text-[12px] font-semibold text-ink">{r.ref}</span> },
    {
      key: 'subject', header: 'Request',
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-semibold text-ink">{r.subject}</p>
          <p className="truncate text-[11px] text-faint">{r.type}{r._site ? ` · ${r._site.name}` : ''}</p>
        </div>
      ),
    },
    { key: 'priority', header: 'Priority', width: 105, render: (r) => <Badge value={r.priority} /> },
    { key: 'status', header: 'Status', width: 145, render: (r) => <Badge value={r.status} dot /> },
    {
      key: 'comments', header: 'Replies', sortable: false, width: 90, align: 'center',
      render: (r) => (
        <span className="inline-flex items-center gap-1 text-[12px] text-muted">
          <MessageSquare size={12} className="text-faint" />{r.comments?.length || 0}
        </span>
      ),
    },
    { key: 'createdAt', header: 'Raised', width: 120, render: (r) => <span className="text-[12px] text-muted">{timeAgo(r.createdAt)}</span> },
    { key: 'updatedAt', header: 'Last update', width: 130, render: (r) => <span className="text-[12px] text-muted">{timeAgo(r.updatedAt)}</span> },
  ]

  return (
    <>
      <PageHeader
        title="Service Requests"
        subtitle="Ask for extra cover, raise a concern or request a site assessment, then follow it through to resolution."
        actions={<Button variant="primary" icon={Plus} onClick={() => setFormOpen(true)}>Raise a request</Button>}
        tabs={<Tabs tabs={tabs} value={tab} onChange={(v) => { setTab(v); t.setPage(1) }} className="mt-4" />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open" value={all.filter((r) => r.status === 'open').length} icon={LifeBuoy} tone="accent" loading={allQ.isLoading} hint="Awaiting first response" />
        <StatCard label="In progress" value={all.filter((r) => r.status === 'in_progress').length} icon={Clock} tone="warn" loading={allQ.isLoading} hint="Being actioned by our team" />
        <StatCard label="Needs your input" value={all.filter((r) => r.status === 'awaiting_client').length} icon={AlertTriangle} tone="critical" loading={allQ.isLoading} hint="We're waiting on you" />
        <StatCard label="Resolved" value={all.filter((r) => r.status === 'resolved' || r.status === 'closed').length} icon={CheckCircle2} tone="ok" loading={allQ.isLoading} />
      </div>

      <Toolbar
        q={t.q} onQ={t.setQ}
        placeholder="Search your requests…"
        activeFilters={t.activeFilters} onReset={t.reset}
        exportName="my-requests"
        exportRows={() => (query.data?.rows || []).map((r) => ({
          ref: r.ref, subject: r.subject, type: r.type, priority: r.priority,
          status: r.status, createdAt: r.createdAt, updatedAt: r.updatedAt,
        }))}
        filters={<FilterSelect label="Priority" value={t.filters.priority} onChange={(v) => t.setFilter('priority', v)} options={PRIORITIES} />}
      />

      <DataTable
        columns={columns}
        rows={query.data?.rows || []}
        loading={query.isLoading} fetching={query.isFetching}
        sort={query.data?.sort} dir={query.data?.dir} onSort={t.toggleSort}
        page={query.data?.page} pageCount={query.data?.pageCount} pageSize={t.pageSize}
        total={query.data?.total} from={query.data?.from} to={query.data?.to}
        onPage={t.setPage} onPageSize={t.setPageSize}
        onRowClick={setThread}
        emptyIcon={LifeBuoy}
        emptyTitle="No requests yet"
        emptyBody="Raise a request and the operations desk will pick it up."
        emptyAction={<Button variant="primary" icon={Plus} onClick={() => setFormOpen(true)}>Raise a request</Button>}
      />

      <RequestForm open={formOpen} onClose={() => setFormOpen(false)} lockClientId={user.clientId} />
      <RequestThread request={liveThread} onClose={() => setThread(null)} canManage={false} />
    </>
  )
}
