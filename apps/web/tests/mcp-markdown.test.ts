import { convertLexicalToMarkdown, editorConfigFactory } from '@payloadcms/richtext-lexical'
import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'
import type { RichTextField, SanitizedConfig } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  checkLinkUrl,
  lexicalToMarkdown,
  type LexicalNode,
  markdownToLexical,
  normalizeCodeLanguage,
  statsFromLexical,
} from '@/mcp/markdown'
import config from '@/payload.config'

/**
 * Markdown → Lexical konvertori (M2-07): 20+ namuna (sarlavhalar, ro'yxatlar, havolalar,
 * iqtiboslar, kod, jadval) va XSS/sanitizatsiya testlari. Natija Payload'ning o'z Lexical
 * muharriri (Posts `content` konfiguratsiyasi) bilan parse qilinadi — noma'lum tugun bo'lsa xato.
 */

type Compact = string | { type: string; [key: string]: unknown }

/** Testlarda o'qish oson bo'lishi uchun: matn → `"[f1]bold"`, element → `{ type, c: [...] }`. */
function compact(node: LexicalNode): Compact {
  if (node.type === 'text') {
    const format = Number(node.format) || 0
    return `${format ? `[f${format}]` : ''}${String(node.text)}`
  }
  if (node.type === 'linebreak') return '<br>'
  const out: { type: string; [key: string]: unknown } = { type: node.type }
  if (node.tag) out.tag = node.tag
  if (node.type === 'listitem' && node.indent) out.indent = node.indent
  if (node.type === 'link') out.url = (node.fields as { url: string }).url
  if (node.type === 'tablecell') out.header = node.headerState
  if (node.type === 'block') {
    const { blockType, language, code } = node.fields as Record<string, string>
    Object.assign(out, { blockType, language, code })
  }
  if (node.children) out.c = node.children.map(compact)
  return out
}

function blocks(markdown: string) {
  return markdownToLexical(markdown, { siteHost: 'blog.odya.uz' }).state.root.children.map(compact)
}

let payloadConfig: SanitizedConfig
let editorConfig: ReturnType<typeof editorConfigFactory.fromField>

beforeAll(async () => {
  payloadConfig = await config
  const posts = payloadConfig.collections.find((collection) => collection.slug === 'posts')
  const field = posts?.flattenedFields.find((f) => f.name === 'content') as RichTextField
  editorConfig = editorConfigFactory.fromField({ field })
})

/** Payload muharriri (Posts `content`) holatni qabul qiladimi — headless Lexical bilan parse. */
function parseWithPayload(markdown: string): string {
  const { state } = markdownToLexical(markdown)
  return convertLexicalToMarkdown({ data: state as never, editorConfig })
}

async function renderHtml(markdown: string): Promise<string> {
  const { state } = markdownToLexical(markdown)
  return convertLexicalToHTML({ data: state as never, disableContainer: true })
}

