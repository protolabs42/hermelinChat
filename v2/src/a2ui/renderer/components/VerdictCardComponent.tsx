/**
 * VerdictCardComponent — typed ninja-shelf verdict artifact as an A2UI catalog
 * extension.
 *
 * Data schema (surface's `data` field):
 *   {
 *     ca: string                 // contract address
 *     ticker?: string
 *     chain?: 'solana' | 'eth' | 'base' | string
 *     venue?: string             // 'pump.fun' | 'pumpswap' | 'raydium' | 'uniswap' | ...
 *     age_hours?: number
 *     verdict?: {
 *       rugcheck?:    { status, confidence?, summary? }
 *       smart_money?: { status, confidence?, summary? }
 *       launchpad?:   { status, confidence?, summary? }
 *     }
 *     holders?: {
 *       top: Array<HolderEntry>
 *       total_holders?: number
 *     }
 *     provenance?: Array<{ source: string; fetched_at?: number }>
 *     loading?: boolean          // explicit skeleton state hint
 *   }
 *
 * Why this is a typed component rather than a composition of primitives:
 *   - Holder distribution is a pool-vault-discounted stacked bar, not a Chart.
 *     Pool-vault exclusion from the untrusted-concentration sum is correctness-
 *     as-design — burying it in a generic Chart primitive would lose meaning.
 *   - Confidence pips are a bespoke atom (4 dots, partially filled) with no
 *     native catalog equivalent.
 *   - StatusChip vocabulary is ninja-shelf-specific (rugcheck/smart-money/
 *     launchpad statuses), not general UI affordance.
 *
 * Reference implementation: commit eda5477 on feat/v2-verdict-card preserves
 * an earlier typed renderer built against the legacy ArtifactPanel. This file
 * ports the visual DNA (skeleton states, pool-vault tagging, state-fluid
 * materialization) onto the A2UI substrate so per-message inline rendering
 * works.
 */

import type { RenderProps } from '../RenderNode'
import type {
  VerdictCardComponent,
  VerdictCardData,
  VerdictRow,
  VerdictHolderEntry,
} from '../../types'

/* ------------------------------------------------------------------ */
/*  Pure helpers (unit-tested)                                        */
/* ------------------------------------------------------------------ */

/**
 * Map a status string to a (color, glyph, label) tuple. Centralized so all
 * three composer rows share a vocabulary, and the renderer is the single
 * place to extend when new ninja-shelf statuses ship.
 */
export function statusMeta(
  status: string | undefined
): { color: string; glyph: string; label: string } {
  const s = (status || '').toLowerCase()

  if (s === 'ok' || s === 'pass' || s === 'clean' || s === 'safe') {
    return { color: 'var(--color-success)', glyph: '✓', label: status || 'ok' }
  }
  if (s === 'caution' || s === 'warn' || s === 'warning' || s === 'partial') {
    return { color: '#f0ad4e', glyph: '⚠', label: status || 'caution' }
  }
  if (s === 'danger' || s === 'hard_rug' || s === 'rug' || s === 'honeypot' || s === 'fail') {
    return { color: 'var(--color-danger)', glyph: '⛔', label: status || 'danger' }
  }
  if (s === 'whale_solo' || s === 'whale_dominant') {
    return { color: 'var(--color-purple, #b4befe)', glyph: '◈', label: status || 'whale_solo' }
  }
  if (s === 'cluster_concentrated' || s === 'bundler_pattern' || s === 'bundler') {
    return { color: 'var(--color-purple, #b4befe)', glyph: '⬢', label: status || 'bundler' }
  }
  if (s === 'broad' || s === 'organic' || s === 'distributed') {
    return { color: 'var(--color-success)', glyph: '◇', label: status || 'broad' }
  }
  return { color: 'var(--color-muted)', glyph: '?', label: status || 'pending' }
}

