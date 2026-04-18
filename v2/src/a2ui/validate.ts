/**
 * Minimal A2UI surface validator for Aurora Chat.
 *
 * We do NOT pull in ajv or a full JSON Schema validator at runtime — that's
 * ~120KB for a use case where we only need to check a handful of structural
 * rules and produce actionable error messages the agent can self-correct on.
 *
 * What this validator checks:
 *   - Every component has an id and a component type
 *   - Exactly one component has id='root'
 *   - Every referenced child id actually exists in the components map
 *   - Every required field for each known component type is present
 *   - Component types are from the catalog allowlist
 *
 * What it does NOT check (yet):
 *   - Deep type validity of component props (we trust Aurora when the field exists)
 *   - JSON Pointer resolution against the data model (happens at render time)
 *   - Function call arg shapes (each function checks its own args)
 *   - Validation `checks` — those run on user input, not on the surface
 *
 * Errors are returned as an array of { path, message } pairs matching the
 * A2UI ErrorMessage format so they can be sent back to the agent directly.
 */

import type {
  Component,
  ComponentId,
  ChildList,
  SurfaceState,
} from './types'

export interface ValidationError {
  path: string
  message: string
}

/** Canonical set of component types accepted by the Aurora Chat catalog. */
const KNOWN_COMPONENT_TYPES = new Set<string>([
  'Text',
  'Button',
  'TextField',
  'TextArea',
  'CheckBox',
  'ChoicePicker',
  'Column',
  'Row',
  'Card',
  'List',
  'Divider',
  'Icon',
  'Image',
  'Chart',
  'Map',
  'Mermaid',
  'Table',
  'Logs',
  'Markdown',
  'HtmlEmbed',
  'IframeEmbed',
  'McpApp',
  'VerdictCard',
])

/** Required fields per component type (beyond id/component). */
const REQUIRED_FIELDS: Record<string, readonly string[]> = {
  Text: ['text'],
  Button: ['text'],
  TextField: [],
  TextArea: [],
  CheckBox: [],
  ChoicePicker: ['options'],
  Column: ['children'],
  Row: ['children'],
  Card: ['child'],
  List: ['children'],
  Divider: [],
  Icon: ['name'],
  Image: ['src'],
  Chart: ['data'],
  Map: [],
  Mermaid: ['diagram'],
  Table: ['columns', 'rows'],
  Logs: ['lines'],
  Markdown: ['content'],
  HtmlEmbed: ['html'],
  IframeEmbed: ['url'],
  McpApp: ['resourceUri', 'server'],
  VerdictCard: ['data'],
}

/** Extract all referenced component ids from a children/child field. */
function extractChildIds(value: unknown): ComponentId[] {
  if (value == null) return []
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) {
    // ComponentId[] form
    return value.filter((v): v is string => typeof v === 'string')
  }
  if (typeof value === 'object') {
    const o = value as ChildList & { componentId?: string; path?: string }
    if (typeof o.componentId === 'string') return [o.componentId]
  }
  return []
}

/**
 * Validate a list of components (as they arrive from an updateComponents message)
 * against the Aurora Chat catalog. Returns an empty array if valid.
 */
export function validateComponents(
  components: Component[],
  surfaceId = 'unknown'
): ValidationError[] {
  const errors: ValidationError[] = []
  const seen = new Map<ComponentId, Component>()
  let rootCount = 0

  for (const comp of components) {
    // Basic shape check
    if (!comp || typeof comp !== 'object') {
      errors.push({
        path: `/surfaces/${surfaceId}/components`,
        message: 'Component must be an object',
      })
      continue
    }
    if (typeof comp.id !== 'string' || comp.id.length === 0) {
      errors.push({
        path: `/surfaces/${surfaceId}/components`,
        message: 'Component is missing required field "id"',
      })
      continue
    }
    if (typeof comp.component !== 'string' || comp.component.length === 0) {
      errors.push({
        path: `/surfaces/${surfaceId}/components/${comp.id}`,
        message: 'Component is missing required field "component"',
      })
      continue
    }

    // Component type allowlist
    if (!KNOWN_COMPONENT_TYPES.has(comp.component)) {
      errors.push({
        path: `/surfaces/${surfaceId}/components/${comp.id}/component`,
        message: `Unknown component type "${comp.component}". Must be one of: ${[...KNOWN_COMPONENT_TYPES].sort().join(', ')}`,
      })
      continue
    }

    // Duplicate id check
    if (seen.has(comp.id)) {
      errors.push({
        path: `/surfaces/${surfaceId}/components/${comp.id}`,
        message: `Duplicate component id "${comp.id}"`,
      })
    }
    seen.set(comp.id, comp)

    if (comp.id === 'root') rootCount++

    // Required fields
    const required = REQUIRED_FIELDS[comp.component] || []
    for (const field of required) {
      if (!(field in (comp as unknown as Record<string, unknown>))) {
        errors.push({
          path: `/surfaces/${surfaceId}/components/${comp.id}/${field}`,
          message: `Required field "${field}" is missing on ${comp.component}`,
        })
      }
    }
  }

  // Exactly one root
  if (rootCount === 0) {
    errors.push({
      path: `/surfaces/${surfaceId}/components`,
      message: 'Surface must contain exactly one component with id="root"',
    })
  } else if (rootCount > 1) {
    errors.push({
      path: `/surfaces/${surfaceId}/components`,
      message: `Surface must contain exactly one component with id="root" (found ${rootCount})`,
    })
  }

  // Dangling child references
  for (const comp of seen.values()) {
    const childField = (comp as unknown as Record<string, unknown>).children
    const childSingle = (comp as unknown as Record<string, unknown>).child
    const refs = [...extractChildIds(childField), ...extractChildIds(childSingle)]
    for (const ref of refs) {
      if (!seen.has(ref)) {
        errors.push({
          path: `/surfaces/${surfaceId}/components/${comp.id}/children`,
          message: `Component "${comp.id}" references unknown child "${ref}"`,
        })
      }
    }
  }

  return errors
}

/** Validate an accumulated surface state (used for integration checks). */
export function validateSurface(state: SurfaceState): ValidationError[] {
  const componentList = Object.values(state.components)
  return validateComponents(componentList, state.surfaceId)
}
