/**
 * Data binding resolver for A2UI Aurora Chat.
 *
 * Every A2UI component property that can carry data is a `DynamicString`,
 * `DynamicNumber`, or `DynamicBoolean` — a value that may be a literal,
 * a JSON Pointer binding `{path: "/foo/bar"}`, or a function call
 * `{call: "formatString", args: {...}}`.
 *
 * This module resolves those values to concrete JS values at render time,
 * given the surface's current data model.
 *
 * Spec refs:
 *   - docs/a2ui-and-mcp-apps-spec-notes.md § Component model
 *   - docs/a2ui-and-mcp-apps-spec-notes.md § Scope resolution
 */

import type {
  DynamicString,
  DynamicNumber,
  DynamicBoolean,
  FunctionCall,
  JsonPointer,
} from '../types'

/** Type guard: JSON Pointer binding `{path: "/..."}`. */
export function isJsonPointer(v: unknown): v is JsonPointer {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as JsonPointer).path === 'string' &&
    (v as JsonPointer).path.startsWith('/') &&
    !('call' in (v as Record<string, unknown>))
  )
}

/** Type guard: catalog function call `{call: "...", args: {...}}`. */
export function isFunctionCall(v: unknown): v is FunctionCall {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as FunctionCall).call === 'string'
  )
}

/**
 * Resolve a JSON Pointer (RFC 6901) against the data model. Returns
 * `undefined` when the path doesn't exist. Supports absolute paths
 * starting with `/`; relative paths are treated as absolute for now
 * (collection-scope iteration is handled by the List renderer itself).
 *
 * Intentionally ~20 lines instead of a dependency — A2UI's pointer use
 * is basic slash-delimited navigation, no `~0`/`~1` escape gymnastics
 * worth a package.
 */
export function resolvePointer(
  pointer: string,
  dataModel: unknown
): unknown {
  if (pointer === '' || pointer === '/') return dataModel
  if (!pointer.startsWith('/')) return undefined

  const segments = pointer
    .slice(1)
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))

  let current: unknown = dataModel
  for (const seg of segments) {
    if (current == null) return undefined
    if (typeof current !== 'object') return undefined
    // Arrays and objects both use string keys here; let JS handle numeric
    // array indices naturally.
    current = (current as Record<string, unknown>)[seg]
  }
  return current
}

/**
 * Execute a catalog function locally. Phase 2 implements the
 * render-side ones (formatString, formatDate, formatNumber). The
 * action-side ones (openUrl, copyToClipboard) are wired in Phase 3.
 *
 * Functions receive their args with any nested bindings already
 * resolved — this function calls itself recursively via `resolveArgs`.
 */
