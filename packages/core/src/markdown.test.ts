import { describe, expect, it } from 'vitest'
import { buildExitPack, exitPackMarkdown } from './exit'
import { buildHandover, handoverHtml, handoverMarkdown } from './handover'
import { renderMarkdown, safeUrl } from './markdown'
import { fromV1 } from './migrate'

describe('renderMarkdown', () => {
  it('renders the basics', () => {
    expect(renderMarkdown('# Steps\n\nRenew **first**, then *check*.\n\n- one\n- two\n\n1. a\n2. b')).toBe([
      '<h3>Steps</h3>',
      '<p>Renew <strong>first</strong>, then <em>check</em>.</p>',
      '<ul><li>one</li><li>two</li></ul>',
      '<ol><li>a</li><li>b</li></ol>',
    ].join('\n'))
  })

  it('keeps line breaks within a paragraph, and code as written', () => {
    expect(renderMarkdown('line one\nline two')).toBe('<p>line one<br>line two</p>')
    expect(renderMarkdown('Run `npm ci <x>`\n\n```\ndocker compose up -d\n<b>\n```')).toBe('<p>Run <code>npm ci &lt;x&gt;</code></p>\n<pre><code>docker compose up -d\n&lt;b&gt;</code></pre>')
  })

  it('never lets raw HTML or scripts through', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n<a href="javascript:alert(1)">x</a>')
    expect(html).not.toMatch(/<script|<img|<a href="javascript/i)
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('keeps only http(s) and mailto links', () => {
    expect(renderMarkdown('[Registrar](https://registrar.example/login)')).toBe('<p><a href="https://registrar.example/login" rel="noopener noreferrer">Registrar</a></p>')
    expect(renderMarkdown('[Mail me](mailto:me@mail.example)')).toContain('<a href="mailto:me@mail.example"')
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'vbscript:x', '//evil.example', 'file:///etc/passwd']) {
      const html = renderMarkdown(`[click](${bad})`)
      expect(html).not.toContain('<a ')
      expect(html).toContain('click (')
    }
  })

  it('cannot break out of a link attribute', () => {
    const html = renderMarkdown('[x](https://ok.example/"onmouseover="alert(1))')
    expect(html).not.toMatch(/"\s*onmouseover=/)
  })

  it('treats markup inside link labels as text', () => {
    expect(renderMarkdown('[<b>hi</b>](https://ok.example)')).toBe('<p><a href="https://ok.example" rel="noopener noreferrer">&lt;b&gt;hi&lt;/b&gt;</a></p>')
  })

  it('handles empty input', () => {
    expect(renderMarkdown('')).toBe('')
  })
})

describe('safeUrl', () => {
  it('allows only http(s) and mailto', () => {
    expect(safeUrl(' https://a.example ')).toBe('https://a.example')
    expect(safeUrl('http://a.example/x?y=1')).toBe('http://a.example/x?y=1')
    expect(safeUrl('mailto:a@b.example')).toBe('mailto:a@b.example')
    expect(safeUrl('javascript:alert(1)')).toBeNull()
    expect(safeUrl('https://a.example/with space')).toBeNull()
  })
})

describe('runbooks in the packs', () => {
  const data = fromV1({
    projects: [
      { id: 'p1', name: 'Shop', runbook: '1. Renew **shop.example**\n2. Email [support](mailto:help@shop.example)\n\n<script>alert(1)</script>' },
      { id: 'p2', name: 'Old', status: 'Archived' },
    ],
  })
  const now = new Date('2026-10-29T12:00:00Z')

  it('puts the global and project runbooks in the handover pack, rendered safely', () => {
    const doc = buildHandover(data, { owner: 'Sam', recipient: 'Sara', message: '', runbook: '# First\n\nCall [the registrar](https://registrar.example).' }, now)
    expect(doc.sections[1]?.heading).toBe('If I’m unavailable, do this')
    const html = handoverHtml(doc)
    expect(html).toContain('<div class="runbook"><h3>First</h3>')
    expect(html).toContain('<a href="https://registrar.example" rel="noopener noreferrer">the registrar</a>')
    expect(html).toContain('<ol><li>Renew <strong>shop.example</strong></li>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(handoverMarkdown(doc)).toContain('1. Renew **shop.example**')
  })

  it('leaves the section out when there is no runbook, and old data has none', () => {
    const doc = buildHandover(data, { owner: 'Sam', recipient: 'Sara', message: '' }, now)
    expect(doc.sections.some((section) => section.heading.startsWith('If I'))).toBe(false)
    expect(data.projects[1]?.runbook).toBe('')
  })

  it('puts the project runbook in the exit pack', () => {
    const markdown = exitPackMarkdown(buildExitPack(data, 'p1', now)!)
    expect(markdown).toContain('## Runbook\n\n1. Renew **shop.example**')
    expect(exitPackMarkdown(buildExitPack(data, 'p2', now)!)).not.toContain('## Runbook')
  })
})
