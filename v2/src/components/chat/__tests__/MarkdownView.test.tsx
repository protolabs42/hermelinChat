/**
 * MarkdownView — renders assistant chat content via react-markdown.
 *
 * We test by rendering <Markdown> directly with our components + plugins via
 * react-dom/server, asserting the static HTML matches our typography and
 * feature expectations. No ThemeProvider needed — buildComponents takes
 * isDark as a plain param.
 */
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import Markdown from 'react-markdown'
import { buildComponents, REMARK_PLUGINS } from '../markdown-components'
import { buildShadowMarkdownCss } from '../shadow-styles'

function render(src: string, isDark = true): string {
  return renderToStaticMarkup(
    createElement(Markdown, {
      remarkPlugins: REMARK_PLUGINS,
      components: buildComponents(isDark),
      children: src,
    })
  )
}

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✗ ${name}`)
    throw err
  }
}

console.log('MarkdownView')

test('shadow stylesheet owns markdown typography and color variables', () => {
  const css = buildShadowMarkdownCss({
    bg: '#000000',
    surface: '#111111',
    elevated: '#222222',
    border: '#333333',
    muted: '#444444',
    text: '#555555',
    textBright: '#666666',
    accent: '#777777',
    danger: '#880000',
    success: '#008800',
    info: '#000088',
    purple: '#550088',
    cyan: '#008888',
    accent300: '#aaaaaa',
    accent400: '#bbbbbb',
    accent500: '#cccccc',
    accent600: '#dddddd',
    accent700: '#eeeeee',
    accent800: '#ffffff',
    accent900: '#121212',
  })
  assert.match(css, /:host/)
  assert.match(css, /--color-accent: #777777;/)
  assert.match(css, /\.markdown-body > \*:first-child/)
  assert.match(css, /\.markdown-body h1/)
  assert.match(css, /\.markdown-body table/)
  assert.match(css, /\.markdown-body blockquote/)
  assert.match(css, /\.markdown-body code:not\(\[class\*="language-"\]\)/)
  assert.match(css, /\.katex/)
})

// ── Heading hierarchy ──────────────────────────────────────────────────

test('h1 renders as semantic heading for shadow typography', () => {
  const html = render('# Hello')
  assert.match(html, /<h1>Hello<\/h1>/)
})

test('h2 renders as semantic heading for shadow typography', () => {
  const html = render('## Hello')
  assert.match(html, /<h2>Hello<\/h2>/)
})

test('h3 renders as semantic heading for shadow typography', () => {
  const html = render('### Hello')
  assert.match(html, /<h3>Hello<\/h3>/)
})

// ── GFM features (the tables/tasklists gap we had before) ──────────────

test('tables render with a scroll wrapper for shadow stylesheet targeting', () => {
  const html = render('| a | b |\n|---|---|\n| 1 | 2 |')
  assert.match(html, /class="markdown-table-scroll"/)
  assert.match(html, /<table>/)
  assert.match(html, /<th>a<\/th>/)
  assert.match(html, /<td>1<\/td>/)
})

test('task lists render checkboxes', () => {
  const html = render('- [x] done\n- [ ] pending')
  // react-markdown + remark-gfm emits <input type="checkbox" disabled> followed by text.
  assert.match(html, /type="checkbox"[^>]*checked/)
  assert.match(html, /done/)
  assert.match(html, /pending/)
})

test('strikethrough renders as <del>', () => {
  const html = render('~~gone~~')
  assert.match(html, /<del>gone<\/del>/)
})

test('autolinks become anchors', () => {
  const html = render('visit https://example.com now')
  assert.match(html, /<a[^>]*href="https:\/\/example\.com"/)
})

// ── Inline code vs fenced code ─────────────────────────────────────────

test('inline code renders as plain code for shadow stylesheet targeting', () => {
  const html = render('Call `foo()` to start.')
  assert.match(html, /<code>foo\(\)<\/code>/)
})

test('fenced code block renders via syntax highlighter', () => {
  const html = render('```js\nconst x = 1\n```')
  // SyntaxHighlighter renders a <pre> wrapper with its own styling
  assert.match(html, /<pre[^>]*>/)
  assert.match(html, /const/)
})

// ── Lists + paragraphs ─────────────────────────────────────────────────

test('paragraph renders as plain p for shadow stylesheet targeting', () => {
  const html = render('Hello world.')
  assert.match(html, /<p>Hello world\.<\/p>/)
})

test('unordered list renders as semantic ul', () => {
  const html = render('- a\n- b')
  assert.match(html, /<ul>/)
})

test('list item renders as semantic li', () => {
  const html = render('- item')
  assert.match(html, /<li>item<\/li>/)
})

// ── Edge cases from the old regex renderer ────────────────────────────

test('text line followed by list (no blank line) renders list properly', () => {
  const html = render('Each NFT is:\n- a vessel\n- a container')
  // Must contain a proper <ul> — not literal "- a vessel" as text.
  assert.match(html, /<ul/)
  assert.match(html, />a vessel</)
  assert.doesNotMatch(html, />- a vessel</)
})

test('bold and italic inline', () => {
  const html = render('This is **bold** and *italic*.')
  assert.match(html, /<strong[^>]*>bold<\/strong>/)
  assert.match(html, /<em>italic<\/em>/)
})

test('blockquote renders as semantic blockquote for shadow stylesheet targeting', () => {
  const html = render('> quoted text')
  assert.match(html, /<blockquote>\s*<p>quoted text<\/p>\s*<\/blockquote>/)
})

console.log('✓ all MarkdownView tests passed')
