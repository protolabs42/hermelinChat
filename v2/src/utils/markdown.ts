/**
 * Chat-message markdown → HTML.
 *
 * Block-oriented: splits input on blank lines, classifies each block as
 * heading / list / code-fence / paragraph, then processes inline syntax
 * within each block. No regex-only line-by-line pipeline — that approach
 * produced empty spacer divs and stray <br/> tags after every list item.
 *
 * Headings use `em` so they scale with the user's font-size setting.
 * Block elements own their own vertical rhythm — no empty-div spacers.
 */

const CODE_TOKEN_PREFIX = '\u0001CB'
const CODE_TOKEN_SUFFIX = '\u0001'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function processInline(text: string): string {
  return text
    .replace(
      /`([^`]+)`/g,
      "<code style=\"background:var(--color-elevated);padding:0.15em 0.5em;border-radius:4px;font-size:0.85em;font-family:'Fira Code',monospace\">$1</code>"
    )
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(
      /\*\*(.+?)\*\*/g,
      '<strong style="color:var(--color-text-bright);font-weight:600">$1</strong>'
    )
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener" style="color:var(--color-accent);text-decoration:underline">$1</a>'
    )
}

function renderBlock(block: string, codeBlocks: string[]): string {
  const trimmed = block.trim()
  if (!trimmed) return ''

  // Code fence token — restore verbatim.
  const tokenMatch = trimmed.match(
    new RegExp(`^${CODE_TOKEN_PREFIX}(\\d+)${CODE_TOKEN_SUFFIX}$`)
  )
  if (tokenMatch) {
    return codeBlocks[parseInt(tokenMatch[1], 10)]
  }

  // Headings — always em, proper hierarchy.
  if (/^### /.test(trimmed)) {
    const content = processInline(trimmed.replace(/^### /, ''))
    return `<div style="font-size:1.1em;font-weight:600;color:var(--color-text-bright);margin:0.9em 0 0.35em">${content}</div>`
  }
  if (/^## /.test(trimmed)) {
    const content = processInline(trimmed.replace(/^## /, ''))
    return `<div style="font-size:1.25em;font-weight:700;color:var(--color-text-bright);margin:1em 0 0.4em">${content}</div>`
  }
  if (/^# /.test(trimmed)) {
    const content = processInline(trimmed.replace(/^# /, ''))
    return `<div style="font-size:1.5em;font-weight:700;color:var(--color-accent);margin:1em 0 0.45em">${content}</div>`
  }

  // Lists — require every line to be a list item. Mixed blocks fall through
  // to paragraph handling.
  const lines = trimmed.split('\n')
  const allUnordered = lines.every((l) => /^[-*] /.test(l.trim()))
  const allOrdered = lines.every((l) => /^\d+\. /.test(l.trim()))

  if (allUnordered && lines.length > 0) {
    const items = lines
      .map(
        (l) =>
          `<div style="padding-left:1.5em;margin:0.2em 0">\u2022 ${processInline(
            l.trim().replace(/^[-*] /, '')
          )}</div>`
      )
      .join('')
    return `<div style="margin:0.5em 0">${items}</div>`
  }
  if (allOrdered && lines.length > 0) {
    const items = lines
      .map((l) => {
        const m = l.trim().match(/^(\d+)\. (.*)$/)!
        return `<div style="padding-left:1.5em;margin:0.2em 0">${m[1]}. ${processInline(
          m[2]
        )}</div>`
      })
      .join('')
    return `<div style="margin:0.5em 0">${items}</div>`
  }

  // Plain paragraph — preserve intra-paragraph line breaks as <br/>.
  const content = processInline(trimmed.replace(/\n/g, '<br/>'))
  return `<p style="margin:0.6em 0">${content}</p>`
}

export function markdownToHtml(text: string): string {
  // 1. Extract code fences first, replace with tokens so subsequent splits
  //    and inline processors don't touch their content.
  const codeBlocks: string[] = []
  const withTokens = text.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_m, _lang, code) => {
      const escaped = escapeHtml(code.replace(/\n$/, ''))
      const html = `<pre style="background:var(--color-elevated);border:1px solid var(--color-border);border-radius:8px;padding:1em;margin:0.8em 0;font-size:0.85em;line-height:1.6;font-family:'Fira Code',monospace;overflow-x:auto"><code style="background:none;padding:0;border-radius:0;font-family:inherit">${escaped}</code></pre>`
      codeBlocks.push(html)
      return `\n\n${CODE_TOKEN_PREFIX}${codeBlocks.length - 1}${CODE_TOKEN_SUFFIX}\n\n`
    }
  )

  // 2. Split on blank lines into blocks.
  const blocks = withTokens.split(/\n\s*\n+/)

  // 3. Render each block.
  return blocks.map((b) => renderBlock(b, codeBlocks)).filter(Boolean).join('')
}
