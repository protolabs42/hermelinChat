/**
 * Pure builder for react-markdown's `components` prop — no React context,
 * no theme imports, no side effects. Extracted from MarkdownView.tsx so the
 * tsx test runner can import it without pulling in the theme module's
 * Vite-specific `?raw` SVG imports.
 *
 * The factory takes `isDark` explicitly; MarkdownView.tsx derives that from
 * theme.colors.bg and passes it in.
 */
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import vscDarkPlus from 'react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus'
import vs from 'react-syntax-highlighter/dist/esm/styles/prism/vs'

export const REMARK_PLUGINS = [remarkGfm, remarkBreaks]

export function buildComponents(isDark: boolean): Components {
  const codeTheme = isDark ? vscDarkPlus : vs
  return {
    h1: ({ children }) => <h1>{children}</h1>,
    h2: ({ children }) => <h2>{children}</h2>,
    h3: ({ children }) => <h3>{children}</h3>,
    h4: ({ children }) => <h4>{children}</h4>,
    h5: ({ children }) => <h5>{children}</h5>,
    h6: ({ children }) => <h6>{children}</h6>,
    p: ({ children }) => <p>{children}</p>,
    ul: ({ children }) => <ul>{children}</ul>,
    ol: ({ children }) => <ol>{children}</ol>,
    li: ({ children }) => <li>{children}</li>,
    a: ({ children, href }) => (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
    strong: ({ children }) => <strong>{children}</strong>,
    em: ({ children }) => <em>{children}</em>,
    blockquote: ({ children }) => <blockquote>{children}</blockquote>,
    hr: () => <hr />,
    table: ({ children }) => (
      <div className="markdown-table-scroll">
        <table>{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead>{children}</thead>,
    tbody: ({ children }) => <tbody>{children}</tbody>,
    tr: ({ children }) => <tr>{children}</tr>,
    th: ({ children }) => <th>{children}</th>,
    td: ({ children }) => <td>{children}</td>,
    code: (props) => {
      const { children, className } = props
      const isFenced = typeof className === 'string' && /language-/.test(className)
      if (!isFenced) {
        return <code>{children}</code>
      }
      const language = className!.replace('language-', '')
      const value = String(children).replace(/\n$/, '')
      return (
        <SyntaxHighlighter
          language={language || 'text'}
          style={codeTheme}
          useInlineStyles
          codeTagProps={{
            style: { fontFamily: "var(--font-mono, 'Fira Code', monospace)" },
          }}
        >
          {value}
        </SyntaxHighlighter>
      )
    },
    pre: ({ children }) => <>{children}</>,
  }
}
