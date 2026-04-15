/**
 * markdownToHtml — chat message markdown renderer.
 *
 * Contract (driven by the real UX complaints — not arbitrary style):
 *   1. Headings scale with font-size setting → use `em`, never hardcoded `px`,
 *      and form a clear hierarchy h1 > h2 > h3 > body (no inversion).
 *   2. Paragraph breaks produce inline flow margin, not empty `<div>` tags.
 *   3. List items are block elements; no trailing `<br/>` injected after them.
 *   4. Inline formatting (bold, italic, inline code, links) survives inside
 *      list items and paragraphs.
 *   5. Code fences preserved verbatim, escape angle brackets.
 */
import assert from 'node:assert/strict'
import { markdownToHtml } from '../markdown'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✗ ${name}`)
    throw err
  }
}

function matchAll(html: string, re: RegExp): string[] {
  return [...html.matchAll(re)].map((m) => m[1] ?? m[0])
}

console.log('markdownToHtml')

// ── 1. Heading scaling & hierarchy ────────────────────────────────────────

test('h1 size is in em, not px', () => {
  const html = markdownToHtml('# Hello')
  assert.match(html, /font-size:\s*[\d.]+em/, 'h1 should use em')
  assert.doesNotMatch(html, /font-size:\s*\d+px/, 'h1 must not use px')
})

test('h2 size is in em, not px', () => {
  const html = markdownToHtml('## Hello')
  assert.match(html, /font-size:\s*[\d.]+em/)
  assert.doesNotMatch(html, /font-size:\s*\d+px/)
})

test('h3 size is in em and strictly larger than body', () => {
  const html = markdownToHtml('### Hello')
  const match = html.match(/font-size:\s*([\d.]+)em/)
  assert.ok(match, 'h3 should emit font-size in em')
  const size = parseFloat(match![1])
  assert.ok(size > 1, `h3 em value ${size} must be > 1em (body)`)
})

test('heading hierarchy: h1 > h2 > h3', () => {
  const h1 = parseFloat(markdownToHtml('# a').match(/font-size:\s*([\d.]+)em/)![1])
  const h2 = parseFloat(markdownToHtml('## a').match(/font-size:\s*([\d.]+)em/)![1])
  const h3 = parseFloat(markdownToHtml('### a').match(/font-size:\s*([\d.]+)em/)![1])
  assert.ok(h1 > h2, `h1 (${h1}) must be > h2 (${h2})`)
  assert.ok(h2 > h3, `h2 (${h2}) must be > h3 (${h3})`)
})

test('heading content rendered, not raw markdown', () => {
  const html = markdownToHtml('## My Heading')
  assert.match(html, />My Heading</, 'heading text inside element')
  assert.doesNotMatch(html, /##/, 'raw ## should be consumed')
})

// ── 2. Paragraph spacing ──────────────────────────────────────────────────

test('two paragraphs separated by blank line: no empty div injected', () => {
  const html = markdownToHtml('First para.\n\nSecond para.')
  // Reject the classic empty-div-with-margin antipattern.
  assert.doesNotMatch(
    html,
    /<div[^>]*><\/div>/,
    'empty <div></div> is the bug we just fixed'
  )
  // Both paragraphs should still appear.
  assert.match(html, /First para\./)
  assert.match(html, /Second para\./)
})

test('paragraph spacing uses margin on real elements, not empty spacers', () => {
  const html = markdownToHtml('A.\n\nB.')
  // Count structural wrapper elements — should be one per paragraph, not 3.
  // Loose count: elements with inline margin style.
  const withMargin = matchAll(html, /<(p|div)[^>]*style="[^"]*margin:[^"]*"/g)
  assert.ok(
    withMargin.length <= 2,
    `expected ≤2 margin-bearing blocks for 2 paragraphs, got ${withMargin.length}`
  )
})

// ── 3. Lists: no stray <br/> after items ──────────────────────────────────

test('unordered list does not inject <br/> after each item', () => {
  const html = markdownToHtml('- one\n- two\n- three')
  // Count <br/> tags — should be zero for a pure list block.
  const brCount = (html.match(/<br\s*\/?>/g) || []).length
  assert.equal(brCount, 0, `pure list should have 0 <br/>, got ${brCount}`)
  assert.match(html, /one/)
  assert.match(html, /two/)
  assert.match(html, /three/)
})

test('ordered list does not inject <br/> after each item', () => {
  const html = markdownToHtml('1. one\n2. two')
  const brCount = (html.match(/<br\s*\/?>/g) || []).length
  assert.equal(brCount, 0)
})

test('list items render bullet marker', () => {
  const html = markdownToHtml('- alpha\n- beta')
  // Two bullet points
  const bullets = (html.match(/\u2022/g) || []).length
  assert.equal(bullets, 2)
})

// ── 4. Inline formatting survives inside blocks ──────────────────────────

test('bold inside paragraph', () => {
  const html = markdownToHtml('This is **bold** text.')
  assert.match(html, /<strong[^>]*>bold<\/strong>/)
})

test('italic inside paragraph', () => {
  const html = markdownToHtml('This is *italic* text.')
  assert.match(html, /<em>italic<\/em>/)
})

test('inline code inside paragraph', () => {
  const html = markdownToHtml('Call `foo()` to start.')
  assert.match(html, /<code[^>]*>foo\(\)<\/code>/)
})

test('link inside paragraph', () => {
  const html = markdownToHtml('See [docs](https://example.com) now.')
  assert.match(html, /<a[^>]*href="https:\/\/example\.com"[^>]*>docs<\/a>/)
})

// ── 5. Code fences ────────────────────────────────────────────────────────

test('fenced code block escapes angle brackets', () => {
  const html = markdownToHtml('```\nconst x = <T>\n```')
  assert.match(html, /&lt;T&gt;/, 'angle brackets must be escaped')
  assert.doesNotMatch(html, /<T>/, 'raw <T> must not appear')
})

test('fenced code block wrapped in <pre><code>', () => {
  const html = markdownToHtml('```js\nconsole.log(1)\n```')
  assert.match(html, /<pre[^>]*><code[^>]*>[\s\S]*console\.log\(1\)[\s\S]*<\/code><\/pre>/)
})

// ── 6. Real-world shape (mirrors the bug screenshot) ─────────────────────

test('headings + lists + paragraphs render without excessive <br/> or empty divs', () => {
  const source = [
    '## Direction A — life-centric',
    '',
    'Each NFT is a being.',
    '',
    'Good for:',
    '',
    '- companions',
    '- social worlds',
    '- emotional attachment',
    '',
    'Direction B — tradition-centric',
    '',
    'Each NFT is a software place/object.',
  ].join('\n')
  const html = markdownToHtml(source)

  // No empty spacer divs.
  assert.doesNotMatch(html, /<div[^>]*><\/div>/)

  // h2 present and styled with em.
  assert.match(html, /font-size:\s*[\d.]+em[^"]*">Direction A/)

  // All three bullets present.
  assert.match(html, /companions/)
  assert.match(html, /social worlds/)
  assert.match(html, /emotional attachment/)

  // No run of 2+ consecutive <br/> — that was the visible-gap bug.
  assert.doesNotMatch(html, /<br\s*\/?>\s*<br\s*\/?>/)
})

console.log('✓ all markdown tests passed')
