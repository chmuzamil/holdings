// A small, safe Markdown renderer for runbooks. Every character of the input
// is escaped first, so raw HTML (including <script>) shows up as text and
// never runs. Supported: headings (#–###), paragraphs, bullet and numbered
// lists, **bold**, *italic*, `code`, ``` code blocks ```, and links whose
// address is http(s) or mailto. Any other link shows as plain text.

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string)

/** Only these link addresses are kept. */
export function safeUrl(url: string): string | null {
  const value = url.trim()
  if (/^https?:\/\/[^\s]+$/i.test(value)) return value
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(value)) return value
  return null
}

function inline(raw: string): string {
  // Code spans first, so their contents are left as they are.
  const codes: string[] = []
  let text = raw.replace(/`([^`]+)`/g, (_, code: string) => {
    codes.push(`<code>${escapeHtml(code)}</code>`)
    return `\u0000${codes.length - 1}\u0000`
  })
  text = escapeHtml(text)
  // Links: [label](address). The address was escaped above, so undo that just to check it.
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, address: string) => {
    const url = safeUrl(address.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'))
    return url ? `<a href="${escapeHtml(url)}" rel="noopener noreferrer">${label}</a>` : `${label} (${address})`
  })
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  return text.replace(/\u0000(\d+)\u0000/g, (_, index: string) => codes[Number(index)] ?? '')
}

export function renderMarkdown(markdown: string): string {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let paragraph: string[] = []
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null
  let code: string[] | null = null

  const flushParagraph = () => {
    if (paragraph.length) out.push(`<p>${paragraph.map(inline).join('<br>')}</p>`)
    paragraph = []
  }
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((item) => `<li>${inline(item)}</li>`).join('')}</${list.tag}>`)
    list = null
  }

  for (const line of lines) {
    if (code) {
      if (/^```/.test(line.trim())) {
        out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
        code = null
      } else {
        code.push(line)
      }
      continue
    }
    if (/^```/.test(line.trim())) {
      flushParagraph()
      flushList()
      code = []
      continue
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line)
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (heading) {
      flushParagraph()
      flushList()
      // Runbooks sit under the pack's own headings, so they start at h3.
      const level = Math.min((heading[1] as string).length + 2, 6)
      out.push(`<h${level}>${inline(heading[2] as string)}</h${level}>`)
    } else if (bullet || numbered) {
      flushParagraph()
      const tag = bullet ? 'ul' : 'ol'
      if (list && list.tag !== tag) flushList()
      list ??= { tag, items: [] }
      list.items.push((bullet ?? numbered)?.[1] ?? '')
    } else if (!line.trim()) {
      flushParagraph()
      flushList()
    } else {
      flushList()
      paragraph.push(line.trim())
    }
  }
  if (code) out.push(`<pre><code>${escapeHtml((code as string[]).join('\n'))}</code></pre>`)
  flushParagraph()
  flushList()
  return out.join('\n')
}
