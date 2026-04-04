import { useState } from 'react'
import { useTheme } from '../theme'

export function AlignmentMascot() {
  const { theme } = useTheme()
  const [hovered, setHovered] = useState(false)

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 10000,
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 6,
      }}
    >
      {/* Whisper tooltip */}
      <div
        style={{
          fontSize: 10,
          fontStyle: 'italic',
          color: 'var(--color-muted)',
          letterSpacing: '0.04em',
          opacity: hovered ? 0.8 : 0,
          transform: hovered ? 'translateY(0)' : 'translateY(4px)',
          transition: 'opacity 0.4s ease, transform 0.4s ease',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          userSelect: 'none',
          paddingRight: 2,
        }}
      >
        {theme.identity.whisperText}
      </div>

      {/* Mascot SVG */}
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: 32,
          height: 32,
          color: 'var(--color-accent)',
          opacity: hovered ? 0.7 : 0.3,
          transition: 'opacity 0.3s ease',
          cursor: 'default',
          flexShrink: 0,
        }}
        title={theme.identity.mascotTitle}
        dangerouslySetInnerHTML={{ __html: theme.identity.mascotSvg }}
      />
    </div>
  )
}
