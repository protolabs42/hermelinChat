/**
 * Simple markdown to HTML converter.
 * Handles: headings, bold, italic, code blocks, inline code, lists, links, paragraphs.
 */
export function markdownToHtml(text: string): string {
  let html = text
    // Code blocks (``` ... ```) — must be before other transforms
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) => {
      const escaped = code.replace(/</g, '&lt;').replace(/>/g, '&gt;')
      return `<pre style="background:var(--color-elevated);padding:10px 12px;border-radius:6px;overflow-x:auto;margin:8px 0;font-size:11px;line-height:1.5"><code>${escaped}</code></pre>`
    })
    // Inline code
    .replace(/`([^`]+)`/g, '<code style="background:var(--color-elevated);padding:1px 5px;border-radius:3px;font-size:0.9em">$1</code>')
    // Headings (### before ## before #)
    .replace(/^### (.+)$/gm, '<div style="font-size:13px;font-weight:700;color:var(--color-text-bright);margin:14px 0 4px">$1</div>')
    .replace(/^## (.+)$/gm, '<div style="font-size:14px;font-weight:700;color:var(--color-text-bright);margin:16px 0 6px">$1</div>')
    .replace(/^# (.+)$/gm, '<div style="font-size:16px;font-weight:700;color:var(--color-accent);margin:16px 0 8px">$1</div>')
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--color-text-bright)">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--color-accent);text-decoration:underline">$1</a>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<div style="padding-left:16px;margin:2px 0">\u2022 $1</div>')
    .replace(/^\* (.+)$/gm, '<div style="padding-left:16px;margin:2px 0">\u2022 $1</div>')
    // Ordered lists
    .replace(/^(\d+)\. (.+)$/gm, '<div style="padding-left:16px;margin:2px 0">$1. $2</div>')
    // Paragraphs (double newline)
    .replace(/\n\n/g, '<div style="margin:8px 0"></div>')
    // Single newlines
    .replace(/\n/g, '<br/>')

  return html
}
