import React, { forwardRef, useId, useState } from 'react'
import { cn, toneFor, titleCase, initials, hueFor } from '@/lib/utils'
import { Loader2, ChevronDown, Check } from 'lucide-react'

/* -------------------------------- Button -------------------------------- */
export const Button = forwardRef(function Button(
  { as: Tag = 'button', variant = 'secondary', size = 'md', loading, icon: Icon, iconRight: IconRight, className, children, ...rest },
  ref
) {
  const iconOnly = !children && (Icon || IconRight)
  return (
    <Tag
      ref={ref}
      className={cn('btn', `btn-${variant}`, iconOnly ? 'btn-icon' : `btn-${size}`, className)}
      disabled={Tag === 'button' ? loading || rest.disabled : undefined}
      {...rest}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : Icon ? <Icon size={size === 'lg' ? 17 : 15} /> : null}
      {children}
      {IconRight && !loading ? <IconRight size={15} /> : null}
    </Tag>
  )
})

/* -------------------------------- Fields -------------------------------- */
export function Field({ label, hint, error, required, children, className }) {
  return (
    <div className={cn('min-w-0', className)}>
      {label && (
        <label className="label">
          {label} {required && <span className="text-critical">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-[11.5px] font-medium text-critical">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[11.5px] text-faint">{hint}</p>
      ) : null}
    </div>
  )
}

export const Input = forwardRef(function Input({ className, error, icon: Icon, ...rest }, ref) {
  return (
    <div className="relative">
      {Icon && <Icon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />}
      <input ref={ref} className={cn('input', Icon && 'pl-9', error && 'border-critical/70 focus:border-critical focus:ring-critical/20', className)} {...rest} />
    </div>
  )
})

export const Textarea = forwardRef(function Textarea({ className, error, rows = 4, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={cn('textarea', error && 'border-critical/70', className)} {...rest} />
})

export const Select = forwardRef(function Select({ className, error, children, ...rest }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={cn('select', error && 'border-critical/70', className)} {...rest}>
        {children}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-faint" />
    </div>
  )
})

export function Checkbox({ checked, indeterminate, onChange, label, className, ...rest }) {
  const id = useId()
  return (
    <label htmlFor={id} className={cn('inline-flex cursor-pointer select-none items-center gap-2', className)}>
      <span
        className={cn(
          'grid h-[16px] w-[16px] place-items-center rounded border transition',
          checked || indeterminate ? 'border-accent bg-accent text-bg' : 'border-line bg-surface2 hover:border-faint'
        )}
      >
        {indeterminate ? <span className="h-[2px] w-[8px] rounded bg-bg" /> : checked ? <Check size={11} strokeWidth={3.5} /> : null}
      </span>
      <input id={id} type="checkbox" className="sr-only" checked={!!checked} onChange={onChange} {...rest} />
      {label && <span className="text-sm text-ink">{label}</span>}
    </label>
  )
}

export function Switch({ checked, onChange, label, hint, disabled }) {
  return (
    <label className={cn('flex items-start justify-between gap-4', disabled && 'opacity-50')}>
      <span className="min-w-0">
        {label && <span className="block text-sm font-medium text-ink">{label}</span>}
        {hint && <span className="mt-0.5 block text-[12px] text-faint">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={!!checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-[22px] w-[38px] shrink-0 rounded-full border transition-colors',
          checked ? 'border-accent bg-accent' : 'border-line bg-surface2'
        )}
      >
        <span
          className={cn(
            'absolute top-[2px] h-[16px] w-[16px] rounded-full bg-white shadow transition-all',
            checked ? 'left-[19px]' : 'left-[2px]'
          )}
        />
      </button>
    </label>
  )
}

/* -------------------------------- Badge --------------------------------- */
export function Badge({ value, label, tone, dot, className, size = 'md' }) {
  const t = tone ? { fg: `text-${tone}`, bg: `bg-${tone}/10`, bd: `border-${tone}/25` } : toneFor(value)
  return (
    <span className={cn('chip', t.fg, t.bg, t.bd, size === 'sm' && 'px-1.5 text-[10px]', className)}>
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full bg-current', value === 'in_progress' && 'animate-pulse')} />}
      {label ?? titleCase(value)}
    </span>
  )
}

export function SeverityDot({ level, className }) {
  const map = { critical: 'bg-critical', high: 'bg-danger', medium: 'bg-warn', low: 'bg-accent' }
  return <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', map[level] || 'bg-muted', className)} />
}

/* -------------------------------- Avatar -------------------------------- */
export function Avatar({ name = '', size = 32, src, hue, className, ring }) {
  const h = hue ?? hueFor(name)
  return (
    <span
      className={cn('relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-bold', ring && 'ring-2 ring-accent/40', className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, size * 0.36),
        background: `linear-gradient(140deg, hsl(${h} 62% 42%), hsl(${(h + 42) % 360} 58% 30%))`,
        color: 'white',
      }}
      title={name}
    >
      {src ? <img src={src} alt={name} className="h-full w-full object-cover" /> : initials(name)}
    </span>
  )
}

