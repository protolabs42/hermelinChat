/**
 * Interactive input components: Button, TextField, TextArea, CheckBox,
 * ChoicePicker.
 *
 * Phase 3: fully interactive.
 *
 *   - TextField/TextArea/CheckBox/ChoicePicker do two-way binding: typing
 *     or toggling writes the value back into the data model via
 *     setBinding(path, value), triggering a re-render of every component
 *     that binds to that path.
 *
 *   - Each input with a value binding runs its `checks` array on every
 *     change and reports the first failing message via setError(path,
 *     message). A red border + inline error message appears as long as
 *     the check fails. When the input becomes valid again, clearError
 *     removes the entry.
 *
 *   - Button resolves its `action.event.context` against the current data
 *     model and emits an ActionMessage through emitAction. LocalAction
 *     (functionCall) support is stubbed for now — Phase 3 focuses on the
 *     server round-trip.
 *
 * All styling still uses CSS variables via the existing theme tokens so
 * interactive states (focus, error, disabled) follow the user's theme.
 */

import { useMemo } from 'react'
import type { RenderProps } from '../RenderNode'
import type {
  ButtonComponent,
  CheckBoxComponent,
  ChoicePickerComponent,
  TextFieldComponent,
  TextAreaComponent,
  ActionMessage,
  ServerAction,
  JsonPointer,
} from '../../types'
import {
  resolveDynamicString,
  resolveDynamicBoolean,
  resolveActionContext,
  runChecks,
  writePointer,
} from '../resolve'
import { useA2UI } from '../context'

/* =============================================================================
 * Helpers
 * ============================================================================= */

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--color-muted)',
  fontFamily: 'var(--font-sans, system-ui, sans-serif)',
  marginBottom: 4,
}

const inputBaseStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: 'var(--color-elevated)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  color: 'var(--color-text-bright)',
  fontFamily: 'var(--font-sans, system-ui, sans-serif)',
  fontSize: 12,
  outline: 'none',
}

function inputStyleFor(hasError: boolean): React.CSSProperties {
  return hasError
    ? {
        ...inputBaseStyle,
        border: '1px solid var(--color-danger)',
        background: 'color-mix(in srgb, var(--color-danger) 8%, var(--color-elevated))',
      }
    : inputBaseStyle
}

function errorMessageStyle(): React.CSSProperties {
  return {
    fontSize: 12,
    color: 'var(--color-danger)',
    fontFamily: 'var(--font-sans, system-ui, sans-serif)',
    marginTop: 4,
  }
}

/**
 * Extract the JSON Pointer path from a DynamicString binding, if any.
 * Used by input components that need to know WHERE to write the user's
 * input. Returns undefined when the binding is a literal or function call.
 */
function pathOf(value: unknown): string | undefined {
  if (value && typeof value === 'object' && 'path' in (value as JsonPointer)) {
    const p = (value as JsonPointer).path
    if (typeof p === 'string') return p
  }
  return undefined
}

/* =============================================================================
 * Button
 * ============================================================================= */

const ButtonRender = ({ component, surface }: RenderProps) => {
  const c = component as ButtonComponent
  const { dataModel, emitAction } = useA2UI()
  const text = resolveDynamicString(c.text, surface.dataModel)
  const disabled = resolveDynamicBoolean(c.disabled, surface.dataModel)

  const variantStyle: React.CSSProperties = (() => {
    switch (c.variant) {
      case 'secondary':
        return {
          background: 'var(--color-elevated)',
          color: 'var(--color-text-bright)',
          border: '1px solid var(--color-border)',
        }
      case 'ghost':
        return {
          background: 'transparent',
          color: 'var(--color-text)',
          border: 'none',
        }
      case 'danger':
        return {
          background: 'var(--color-danger)',
          color: 'var(--color-bg)',
          border: 'none',
        }
      case 'primary':
      default:
        return {
          background: 'var(--color-accent)',
          color: 'var(--color-bg)',
          border: 'none',
        }
    }
  })()

  const handleClick = () => {
    if (disabled || !c.action) return

    // Server action → build A2UI ActionMessage, resolve context from data model.
    //
    // NOTE: A2UI v0.9 treats full data-model echoes as transport metadata,
    // not as a field of `action`. We nest it here as an Aurora-local shim
    // for Phase 4 so the agent gets the whole model in one round-trip over
    // the marker-prompt transport. When we promote actions to a first-class
    // ACP event (Phase 7+), the dataModel moves to the envelope and this
    // branch goes back to spec-pure `{action: {...}}`. Keep clearly marked.
    if ('event' in c.action) {
      const server = c.action as ServerAction
      const message: ActionMessage = {
        action: {
          name: server.event.name,
          surfaceId: surface.surfaceId,
          sourceComponentId: c.id,
          timestamp: new Date().toISOString(),
          context: resolveActionContext(server.event.context, dataModel),
          ...(surface.sendDataModel ? { dataModel } : {}),
        },
      }
      emitAction(message)
      return
    }

    // Local action (functionCall) — Phase 3 leaves openUrl/copyToClipboard
    // as stubs; they'll be filled in alongside the hermes transport wiring.
    // eslint-disable-next-line no-console
    console.warn('[A2UI] local functionCall action not yet implemented:', c.action)
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      style={{
        ...variantStyle,
        padding: '8px 16px',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        minHeight: 32,
      }}
    >
      {text}
    </button>
  )
}

/* =============================================================================
 * TextField / TextArea
 * ============================================================================= */

