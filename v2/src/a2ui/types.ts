/**
 * A2UI protocol types for Aurora Chat.
 *
 * These mirror the A2UI v0.9 spec plus Aurora Chat's catalog extensions.
 * See docs/a2ui-and-mcp-apps-spec-notes.md for the full protocol reference
 * and v2/src/a2ui/catalog.json for the machine-readable schema.
 *
 * Kept hand-written rather than generated so we can add JSDoc, narrow
 * variant unions, and tailor the API to our renderers. If the catalog
 * changes, update both files together.
 */

/* =============================================================================
 * Core protocol types (A2UI v0.9)
 * ============================================================================= */

export type A2UIVersion = 'v0.9'

/** Unique id of a component within a surface. */
export type ComponentId = string

/** JSON Pointer binding into the surface's data model. */
export interface JsonPointer {
  path: string
}

/** Invocation of a catalog function. Args may themselves be Dynamic* values. */
export interface FunctionCall {
  call: string
  args?: Record<string, unknown>
}

/** A string literal, a data binding, or a function call. */
export type DynamicString = string | JsonPointer | FunctionCall

/** A number literal, a data binding, or a function call. */
export type DynamicNumber = number | JsonPointer | FunctionCall

/** A boolean literal, a data binding, or a function call. */
export type DynamicBoolean = boolean | JsonPointer | FunctionCall

/** Children specification: either a static list of ids or a template iteration. */
export type ChildList =
  | ComponentId[]
  | { path: string; componentId: ComponentId }

/** Action that round-trips to the agent. */
export interface ServerAction {
  event: {
    name: string
    context?: Record<string, unknown>
  }
}

/** Action that runs a catalog function locally with no agent round-trip. */
export interface LocalAction {
  functionCall: FunctionCall
}

export type Action = ServerAction | LocalAction

/** Validation rule attached to an input component. */
export interface ValidationCheck {
  call: string
  args?: Record<string, unknown>
  message: string
}

/* =============================================================================
 * Component definitions — basic A2UI catalog + Aurora Chat extensions
 * ============================================================================= */

interface BaseComponent {
  id: ComponentId
}

export interface TextComponent extends BaseComponent {
  component: 'Text'
  text: DynamicString
  markdown?: boolean
  variant?: 'body' | 'caption' | 'heading1' | 'heading2' | 'heading3' | 'code'
  align?: 'start' | 'center' | 'end'
}

export interface ButtonComponent extends BaseComponent {
  component: 'Button'
  text: DynamicString
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  icon?: string
  disabled?: DynamicBoolean
  action?: Action
}

export interface TextFieldComponent extends BaseComponent {
  component: 'TextField'
  label?: string
  placeholder?: string
  value?: DynamicString
  variant?: 'text' | 'email' | 'password' | 'number' | 'url' | 'search'
  disabled?: DynamicBoolean
  checks?: ValidationCheck[]
}

export interface TextAreaComponent extends BaseComponent {
  component: 'TextArea'
  label?: string
  placeholder?: string
  value?: DynamicString
  rows?: number
  disabled?: DynamicBoolean
  checks?: ValidationCheck[]
}

export interface CheckBoxComponent extends BaseComponent {
  component: 'CheckBox'
  label?: string
  value?: DynamicBoolean
  disabled?: DynamicBoolean
}

export interface ChoicePickerComponent extends BaseComponent {
  component: 'ChoicePicker'
  label?: string
  value?: DynamicString | string[]
  variant?: 'singleSelect' | 'multiSelect' | 'radio' | 'checklist'
  options: Array<{ id: string; label: string }>
}

export interface ColumnComponent extends BaseComponent {
  component: 'Column'
  children: ChildList
  gap?: number
  justify?: 'start' | 'center' | 'end' | 'between' | 'around'
  align?: 'start' | 'center' | 'end' | 'stretch'
}

export interface RowComponent extends BaseComponent {
  component: 'Row'
  children: ChildList
  gap?: number
  justify?: 'start' | 'center' | 'end' | 'between' | 'around'
  align?: 'start' | 'center' | 'end' | 'stretch'
  wrap?: boolean
}

export interface CardComponent extends BaseComponent {
  component: 'Card'
  child: ComponentId
  title?: DynamicString
  subtitle?: DynamicString
  variant?: 'elevated' | 'outlined' | 'ghost'
}

export interface ListComponent extends BaseComponent {
  component: 'List'
  children: ChildList
  gap?: number
  maxHeight?: number
}

export interface DividerComponent extends BaseComponent {
  component: 'Divider'
  variant?: 'solid' | 'dashed'
}

export interface IconComponent extends BaseComponent {
  component: 'Icon'
  name: string
  size?: number
  color?: string
}

export interface ImageComponent extends BaseComponent {
  component: 'Image'
  src: DynamicString
  alt?: string
  caption?: DynamicString
  fit?: 'contain' | 'cover' | 'fill' | 'none'
  width?: number
  height?: number
}

/* Aurora Chat extensions */

