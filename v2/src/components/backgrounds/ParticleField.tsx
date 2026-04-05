import { useEffect, useRef } from 'react'
import { useTheme } from '../../theme'

function clampNum(n: unknown, min: number, max: number): number {
  const x = Number(n)
  if (!Number.isFinite(x)) return min
  return Math.min(max, Math.max(min, x))
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null
}

interface ParticleFieldProps {
  intensity?: number
}

export function ParticleField({ intensity = 50 }: ParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { theme } = useTheme()

  const pct = clampNum(intensity, 0, 100)
  const factor = pct / 50
  const canvasOpacity = clampNum(0.6 * factor, 0, 1)

  const accentHex = theme.colors.accent400
  const accentRgb = hexToRgb(accentHex) || { r: 180, g: 190, b: 254 }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let particles: { x: number; y: number; vx: number; vy: number; r: number; o: number }[] = []

    const init = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight

      const count = Math.max(12, Math.round(40 * factor))
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 2 + 0.8,
        o: Math.min(0.35, (Math.random() * 0.2 + 0.05) * factor),
      }))
    }

    let lastFrame = 0
    const FRAME_INTERVAL = 33 // ~30fps

    const draw = (now: number) => {
      animId = requestAnimationFrame(draw)
      if (now - lastFrame < FRAME_INTERVAL) return
      lastFrame = now

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0) p.x = canvas.width
        if (p.x > canvas.width) p.x = 0
        if (p.y < 0) p.y = canvas.height
        if (p.y > canvas.height) p.y = 0
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${accentRgb.r},${accentRgb.g},${accentRgb.b},${p.o})`
        ctx.fill()
      }

      // Connection lines — use squared distance to avoid sqrt
      const connBase = Math.min(0.08, 0.04 * factor)
      const maxDistSq = 14400 // 120 * 120
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dSq = dx * dx + dy * dy
          if (dSq < maxDistSq) {
            const d = Math.sqrt(dSq)
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.strokeStyle = `rgba(${accentRgb.r},${accentRgb.g},${accentRgb.b},${connBase * (1 - d / 120)})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      }
    }

    init()
    window.addEventListener('resize', init)
    animId = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', init)
    }
  }, [factor, accentRgb.r, accentRgb.g, accentRgb.b])

  return (
    <canvas
      ref={canvasRef}
      className="block absolute top-0 left-0 w-full h-full pointer-events-none"
      style={{ opacity: canvasOpacity }}
    />
  )
}
