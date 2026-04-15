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
    h1: ({ children }) => (
      <div
        style={{
          fontSize: '1.5em',
          fontWeight: 700,
          color: 'var(--color-accent)',
          margin: '1em 0 0.45em',
        }}
      >
        {children}
      </div>
    ),
    h2: ({ children }) => (
      <div
        style={{
          fontSize: '1.25em',
          fontWeight: 700,
          color: 'var(--color-text-bright)',
          margin: '1em 0 0.4em',
        }}
      >
        {children}
      </div>
    ),
    h3: ({ children }) => (
      <div
        style={{
          fontSize: '1.1em',
          fontWeight: 600,
          color: 'var(--color-text-bright)',
          margin: '0.9em 0 0.35em',
        }}
      >
        {children}
      </div>
    ),
    h4: ({ children }) => (
      <div
        style={{
          fontSize: '1.05em',
          fontWeight: 600,
          color: 'var(--color-text-bright)',
          margin: '0.8em 0 0.3em',
        }}
      >
        {children}
      </div>
    ),
    p: ({ children }) => (
      <p style={{ margin: '0.6em 0' }}>{children}</p>
    ),
    ul: ({ children }) => (
      <ul style={{ margin: '0.5em 0', paddingLeft: '1.25em' }}>{children}</ul>
    ),
    ol: ({ children }) => (
      <ol style={{ margin: '0.5em 0', paddingLeft: '1.25em' }}>{children}</ol>
    ),
    li: ({ children }) => (
      <li style={{ margin: '0.2em 0' }}>{children}</li>
    ),
    a: ({ children, href }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}
      >
        {children}
      </a>
    ),
    strong: ({ children }) => (
      <strong style={{ color: 'var(--color-text-bright)', fontWeight: 600 }}>
        {children}
      </strong>
    ),
    em: ({ children }) => <em>{children}</em>,
    blockquote: ({ children }) => (
      <blockquote
        style={{
          margin: '0.6em 0',
          padding: '0.3em 0 0.3em 1em',
          borderLeft: '4px solid var(--color-accent)',
          color: 'var(--color-muted)',
          fontStyle: 'italic',
        }}
      >
        {children}
      </blockquote>
    ),
    hr: () => (
      <hr
        style={{
          border: 'none',
          borderTop: '1px solid var(--color-border)',
          margin: '1em 0',
        }}
      />
    ),
    table: ({ children }) => (
      <div style={{ overflowX: 'auto', margin: '0.6em 0' }}>
        <table
          style={{
            borderCollapse: 'collapse',
            width: '100%',
            fontSize: '0.95em',
          }}
        >
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => <thead>{children}</thead>,
    tbody: ({ children }) => <tbody>{children}</tbody>,
    tr: ({ children }) => <tr>{children}</tr>,
    th: ({ children }) => (
      <th
        style={{
          padding: '0.5em 0.75em',
          border: '1px solid var(--color-border)',
          background: 'var(--color-elevated)',
          textAlign: 'left',
          fontWeight: 600,
          color: 'var(--color-text-bright)',
        }}
      >
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td
        style={{
          padding: '0.5em 0.75em',
          border: '1px solid var(--color-border)',
        }}
      >
        {children}
      </td>
    ),
    code: (props) => {
      const { children, className } = props
      const isFenced = typeof className === 'string' && /language-/.test(className)
      if (!isFenced) {
        return (
          <code
            style={{
              background: 'var(--color-elevated)',
              padding: '0.15em 0.5em',
              borderRadius: 4,
              fontSize: '0.85em',
              fontFamily: "'Fira Code', monospace",
            }}
          >
            {children}
          </code>
        )
      }
      const language = className!.replace('language-', '')
      const value = String(children).replace(/\n$/, '')
      return (
        <SyntaxHighlighter
          language={language || 'text'}
          style={codeTheme}
          customStyle={{
            margin: '0.8em 0',
            padding: '1em',
            borderRadius: 8,
            border: '1px solid var(--color-border)',
            fontSize: '0.85em',
            lineHeight: 1.6,
            background: 'var(--color-elevated)',
          }}
          codeTagProps={{
            style: { fontFamily: "'Fira Code', monospace" },
          }}
        >
          {value}
        </SyntaxHighlighter>
      )
    },
    pre: ({ children }) => <>{children}</>,
  }
}
