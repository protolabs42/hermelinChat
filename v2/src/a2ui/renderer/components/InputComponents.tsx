/**
 * Interactive input components: Button, TextField, TextArea, CheckBox,
 * ChoicePicker.
 *
 * Phase 2: render-only. Inputs display their currently-bound values
 * (read from the data model) but typing/clicking does NOT write back
 * to the data model and does NOT emit actions. Those are Phase 3.
 *
 * All styles follow Aurora Chat's theme via CSS variables so the form
 * components match whatever theme the user is running.
 */

import type { RenderProps } from '../RenderNode'
import type {
  ButtonComponent,
  CheckBoxComponent,
  ChoicePickerComponent,
  TextFieldComponent,
  TextAreaComponent,
} from '../../types'
import {
  resolveDynamicString,
  resolveDynamicBoolean,
} from '../resolve'

const ButtonRender = ({ component, surface }: RenderProps) => {
  const c = component as ButtonComponent
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

  return (
    <button
      type="button"
      disabled={disabled}
      style={{
        ...variantStyle,
        padding: '8px 16px',
        borderRadius: 8,
        fontSize: 13,
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

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--color-muted)',
  fontFamily: 'var(--font-sans, system-ui, sans-serif)',
  marginBottom: 4,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: 'var(--color-elevated)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  color: 'var(--color-text-bright)',
  fontFamily: 'var(--font-sans, system-ui, sans-serif)',
  fontSize: 13,
  outline: 'none',
}

const TextFieldRender = ({ component, surface }: RenderProps) => {
  const c = component as TextFieldComponent
  const value = resolveDynamicString(c.value, surface.dataModel)
  const disabled = resolveDynamicBoolean(c.disabled, surface.dataModel)
  const htmlType =
    c.variant === 'email' ? 'email'
    : c.variant === 'password' ? 'password'
    : c.variant === 'number' ? 'number'
    : c.variant === 'url' ? 'url'
    : c.variant === 'search' ? 'search'
    : 'text'
  return (
    <label style={{ display: 'block', width: '100%' }}>
      {c.label && <span style={labelStyle}>{c.label}</span>}
      <input
        type={htmlType}
        value={value}
        placeholder={c.placeholder}
        disabled={disabled}
        readOnly
        style={inputStyle}
      />
    </label>
  )
}

const TextAreaRender = ({ component, surface }: RenderProps) => {
  const c = component as TextAreaComponent
  const value = resolveDynamicString(c.value, surface.dataModel)
  const disabled = resolveDynamicBoolean(c.disabled, surface.dataModel)
  return (
    <label style={{ display: 'block', width: '100%' }}>
      {c.label && <span style={labelStyle}>{c.label}</span>}
      <textarea
        value={value}
        placeholder={c.placeholder}
        rows={c.rows ?? 4}
        disabled={disabled}
        readOnly
        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
      />
    </label>
  )
}

const CheckBoxRender = ({ component, surface }: RenderProps) => {
  const c = component as CheckBoxComponent
  const checked = resolveDynamicBoolean(c.value, surface.dataModel)
  const disabled = resolveDynamicBoolean(c.disabled, surface.dataModel)
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
        fontSize: 13,
        color: 'var(--color-text)',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <input type="checkbox" checked={checked} readOnly disabled={disabled} />
      {c.label}
    </label>
  )
}

const ChoicePickerRender = ({ component, surface }: RenderProps) => {
  const c = component as ChoicePickerComponent
  const isMulti = c.variant === 'multiSelect' || c.variant === 'checklist'
  // Resolve current value(s)
  let selected: string[] = []
  if (Array.isArray(c.value)) {
    selected = c.value
  } else if (c.value !== undefined) {
    const v = resolveDynamicString(c.value, surface.dataModel)
    if (v) selected = [v]
  }

  // Radio/checklist variants render individual controls; select variants render a <select>.
  if (c.variant === 'radio' || c.variant === 'checklist') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {c.label && <span style={labelStyle}>{c.label}</span>}
        {c.options.map((opt) => (
          <label
            key={opt.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: 'var(--color-text)',
              fontFamily: 'var(--font-sans, system-ui, sans-serif)',
            }}
          >
            <input
              type={c.variant === 'radio' ? 'radio' : 'checkbox'}
              checked={selected.includes(opt.id)}
              readOnly
            />
            {opt.label}
          </label>
        ))}
      </div>
    )
  }

  return (
    <label style={{ display: 'block', width: '100%' }}>
      {c.label && <span style={labelStyle}>{c.label}</span>}
      <select
        value={isMulti ? selected : selected[0] || ''}
        multiple={isMulti}
        disabled
        style={{ ...inputStyle, cursor: 'not-allowed' }}
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