describe('Markdown → Lexical: namunalar', () => {
  const samples: { name: string; md: string; expected: Compact[] }[] = [
    {
      name: '01 oddiy paragraf',
      md: 'Salom, dunyo!',
      expected: [{ type: 'paragraph', c: ['Salom, dunyo!'] }],
    },
    {
      name: '02 ikki paragraf va yumshoq qator ko‘chirish',
      md: 'Birinchi qator\nshu paragrafda.\n\nIkkinchi paragraf.',
      expected: [
        { type: 'paragraph', c: ['Birinchi qator shu paragrafda.'] },
        { type: 'paragraph', c: ['Ikkinchi paragraf.'] },
      ],
    },
    {
      name: '03 H2 va H3 sarlavhalar',
      md: '## Narxi va chiqish sanasi\n\n### Oʻzbekistonda',
      expected: [
        { type: 'heading', tag: 'h2', c: ['Narxi va chiqish sanasi'] },
        { type: 'heading', tag: 'h3', c: ['Oʻzbekistonda'] },
      ],
    },
    {
      name: '04 H1 → H2 (ogohlantirish bilan)',
      md: '# Sarlavha',
      expected: [{ type: 'heading', tag: 'h2', c: ['Sarlavha'] }],
    },
    {
      name: '05 setext sarlavha',
      md: 'Bo‘lim\n-------',
      expected: [{ type: 'heading', tag: 'h2', c: ['Bo‘lim'] }],
    },
    {
      name: '06 qalin, kursiv, ustiga chizilgan, inline kod',
      md: '**qalin** *kursiv* ~~eski~~ `npm i` ***ikkalasi***',
      expected: [
        {
          type: 'paragraph',
          c: [
            '[f1]qalin',
            ' ',
            '[f2]kursiv',
            ' ',
            '[f4]eski',
            ' ',
            '[f16]npm i',
            ' ',
            '[f3]ikkalasi',
          ],
        },
      ],
    },
    {
      name: '07 tashqi havola',
      md: 'Manba: [The Verge](https://www.theverge.com/x "sarlavha").',
      expected: [
        {
          type: 'paragraph',
          c: [
            'Manba: ',
            { type: 'link', url: 'https://www.theverge.com/x', c: ['The Verge'] },
            '.',
          ],
        },
      ],
    },
    {
      name: '08 ichki nisbiy havola va format ichida',
      md: 'Oldingi [**Apple taqdimoti**](/gadjetlar/apple-taqdimoti) haqida.',
      expected: [
        {
          type: 'paragraph',
          c: [
            'Oldingi ',
            { type: 'link', url: '/gadjetlar/apple-taqdimoti', c: ['[f1]Apple taqdimoti'] },
            ' haqida.',
          ],
        },
      ],
    },
    {
      name: '09 autolink va reference havola',
      md: 'Sayt: <https://odya.uz> va [bu][ref].\n\n[ref]: https://example.com/ref',
      expected: [
        {
          type: 'paragraph',
          c: [
            'Sayt: ',
            { type: 'link', url: 'https://odya.uz', c: ['https://odya.uz'] },
            ' va ',
            { type: 'link', url: 'https://example.com/ref', c: ['bu'] },
            '.',
          ],
        },
      ],
    },
    {
      name: '10 belgili ro‘yxat (-, *, +)',
      md: '- bir\n* ikki\n\n+ uch',
      expected: [
        { type: 'list', tag: 'ul', c: [{ type: 'listitem', c: ['bir'] }] },
        { type: 'list', tag: 'ul', c: [{ type: 'listitem', c: ['ikki'] }] },
        { type: 'list', tag: 'ul', c: [{ type: 'listitem', c: ['uch'] }] },
      ],
    },
    {
      name: '11 raqamli ro‘yxat (1. va 1))',
      md: '1. birinchi\n2. ikkinchi\n\n3) uchinchi',
      expected: [
        {
          type: 'list',
          tag: 'ol',
          c: [
            { type: 'listitem', c: ['birinchi'] },
            { type: 'listitem', c: ['ikkinchi'] },
          ],
        },
        { type: 'list', tag: 'ol', c: [{ type: 'listitem', c: ['uchinchi'] }] },
      ],
    },
    {
      name: '12 ichma-ich ro‘yxat (2 bo‘shliq)',
      md: '- tashqi\n  - ichki\n- keyingi',
      expected: [
        {
          type: 'list',
          tag: 'ul',
          c: [
            { type: 'listitem', c: ['tashqi'] },
            {
              type: 'listitem',
              c: [{ type: 'list', tag: 'ul', c: [{ type: 'listitem', indent: 1, c: ['ichki'] }] }],
            },
            { type: 'listitem', c: ['keyingi'] },
          ],
        },
      ],
    },
    {
      name: '13 vazifalar ro‘yxati (GFM) — oddiy ro‘yxat',
      md: '- [x] bajarildi\n- [ ] kutilmoqda',
      expected: [
        {
          type: 'list',
          tag: 'ul',
          c: [
            { type: 'listitem', c: ['bajarildi'] },
            { type: 'listitem', c: ['kutilmoqda'] },
          ],
        },
      ],
    },
    {
      name: '14 iqtibos (ko‘p qatorli, ko‘p paragrafli)',
      md: '> Birinchi qator\n> davomi\n>\n> Ikkinchi paragraf',
      expected: [{ type: 'quote', c: ['Birinchi qator davomi', '<br>', 'Ikkinchi paragraf'] }],
    },
    {
      name: '15 tilli kod bloki (taxallus → Monaco tili)',
      md: '```ts\nconst a: number = 1\n```',
      expected: [
        { type: 'block', blockType: 'Code', language: 'typescript', code: 'const a: number = 1' },
      ],
    },
    {
      name: '16 tilsiz kod bloki va indent kod',
      md: '```\nplain <b>matn</b>\n```\n\n    indent kod',
      expected: [
        { type: 'block', blockType: 'Code', language: 'plaintext', code: 'plain <b>matn</b>' },
        { type: 'block', blockType: 'Code', language: 'plaintext', code: 'indent kod' },
      ],
    },
    {
      name: '17 jadval (sarlavha qatori bilan)',
      md: '| Model | Narx |\n|:--|--:|\n| iPhone 18 | $999 |',
      expected: [
        {
          type: 'table',
          c: [
            {
              type: 'tablerow',
              c: [
                { type: 'tablecell', header: 1, c: [{ type: 'paragraph', c: ['Model'] }] },
                { type: 'tablecell', header: 1, c: [{ type: 'paragraph', c: ['Narx'] }] },
              ],
            },
            {
              type: 'tablerow',
              c: [
                { type: 'tablecell', header: 0, c: [{ type: 'paragraph', c: ['iPhone 18'] }] },
                { type: 'tablecell', header: 0, c: [{ type: 'paragraph', c: ['$999'] }] },
              ],
            },
          ],
        },
      ],
    },
    {
      name: '18 jadval: yetishmagan katakchalar to‘ldiriladi',
      md: '| A | B |\n|---|---|\n| 1 |',
      expected: [
        {
          type: 'table',
          c: [
            {
              type: 'tablerow',
              c: [
                { type: 'tablecell', header: 1, c: [{ type: 'paragraph', c: ['A'] }] },
                { type: 'tablecell', header: 1, c: [{ type: 'paragraph', c: ['B'] }] },
              ],
            },
            {
              type: 'tablerow',
              c: [
                { type: 'tablecell', header: 0, c: [{ type: 'paragraph', c: ['1'] }] },
                { type: 'tablecell', header: 0, c: [{ type: 'paragraph', c: [] }] },
              ],
            },
          ],
        },
      ],
    },
    {
      name: '19 gorizontal chiziq va qattiq qator ko‘chirish',
      md: 'yuqori  \npastki\n\n---',
      expected: [
        { type: 'paragraph', c: ['yuqori', '<br>', 'pastki'] },
        { type: 'horizontalrule' },
      ],
    },
    {
      name: '20 escape qilingan Markdown belgilar matn bo‘lib qoladi',
      md: '\\*yulduz\\* va 5 \\> 3',
      expected: [{ type: 'paragraph', c: ['*yulduz* va 5 > 3'] }],
    },
    {
      name: '21 oʻzbekcha apostroflar va emoji saqlanadi',
      md: 'Oʻzbekiston gʻalabasi — taʼlim 🚀',
      expected: [{ type: 'paragraph', c: ['Oʻzbekiston gʻalabasi — taʼlim 🚀'] }],
    },
    {
      name: '22 ro‘yxat bandida bir nechta paragraf va kod',
      md: '- birinchi abzas\n\n  ikkinchi abzas\n- `kod` bilan',
      expected: [
        {
          type: 'list',
          tag: 'ul',
          c: [
            { type: 'listitem', c: ['birinchi abzas', '<br>', 'ikkinchi abzas'] },
            { type: 'listitem', c: ['[f16]kod', ' bilan'] },
          ],
        },
      ],
    },
    {
      name: '23 CRLF qator oxirlari',
      md: '## Sarlavha\r\n\r\nMatn\r\n',
      expected: [
        { type: 'heading', tag: 'h2', c: ['Sarlavha'] },
        { type: 'paragraph', c: ['Matn'] },
      ],
    },
  ]

  it.each(samples)('$name', ({ md, expected }) => {
    expect(blocks(md)).toEqual(expected)
  })

  it('barcha namunalar Payload muharriri (Posts content) tomonidan qabul qilinadi', () => {
    for (const { md } of samples) {
      expect(() => parseWithPayload(md)).not.toThrow()
    }
    const all = samples.map((sample) => sample.md).join('\n\n')
    const roundTrip = parseWithPayload(all)
    expect(roundTrip).toContain('## Narxi va chiqish sanasi')
    expect(roundTrip).toContain('[The Verge](https://www.theverge.com/x)')
    expect(roundTrip).toContain('| Model | Narx |')
  })

  it('H1 va rasm uchun ogohlantirishlar, statistika', () => {
    const result = markdownToLexical(
      [
        '# Katta sarlavha',
        '',
        'Birinchi abzas [ichki](/ai/post-1) va [yana](https://blog.odya.uz/ai/post-2), ' +
          '[tashqi](https://techcrunch.com/a) ![rasm](https://x.test/a.png).',
        '',
        '## Ikkinchi',
        '',
        '```js\nconst kodSozlari = "sanalmaydi"\n```',
      ].join('\n'),
      { siteHost: 'blog.odya.uz' },
    )
    expect(result.errors).toEqual([])
    expect(result.warnings.map((warning) => warning.code).sort()).toEqual([
      'h1_converted',
      'image_removed',
    ])
    expect(result.stats.headings).toEqual([
      { depth: 1, text: 'Katta sarlavha' },
      { depth: 2, text: 'Ikkinchi' },
    ])
    expect(result.stats.internalLinks).toEqual(['/ai/post-1', 'https://blog.odya.uz/ai/post-2'])
    expect(result.stats.externalLinks).toEqual(['https://techcrunch.com/a'])
    expect(result.stats.firstParagraph).toBe('Birinchi abzas ichki va yana, tashqi .')
    expect(result.stats.plainText).not.toContain('kodSozlari')
    expect(result.stats.words).toBe(9)

    const fromLexical = statsFromLexical(result.state, { siteHost: 'blog.odya.uz' })
    expect(fromLexical.words).toBe(result.stats.words)
    expect(fromLexical.internalLinks).toEqual(result.stats.internalLinks)
    expect(fromLexical.headings.map((heading) => heading.depth)).toEqual([2, 2])
  })

  it('Lexical → Markdown (preview) asosiy tuzilmani qaytaradi', () => {
    const md = [
      '## Sarlavha',
      '',
      '**Qalin** va [havola](https://a.test).',
      '',
      '- bir',
      '- ikki',
      '',
      '> iqtibos',
      '',
      '```python\nprint(1)\n```',
      '',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
    ].join('\n')
    expect(lexicalToMarkdown(markdownToLexical(md).state)).toBe(md)
    expect(lexicalToMarkdown(null)).toBe('')
  })

  it('kod tillari: taxalluslar va noma’lum til', () => {
    expect(normalizeCodeLanguage('TS')).toBe('typescript')
    expect(normalizeCodeLanguage('bash')).toBe('shell')
    expect(normalizeCodeLanguage('python')).toBe('python')
    expect(normalizeCodeLanguage('brainfuck')).toBe('plaintext')
    expect(normalizeCodeLanguage(undefined)).toBe('plaintext')
  })
})