export function shortAddress(addr: string): string {
  if (!addr) return ''
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function formatPct(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(2)}%`
}

export function formatAge(hours: number | undefined): string {
  if (typeof hours !== 'number' || !Number.isFinite(hours)) return '—'
  if (hours < 1) return `${Math.round(hours * 60)}m`
  if (hours < 48) return `${hours.toFixed(1)}h`
  return `${Math.floor(hours / 24)}d`
}

export function formatRelative(ts: number | undefined): string {
  if (!ts) return ''
  const now = Date.now() / 1000
  const diff = Math.max(0, now - ts)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

/**
 * Split top-holder percentages into untrusted (treated as concentration signal)
 * vs pool-vault (discounted — these are pool LP vaults, not circulating supply
 * in user hands). Non-finite pct values are silently dropped.
 *
 * This is correctness-as-design: the card's top-holder bar and the overall
 * "concentration" read depend on this split. If pool vaults were included in
 * untrusted, a token with 70% of supply locked in a PumpSwap pool would look
 * like a rug when it's actually healthy bootstrap liquidity.
 */
export function concentrationSplit(
  holders: ReadonlyArray<VerdictHolderEntry>
): { untrustedPct: number; poolVaultPct: number } {
  let untrustedPct = 0
  let poolVaultPct = 0
  for (const h of holders) {
    const v = Number.isFinite(h.pct) ? h.pct : 0
    if (h.is_pool_vault) poolVaultPct += v
    else untrustedPct += v
  }
  return { untrustedPct, poolVaultPct }
}

/* ------------------------------------------------------------------ */
/*  Renderer                                                          */
/* ------------------------------------------------------------------ */

/**
 * Resolve a VerdictCard `data` field to an actual VerdictCardData object.
 * Accepts a literal VerdictCardData or a JSON Pointer {path: '/foo/bar'}
 * into the surface's data model. Path resolution is intentionally minimal
 * (same pattern as resolve.ts for DynamicString) and falls through to an
 * empty object on unresolvable paths so the renderer shows its skeleton
 * state rather than crashing.
 */
function resolveData(
  data: VerdictCardData | { path: string } | undefined,
  dataModel: unknown
): VerdictCardData {
  if (!data) return {}
  if ('path' in data && typeof (data as { path: string }).path === 'string') {
    const segs = (data as { path: string }).path.replace(/^\//, '').split('/').filter(Boolean)
    let cursor: unknown = dataModel
    for (const k of segs) {
      if (!cursor || typeof cursor !== 'object') return {}
      cursor = (cursor as Record<string, unknown>)[k]
    }
    return (cursor as VerdictCardData) || {}
  }
  return data as VerdictCardData
}

function Chip({
  children,
  color,
  dim,
}: {
  children: React.ReactNode
  color?: string
  dim?: boolean
}) {
  return (
    <span
      style={{
        fontSize: 10,
        padding: '2px 8px',
        borderRadius: 99,
        border: `1px solid ${color || 'var(--color-border)'}`,
        color: color || 'var(--color-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        whiteSpace: 'nowrap',
        opacity: dim ? 0.55 : 1,
      }}
    >
      {children}
    </span>
  )
}

function StatusChip({ status }: { status: string | undefined }) {
  const meta = statusMeta(status)
  const isPending = !status || statusMeta(status).glyph === '?'
  return (
    <span
      className={isPending ? 'animate-aurora-pulse' : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 8px',
        borderRadius: 99,
        fontSize: 11,
        fontWeight: 600,
        color: meta.color,
        border: `1px solid ${meta.color}`,
        background: `color-mix(in srgb, ${meta.color} 8%, transparent)`,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: 10, lineHeight: 1 }}>{meta.glyph}</span>
      <span>{meta.label}</span>
    </span>
  )
}

function ConfidencePips({ confidence }: { confidence: number | undefined }) {
  const filled =
    typeof confidence === 'number'
      ? Math.round(Math.max(0, Math.min(1, confidence)) * 4)
      : 0
  return (
    <span
      style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}
      title={
        typeof confidence === 'number'
          ? `confidence ${(confidence * 100).toFixed(0)}%`
          : 'no confidence reported'
      }
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: i < filled ? 'var(--color-accent)' : 'transparent',
            border: '1px solid var(--color-border)',
            flexShrink: 0,
          }}
        />
      ))}
    </span>
  )
}

function Section({
  label,
  meta,
  children,
}: {
  label: string
  meta?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: 'var(--color-muted)',
            fontFamily: "'Fira Code', monospace",
          }}
        >
          {label}
        </span>
        {meta}
      </div>
      <div>{children}</div>
    </div>
  )
}

function Header({ d }: { d: VerdictCardData }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-bright)' }}>
          {d.ticker || 'unknown'}
        </span>
        {d.ca && (
          <span style={{ fontSize: 11, color: 'var(--color-muted)' }} title={d.ca}>
            {shortAddress(d.ca)}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {d.chain && <Chip color="var(--color-accent)">{d.chain}</Chip>}
        {d.venue && <Chip color="var(--color-info, var(--color-cyan))">{d.venue}</Chip>}
        {typeof d.age_hours === 'number' && <Chip>age {formatAge(d.age_hours)}</Chip>}
      </div>
    </div>
  )
}

function VerdictTriangle({ d }: { d: VerdictCardData }) {
  const verdict = d.verdict || {}
  const rows: Array<{ key: string; label: string; row: VerdictRow | undefined }> = [
    { key: 'rugcheck', label: 'rugcheck', row: verdict.rugcheck },
    { key: 'smart_money', label: 'smart-money', row: verdict.smart_money },
    { key: 'launchpad', label: 'launchpad', row: verdict.launchpad },
  ]

  return (
    <Section label="VERDICT">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(({ key, label, row }, idx) => (
          <div
            key={key}
            className="animate-fade-in"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 8,
              background: 'var(--color-elevated)',
              border: '1px solid var(--color-border)',
              animationDelay: `${idx * 80}ms`,
              animationFillMode: 'both',
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: 'var(--color-muted)',
                width: 88,
                flexShrink: 0,
                fontFamily: "'Fira Code', monospace",
              }}
            >
              {label}
            </span>
            <StatusChip status={row?.status} />
            <div style={{ flex: 1, minWidth: 0 }}>
              {row?.summary && (
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--color-text)',
                    opacity: 0.8,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: 'block',
                    whiteSpace: 'nowrap',
                  }}
                  title={row.summary}
                >
                  {row.summary}
                </span>
              )}
            </div>
            <ConfidencePips confidence={row?.confidence} />
          </div>
        ))}
      </div>
    </Section>
  )
}

function HolderDistribution({ d }: { d: VerdictCardData }) {
  const holders = d.holders
  if (!holders || !holders.top || holders.top.length === 0) {
    return (
      <Section label="HOLDERS">
        <div
          className="animate-aurora-pulse"
          style={{ fontSize: 11, color: 'var(--color-muted)', padding: '8px 0' }}
        >
          loading distribution…
        </div>
      </Section>
    )
  }

  const top = holders.top
  const { untrustedPct, poolVaultPct } = concentrationSplit(top)

  return (
    <Section
      label="HOLDERS"
      meta={
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          {typeof holders.total_holders === 'number' && (
            <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>
              {holders.total_holders.toLocaleString()} total
            </span>
          )}
          <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>
            top {formatPct(untrustedPct)} untrusted · {formatPct(poolVaultPct)} pool
          </span>
        </div>
      }
    >
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 8,
          borderRadius: 4,
          overflow: 'hidden',
          border: '1px solid var(--color-border)',
          marginBottom: 12,
        }}
        title={`top-${top.length} concentration · pool vaults discounted`}
      >
        {top.map((h, i) => (
          <div
            key={i}
            style={{
              width: `${Math.max(0.5, Number.isFinite(h.pct) ? h.pct : 0)}%`,
              background: h.is_pool_vault
                ? 'var(--color-muted)'
                : h.is_insider_cluster
                  ? 'var(--color-danger)'
                  : h.is_creator
                    ? 'var(--color-purple, #b4befe)'
                    : 'var(--color-accent)',
              opacity: h.is_pool_vault ? 0.35 : 0.85,
              borderRight: i < top.length - 1 ? '1px solid var(--color-bg)' : undefined,
            }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {top.slice(0, 10).map((h, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 11,
              fontFamily: "'Fira Code', monospace",
              opacity: h.is_pool_vault ? 0.55 : 1,
            }}
          >
            <span
              style={{
                width: 18,
                color: 'var(--color-muted)',
                textAlign: 'right',
                flexShrink: 0,
              }}
            >
              {i + 1}
            </span>
            <span
              style={{
                color: 'var(--color-text)',
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={h.address}
            >
              {shortAddress(h.address)}
            </span>
            <span
              style={{
                width: 64,
                textAlign: 'right',
                color: 'var(--color-text-bright)',
                flexShrink: 0,
              }}
            >
              {formatPct(h.pct)}
            </span>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              {h.is_pool_vault && (
                <Chip color="var(--color-muted)" dim>
                  {h.vault_label || 'pool'}
                </Chip>
              )}
              {h.is_creator && <Chip color="var(--color-purple, #b4befe)">creator</Chip>}
              {h.is_insider_cluster && <Chip color="var(--color-danger)">insider</Chip>}
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

function ProvenanceFooter({ d }: { d: VerdictCardData }) {
  if (!d.provenance || d.provenance.length === 0) return null
  return (
    <Section label="SOURCES">
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {d.provenance.map((p, i) => (
          <Chip key={i}>
            {p.source}
            {p.fetched_at ? ` · ${formatRelative(p.fetched_at)}` : ''}
          </Chip>
        ))}
      </div>
    </Section>
  )
}

/**
 * Default renderer registered in RenderNode.tsx for `component: 'VerdictCard'`.
 */
export function VerdictCardRender({ component, surface }: RenderProps) {
  const c = component as VerdictCardComponent
  const d = resolveData(c.data, surface.dataModel)

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 12,
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      }}
    >
      <Header d={d} />
      <VerdictTriangle d={d} />
      <HolderDistribution d={d} />
      <ProvenanceFooter d={d} />
    </div>
  )
}
