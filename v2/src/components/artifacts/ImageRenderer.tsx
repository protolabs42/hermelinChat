/**
 * ImageRenderer — displays an image artifact.
 *
 * Data schema (artifact.data):
 * {
 *   src?: string,           // URL (http/https/file/data:image)
 *   base64?: string,        // raw base64, no prefix — treated as image/png unless mime given
 *   mime?: string,          // e.g. "image/jpeg"
 *   alt?: string,
 *   caption?: string,
 *   width?: number | string,
 *   height?: number | string,
 *   fit?: "contain" | "cover" | "fill" | "none"
 * }
 *
 * Also accepts a bare string (treated as src).
 */

import { useState } from 'react'

interface ImageData {
  src?: string
  base64?: string
  mime?: string
  alt?: string
  caption?: string
  width?: number | string
  height?: number | string
  fit?: 'contain' | 'cover' | 'fill' | 'none'
}

function buildSrc(d: ImageData | string): string {
  if (typeof d === 'string') return d
  if (d.src) return d.src
  if (d.base64) {
    const mime = d.mime || 'image/png'
    const cleaned = d.base64.replace(/^data:[^;]+;base64,/, '')
    return `data:${mime};base64,${cleaned}`
  }
  return ''
}

export default function ImageRenderer({ data }: { data: unknown }) {
  const [errored, setErrored] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const d = (data && typeof data === 'object' ? data : { src: String(data || '') }) as ImageData
  const src = buildSrc(d)
  const alt = d.alt || 'Artifact image'
  const fit = d.fit || 'contain'

  if (!src) {
    return (
      <div style={emptyStyle}>
        <div style={{ fontSize: 12, color: 'var(--color-text-bright)' }}>Image</div>
        <div style={{ fontSize: 12, opacity: 0.7, color: 'var(--color-muted)' }}>No src or base64 provided</div>
      </div>
    )
  }

  if (errored) {
    return (
      <div style={emptyStyle}>
        <div style={{ fontSize: 12, color: 'var(--color-danger)' }}>Failed to load image</div>
        <div style={{ fontSize: 11, color: 'var(--color-muted)', wordBreak: 'break-all', maxWidth: 400 }}>{src}</div>
      </div>
    )
  }

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-bg)',
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          minHeight: 0,
          position: 'relative',
        }}
      >
        {!loaded && (
          <div
            style={{
              position: 'absolute',
              fontSize: 11,
              color: 'var(--color-muted)',
              fontFamily: 'var(--font-mono, monospace)',
            }}
            className="animate-aurora-pulse"
          >
            loading image...
          </div>
        )}
        <img
          src={src}
          alt={alt}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            width: d.width || 'auto',
            height: d.height || 'auto',
            objectFit: fit,
            opacity: loaded ? 1 : 0,
            transition: 'opacity 160ms',
            borderRadius: 4,
          }}
        />
      </div>
      {d.caption && (
        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid var(--color-border)',
            fontSize: 11,
            color: 'var(--color-muted)',
            fontFamily: 'var(--font-mono, monospace)',
            textAlign: 'center',
            flexShrink: 0,
          }}
        >
          {d.caption}
        </div>
      )}
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
