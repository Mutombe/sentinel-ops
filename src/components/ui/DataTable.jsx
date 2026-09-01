import React from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUp, ArrowDown, ChevronsUpDown, Inbox, Loader2 } from 'lucide-react'
import { cn, num } from '@/lib/utils'
import { Checkbox, TableSkeleton, EmptyState, Button } from './primitives'

export function Pagination({ page, pageCount, pageSize, total, from, to, onPage, onPageSize, compactMode }) {
  const pages = React.useMemo(() => {
    const out = []
    const win = 1
    for (let i = 1; i <= pageCount; i++) {
      if (i === 1 || i === pageCount || (i >= page - win && i <= page + win)) out.push(i)
      else if (out[out.length - 1] !== '…') out.push('…')
    }
    return out
  }, [page, pageCount])

  return (
    <div className="flex flex-col-reverse items-center justify-between gap-3 border-t border-line px-4 py-2.5 sm:flex-row">
      <div className="flex items-center gap-3">
        <p className="text-[12px] text-faint">
          {total === 0 ? 'No results' : (
            <>
              <span className="mono font-semibold text-muted">{num(from)}-{num(to)}</span> of{' '}
              <span className="mono font-semibold text-muted">{num(total)}</span>
            </>
          )}
        </p>
        {onPageSize && !compactMode && (
          <select
            value={pageSize}
            onChange={(e) => onPageSize(+e.target.value)}
            className="h-7 rounded-md border border-line bg-surface2 px-1.5 text-[11.5px] text-muted outline-none focus:border-accent/60"
            aria-label="Rows per page"
          >
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button className="btn btn-ghost h-7 w-7 px-0" disabled={page <= 1} onClick={() => onPage(1)} aria-label="First page">
          <ChevronsLeft size={14} />
        </button>
        <button className="btn btn-ghost h-7 w-7 px-0" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft size={14} />
        </button>
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={'e' + i} className="px-1 text-[12px] text-faint">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={cn(
                'mono h-7 min-w-[28px] rounded-md px-1.5 text-[12px] font-semibold transition',
                p === page ? 'bg-accent text-bg' : 'text-muted hover:bg-surface2 hover:text-ink'
              )}
            >
              {p}
            </button>
          )
        )}
        <button className="btn btn-ghost h-7 w-7 px-0" disabled={page >= pageCount} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight size={14} />
        </button>
        <button className="btn btn-ghost h-7 w-7 px-0" disabled={page >= pageCount} onClick={() => onPage(pageCount)} aria-label="Last page">
          <ChevronsRight size={14} />
        </button>
      </div>
    </div>
  )
}

/* Columns carrying secondary detail drop out as the viewport narrows, so a
   table never needs horizontal scrolling. A column sets its own breakpoint
   with hide: 'md' | 'lg' | 'xl', or opts out entirely with hide: false. */
const SECONDARY = {
  xl: ['ip', 'agent', 'entityId', 'serial', 'verifiedBy', 'provider', 'method',
       'route', 'issuedBy', 'createdBy', 'coveredBy', 'supervisorId'],
  lg: ['uploadedAt', 'completedAt', 'issueDate', 'period', 'durationMins', 'checkpoints',
       'coverage', 'slaResponseMins', 'contractEnd', 'hourlyRate', 'baseHours', 'otHours',
       'deductions', 'reportedBy', 'expiresAt', 'createdAt', 'grade', 'mandatory',
       'geoVerified', 'comments', 'evidence', 'findings', 'score', 'lossValue'],
  md: ['clockOut', 'updatedAt', 'city', 'tier', 'rank', 'category', 'startedAt', 'licenseNo'],
}

const HIDE_CLASS = {
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
}

function hideClass(col) {
  if (col.hide === false) return ''
  const at = col.hide
    || (SECONDARY.xl.includes(col.key) && 'xl')
    || (SECONDARY.lg.includes(col.key) && 'lg')
    || (SECONDARY.md.includes(col.key) && 'md')
  return HIDE_CLASS[at] || ''
}

