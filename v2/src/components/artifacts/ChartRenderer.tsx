/**
 * ChartRenderer — Recharts-backed visualization for artifact type "chart".
 *
 * Data schema (artifact.data):
 * {
 *   kind: "line" | "bar" | "area" | "pie",
 *   data: Array<Record<string, unknown>>,       // row-shaped rows
 *   xKey?: string,                              // which field is the x-axis category
 *   series?: Array<{ key: string, label?: string, color?: string }>,
 *   title?: string,
 *   yLabel?: string,
 *   stacked?: boolean,
 * }
 *
 * Colors fall through: explicit series.color > theme palette (cycled).
 * Everything uses CSS vars via the useTheme() hook so it follows the user's active theme.
 */

import { useMemo } from 'react'
import {
  LineChart, Line,
  BarChart, Bar,
  AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { useTheme } from '../../theme'

type ChartKind = 'line' | 'bar' | 'area' | 'pie'

interface Series {
  key: string
  label?: string
  color?: string
}

interface ChartData {
  kind?: ChartKind
  data?: Array<Record<string, unknown>>
  xKey?: string
  series?: Series[]
  title?: string
  yLabel?: string
  stacked?: boolean
}

export default function ChartRenderer({ data }: { data: unknown }) {
  const { theme } = useTheme()
  const d = (data || {}) as ChartData

  // Build palette from theme accent shades so multi-series charts stay on-brand.
  const palette = useMemo(
    () => [
      theme.colors.accent,
      theme.colors.info,
      theme.colors.success,
      theme.colors.purple,
      theme.colors.cyan,
      theme.colors.danger,
    ].filter(Boolean) as string[],
    [theme]
  )

  const kind: ChartKind = (d.kind || 'line') as ChartKind
  const rows = Array.isArray(d.data) ? d.data : []
  const xKey = d.xKey || 'name'

  // Auto-detect series if not provided: take every non-xKey numeric column
  const series: Series[] = useMemo(() => {
    if (d.series && d.series.length > 0) return d.series
    if (rows.length === 0) return []
    const first = rows[0]
    return Object.keys(first)
      .filter((k) => k !== xKey && typeof first[k] === 'number')
      .map((k) => ({ key: k, label: k }))
  }, [d.series, rows, xKey])

  if (rows.length === 0) {
    return (
      <div style={emptyStyle}>
        <div style={{ fontSize: 12, color: 'var(--color-text-bright)' }}>Chart</div>
        <div style={{ fontSize: 12, opacity: 0.7, color: 'var(--color-muted)' }}>No data provided</div>
      </div>
    )
  }

  const colorFor = (i: number, explicit?: string) => explicit || palette[i % palette.length]

  const axisProps = {
    stroke: theme.colors.muted,
    tick: { fill: theme.colors.muted, fontSize: 11, fontFamily: 'var(--font-mono, monospace)' },
    style: { fontFamily: 'var(--font-mono, monospace)', fontSize: 11 },
  }

  const renderChart = () => {
    if (kind === 'pie') {
      // For pie, assume: data = [{ name, value }] and no series needed
      return (
        <PieChart>
          <Pie
            data={rows}
            dataKey={series[0]?.key || 'value'}
            nameKey={xKey}
            cx="50%"
            cy="50%"
            innerRadius="45%"
            outerRadius="75%"
            paddingAngle={2}
            stroke={theme.colors.bg}
            strokeWidth={2}
          >
            {rows.map((_, i) => (
              <Cell key={i} fill={colorFor(i)} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip theme={theme} />} />
          <Legend
            wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-mono, monospace)', color: theme.colors.muted }}
          />
        </PieChart>
      )
    }

    const commonAxes = (
      <>
        <CartesianGrid stroke={theme.colors.border} strokeDasharray="2 4" />
        <XAxis dataKey={xKey} {...axisProps} />
        <YAxis
          {...axisProps}
          label={
            d.yLabel
              ? { value: d.yLabel, angle: -90, position: 'insideLeft', fill: theme.colors.muted, fontSize: 11 }
              : undefined
          }
        />
        <Tooltip content={<CustomTooltip theme={theme} />} cursor={{ stroke: theme.colors.accent, strokeWidth: 1, strokeDasharray: '2 2' }} />
        {series.length > 1 && (
          <Legend
            wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-mono, monospace)', color: theme.colors.muted }}
          />
        )}
      </>
    )

    if (kind === 'bar') {
      return (
        <BarChart data={rows} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
          {commonAxes}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label || s.key}
              fill={colorFor(i, s.color)}
              stackId={d.stacked ? 'stack' : undefined}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      )
    }

    if (kind === 'area') {
      return (
        <AreaChart data={rows} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
          <defs>
            {series.map((s, i) => {
              const c = colorFor(i, s.color)
              return (
                <linearGradient key={s.key} id={`chart-grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={c} stopOpacity={0} />
                </linearGradient>
              )
            })}
          </defs>
          {commonAxes}
          {series.map((s, i) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label || s.key}
              stroke={colorFor(i, s.color)}
              strokeWidth={2}
              fill={`url(#chart-grad-${s.key})`}
              stackId={d.stacked ? 'stack' : undefined}
            />
          ))}
        </AreaChart>
      )
    }

    // default: line
    return (
      <LineChart data={rows} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
        {commonAxes}
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label || s.key}
            stroke={colorFor(i, s.color)}
            strokeWidth={2}
            dot={{ r: 3, strokeWidth: 0, fill: colorFor(i, s.color) }}
            activeDot={{ r: 5, strokeWidth: 0 }}
          />
        ))}
      </LineChart>
    )
  }

  return (
    <div style={{ padding: 16, height: '100%', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
      {d.title && (
        <div style={{ fontSize: 12, color: 'var(--color-text-bright)', fontWeight: 600, flexShrink: 0 }}>
          {d.title}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/** Custom tooltip — themed, doesn't override chart colors for series values. */
function CustomTooltip({
  active,
  payload,
  label,
  theme,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number | string; color?: string }>
  label?: string | number
  theme: ReturnType<typeof useTheme>['theme']
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div
      style={{
        background: theme.colors.elevated,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: 8,
        padding: '8px 12px',
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: 11,
        color: theme.colors.text,
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      }}
    >
      {label !== undefined && (
        <div style={{ color: theme.colors.textBright, marginBottom: 4, fontWeight: 600 }}>{String(label)}</div>
      )}
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, color: p.color || theme.colors.text }}>
          <span>{p.name}:</span>
          <span style={{ color: theme.colors.textBright, fontWeight: 500 }}>{String(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

const emptyStyle: React.CSSProperties = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: 32,
  textAlign: 'center',
  color: 'var(--color-muted)',
}
