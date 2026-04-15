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

// ── Heading hierarchy ──────────────────────────────────────────────────

test('h1 renders with 1.5em and accent color', () => {
  const html = render('# Hello')
  assert.match(html, /font-size:1\.5em/)
  assert.match(html, /color:var\(--color-accent\)/)
  assert.match(html, />Hello</)
})

test('h2 renders with 1.25em', () => {
  const html = render('## Hello')
  assert.match(html, /font-size:1\.25em/)
})

test('h3 renders with 1.1em', () => {
  const html = render('### Hello')
  assert.match(html, /font-size:1\.1em/)
})

// ── GFM features (the tables/tasklists gap we had before) ──────────────

test('tables render with our bordered cell style', () => {
  const html = render('| a | b |\n|---|---|\n| 1 | 2 |')
  assert.match(html, /<table/)
  assert.match(html, /<th[^>]*border:1px solid/)
  assert.match(html, /<td[^>]*border:1px solid/)
  assert.match(html, />a</)
  assert.match(html, />1</)
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

test('inline code gets elevated background', () => {
  const html = render('Call `foo()` to start.')
  assert.match(html, /<code[^>]*background:var\(--color-elevated\)[^>]*>foo\(\)<\/code>/)
})

test('fenced code block renders via syntax highlighter', () => {
  const html = render('```js\nconst x = 1\n```')
  // SyntaxHighlighter renders a <pre> wrapper with its own styling
  assert.match(html, /<pre[^>]*>/)
  assert.match(html, /const/)
})

// ── Lists + paragraphs ─────────────────────────────────────────────────

test('paragraph gets 0.6em vertical margin', () => {
  const html = render('Hello world.')
  assert.match(html, /<p[^>]*style="margin:0\.6em 0"/)
})

test('unordered list uses 1.25em left padding', () => {
  const html = render('- a\n- b')
  assert.match(html, /<ul[^>]*padding-left:1\.25em/)
})

test('list item 0.2em vertical margin', () => {
  const html = render('- item')
  assert.match(html, /<li[^>]*margin:0\.2em 0/)
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

test('blockquote rendered with left-border accent', () => {
  const html = render('> quoted text')
  assert.match(html, /<blockquote[^>]*border-left:4px solid var\(--color-accent\)/)
  assert.match(html, />quoted text</)
})

console.log('✓ all MarkdownView tests passed')