const TextFieldRender = ({ component }: RenderProps) => {
  const c = component as TextFieldComponent
  const { dataModel, setBinding, errors, setError, clearError } = useA2UI()
  const value = resolveDynamicString(c.value, dataModel)
  const disabled = resolveDynamicBoolean(c.disabled, dataModel)
  const boundPath = useMemo(() => pathOf(c.value), [c.value])
  const errorMessage = boundPath ? errors[boundPath] : undefined

  const htmlType =
    c.variant === 'email' ? 'email'
    : c.variant === 'password' ? 'password'
    : c.variant === 'number' ? 'number'
    : c.variant === 'url' ? 'url'
    : c.variant === 'search' ? 'search'
    : 'text'

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value
    if (boundPath) {
      setBinding(boundPath, next)
      // Run validation against a temporary model containing the new value
      // so checks see the value the user just typed rather than the stale one
      const nextModel = writePointer(boundPath, next, dataModel)
      const err = runChecks(c.checks, nextModel)
      if (err) setError(boundPath, err)
      else clearError(boundPath)
    }
  }

  return (
    <label style={{ display: 'block', width: '100%' }}>
      {c.label && <span style={labelStyle}>{c.label}</span>}
      <input
        type={htmlType}
        value={value}
        placeholder={c.placeholder}
        disabled={disabled}
        onChange={handleChange}
        style={inputStyleFor(!!errorMessage)}
      />
      {errorMessage && <div style={errorMessageStyle()}>{errorMessage}</div>}
    </label>
  )
}

const TextAreaRender = ({ component }: RenderProps) => {
  const c = component as TextAreaComponent
  const { dataModel, setBinding, errors, setError, clearError } = useA2UI()
  const value = resolveDynamicString(c.value, dataModel)
  const disabled = resolveDynamicBoolean(c.disabled, dataModel)
  const boundPath = useMemo(() => pathOf(c.value), [c.value])
  const errorMessage = boundPath ? errors[boundPath] : undefined

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value
    if (boundPath) {
      setBinding(boundPath, next)
      const nextModel = writePointer(boundPath, next, dataModel)
      const err = runChecks(c.checks, nextModel)
      if (err) setError(boundPath, err)
      else clearError(boundPath)
    }
  }

  return (
    <label style={{ display: 'block', width: '100%' }}>
      {c.label && <span style={labelStyle}>{c.label}</span>}
      <textarea
        value={value}
        placeholder={c.placeholder}
        rows={c.rows ?? 4}
        disabled={disabled}
        onChange={handleChange}
        style={{
          ...inputStyleFor(!!errorMessage),
          resize: 'vertical',
          fontFamily: 'inherit',
        }}
      />
      {errorMessage && <div style={errorMessageStyle()}>{errorMessage}</div>}
    </label>
  )
}

/* =============================================================================
 * CheckBox
 * ============================================================================= */

const CheckBoxRender = ({ component }: RenderProps) => {
  const c = component as CheckBoxComponent
  const { dataModel, setBinding } = useA2UI()
  const checked = resolveDynamicBoolean(c.value, dataModel)
  const disabled = resolveDynamicBoolean(c.disabled, dataModel)
  const boundPath = useMemo(() => pathOf(c.value), [c.value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (boundPath) setBinding(boundPath, e.target.checked)
  }

  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
        fontSize: 12,
        color: 'var(--color-text)',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={handleChange}
      />
      {c.label}
    </label>
  )
}

/* =============================================================================
 * ChoicePicker
 * ============================================================================= */

const ChoicePickerRender = ({ component }: RenderProps) => {
  const c = component as ChoicePickerComponent
  const { dataModel, setBinding } = useA2UI()
  const isMulti = c.variant === 'multiSelect' || c.variant === 'checklist'

  // Resolve current selection
  let selected: string[] = []
  if (Array.isArray(c.value)) {
    selected = c.value
  } else if (c.value !== undefined) {
    const v = resolveDynamicString(c.value, dataModel)
    if (v) selected = [v]
  }

  const boundPath = useMemo(() => (Array.isArray(c.value) ? undefined : pathOf(c.value)), [c.value])

  const writeSingle = (id: string) => {
    if (boundPath) setBinding(boundPath, id)
  }

  const toggleMulti = (id: string) => {
    if (!boundPath) return
    const next = selected.includes(id)
      ? selected.filter((s) => s !== id)
      : [...selected, id]
    setBinding(boundPath, next)
  }

  if (c.variant === 'radio' || c.variant === 'checklist') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {c.label && <span style={labelStyle}>{c.label}</span>}
        {c.options.map((opt) => {
          const isChecked = selected.includes(opt.id)
          return (
            <label
              key={opt.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: 'var(--color-text)',
                fontFamily: 'var(--font-sans, system-ui, sans-serif)',
                cursor: 'pointer',
              }}
            >
              <input
                type={c.variant === 'radio' ? 'radio' : 'checkbox'}
                name={`a2ui-choice-${c.id}`}
                checked={isChecked}
                onChange={() => (c.variant === 'radio' ? writeSingle(opt.id) : toggleMulti(opt.id))}
              />
              {opt.label}
            </label>
          )
        })}
      </div>
    )
  }

  // singleSelect / multiSelect render as native <select>
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (isMulti) {
      const selectedOptions = Array.from(e.target.selectedOptions).map((o) => o.value)
      if (boundPath) setBinding(boundPath, selectedOptions)
    } else {
      writeSingle(e.target.value)
    }
  }

  return (
    <label style={{ display: 'block', width: '100%' }}>
      {c.label && <span style={labelStyle}>{c.label}</span>}
      <select
        value={isMulti ? selected : selected[0] || ''}
        multiple={isMulti}
        onChange={handleChange}
        style={{ ...inputBaseStyle, cursor: 'pointer' }}
      >
        {c.options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export const InputComponents = {
  Button: ButtonRender,
  TextField: TextFieldRender,
  TextArea: TextAreaRender,
  CheckBox: CheckBoxRender,
  ChoicePicker: ChoicePickerRender,
}