describe('Markdown → Lexical: XSS va sanitizatsiya', () => {
  const unsafeLinks = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    ' javascript:alert(1)',
    'javascript&#58;alert(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    '//evil.example/x',
  ]

  it.each(unsafeLinks)('xavfli havola rad etiladi: %s', (url) => {
    const markdown = `Bosing: [bu yerga](<${url}>)`
    const result = markdownToLexical(markdown)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]?.code).toMatch(/unsafe_url|invalid_url/)
    const json = JSON.stringify(result.state)
    expect(json).not.toMatch(/"type":"link"/)
    // Havola matni oddiy matn sifatida qoladi.
    expect(json).toContain('bu yerga')
  })

  it('xom HTML (script, img onerror, iframe, style) olib tashlanadi', async () => {
    const markdown = [
      '<script>alert("xss")</script>',
      '',
      'Matn <img src=x onerror="alert(1)"> davomi <b>qalin</b> <a href="javascript:alert(1)">x</a>.',
      '',
      '<iframe src="https://evil.example"></iframe>',
      '',
      '<style>body{display:none}</style>',
      '',
      '<div onclick="alert(1)">',
      '',
      'Ichki matn',
      '',
      '</div>',
    ].join('\n')
    const result = markdownToLexical(markdown)
    expect(result.errors).toEqual([])
    expect(result.warnings.map((warning) => warning.code)).toContain('html_removed')
    const json = JSON.stringify(result.state)
    for (const needle of [
      '<script',
      'onerror',
      '<iframe',
      '<style',
      'onclick',
      'javascript:',
      '<img',
    ]) {
      expect(json).not.toContain(needle)
    }
    expect(blocks(markdown)).toEqual([
      { type: 'paragraph', c: ['Matn  davomi qalin x.'] },
      { type: 'paragraph', c: ['Ichki matn'] },
    ])
    const html = await renderHtml(markdown)
    expect(html).not.toMatch(/<script|onerror|onclick|<iframe|javascript:/i)
  })

  it('matndagi HTML-ga o‘xshash belgilar HTML sifatida chiqmaydi', async () => {
    const html = await renderHtml('Formula: 5 &lt; 6 va `<script>` kodi, \\<b\\> belgisi')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('rasmlar (inline va reference) olib tashlanadi, havola ichidagi rasm — matnsiz havola', () => {
    const result = markdownToLexical(
      '![a](https://x.test/a.png) ![b][img] [![c](https://x.test/c.png)](https://x.test)\n\n[img]: javascript:alert(1)',
    )
    const json = JSON.stringify(result.state)
    expect(json).not.toContain('x.test/a.png')
    expect(json).not.toContain('"type":"link"')
    expect(result.warnings.map((warning) => warning.code).sort()).toEqual([
      'empty_link',
      'image_removed',
    ])
    expect(result.state.root.children).toEqual([])
  })

  it('kod blokidagi HTML — faqat matn (Code bloki maydoni)', async () => {
    const result = markdownToLexical('```html\n<script>alert(1)</script>\n```')
    expect(blocks('```html\n<script>alert(1)</script>\n```')).toEqual([
      { type: 'block', blockType: 'Code', language: 'html', code: '<script>alert(1)</script>' },
    ])
    expect(result.warnings).toEqual([])
  })

  it('checkLinkUrl: ruxsat etilgan va rad etilgan manzillar', () => {
    expect(checkLinkUrl('https://a.test/x')).toMatchObject({ ok: true, kind: 'external' })
    expect(checkLinkUrl('http://a.test')).toMatchObject({ ok: true, kind: 'external' })
    expect(checkLinkUrl('/ai/slug')).toMatchObject({ ok: true, kind: 'internal' })
    expect(checkLinkUrl('https://www.blog.odya.uz/ai/x', 'blog.odya.uz')).toMatchObject({
      ok: true,
      kind: 'internal',
    })
    expect(checkLinkUrl('#faq')).toMatchObject({ ok: true, kind: 'anchor' })
    expect(checkLinkUrl('mailto:info@odya.uz')).toMatchObject({ ok: true, kind: 'mailto' })
    expect(checkLinkUrl('/\\evil.example')).toEqual({ ok: false, reason: 'unsafe_scheme' })
    expect(checkLinkUrl('ftp://a.test')).toEqual({ ok: false, reason: 'unsafe_scheme' })
    expect(checkLinkUrl('nisbiy/yol')).toEqual({ ok: false, reason: 'invalid' })
    expect(checkLinkUrl('https://')).toEqual({ ok: false, reason: 'invalid' })
    expect(checkLinkUrl('')).toEqual({ ok: false, reason: 'invalid' })
  })
})
