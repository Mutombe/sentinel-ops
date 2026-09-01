import React, { useEffect, useState } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, ComposedChart,
  Pie, PieChart, PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'
import { cn, titleCase, num, compact } from '@/lib/utils'

/* Recharts writes colours as SVG presentation attributes, which do not resolve
   CSS custom properties, so read the tokens out of the DOM instead and
   re-read them whenever the theme flips. */
const TOKENS = ['accent', 'accent2', 'ok', 'warn', 'danger', 'critical', 'muted', 'faint', 'line', 'ink', 'surface']

export function useThemeColors() {
  const read = () => {
    const cs = getComputedStyle(document.documentElement)
    const out = {}
    TOKENS.forEach((t) => { out[t] = `rgb(${cs.getPropertyValue('--' + t).trim()})` })
    out.alpha = (t, a) => `rgb(${getComputedStyle(document.documentElement).getPropertyValue('--' + t).trim()} / ${a})`
    return out
  }
  const [c, setC] = useState(read)
  useEffect(() => {
    const ob = new MutationObserver(() => setC(read()))
    ob.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => ob.disconnect()
  }, [])
  return c
}

export function ChartTooltip({ active, payload, label, formatter, labelFormatter }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 shadow-pop">
      {label != null && (
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-faint">
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-[12px]">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color || p.fill }} />
            <span className="text-muted">{titleCase(p.name)}</span>
            <span className="mono ml-auto font-semibold text-ink">
              {formatter ? formatter(p.value, p.name) : num(p.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const axis = (c) => ({ stroke: c.line, tick: { fill: c.faint, fontSize: 11 }, tickLine: false, axisLine: false })

// Keeps large values (loss totals, payroll) from overflowing the axis gutter.
const tick = (v) => (Math.abs(v) >= 10000 ? compact(v) : num(v))

export function TrendChart({ data, height = 220, keys, formatter }) {
  const c = useThemeColors()
  const series = keys || [{ key: 'total', label: 'Incidents', color: 'accent' }]
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c[s.color]} stopOpacity={0.32} />
              <stop offset="100%" stopColor={c[s.color]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={c.line} vertical={false} />
        <XAxis dataKey={data[0]?.day !== undefined ? 'day' : 'week'} {...axis(c)} />
        <YAxis {...axis(c)} width={38} allowDecimals={false} />
        <Tooltip content={<ChartTooltip formatter={formatter} />} cursor={{ stroke: c.line }} />
        {series.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={c[s.color]}
            strokeWidth={2}
            fill={`url(#g-${s.key})`}
            dot={false}
            activeDot={{ r: 3.5, strokeWidth: 0 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function BarsChart({ data, xKey = 'name', bars, height = 220, layout = 'horizontal', formatter, stacked }) {
  const c = useThemeColors()
  const vertical = layout === 'vertical'
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={layout} margin={{ top: 6, right: 10, left: vertical ? 8 : 0, bottom: 0 }} barCategoryGap={vertical ? 6 : '22%'}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.line} vertical={vertical} horizontal={!vertical} />
        {vertical ? (
          <>
            <XAxis type="number" {...axis(c)} tickFormatter={tick} />
            <YAxis type="category" dataKey={xKey} width={132} {...axis(c)} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} {...axis(c)} />
            <YAxis {...axis(c)} width={52} tickFormatter={tick} />
          </>
        )}
        <Tooltip content={<ChartTooltip formatter={formatter} />} cursor={{ fill: c.alpha('ink', 0.04) }} />
        {bars.map((b) => (
          <Bar
            key={b.key}
            dataKey={b.key}
            name={b.label}
            fill={c[b.color]}
            radius={vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]}
            stackId={stacked ? 'a' : undefined}
            maxBarSize={vertical ? 18 : 42}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

export function RevenueChart({ data, height = 240, formatter }) {
  const c = useThemeColors()
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 6, right: 6, left: -6, bottom: 0 }}>
        <defs>
          <linearGradient id="g-collected" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.ok} stopOpacity={0.3} />
            <stop offset="100%" stopColor={c.ok} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={c.line} vertical={false} />
        <XAxis dataKey="period" {...axis(c)} />
        <YAxis {...axis(c)} width={54} tickFormatter={(v) => '$' + (v / 1000).toFixed(0) + 'k'} />
        <Tooltip content={<ChartTooltip formatter={formatter} />} cursor={{ fill: c.alpha('ink', 0.04) }} />
        <Legend
          verticalAlign="top"
          height={28}
          iconType="circle"
          iconSize={7}
          formatter={(v) => <span className="text-[11.5px] text-muted">{v}</span>}
        />
        <Bar dataKey="billed" name="Billed" fill={c.alpha('accent', 0.45)} radius={[4, 4, 0, 0]} maxBarSize={34} />
        <Area type="monotone" dataKey="collected" name="Collected" stroke={c.ok} strokeWidth={2} fill="url(#g-collected)" />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

const SEV_COLORS = { critical: 'critical', high: 'danger', medium: 'warn', low: 'accent' }

export function DonutChart({ data, height = 200, colorMap, centerLabel, centerValue, formatter }) {
  const c = useThemeColors()
  const map = colorMap || SEV_COLORS
  const total = data.reduce((a, d) => a + d.value, 0)
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="88%"
            paddingAngle={2}
            stroke="none"
          >
            {data.map((d, i) => (
              <Cell key={i} fill={c[map[d.name] || ['accent', 'accent2', 'ok', 'warn', 'danger', 'critical'][i % 6]]} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip formatter={formatter} />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="text-center">
          <p className="mono text-[22px] font-bold leading-none text-ink">{centerValue ?? num(total)}</p>
          <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-wider text-faint">{centerLabel || 'Total'}</p>
        </div>
      </div>
    </div>
  )
}

export function GaugeChart({ value, label, height = 150, tone = 'ok' }) {
  const c = useThemeColors()
  const data = [{ name: label, value: Math.max(0, Math.min(100, value)) }]
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <RadialBarChart innerRadius="72%" outerRadius="100%" data={data} startAngle={220} endAngle={-40}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar background={{ fill: c.alpha('ink', 0.07) }} dataKey="value" cornerRadius={8} fill={c[tone]} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center pt-2">
        <div className="text-center">
          <p className="mono text-[24px] font-bold leading-none text-ink">{Math.round(value)}%</p>
          <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-wider text-faint">{label}</p>
        </div>
      </div>
    </div>
  )
}

export function Legend2({ items, className }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5', className)}>
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5 text-[11.5px] text-muted">
          <span className={cn('h-2 w-2 rounded-full', `bg-${i.color}`)} />
          {i.label}
          {i.value != null && <span className="mono font-semibold text-ink">{i.value}</span>}
        </span>
      ))}
    </div>
  )
}

export function Sparkline({ data, dataKey = 'value', color = 'accent', height = 34 }) {
  const c = useThemeColors()
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`sp-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c[color]} stopOpacity={0.35} />
            <stop offset="100%" stopColor={c[color]} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey={dataKey} stroke={c[color]} strokeWidth={1.6} fill={`url(#sp-${color})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