export function DataTable({
  columns,
  rows = [],
  rowKey = 'id',
  loading,
  fetching,
  sort,
  dir,
  onSort,
  selectable,
  selected = [],
  onSelected,
  onRowClick,
  page, pageCount, pageSize, total, from, to, onPage, onPageSize,
  bulkBar,
  emptyTitle = 'Nothing here yet',
  emptyBody,
  emptyAction,
  emptyIcon = Inbox,
  className,
  dense,
}) {
  /* Column widths are hints, not commands. Converting them to percentages of
     their own total means the table always fits its container: no horizontal
     scrolling, and a hidden column simply gives its share back to the rest. */
  const widthPct = React.useMemo(() => {
    const total = columns.reduce((a, c) => a + (c.width || 230), 0) + (selectable ? 36 : 0)
    const map = {}
    columns.forEach((c) => { map[c.key] = (((c.width || 230) / total) * 100).toFixed(3) + '%' })
    return map
  }, [columns, selectable])

  const ids = rows.map((r) => r[rowKey])
  const allSelected = ids.length > 0 && ids.every((id) => selected.includes(id))
  const someSelected = !allSelected && ids.some((id) => selected.includes(id))

  const toggleAll = () => {
    if (allSelected) onSelected(selected.filter((id) => !ids.includes(id)))
    else onSelected([...new Set([...selected, ...ids])])
  }

  return (
    <div className={cn('card relative overflow-hidden', className)}>
      {fetching && !loading && (
        <div className="absolute inset-x-0 top-0 z-20 h-[2px] overflow-hidden bg-transparent">
          <div className="h-full w-1/3 animate-[shimmer_1.2s_infinite] bg-accent" />
        </div>
      )}

      {selectable && selected.length > 0 && bulkBar && (
        <div className="flex items-center justify-between gap-3 border-b border-accent/25 bg-accent/[.07] px-4 py-2 animate-in">
          <span className="text-[12.5px] font-semibold text-ink">
            {selected.length} selected
          </span>
          <div className="flex items-center gap-1.5">
            {bulkBar(selected)}
            <Button size="xs" variant="ghost" onClick={() => onSelected([])}>Clear</Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse">
          <thead className="sticky top-0 z-10 bg-surface2/80 backdrop-blur">
            <tr>
              {selectable && (
                <th className="th w-9 pr-0">
                  <Checkbox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} />
                </th>
              )}
              {columns.map((c) => {
                const active = sort === (c.sortKey || c.key)
                return (
                  <th
                    key={c.key}
                    className={cn(
                      'th align-bottom leading-tight',
                      c.align === 'right' && 'text-right',
                      c.align === 'center' && 'text-center',
                      hideClass(c),
                      c.headerClass
                    )}
                    style={{ width: widthPct[c.key] }}
                  >
                    {c.sortable !== false && onSort ? (
                      <button
                        onClick={() => onSort(c.sortKey || c.key)}
                        className={cn('inline-flex items-start gap-1 text-left transition hover:text-ink', active && 'text-accent')}
                      >
                        {c.header}
                        {active ? (
                          dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
                        ) : (
                          <ChevronsUpDown size={11} className="opacity-40" />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>

          {loading ? (
            <tbody>
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} className="p-0">
                  <TableSkeleton cols={Math.min(columns.length, 7)} rows={pageSize ? Math.min(pageSize, 8) : 8} />
                </td>
              </tr>
            </tbody>
          ) : rows.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)}>
                  <EmptyState icon={emptyIcon} title={emptyTitle} body={emptyBody} action={emptyAction} />
                </td>
              </tr>
            </tbody>
          ) : (
            <tbody>
              {rows.map((r) => {
                const id = r[rowKey]
                const isSel = selected.includes(id)
                return (
                  <tr
                    key={id}
                    onClick={onRowClick ? () => onRowClick(r) : undefined}
                    className={cn(
                      'row',
                      onRowClick && 'cursor-pointer',
                      isSel && 'bg-accent/[.06]',
                      r.__optimistic && 'opacity-60',
                      r.__deleting && 'opacity-35 line-through'
                    )}
                  >
                    {selectable && (
                      <td className="td w-9 pr-0" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSel}
                          onChange={() => onSelected(isSel ? selected.filter((x) => x !== id) : [...selected, id])}
                        />
                      </td>
                    )}
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          'td overflow-hidden text-ellipsis whitespace-nowrap',
                          dense && 'py-2',
                          c.align === 'right' && 'text-right',
                          c.align === 'center' && 'text-center',
                          hideClass(c),
                          c.className
                        )}
                      >
                        {c.render ? c.render(r) : <span className="text-muted">{r[c.key] ?? 'Unspecified'}</span>}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          )}
        </table>
      </div>

      {!loading && rows.length > 0 && onPage && (
        <Pagination
          page={page} pageCount={pageCount} pageSize={pageSize} total={total} from={from} to={to}
          onPage={onPage} onPageSize={onPageSize}
        />
      )}
    </div>
  )
}

export function InlineBusy({ label = 'Saving' }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-faint">
      <Loader2 size={11} className="animate-spin" /> {label}
    </span>
  )
}
