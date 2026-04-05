import { useState } from 'react'
import { useTheme } from '../theme'

export function AlignmentMascot() {
  const { theme } = useTheme()
  const [hovered, setHovered] = useState(false)

  return (
    <div className="fixed bottom-4 right-4 z-[10000] pointer-events-auto flex flex-col items-end gap-1.5">
      {/* Whisper tooltip */}
      <div
        className="glass-surface rounded-lg px-3 py-2 text-[10px] italic text-(--color-muted) tracking-[0.04em] pointer-events-none select-none max-w-[200px] shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-400"
        style={{
          opacity: hovered ? 0.9 : 0,
          transform: hovered ? 'translateY(0)' : 'translateY(4px)',
        }}
      >
        {theme.identity.whisperText}
      </div>

      {/* Mascot SVG */}
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="w-8 h-8 text-(--color-accent) transition-opacity duration-300 cursor-default shrink-0"
        style={{ opacity: hovered ? 0.7 : 0.3 }}
        title={theme.identity.mascotTitle}
        dangerouslySetInnerHTML={{ __html: theme.identity.mascotSvg }}
      />
    </div>
  )
}
