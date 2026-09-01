import React, { useEffect, useMemo, useState } from 'react'
import { Plus, Receipt, Trash2, Pencil, Send, CheckCircle2, Printer, X, DollarSign, TrendingUp, Clock, AlertTriangle } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { DataTable } from '@/components/ui/DataTable'
import { Toolbar, FilterSelect } from '@/components/ui/Toolbar'
import { Drawer, ConfirmDialog, Modal } from '@/components/ui/Modal'
import { Badge, Button, Field, Input, Select, Textarea, Tabs, StatCard, Card, Avatar } from '@/components/ui/primitives'
import { RevenueChart } from '@/components/charts/Charts'
import { useList, useTableState, useCreate, useUpdate, useDelete, useBulk, useLookups, useForm } from '@/lib/hooks'
import { fmtDate, money, money2, titleCase, cn, num } from '@/lib/utils'
import { hrefFor } from '@/lib/records'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { useToast } from '@/components/ui/Toast'

const STATUSES = ['draft', 'sent', 'paid', 'overdue', 'void']

function LineItems({ items, onChange }) {
  const set = (i, k, v) => onChange(items.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)))
  const add = () => onChange([...items, { id: 'li_' + Date.now(), description: '', qty: 1, unit: 'hrs', rate: 0, amount: 0 }])
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i))
  const subtotal = items.reduce((a, i) => a + (+i.qty || 0) * (+i.rate || 0), 0)
  const tax = subtotal * 0.15

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[560px]">
          <thead className="bg-surface2/70">
            <tr>
              <th className="th">Description</th>
              <th className="th w-24 text-right">Qty</th>
              <th className="th w-20">Unit</th>
              <th className="th w-28 text-right">Rate</th>
              <th className="th w-28 text-right">Amount</th>
              <th className="th w-9" />
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id || i} className="border-t border-line/70">
                <td className="px-2 py-1.5">
                  <input className="input h-8 text-[12.5px]" value={it.description} onChange={(e) => set(i, 'description', e.target.value)} placeholder="Service description" />
                </td>
                <td className="px-2 py-1.5">
                  <input type="number" min="0" className="input h-8 text-right text-[12.5px]" value={it.qty} onChange={(e) => set(i, 'qty', e.target.value)} />
                </td>
                <td className="px-2 py-1.5">
                  <select className="select h-8 text-[12.5px]" value={it.unit} onChange={(e) => set(i, 'unit', e.target.value)}>
                    {['hrs', 'ea', 'day', 'month'].map((u) => <option key={u}>{u}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <input type="number" min="0" step="0.01" className="input h-8 text-right text-[12.5px]" value={it.rate} onChange={(e) => set(i, 'rate', e.target.value)} />
                </td>
                <td className="mono px-3 py-1.5 text-right text-[12.5px] font-semibold text-ink">
                  {money2((+it.qty || 0) * (+it.rate || 0))}
                </td>
                <td className="px-1 py-1.5">
                  <button type="button" onClick={() => remove(i)} className="btn btn-ghost h-7 w-7 px-0 text-critical"><X size={13} /></button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-[12.5px] text-faint">No line items yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex items-start justify-between gap-4">
        <Button type="button" size="sm" variant="secondary" icon={Plus} onClick={add}>Add line</Button>
        <div className="w-56 space-y-1 text-[12.5px]">
          <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="mono text-ink">{money2(subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-muted">VAT (15%)</span><span className="mono text-ink">{money2(tax)}</span></div>
          <div className="flex justify-between border-t border-line pt-1"><span className="font-semibold text-ink">Total</span><span className="mono font-bold text-ink">{money2(subtotal + tax)}</span></div>
        </div>
      </div>
    </div>
  )
}

function InvoiceForm({ open, onClose, initial }) {
  const isEdit = !!initial
  const { data: lk } = useLookups()
  const toast = useToast()
  const create = useCreate('invoices', { label: 'Invoice', onSuccess: onClose })
  const update = useUpdate('invoices', { label: 'Invoice', onSuccess: onClose })
  const busy = create.isPending || update.isPending

  const blank = {
    clientId: '', issueDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    period: new Date().toISOString().slice(0, 7), status: 'draft', currency: 'USD', notes: '',
    lineItems: [],
  }
  const f = useForm(blank)

  useEffect(() => {
    if (!open) return
    f.reset(initial ? {
      ...initial,
      issueDate: (initial.issueDate || '').slice(0, 10),
      dueDate: (initial.dueDate || '').slice(0, 10),
    } : blank)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id])

  const submit = async (e) => {
    e.preventDefault()
    const payload = {
      ...f.values,
      issueDate: new Date(f.values.issueDate).toISOString(),
      dueDate: new Date(f.values.dueDate).toISOString(),
      lineItems: f.values.lineItems.map((li) => ({ ...li, qty: +li.qty || 0, rate: +li.rate || 0 })),
      number: isEdit ? initial.number : `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 8999)}`,
    }
    try {
      if (isEdit) await update.mutateAsync({ id: initial.id, patch: payload })
      else await create.mutateAsync(payload)
    } catch (err) {
      f.applyServerError(err)
      if (!err.fields) toast.error('Could not save invoice', { body: err.message })
    }
  }

  return (
    <Drawer
      open={open} onClose={onClose}
      title={isEdit ? `Edit ${initial.number}` : 'New invoice'}
      subtitle={isEdit ? initial._client?.name : 'Bill a client for guarding services'}
      width="max-w-3xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={submit}>{isEdit ? 'Save invoice' : 'Create invoice'}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client" required error={f.errors.clientId}>
            <Select {...f.bind('clientId')}>
              <option value="">Select a client…</option>
              {lk?.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Billing period"><Input type="month" {...f.bind('period')} /></Field>
          <Field label="Issue date"><Input type="date" {...f.bind('issueDate')} /></Field>
          <Field label="Due date"><Input type="date" {...f.bind('dueDate')} /></Field>
          <Field label="Status">
            <Select {...f.bind('status')}>{STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
          </Field>
          <Field label="Currency">
            <Select {...f.bind('currency')}>{['USD', 'ZAR', 'ZWG', 'GBP'].map((c) => <option key={c}>{c}</option>)}</Select>
          </Field>
        </div>

        <div>
          <p className="label">Line items</p>
          <LineItems items={f.values.lineItems} onChange={(v) => f.set('lineItems', v)} />
        </div>

        <Field label="Notes to client"><Textarea rows={3} {...f.bind('notes')} placeholder="Payment terms, PO references…" /></Field>
      </form>
    </Drawer>
  )
}

function InvoicePreview({ invoice, onClose }) {
  if (!invoice) return null
  return (
    <Modal
      open={!!invoice}
      onClose={onClose}
      size="xl"
      title={invoice.number}
      subtitle={`${invoice._client?.name} · ${titleCase(invoice.status)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print</Button>
        </>
      }
    >
      <div className="rounded-xl border border-line bg-surface2/30 p-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-[17px] font-bold text-ink">Sentinel Ops (Pvt) Ltd</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              14 Josiah Tongogara Ave<br />Harare, Zimbabwe<br />VAT 10024578
            </p>
          </div>
          <div className="text-right">
            <p className="mono text-[19px] font-bold text-ink">{invoice.number}</p>
            <div className="mt-1"><Badge value={invoice.status} /></div>
            <p className="mt-2 text-[12px] text-muted">Issued {fmtDate(invoice.issueDate)}</p>
            <p className="text-[12px] text-muted">Due {fmtDate(invoice.dueDate)}</p>
          </div>
        </div>

        <div className="mt-6 border-t border-line pt-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-faint">Bill to</p>
          <p className="mt-1 text-[14px] font-semibold text-ink">{invoice._client?.name}</p>
          <p className="text-[12px] text-muted">Billing period {invoice.period}</p>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead>
              <tr className="border-b border-line">
                <th className="th">Description</th>
                <th className="th text-right">Qty</th>
                <th className="th text-right">Rate</th>
                <th className="th text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((li) => (
                <tr key={li.id} className="border-b border-line/50">
                  <td className="td text-[12.5px] text-ink">{li.description}</td>
                  <td className="td mono text-right text-[12.5px] text-muted">{num(li.qty)} {li.unit}</td>
                  <td className="td mono text-right text-[12.5px] text-muted">{money2(li.rate)}</td>
                  <td className="td mono text-right text-[12.5px] font-semibold text-ink">{money2(li.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-end">
          <div className="w-64 space-y-1.5 text-[13px]">
            <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="mono text-ink">{money2(invoice.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted">VAT (15%)</span><span className="mono text-ink">{money2(invoice.tax)}</span></div>
            <div className="flex justify-between border-t border-line pt-2 text-[15px]">
              <span className="font-bold text-ink">Total due</span>
              <span className="mono font-bold text-accent">{money2(invoice.total)}</span>
            </div>
          </div>
        </div>

        {invoice.paidAt && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-ok/25 bg-ok/[.08] px-3 py-2">
            <CheckCircle2 size={15} className="text-ok" />
            <p className="text-[12.5px] text-ink">Paid {fmtDate(invoice.paidAt)} via {invoice.paymentMethod}</p>
          </div>
        )}
      </div>
    </Modal>
  )
}

export default function Invoices() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const t = useTableState({ sort: 'issueDate', dir: 'desc' })
  const [tab, setTab] = useState('all')
  const [selected, setSelected] = useState([])
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [preview, setPreview] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const filters = { ...t.filters, ...(tab === 'all' ? {} : { status: tab }) }
  const query = useList('invoices', { ...t.params, filters, facet: 'status' })
  const allQ = useList('invoices', { all: true, pageSize: 1000 })
  const del = useDelete('invoices', { label: 'Invoice' })
  const update = useUpdate('invoices', { label: 'Invoice' })
  const bulk = useBulk('invoices')

  const all = allQ.data?.rows || []
  const billed = all.reduce((a, i) => a + i.total, 0)
  const collected = all.filter((i) => i.status === 'paid').reduce((a, i) => a + i.total, 0)
  const outstanding = all.filter((i) => i.status === 'sent' || i.status === 'overdue').reduce((a, i) => a + i.total, 0)
  const overdue = all.filter((i) => i.status === 'overdue')

  const revenue = useMemo(() => Object.values(
    all.reduce((acc, i) => {
      acc[i.period] = acc[i.period] || { period: i.period, billed: 0, collected: 0 }
      acc[i.period].billed += i.total
      if (i.status === 'paid') acc[i.period].collected += i.total
      return acc
    }, {})
  ).sort((a, b) => a.period.localeCompare(b.period)).slice(-8), [all])

  const facets = query.data?.facets || {}
  const tabs = [
    { value: 'all', label: 'All invoices', count: Object.values(facets).reduce((a, b) => a + b, 0) },
    ...STATUSES.map((s) => ({ value: s, label: titleCase(s), count: facets[s] || 0 })),
  ]

  const columns = [
    { key: 'number', header: 'Invoice', width: 155, render: (r) => <span className="mono text-[12.5px] font-semibold text-ink">{r.number}</span> },
    {
      key: 'clientId', header: 'Client', sortable: false,
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={r._client?.name || 'Unassigned'} size={26} />
          <span className="truncate text-[12.5px] text-ink">{r._client?.name}</span>
        </div>
      ),
    },
    { key: 'period', header: 'Period', width: 100, render: (r) => <span className="mono text-[12.5px] text-muted">{r.period}</span> },
    { key: 'issueDate', header: 'Issued', width: 120, render: (r) => <span className="text-[12.5px] text-muted">{fmtDate(r.issueDate)}</span> },
    {
      key: 'dueDate', header: 'Due', width: 130,
      render: (r) => {
        const late = r.status !== 'paid' && new Date(r.dueDate) < Date.now()
        return (
          <div>
            <p className={cn('text-[12.5px]', late ? 'font-semibold text-critical' : 'text-muted')}>{fmtDate(r.dueDate)}</p>
            {late && <p className="text-[10.5px] text-critical">{Math.round((Date.now() - new Date(r.dueDate)) / 86400000)}d overdue</p>}
          </div>
        )
      },
    },
    { key: 'total', header: 'Total', align: 'right', width: 120, render: (r) => <span className="mono text-[12.5px] font-bold text-ink">{money2(r.total)}</span> },
    { key: 'status', header: 'Status', width: 124, render: (r) => <Badge value={r.status} /> },
    {
      key: 'actions', header: '', sortable: false, width: 120, align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          {r.status === 'draft' && can('invoices', 'update') && (
            <button className="btn btn-ghost h-7 w-7 px-0" title="Send" onClick={() => update.mutate({ id: r.id, patch: { status: 'sent' } })}><Send size={13} /></button>
          )}
          {(r.status === 'sent' || r.status === 'overdue') && can('invoices', 'update') && (
            <button className="btn btn-ghost h-7 w-7 px-0 text-ok" title="Mark paid"
              onClick={() => update.mutate({ id: r.id, patch: { status: 'paid', paidAt: new Date().toISOString(), paymentMethod: 'EFT' } })}>
              <CheckCircle2 size={13} />
            </button>
          )}
          {can('invoices', 'update') && (
            <button className="btn btn-ghost h-7 w-7 px-0" title="Edit" onClick={() => { setEditing(r); setFormOpen(true) }}><Pencil size={13} /></button>
          )}
          {can('invoices', 'delete') && (
            <button className="btn btn-ghost h-7 w-7 px-0 text-critical" title="Delete" onClick={() => setConfirm(r)}><Trash2 size={13} /></button>
          )}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Invoicing"
        subtitle="Contract billing, collections and revenue recognition."
        actions={can('invoices', 'create') && (
          <Button variant="primary" icon={Plus} onClick={() => { setEditing(null); setFormOpen(true) }}>New invoice</Button>
        )}
        tabs={<Tabs tabs={tabs} value={tab} onChange={(v) => { setTab(v); t.setPage(1); setSelected([]) }} className="mt-4" />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total billed" value={money(billed)} icon={Receipt} tone="accent" loading={allQ.isLoading} hint={`${all.length} invoices`} />
        <StatCard label="Collected" value={money(collected)} icon={TrendingUp} tone="ok" loading={allQ.isLoading} hint={`${Math.round((collected / (billed || 1)) * 100)}% collection rate`} />
        <StatCard label="Outstanding" value={money(outstanding)} icon={Clock} tone="warn" loading={allQ.isLoading} hint="Sent and awaiting payment" />
        <StatCard label="Overdue" value={overdue.length} icon={AlertTriangle} tone="critical" loading={allQ.isLoading} hint={money(overdue.reduce((a, i) => a + i.total, 0))} />
      </div>

      <Card className="mb-4" title="Billing vs collections" subtitle="Last 8 periods">
        <RevenueChart data={revenue} formatter={(v) => money(v)} />
      </Card>

      <Toolbar
        q={t.q} onQ={t.setQ}
        placeholder="Search invoice number or period…"
        activeFilters={t.activeFilters} onReset={t.reset}
        exportName="invoices"
        exportRows={() => (query.data?.rows || []).map((r) => ({
          number: r.number, client: r._client?.name, period: r.period, issueDate: r.issueDate,
          dueDate: r.dueDate, subtotal: r.subtotal, tax: r.tax, total: r.total, status: r.status, paidAt: r.paidAt,
        }))}
      />

      <DataTable
        columns={columns}
        rows={query.data?.rows || []}
        loading={query.isLoading} fetching={query.isFetching}
        sort={query.data?.sort} dir={query.data?.dir} onSort={t.toggleSort}
        page={query.data?.page} pageCount={query.data?.pageCount} pageSize={t.pageSize}
        total={query.data?.total} from={query.data?.from} to={query.data?.to}
        onPage={t.setPage} onPageSize={t.setPageSize}
        onRowClick={(r) => navigate(hrefFor('invoices', r.id))}
        selectable={can('invoices', 'update')}
        selected={selected} onSelected={setSelected}
        emptyIcon={Receipt} emptyTitle="No invoices found"
        bulkBar={(ids) => (
          <>
            <Button size="xs" variant="secondary" icon={Send} onClick={() => bulk.update.mutate({ ids, patch: { status: 'sent' } })}>Send</Button>
            <Button size="xs" variant="secondary" icon={CheckCircle2}
              onClick={() => bulk.update.mutate({ ids, patch: { status: 'paid', paidAt: new Date().toISOString(), paymentMethod: 'EFT' } })}>
              Mark paid
            </Button>
          </>
        )}
      />

      <InvoiceForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null) }} initial={editing} />
      <InvoicePreview invoice={preview} onClose={() => setPreview(null)} />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Delete invoice?"
        body={`${confirm?.number} for ${confirm?._client?.name} (${confirm ? money2(confirm.total) : ''}) will be permanently removed.`}
        confirmLabel="Delete invoice"
        onConfirm={() => del.mutate(confirm.id)}
      />
    </>
  )
}
