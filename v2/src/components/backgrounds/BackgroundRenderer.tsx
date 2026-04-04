import { useTheme } from '../../theme'
import { ParticleField } from './ParticleField'
import { GrainOverlay } from './GrainOverlay'
import { ScanlinesOverlay } from './ScanlinesOverlay'

export function BackgroundRenderer() {
  const { theme } = useTheme()
  const bg = theme.background
  if (!bg) return null

  const overlayKind = bg.overlay?.kind
  const overlayOpacity = bg.overlay?.opacity

  return (
    <>
      {/* For Phase 4 only ParticleField is ported; matrix-rain, nous-crt,
          and samaritan backgrounds will fall back to particles for now. */}
      <ParticleField intensity={50} />

      {overlayKind === 'scanlines' ? (
        <ScanlinesOverlay opacity={overlayOpacity ?? 0.06} />
      ) : overlayKind === 'grain' ? (
        <GrainOverlay opacity={overlayOpacity ?? 0.03} />
      ) : null}
    </>
  )
}
