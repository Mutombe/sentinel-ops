import React from 'react'
import { Search, X, SlidersHorizontal, Download } from 'lucide-react'
import { cn, titleCase, toCSV, download } from '@/lib/utils'
import { Button, Select } from './primitives'
import { useToast } from './Toast'

export function FilterSelect({ label, value, onChange, options, allLabel = 'All' }) {
  return (
    <div className="relative">
      <Select
        value={value ?? 'all'}
        onChange={(e) => onChange(e.target.value)}
        className={cn('h-9 w-auto min-w-[130px] text-[12.5px]', value && value !== 'all' && 'border-accent/50 text-accent')}
        aria-label={label}
      >
        <option value="all">{allLabel} {label.toLowerCase()}</option>
        {options.map((o) => {
          const v = typeof o === 'string' ? o : o.value
          const l = typeof o === 'string' ? titleCase(o) : o.label
          return <option key={v} value={v}>{l}</option>
        })}
      </Select>
    </div>
  )
}

export function Toolbar({
  q, onQ, placeholder = 'Search…',
  filters, activeFilters = 0, onReset,
  right, exportRows, exportName, exportColumns,
  children,
}) {
  const toast = useToast()

  const doExport = () => {
    const rows = typeof exportRows === 'function' ? exportRows() : exportRows
    if (!rows?.length) return toast.warning('Nothing to export')
    download(`${exportName || 'export'}-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows, exportColumns))
    toast.success(`Exported ${rows.length} rows`, { body: 'CSV saved to your downloads folder.' })
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {onQ && (
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={q}
            onChange={(e) => onQ(e.target.value)}
            placeholder={placeholder}
            className="input pl-9 pr-8"
          />
          {q && (
            <button onClick={() => onQ('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-faint hover:text-ink">
              <X size={13} />
            </button>
          )}
        </div>
      )}

      {filters}

      {activeFilters > 0 && (
        <Button size="sm" variant="ghost" icon={SlidersHorizontal} onClick={onReset}>
          Clear {activeFilters}
        </Button>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {children}
        {exportRows && (
          <Button size="sm" variant="secondary" icon={Download} onClick={doExport}>
            <span className="hidden sm:inline">Export</span>
          </Button>
        )}
        {right}
      </div>
    </div>
  )
}
