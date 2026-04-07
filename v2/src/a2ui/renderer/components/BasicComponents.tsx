/**
 * Basic display components: Text, Icon, Divider, Image.
 *
 * Simple, no state, no interactivity. Text supports a few variants
 * (body / heading / caption / code) and optional inline markdown.
 * Image reuses the existing ImageRenderer under the hood so we get
 * zoom/pan for free.
 */

import type { RenderProps } from '../RenderNode'
import type {
  TextComponent,
  IconComponent,
  DividerComponent,
  ImageComponent,
} from '../../types'
import { resolveDynamicString } from '../resolve'
import ImageRenderer from '../../../components/artifacts/ImageRenderer'

const TextRender = ({ component, surface }: RenderProps) => {
  const c = component as TextComponent
  const text = resolveDynamicString(c.text, surface.dataModel)

  const style: React.CSSProperties = {
    color: 'var(--color-text)',
    fontFamily: 'var(--font-sans, system-ui, sans-serif)',
    margin: 0,
    textAlign: c.align || 'start',
  }

  // Variant-specific styling, all on the 4px grid
  switch (c.variant) {
    case 'heading1':
      return (
        <h1 style={{ ...style, fontSize: 24, fontWeight: 700, color: 'var(--color-text-bright)' }}>
          {text}
        </h1>
      )
    case 'heading2':
      return (
        <h2 style={{ ...style, fontSize: 20, fontWeight: 600, color: 'var(--color-text-bright)' }}>
          {text}
        </h2>
      )
    case 'heading3':
      return (
        <h3 style={{ ...style, fontSize: 16, fontWeight: 600, color: 'var(--color-text-bright)' }}>
          {text}
        </h3>
      )
    case 'caption':
      return (
        <span style={{ ...style, fontSize: 12, color: 'var(--color-muted)' }}>
          {text}
        </span>
      )
    case 'code':
      return (
        <code
          style={{
            ...style,
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 12,
            background: 'var(--color-elevated)',
            padding: '4px 8px',
            borderRadius: 4,
          }}
        >
          {text}
        </code>
      )
    case 'body':
    default:
      return (
        <p style={{ ...style, fontSize: 14, lineHeight: 1.5 }}>{text}</p>
      )
  }
}

/** Small inline SVG icon set covering the names our catalog mentions.
 *  Everything falls back to a generic square if the name is unknown,
 *  so an unknown icon name is never a hard error. */
function IconSvg({ name, size, color }: { name: string; size: number; color: string }) {
  const stroke = color
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  switch (name.toLowerCase()) {
    case 'check':
      return <svg {...props}><polyline points="20 6 9 17 4 12" /></svg>
    case 'x':
    case 'close':
      return <svg {...props}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
    case 'info':
      return <svg {...props}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="8" /></svg>
    case 'warning':
    case 'alert':
      return <svg {...props}><path d="M10.3 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12" y2="17" /></svg>
    case 'arrow-right':
      return <svg {...props}><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
    case 'arrow-left':
      return <svg {...props}><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
    case 'plus':
      return <svg {...props}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
    case 'minus':
      return <svg {...props}><line x1="5" y1="12" x2="19" y2="12" /></svg>
    case 'external':
    case 'external-link':
      return <svg {...props}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
    default:
      return <svg {...props}><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
  }
}

const IconRender = ({ component }: RenderProps) => {
  const c = component as IconComponent
  const size = c.size ?? 16
  // Resolve named theme color to CSS var
  const colorName = (c.color || 'text').toLowerCase()
  const color = `var(--color-${colorName})`
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', color }}>
      <IconSvg name={c.name} size={size} color="currentColor" />
    </span>
  )
}

const DividerRender = ({ component }: RenderProps) => {
  const c = component as DividerComponent
  return (
    <hr
      style={{
        border: 0,
        borderTop:
          c.variant === 'dashed'
            ? '1px dashed var(--color-border)'
            : '1px solid var(--color-border)',
        margin: 0,
        width: '100%',
      }}
    />
  )
}

const ImageAdapter = ({ component, surface }: RenderProps) => {
  const c = component as ImageComponent
  const src = resolveDynamicString(c.src, surface.dataModel)
  const caption = c.caption ? resolveDynamicString(c.caption, surface.dataModel) : undefined
  // Clamp the ImageRenderer to a reasonable inline height so it doesn't
  // take the full chat viewport. Zoom/pan stays available for details.
  return (
    <div style={{ height: c.height || 320, width: '100%', position: 'relative' }}>
      <ImageRenderer
        data={{
          src,
          alt: c.alt,
          caption,
          fit: c.fit,
          width: c.width,
          height: c.height,
        }}
      />
    </div>
  )
}

export const BasicComponents = {
  Text: TextRender,
  Icon: IconRender,
  Divider: DividerRender,
  Image: ImageAdapter,
}
