import { useTheme } from '../../theme'
import { ParticleField } from './ParticleField'
import { MatrixRainField } from './MatrixRainField'
import { NousCRTField } from './NousCRTField'
import { SamaritanField } from './SamaritanField'
import { GrainOverlay } from './GrainOverlay'
import { ScanlinesOverlay } from './ScanlinesOverlay'

export function BackgroundRenderer() {
  const { theme } = useTheme()
  const bg = theme.background
  if (!bg) return null

  const overlayKind = bg.overlay?.kind
  const overlayOpacity = bg.overlay?.opacity

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      pointerEvents: 'none',
    }}>
      {bg.kind === 'matrix-rain' ? (
        <MatrixRainField intensity={50} config={theme.background?.matrixRain} />
      ) : bg.kind === 'nous-crt' ? (
        <NousCRTField intensity={50} />
      ) : bg.kind === 'samaritan' ? (
        <SamaritanField intensity={50} />
      ) : (
        <ParticleField intensity={50} />
      )}

      {overlayKind === 'scanlines' ? (
        <ScanlinesOverlay opacity={overlayOpacity ?? 0.06} />
      ) : overlayKind === 'grain' ? (
        <GrainOverlay opacity={overlayOpacity ?? 0.03} />
      ) : null}
    </div>
  )
}
