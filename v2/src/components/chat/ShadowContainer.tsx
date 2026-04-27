import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '../../theme'
import { buildShadowMarkdownCss } from './shadow-styles'

interface ShadowContainerProps {
  children: ReactNode
}

export default function ShadowContainer({ children }: ShadowContainerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const styleRef = useRef<HTMLStyleElement | null>(null)
  const [shadowRoot, setShadowRoot] = useState<ShadowRoot | null>(null)
  const { theme } = useTheme()
  const css = useMemo(() => buildShadowMarkdownCss(theme.colors), [theme.colors])

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return

    const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
    setShadowRoot(root)
  }, [])

  useEffect(() => {
    if (!shadowRoot) return

    let style = styleRef.current
    if (!style || style.parentNode !== shadowRoot) {
      style = document.createElement('style')
      style.setAttribute('data-shadow-markdown-style', 'true')
      shadowRoot.prepend(style)
      styleRef.current = style
    }
    style.textContent = css

    return () => {
      styleRef.current?.remove()
      styleRef.current = null
    }
  }, [css, shadowRoot])

  return (
    <div ref={hostRef} data-shadow-markdown-host>
      {shadowRoot ? createPortal(children, shadowRoot) : null}
    </div>
  )
}
