import { useTheme } from '../../theme'

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null
}

interface ScanlinesOverlayProps {
  opacity?: number
}

export function ScanlinesOverlay({ opacity = 0.06 }: ScanlinesOverlayProps) {
  const { theme } = useTheme()
  const accentHex = theme.colors.accent400
  const accentRgb = hexToRgb(accentHex) || { r: 52, g: 211, b: 153 }
  const stripe = `rgba(${accentRgb.r},${accentRgb.g},${accentRgb.b},0.12)`

  return (
    <div
      className="absolute inset-0 pointer-events-none z-10"
      style={{
        opacity,
        mixBlendMode: 'overlay',
        backgroundImage: `repeating-linear-gradient(to bottom, ${stripe} 0, ${stripe} 1px, rgba(0,0,0,0) 4px, rgba(0,0,0,0) 7px)`,
      }}
    />
  )
}