export interface ChartSeries {
  key: string
  label?: string
  color?: string
}

export interface ChartComponent extends BaseComponent {
  component: 'Chart'
  kind?: 'line' | 'bar' | 'area' | 'pie'
  data: Array<Record<string, unknown>> | JsonPointer
  xKey?: string
  series?: ChartSeries[]
  title?: DynamicString
  yLabel?: string
  stacked?: boolean
}

export interface MapComponent extends BaseComponent {
  component: 'Map'
  center?: [number, number] | Record<string, number> | JsonPointer
  zoom?: number
  markers?: unknown[] | JsonPointer
  geojson?: Record<string, unknown> | JsonPointer
  tiles?: string
}

export interface MermaidComponent extends BaseComponent {
  component: 'Mermaid'
  diagram: DynamicString
}

export interface TableComponent extends BaseComponent {
  component: 'Table'
  columns: string[] | JsonPointer
  rows: unknown[][] | JsonPointer
}

export interface LogsComponent extends BaseComponent {
  component: 'Logs'
  lines: unknown[] | JsonPointer
}

export interface MarkdownComponent extends BaseComponent {
  component: 'Markdown'
  content: DynamicString
}

export interface HtmlEmbedComponent extends BaseComponent {
  component: 'HtmlEmbed'
  html: DynamicString
  height?: number
}

export interface IframeEmbedComponent extends BaseComponent {
  component: 'IframeEmbed'
  url: DynamicString
  height?: number
}

export interface McpAppComponent extends BaseComponent {
  component: 'McpApp'
  resourceUri: string
  server: string
  height?: number
  toolInput?: Record<string, unknown>
}

/** Discriminated union of every component type in the catalog. */
export type Component =
  | TextComponent
  | ButtonComponent
  | TextFieldComponent
  | TextAreaComponent
  | CheckBoxComponent
  | ChoicePickerComponent
  | ColumnComponent
  | RowComponent
  | CardComponent
  | ListComponent
  | DividerComponent
  | IconComponent
  | ImageComponent
  | ChartComponent
  | MapComponent
  | MermaidComponent
  | TableComponent
  | LogsComponent
  | MarkdownComponent
  | HtmlEmbedComponent
  | IframeEmbedComponent
  | McpAppComponent

/* =============================================================================
 * Protocol envelope types — A2UI v0.9 server→client messages
 * ============================================================================= */

export interface CreateSurfaceMessage {
  version: A2UIVersion
  createSurface: {
    surfaceId: string
    catalogId: string
    theme?: Record<string, unknown>
    sendDataModel?: boolean
  }
}

export interface UpdateComponentsMessage {
  version: A2UIVersion
  updateComponents: {
    surfaceId: string
    components: Component[]
  }
}

export interface UpdateDataModelMessage {
  version: A2UIVersion
  updateDataModel: {
    surfaceId: string
    path?: string
    value?: unknown
  }
}

export interface DeleteSurfaceMessage {
  version: A2UIVersion
  deleteSurface: {
    surfaceId: string
  }
}

export type A2UIServerMessage =
  | CreateSurfaceMessage
  | UpdateComponentsMessage
  | UpdateDataModelMessage
  | DeleteSurfaceMessage

/* =============================================================================
 * Protocol envelope types — client→server messages
 * ============================================================================= */

export interface ActionMessage {
  action: {
    name: string
    surfaceId: string
    sourceComponentId: ComponentId
    timestamp: string
    context: Record<string, unknown>
    dataModel?: unknown
  }
}

export interface ErrorMessage {
  error: {
    code: 'VALIDATION_FAILED' | string
    surfaceId: string
    path: string
    message: string
  }
}

export type A2UIClientMessage = ActionMessage | ErrorMessage

/* =============================================================================
 * Runtime surface state — the accumulated view the renderer actually renders
 * ============================================================================= */

/** Accumulated state for a single A2UI surface, built from server messages. */
export interface SurfaceState {
  surfaceId: string
  catalogId: string
  theme?: Record<string, unknown>
  sendDataModel?: boolean
  /** id → component map, built from updateComponents messages. */
  components: Record<ComponentId, Component>
  /** Mutable data model, patched by updateDataModel and user input. */
  dataModel: Record<string, unknown>
  /**
   * Monotonic counter bumped by the store every time a remote A2UI message
   * is folded into this surface. The renderer watches this to re-seed its
   * local data model state on remote updateDataModel pushes. Phase 4.
   */
  revision?: number
}

/* =============================================================================
 * Phase 4: explicit data-model patch ops
 * ============================================================================= */

/**
 * Patch operation for update_data_model tool calls. Explicit `op` lets
 * Aurora distinguish "unset" from "set to null" without ambiguity — LLMs
 * tend to emit null when they mean "remove", and a bare {path, value} shape
 * would make that unrecoverable. Inspired by RFC 6902 but narrowed to the
 * two ops we actually need right now.
 */
export type DataModelPatch =
  | { op: 'set'; path: string; value: unknown }
  | { op: 'remove'; path: string }
