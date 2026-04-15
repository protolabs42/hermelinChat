/**
 * MarkdownView — renders assistant chat content with an AST-based parser.
 *
 * Stack (mirrors iOfficeAI/AionUi's proven composition):
 *   react-markdown                  — parser + renderer
 *   remark-gfm                      — tables, task lists, strikethrough, autolinks
 *   remark-breaks                   — single '\n' → <br/> (important for LLM output)
 *   react-syntax-highlighter/prism  — themed code-block highlighting
 *
 * Typography + components live in ./markdown-components so they're
 * importable from tsx tests without pulling in the theme module's SVGs.
 */
import { useMemo } from 'react'
import Markdown from 'react-markdown'
import { useTheme } from '../../theme'
import { buildComponents, REMARK_PLUGINS } from './markdown-components'

interface Props {
  children: string
}

/** YIQ luminance check: picks syntax-highlight theme based on bg darkness. */
function isDarkBg(bg: string): boolean {
  const hex = bg.replace('#', '').padEnd(6, '0').slice(0, 6)
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 < 128
}

export default function MarkdownView({ children }: Props) {
  const { theme } = useTheme()
  const isDark = isDarkBg(theme.colors.bg)
  const components = useMemo(() => buildComponents(isDark), [isDark])

  return (
    <div className="markdown-body">
      <Markdown remarkPlugins={REMARK_PLUGINS} components={components}>
        {children}
      </Markdown>
    </div>
  )
}