/* --------------------------------- Card --------------------------------- */
export function Card({ title, subtitle, actions, children, className, bodyClass, noPad }) {
  return (
    <section className={cn('card flex flex-col', className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {title && <h3 className="truncate text-[13.5px] font-semibold text-ink">{title}</h3>}
            {subtitle && <p className="mt-0.5 truncate text-[12px] text-faint">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={cn(noPad ? '' : 'p-4', 'min-w-0 flex-1', bodyClass)}>{children}</div>
    </section>
  )
}

/* ------------------------------- Segmented ------------------------------ */
export function Segmented({ value, onChange, options, size = 'md', className }) {
  return (
    <div className={cn('inline-flex rounded-lg border border-line bg-surface2 p-0.5', className)}>
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value
        const l = typeof o === 'string' ? titleCase(o) : o.label
        const active = v === value
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={cn(
              'rounded-[6px] font-semibold transition-colors',
              size === 'sm' ? 'px-2.5 py-1 text-[11.5px]' : 'px-3 py-1.5 text-[12.5px]',
              active ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
            )}
          >
            {l}
          </button>
        )
      })}
    </div>
  )
}

/* --------------------------------- Tabs --------------------------------- */
export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cn('flex items-center gap-1 overflow-x-auto border-b border-line', className)}>
      {tabs.map((t) => {
        const active = t.value === value
        return (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            className={cn(
              'relative whitespace-nowrap px-3 py-2.5 text-[13px] font-semibold transition-colors',
              active ? 'text-ink' : 'text-muted hover:text-ink'
            )}
          >
            {t.label}
            {t.count != null && (
              <span className="ml-1.5 rounded-full bg-surface2 px-1.5 py-0.5 text-[10.5px] font-bold text-muted">{t.count}</span>
            )}
            {active && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-accent" />}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------- Progress ------------------------------- */
export function Progress({ value, max = 100, tone = 'accent', className, showLabel }) {
  const p = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface2">
        <div className={cn('h-full rounded-full transition-all duration-500', `bg-${tone}`)} style={{ width: `${p}%` }} />
      </div>
      {showLabel && <span className="mono w-9 shrink-0 text-right text-[11px] text-muted">{Math.round(p)}%</span>}
    </div>
  )
}

/* ------------------------------- Skeleton ------------------------------- */
export const Skeleton = ({ className }) => <div className={cn('skel', className)} />

export function TableSkeleton({ rows = 8, cols = 6 }) {
  return (
    <div className="divide-y divide-line/70">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3.5">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn('h-3.5', c === 0 ? 'w-[22%]' : c === cols - 1 ? 'w-[8%]' : 'w-[13%]')} />
          ))}
        </div>
      ))}
    </div>
  )
}

/* ------------------------------ EmptyState ------------------------------ */
export function EmptyState({ icon: Icon, title, body, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {Icon && (
        <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl border border-line bg-surface2 text-faint">
          <Icon size={20} />
        </div>
      )}
      <p className="text-[14px] font-semibold text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-faint">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/* -------------------------------- Tooltip ------------------------------- */
export function Tooltip({ label, children, side = 'top' }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {children}
      {open && (
        <span
          className={cn(
            'pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink shadow-pop animate-pop',
            side === 'top' && 'bottom-full left-1/2 mb-1.5 -translate-x-1/2',
            side === 'bottom' && 'top-full left-1/2 mt-1.5 -translate-x-1/2',
            side === 'left' && 'right-full top-1/2 mr-1.5 -translate-y-1/2',
            side === 'right' && 'left-full top-1/2 ml-1.5 -translate-y-1/2'
          )}
        >
          {label}
        </span>
      )}
    </span>
  )
}

/* ------------------------------- StatCard ------------------------------- */
export function StatCard({ label, value, delta, deltaLabel, icon: Icon, tone = 'accent', hint, loading, onClick }) {
  const up = delta > 0
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={cn(
        'card group relative overflow-hidden p-4 text-left transition',
        onClick && 'hover:border-faint/50 hover:shadow-pop'
      )}
    >
      <div className={cn('absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-[.07] blur-xl', `bg-${tone}`)} />
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11.5px] font-semibold uppercase tracking-[.07em] text-faint">{label}</span>
        {Icon && (
          <span className={cn('grid h-7 w-7 place-items-center rounded-lg border', `text-${tone} bg-${tone}/10 border-${tone}/20`)}>
            <Icon size={14} />
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-24" />
      ) : (
        <div className="mt-2 flex items-baseline gap-2">
          <span className="mono text-[26px] font-bold leading-none tracking-tight text-ink">{value}</span>
          {delta != null && delta !== 0 && (
            <span className={cn('mono text-[11.5px] font-bold', up ? 'text-critical' : 'text-ok')}>
              {up ? '▲' : '▼'} {Math.abs(delta)}%
            </span>
          )}
        </div>
      )}
      {(hint || deltaLabel) && <p className="mt-1.5 text-[11.5px] text-faint">{hint || deltaLabel}</p>}
    </Tag>
  )
}

export function Spinner({ size = 16, className }) {
  return <Loader2 size={size} className={cn('animate-spin text-muted', className)} />
}
