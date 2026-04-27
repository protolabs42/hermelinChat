export interface ShadowMarkdownColors {
  accent300: string
  accent400: string
  accent500: string
  accent600: string
  accent700: string
  accent800: string
  accent900: string
  bg: string
  surface: string
  elevated: string
  border: string
  muted: string
  text: string
  textBright: string
  accent: string
  danger: string
  success: string
  info: string
  purple: string
  cyan: string
}

function colorVars(colors: ShadowMarkdownColors): string {
  return [
    ['--color-bg', colors.bg],
    ['--color-surface', colors.surface],
    ['--color-elevated', colors.elevated],
    ['--color-border', colors.border],
    ['--color-muted', colors.muted],
    ['--color-text', colors.text],
    ['--color-text-bright', colors.textBright],
    ['--color-accent', colors.accent],
    ['--color-danger', colors.danger],
    ['--color-success', colors.success],
    ['--color-info', colors.info],
    ['--color-purple', colors.purple],
    ['--color-cyan', colors.cyan],
    ['--color-accent-300', colors.accent300],
    ['--color-accent-400', colors.accent400],
    ['--color-accent-500', colors.accent500],
    ['--color-accent-600', colors.accent600],
    ['--color-accent-700', colors.accent700],
    ['--color-accent-800', colors.accent800],
    ['--color-accent-900', colors.accent900],
  ].map(([name, value]) => `  ${name}: ${value};`).join('\n')
}

export function buildShadowMarkdownCss(colors: ShadowMarkdownColors): string {
  return `:host {
${colorVars(colors)}
  display: block;
  color: var(--color-text-bright);
  font: inherit;
  line-height: inherit;
}

*, *::before, *::after {
  box-sizing: border-box;
}

.markdown-body {
  color: var(--color-text-bright);
  font: inherit;
  line-height: inherit;
  overflow-wrap: anywhere;
}

.markdown-body > *:first-child { margin-top: 0 !important; }
.markdown-body > *:last-child { margin-bottom: 0 !important; }

.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4,
.markdown-body h5,
.markdown-body h6 {
  line-height: 1.25;
}

.markdown-body h1 {
  margin: 1em 0 0.45em;
  color: var(--color-accent);
  font-size: 1.5em;
  font-weight: 700;
}

.markdown-body h2 {
  margin: 1em 0 0.4em;
  color: var(--color-text-bright);
  font-size: 1.25em;
  font-weight: 700;
}

.markdown-body h3 {
  margin: 0.9em 0 0.35em;
  color: var(--color-text-bright);
  font-size: 1.1em;
  font-weight: 600;
}

.markdown-body h4,
.markdown-body h5,
.markdown-body h6 {
  margin: 0.8em 0 0.3em;
  color: var(--color-text-bright);
  font-size: 1.05em;
  font-weight: 600;
}

.markdown-body p {
  margin: 0.6em 0;
}

.markdown-body ul,
.markdown-body ol {
  margin: 0.5em 0;
  padding-left: 1.25em;
}

.markdown-body li {
  margin: 0.2em 0;
}

.markdown-body a {
  color: var(--color-accent);
  text-decoration: underline;
}

.markdown-body strong {
  color: var(--color-text-bright);
  font-weight: 600;
}

.markdown-body blockquote {
  margin: 0.6em 0;
  padding: 0.3em 0 0.3em 1em;
  border-left: 4px solid var(--color-accent);
  color: var(--color-muted);
  font-style: italic;
}

.markdown-body hr {
  margin: 1em 0;
  border: 0;
  border-top: 1px solid var(--color-border);
}

.markdown-table-scroll {
  margin: 0.6em 0;
  overflow-x: auto;
}

.markdown-body table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95em;
}

.markdown-body th,
.markdown-body td {
  padding: 0.5em 0.75em;
  border: 1px solid var(--color-border);
}

.markdown-body th {
  background: var(--color-elevated);
  color: var(--color-text-bright);
  font-weight: 600;
  text-align: left;
}

.markdown-body code:not([class*="language-"]) {
  border-radius: 4px;
  background: var(--color-elevated);
  padding: 0.15em 0.5em;
  font-family: var(--font-mono, 'Fira Code', monospace);
  font-size: 0.85em;
}

.markdown-body pre {
  margin: 0.8em 0 !important;
  border: 1px solid var(--color-border) !important;
  border-radius: 8px !important;
  background: var(--color-elevated) !important;
  padding: 1em !important;
  overflow-x: auto;
  font-size: 0.85em !important;
  line-height: 1.6 !important;
}

.markdown-body pre code {
  font-family: var(--font-mono, 'Fira Code', monospace) !important;
}

.markdown-body .katex,
.markdown-body .katex-display {
  color: var(--color-text-bright);
  font-size: 1em;
}

.markdown-body .katex-display {
  margin: 0.8em 0;
  overflow-x: auto;
  overflow-y: hidden;
}
`
}
