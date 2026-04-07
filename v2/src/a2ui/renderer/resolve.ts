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
  ValidationCheck,
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

/* =============================================================================
 * Phase 3: writing bindings, action context resolution, validation runner
 * ============================================================================= */

/**
 * Write a value into a data model at a JSON Pointer path. Returns a new
 * data model object (immutable update) so React can detect the change.
 * Intermediate objects are created as needed — writing to `/form/email`
 * when `form` doesn't exist creates `{form: {email: value}}`.
 */
export function writePointer(
  pointer: string,
  value: unknown,
  dataModel: unknown
): unknown {
  if (pointer === '' || pointer === '/') return value

  const segments = pointer
    .slice(1)
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))

  // Shallow clone as we descend so we never mutate the source object
  const root = (dataModel && typeof dataModel === 'object' ? { ...dataModel } : {}) as Record<string, unknown>
  let cursor: Record<string, unknown> = root

  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i]
    const next = cursor[key]
    cursor[key] = next && typeof next === 'object' ? { ...(next as Record<string, unknown>) } : {}
    cursor = cursor[key] as Record<string, unknown>
  }
  cursor[segments[segments.length - 1]] = value
  return root
}

/**
 * Resolve every `{path}` or `{call}` inside an action's context object to
 * concrete values using the current data model. Used when a Button's click
 * handler fires and we need to serialize the current state into an action
 * message.
 *
 * Mirrors A2UI v0.9 semantics: context values that are bindings resolve
 * to their current value at the moment the action is dispatched.
 */
export function resolveActionContext(
  context: Record<string, unknown> | undefined,
  dataModel: unknown
): Record<string, unknown> {
  if (!context) return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(context)) {
    out[k] = resolveAny(v, dataModel)
  }
  return out
}

/**
 * Run a single validation check against the current data model. Returns
 * `null` if the check passes, or the configured error message if it fails.
 * Unknown check functions pass (graceful degradation — we don't want
 * unknown validators to block form submission).
 */
export function runCheck(
  check: ValidationCheck,
  dataModel: unknown
): string | null {
  const args = (check.args || {}) as Record<string, unknown>
  // The resolved value the check is about
  const value = resolveAny(args.value, dataModel)

  const pass = evalCheck(check.call, value, args, dataModel)
  return pass ? null : check.message
}

function evalCheck(
  name: string,
  value: unknown,
  args: Record<string, unknown>,
  dataModel: unknown
): boolean {
  switch (name) {
    case 'required': {
      if (value == null) return false
      if (typeof value === 'string' && value.trim() === '') return false
      if (Array.isArray(value) && value.length === 0) return false
      return true
    }

    case 'email': {
      if (value == null || value === '') return true // empty → required handles it
      // Conservative RFC-5322-lite pattern
      return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    }

    case 'regex': {
      if (value == null) return true
      const pattern = String(args.pattern ?? '')
      if (!pattern) return true
      try {
        return new RegExp(pattern).test(String(value))
      } catch {
        return true
      }
    }

    case 'minLength': {
      if (value == null) return true
      const len = Number(args.length ?? 0)
      return String(value).length >= len
    }

    case 'maxLength': {
      if (value == null) return true
      const len = Number(args.length ?? Infinity)
      return String(value).length <= len
    }

    default:
      // Unknown check — don't block. Log in dev so the developer notices.
      if (typeof process === 'undefined' || process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn(`[A2UI] unknown validation check "${name}"`)
      }
      // Reference dataModel so TS doesn't flag it as unused in this branch
      void dataModel
      return true
  }
}

/**
 * Run every check on a list and return the first failing message, or null
 * if all pass. Returning only the first error keeps the inline UI simple —
 * the user sees one actionable message per field.
 */
export function runChecks(
  checks: ValidationCheck[] | undefined,
  dataModel: unknown
): string | null {
  if (!checks) return null
  for (const check of checks) {
    const err = runCheck(check, dataModel)
    if (err) return err
  }
  return null
}