export function callFunction(
  fn: FunctionCall,
  dataModel: unknown
): unknown {
  const args = resolveArgs(fn.args || {}, dataModel)

  switch (fn.call) {
    case 'formatString': {
      const template = String((args as Record<string, unknown>).template ?? '')
      const values = ((args as Record<string, unknown>).values ?? {}) as Record<string, unknown>
      // Interpolate ${path} references either from values or from the
      // current data model. Matches A2UI's formatString semantics.
      return template.replace(/\$\{([^}]+)\}/g, (_match, expr: string) => {
        const key = expr.trim()
        if (key in values) return String(values[key] ?? '')
        const pointer = key.startsWith('/') ? key : `/${key}`
        const v = resolvePointer(pointer, dataModel)
        return v == null ? '' : String(v)
      })
    }

    case 'formatDate': {
      const raw = (args as Record<string, unknown>).value
      if (raw == null) return ''
      const d = new Date(String(raw))
      if (isNaN(d.getTime())) return String(raw)
      const format = String((args as Record<string, unknown>).format ?? 'YYYY-MM-DD')
      if (format === 'relative') {
        const diffMs = Date.now() - d.getTime()
        const abs = Math.abs(diffMs) / 1000
        if (abs < 60) return 'just now'
        if (abs < 3600) return `${Math.floor(abs / 60)}m ${diffMs > 0 ? 'ago' : 'from now'}`
        if (abs < 86400) return `${Math.floor(abs / 3600)}h ${diffMs > 0 ? 'ago' : 'from now'}`
        return d.toLocaleDateString()
      }
      // Minimal format tokens — expand later as real use cases appear
      return format
        .replace('YYYY', String(d.getFullYear()))
        .replace('MM', String(d.getMonth() + 1).padStart(2, '0'))
        .replace('DD', String(d.getDate()).padStart(2, '0'))
        .replace('HH', String(d.getHours()).padStart(2, '0'))
        .replace('mm', String(d.getMinutes()).padStart(2, '0'))
        .replace('ss', String(d.getSeconds()).padStart(2, '0'))
    }

    case 'formatNumber': {
      const raw = Number((args as Record<string, unknown>).value)
      if (!Number.isFinite(raw)) return ''
      const precision = (args as Record<string, unknown>).precision
      const unit = String((args as Record<string, unknown>).unit ?? '')
      let out =
        typeof precision === 'number'
          ? raw.toLocaleString(undefined, {
              minimumFractionDigits: precision,
              maximumFractionDigits: precision,
            })
          : raw.toLocaleString()
      if (unit) out += ` ${unit}`
      return out
    }

    default:
      // Unknown function — leave unresolved. Validation catches this
      // upstream; at render time we prefer graceful degradation.
      return undefined
  }
}

/** Resolve every value in an args object, recursing into nested bindings. */
function resolveArgs(
  args: Record<string, unknown>,
  dataModel: unknown
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args)) {
    out[k] = resolveAny(v, dataModel)
  }
  return out
}

/** Resolve an arbitrary value. If it looks like a binding, resolve; otherwise pass through. */
function resolveAny(value: unknown, dataModel: unknown): unknown {
  if (isJsonPointer(value)) return resolvePointer(value.path, dataModel)
  if (isFunctionCall(value)) return callFunction(value, dataModel)
  return value
}

/* =============================================================================
 * Typed helpers — render code uses these to get strings/numbers/booleans out
 * ============================================================================= */

export function resolveDynamicString(
  v: DynamicString | undefined,
  dataModel: unknown,
  fallback = ''
): string {
  if (v === undefined) return fallback
  if (typeof v === 'string') return v
  if (isJsonPointer(v)) {
    const r = resolvePointer(v.path, dataModel)
    return r == null ? fallback : String(r)
  }
  if (isFunctionCall(v)) {
    const r = callFunction(v, dataModel)
    return r == null ? fallback : String(r)
  }
  return fallback
}

export function resolveDynamicNumber(
  v: DynamicNumber | undefined,
  dataModel: unknown,
  fallback = 0
): number {
  if (v === undefined) return fallback
  if (typeof v === 'number') return v
  if (isJsonPointer(v)) {
    const r = resolvePointer(v.path, dataModel)
    const n = Number(r)
    return Number.isFinite(n) ? n : fallback
  }
  if (isFunctionCall(v)) {
    const r = callFunction(v, dataModel)
    const n = Number(r)
    return Number.isFinite(n) ? n : fallback
  }
  return fallback
}

export function resolveDynamicBoolean(
  v: DynamicBoolean | undefined,
  dataModel: unknown,
  fallback = false
): boolean {
  if (v === undefined) return fallback
  if (typeof v === 'boolean') return v
  if (isJsonPointer(v)) {
    const r = resolvePointer(v.path, dataModel)
    return !!r
  }
  if (isFunctionCall(v)) {
    const r = callFunction(v, dataModel)
    return !!r
  }
  return fallback
}

/** Resolve a field that can be a binding or a literal of any JS type. */
export function resolveAnyField(v: unknown, dataModel: unknown): unknown {
  return resolveAny(v, dataModel)
}
