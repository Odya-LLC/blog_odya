import { randomBytes } from 'node:crypto'

import type {
  Blockquote,
  Code,
  Definition,
  Heading,
  List,
  ListItem,
  Nodes,
  PhrasingContent,
  RootContent,
  Table,
} from 'mdast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'

/**
 * Markdown → Lexical (Payload richText) konvertori — MCP `save_rewrite` uchun (TZ §5.1, M2-07).
 *
 * Nega o'zimizniki: Payload'ning `convertMarkdownToLexical` (Lexical markdown transformerlari)
 * agent matnlarida ishonchsiz — `javascript:` havolalarni qabul qiladi, `1)` ro'yxatlar,
 * 2 bo'shliqli ichki ro'yxatlar, ko'p qatorli iqtiboslar va tilsiz kod bloklarini buzadi.
 * Bu yerda Markdown CommonMark + GFM (`micromark`/`mdast`) bilan to'liq tahlil qilinadi va
 * Lexical JSON qo'lda quriladi — natija Posts `content` muharriri qo'llaydigan tugunlardan
 * iborat: paragraph, heading (h2–h6), text (qalin/kursiv/ustiga chizilgan/inline kod),
 * linebreak, link, list/listitem, quote, horizontalrule, table, `Code` bloki.
 *
 * Sanitizatsiya (XSS):
 * - Xom HTML (`<script>`, `<img onerror>`, `<div>` …) — butunlay olib tashlanadi (ichidagi oddiy
 *   matn qoladi), ogohlantirish bilan. Lexical matn tugunlari HTML sifatida chiqarilmaydi.
 * - Havolalar: faqat `http(s)://`, `mailto:`, nisbiy `/yo'l` va `#anchor`. `javascript:`,
 *   `data:`, `vbscript:`, `file:`, protokolsiz `//host` va boshqalar — **xato** (saqlanmaydi).
 * - Rasmlar (`![]()`) — olib tashlanadi (rasmni muharrir qo'shadi), ogohlantirish bilan.
 */

// ---------------------------------------------------------------------------
// Lexical tugunlari (serialized JSON)
// ---------------------------------------------------------------------------

export interface LexicalNode {
  type: string
  version: number
  children?: LexicalNode[]
  [key: string]: unknown
}

export interface LexicalState {
  root: LexicalNode & { type: 'root'; children: LexicalNode[] }
}

/** Lexical matn format bitlari. */
export const TEXT_FORMAT = {
  bold: 1,
  italic: 2,
  strikethrough: 4,
  underline: 8,
  code: 16,
} as const

/** `Code` blokining ruxsat etilgan tillari (Payload `CodeBlock` — Monaco ro'yxati) va taxalluslar. */
// prettier-ignore
export const CODE_LANGUAGES = [
  'abap', 'apex', 'azcli', 'bat', 'bicep', 'cameligo', 'clojure', 'coffee', 'cpp', 'csharp', 'csp',
  'css', 'cypher', 'dart', 'dockerfile', 'ecl', 'elixir', 'flow9', 'freemarker2', 'fsharp', 'go',
  'graphql', 'handlebars', 'hcl', 'html', 'ini', 'java', 'javascript', 'julia', 'kotlin', 'less',
  'lexon', 'liquid', 'lua', 'm3', 'markdown', 'mdx', 'mips', 'msdax', 'mysql', 'pascal',
  'pascaligo', 'perl', 'pgsql', 'php', 'pla', 'plaintext', 'postiats', 'powerquery', 'powershell',
  'protobuf', 'pug', 'python', 'qsharp', 'r', 'razor', 'redis', 'redshift', 'restructuredtext',
  'ruby', 'rust', 'sb', 'scala', 'scheme', 'scss', 'shell', 'solidity', 'sophia', 'sparql', 'sql',
  'st', 'swift', 'systemverilog', 'tcl', 'twig', 'typescript', 'typespec', 'vb', 'wgsl', 'xml',
  'yaml',
] as const

const LANGUAGE_ALIASES: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  console: 'shell',
  ps1: 'powershell',
  yml: 'yaml',
  md: 'markdown',
  'c++': 'cpp',
  c: 'cpp',
  'c#': 'csharp',
  cs: 'csharp',
  kt: 'kotlin',
  golang: 'go',
  postgres: 'pgsql',
  postgresql: 'pgsql',
  text: 'plaintext',
  txt: 'plaintext',
  json: 'plaintext',
}

export function normalizeCodeLanguage(lang: string | null | undefined): string {
  const key = (lang ?? '').trim().toLowerCase()
  if (!key) return 'plaintext'
  if ((CODE_LANGUAGES as readonly string[]).includes(key)) return key
  return LANGUAGE_ALIASES[key] ?? 'plaintext'
}

// ---------------------------------------------------------------------------
// URL sanitizatsiyasi
// ---------------------------------------------------------------------------

export type UrlCheck =
  | { ok: true; url: string; kind: 'internal' | 'external' | 'anchor' | 'mailto' }
  | { ok: false; reason: 'unsafe_scheme' | 'invalid' }

/** Boshqaruv belgilari va bo'shliqlar (brauzerlar `java\tscript:` ni `javascript:` deb o'qiydi). */
const URL_INVISIBLE_RE = /[\u0000-\u0020\u007f-\u009f\u00ad\u200b-\u200f\u2028\u2029\ufeff]/g

/**
 * Havola manzilini tekshiradi. `siteHost` berilsa, shu host'dagi absolyut URL — ichki havola.
 */
export function checkLinkUrl(raw: string, siteHost?: string): UrlCheck {
  const url = raw.trim()
  if (!url) return { ok: false, reason: 'invalid' }
  const compact = url.replace(URL_INVISIBLE_RE, '')
  if (compact.startsWith('#')) return { ok: true, url, kind: 'anchor' }
  if (compact.startsWith('/')) {
    // `//host` — protokolsiz tashqi manzil; `/\host` — ba'zi brauzerlarda ham shunday.
    if (compact.startsWith('//') || compact.startsWith('/\\')) {
      return { ok: false, reason: 'unsafe_scheme' }
    }
    return { ok: true, url, kind: 'internal' }
  }
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact)?.[1]?.toLowerCase()
  if (!scheme) return { ok: false, reason: 'invalid' }
  if (scheme === 'mailto') return { ok: true, url, kind: 'mailto' }
  if (scheme !== 'http' && scheme !== 'https') return { ok: false, reason: 'unsafe_scheme' }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  if (!parsed.hostname) return { ok: false, reason: 'invalid' }
  const host = parsed.hostname.replace(/^www\./, '')
  const internal = siteHost !== undefined && host === siteHost.replace(/^www\./, '')
  return { ok: true, url, kind: internal ? 'internal' : 'external' }
}

// ---------------------------------------------------------------------------
// Konvertatsiya
// ---------------------------------------------------------------------------

export interface MarkdownIssue {
  code: string
  message: string
}

export interface MarkdownStats {
  /** So'zlar soni (kod bloklarisiz). */
  words: number
  /** Sarlavhalar (daraja va matn) — asl Markdown darajasi bilan. */
  headings: { depth: number; text: string }[]
  internalLinks: string[]
  externalLinks: string[]
  /** Birinchi paragraf matni. */
  firstParagraph: string
  /** Butun matn (kod bloklarisiz) — kirill va o'xshashlik tekshiruvlari uchun. */
  plainText: string
}

export interface MarkdownConversion {
  state: LexicalState
  stats: MarkdownStats
  /** Xatolar (masalan, xavfli havola) — saqlanmaydi. */
  errors: MarkdownIssue[]
  /** Olib tashlangan/o'zgartirilgan qismlar haqida. */
  warnings: MarkdownIssue[]
}

export interface MarkdownOptions {
  /** Sayt host'i (masalan, `blog.odya.uz`) — absolyut ichki havolalarni aniqlash uchun. */
  siteHost?: string
}

const MAX_URL_IN_MESSAGE = 80

function shortUrl(url: string): string {
  return url.length > MAX_URL_IN_MESSAGE ? `${url.slice(0, MAX_URL_IN_MESSAGE - 1)}…` : url
}

/** Payload'ning Lexical tugun ID'lari (bson ObjectId ko'rinishidagi 24 hex). */
function nodeId(): string {
  return randomBytes(12).toString('hex')
}

function textNode(text: string, format: number): LexicalNode {
  return { detail: 0, format, mode: 'normal', style: '', text, type: 'text', version: 1 }
}

function elementBase(type: string, children: LexicalNode[]): LexicalNode {
  return { children, direction: null, format: '', indent: 0, type, version: 1 }
}

function paragraph(children: LexicalNode[]): LexicalNode {
  return { ...elementBase('paragraph', children), textFormat: 0, textStyle: '' }
}

/** Qo'shni bir xil formatdagi matn tugunlarini birlashtiradi, bo'shlarini tashlaydi. */
function mergeText(nodes: LexicalNode[]): LexicalNode[] {
  const out: LexicalNode[] = []
  for (const node of nodes) {
    const prev = out[out.length - 1]
    if (node.type === 'text') {
      if (!node.text) continue
      if (prev?.type === 'text' && prev.format === node.format) {
        prev.text = `${String(prev.text)}${String(node.text)}`
        continue
      }
    }
    out.push(node)
  }
  // Boshidagi/oxiridagi qator ko'chirishlar kerak emas.
  while (out[0]?.type === 'linebreak') out.shift()
  while (out[out.length - 1]?.type === 'linebreak') out.pop()
  return out
}

function hasVisibleText(nodes: LexicalNode[]): boolean {
  return nodes.some(
    (node) =>
      (node.type === 'text' && String(node.text).trim() !== '') ||
      (Array.isArray(node.children) && hasVisibleText(node.children)),
  )
}

class Converter {
  readonly errors: MarkdownIssue[] = []
  readonly warnings: MarkdownIssue[] = []
  private readonly warned = new Set<string>()
  readonly stats: MarkdownStats = {
    words: 0,
    headings: [],
    internalLinks: [],
    externalLinks: [],
    firstParagraph: '',
    plainText: '',
  }
  private readonly definitions = new Map<string, Definition>()
  private readonly textParts: string[] = []

  constructor(private readonly options: MarkdownOptions) {}

  private warnOnce(code: string, message: string) {
    if (this.warned.has(code)) return
    this.warned.add(code)
    this.warnings.push({ code, message })
  }

  convert(markdown: string): LexicalNode[] {
    const tree = fromMarkdown(markdown, {
      extensions: [gfm()],
      mdastExtensions: [gfmFromMarkdown()],
    })
    this.collectDefinitions(tree)
    const children = this.blocks(tree.children)
    this.stats.plainText = this.textParts.join('\n').trim()
    return children
  }

  private collectDefinitions(node: Nodes) {
    if (node.type === 'definition') {
      const key = node.identifier.toLowerCase()
      if (!this.definitions.has(key)) this.definitions.set(key, node)
    }
    if ('children' in node) for (const child of node.children) this.collectDefinitions(child)
  }

  private blocks(nodes: RootContent[]): LexicalNode[] {
    return nodes.flatMap((node) => this.block(node))
  }

  private block(node: RootContent): LexicalNode[] {
    switch (node.type) {
      case 'paragraph': {
        const children = mergeText(this.inline(node.children, 0))
        if (!hasVisibleText(children)) return []
        const text = plainOf(children)
        if (!this.stats.firstParagraph) this.stats.firstParagraph = text
        this.textParts.push(text)
        return [paragraph(children)]
      }
      case 'heading':
        return this.heading(node)
      case 'list':
        return [this.list(node, 0)]
      case 'blockquote':
        return this.quote(node)
      case 'code':
        return [this.code(node)]
      case 'thematicBreak':
        return [{ type: 'horizontalrule', version: 1 }]
      case 'table':
        return this.table(node)
      case 'html':
        this.warnOnce('html_removed', 'HTML teglari olib tashlandi — faqat Markdown ishlating.')
        return []
      case 'definition':
      case 'footnoteDefinition':
        return []
      default:
        return []
    }
  }

  private heading(node: Heading): LexicalNode[] {
    const children = mergeText(this.inline(node.children, 0))
    if (!hasVisibleText(children)) return []
    const text = plainOf(children)
    this.stats.headings.push({ depth: node.depth, text })
    this.textParts.push(text)
    let depth: number = node.depth
    if (depth === 1) {
      depth = 2
      this.warnOnce(
        'h1_converted',
        'Matnda H1 (#) ishlatilmaydi — sarlavha H2 (##) ga aylantirildi (H1 — maqola sarlavhasi).',
      )
    }
    return [{ ...elementBase('heading', children), tag: `h${depth}` }]
  }

  /** mdast ro'yxati → Lexical `list`. Ichki ro'yxat alohida `listitem` ichida (Lexical modeli). */
  private list(node: List, depth: number): LexicalNode {
    const ordered = Boolean(node.ordered)
    const items: LexicalNode[] = []
    let value = ordered ? (node.start ?? 1) : 1
    for (const item of node.children) {
      for (const entry of this.listItem(item, depth)) {
        items.push({ ...entry, value: value++ })
      }
    }
    return {
      ...elementBase('list', items),
      listType: ordered ? 'number' : 'bullet',
      start: ordered ? (node.start ?? 1) : 1,
      tag: ordered ? 'ol' : 'ul',
    }
  }

  private listItem(item: ListItem, depth: number): LexicalNode[] {
    const inline: LexicalNode[] = []
    const nested: LexicalNode[] = []
    for (const child of item.children) {
      if (child.type === 'list') {
        nested.push(this.list(child, depth + 1))
        continue
      }
      const content = this.flattenToInline(child)
      if (content.length) {
        if (inline.length) inline.push({ type: 'linebreak', version: 1 })
        inline.push(...content)
      }
    }
    const result: LexicalNode[] = []
    const merged = mergeText(inline)
    if (hasVisibleText(merged)) {
      this.textParts.push(plainOf(merged))
      result.push({ ...elementBase('listitem', merged), indent: depth })
    }
    for (const list of nested) {
      result.push({ ...elementBase('listitem', [list]), indent: depth })
    }
    return result
  }

  /** Blok tugunini (ro'yxat bandi yoki iqtibos ichida) inline tugunlarga aylantiradi. */
  private flattenToInline(node: RootContent): LexicalNode[] {
    switch (node.type) {
      case 'paragraph':
      case 'heading':
        return this.inline(node.children, 0)
      case 'code':
        return node.value ? [textNode(node.value.replace(/\n+/g, ' '), TEXT_FORMAT.code)] : []
      case 'html':
        this.warnOnce('html_removed', 'HTML teglari olib tashlandi — faqat Markdown ishlating.')
        return []
      case 'list':
      case 'blockquote': {
        const parts: LexicalNode[] = []
        for (const child of node.children) {
          const content = this.flattenToInline(child as RootContent)
          if (!content.length) continue
          if (parts.length) parts.push({ type: 'linebreak', version: 1 })
          parts.push(...content)
        }
        return parts
      }
      case 'listItem': {
        const parts: LexicalNode[] = []
        for (const child of node.children) {
          const content = this.flattenToInline(child)
          if (!content.length) continue
          if (parts.length) parts.push({ type: 'linebreak', version: 1 })
          parts.push(...content)
        }
        return parts
      }
      case 'table':
        this.warnOnce('nested_table', "Ro'yxat yoki iqtibos ichidagi jadval matnga aylantirildi.")
        return node.children.flatMap((row, index) => [
          ...(index ? [{ type: 'linebreak', version: 1 }] : []),
          ...row.children.flatMap((cell, cellIndex) => [
            ...(cellIndex ? [textNode(' | ', 0)] : []),
            ...this.inline(cell.children, 0),
          ]),
        ])
      default:
        return []
    }
  }

  private quote(node: Blockquote): LexicalNode[] {
    const children = mergeText(this.flattenToInline(node))
    if (!hasVisibleText(children)) return []
    this.textParts.push(plainOf(children))
    return [elementBase('quote', children)]
  }

  private code(node: Code): LexicalNode {
    return {
      type: 'block',
      version: 2,
      format: '',
      fields: {
        id: nodeId(),
        blockName: '',
        blockType: 'Code',
        language: normalizeCodeLanguage(node.lang),
        code: node.value,
      },
    }
  }

  private table(node: Table): LexicalNode[] {
    const width = Math.max(0, ...node.children.map((row) => row.children.length))
    if (!width) return []
    const rows = node.children.map((row, rowIndex) => {
      const cells = Array.from({ length: width }, (_, cellIndex) => {
        const cell = row.children[cellIndex]
        const inline = cell ? mergeText(this.inline(cell.children, 0)) : []
        if (inline.length) this.textParts.push(plainOf(inline))
        return {
          ...elementBase('tablecell', [paragraph(inline)]),
          backgroundColor: null,
          colSpan: 1,
          headerState: rowIndex === 0 ? 1 : 0,
          rowSpan: 1,
        }
      })
      return elementBase('tablerow', cells)
    })
    return [elementBase('table', rows)]
  }

  private inline(nodes: PhrasingContent[], format: number): LexicalNode[] {
    return nodes.flatMap((node) => this.inlineNode(node, format))
  }

  private inlineNode(node: PhrasingContent, format: number): LexicalNode[] {
    switch (node.type) {
      case 'text':
        // Yumshoq qator ko'chirish (paragraf ichida) — bo'shliq.
        return [textNode(node.value.replace(/\s*\n\s*/g, ' '), format)]
      case 'strong':
        return this.inline(node.children, format | TEXT_FORMAT.bold)
      case 'emphasis':
        return this.inline(node.children, format | TEXT_FORMAT.italic)
      case 'delete':
        return this.inline(node.children, format | TEXT_FORMAT.strikethrough)
      case 'inlineCode':
        return [textNode(node.value, format | TEXT_FORMAT.code)]
      case 'break':
        return [{ type: 'linebreak', version: 1 }]
      case 'link':
        return this.link(node.url, node.children, format)
      case 'linkReference': {
        const definition = this.definitions.get(node.identifier.toLowerCase())
        if (!definition) return this.inline(node.children, format)
        return this.link(definition.url, node.children, format)
      }
      case 'image':
      case 'imageReference':
        this.warnOnce(
          'image_removed',
          "Rasmlar (![]()) olib tashlandi — rasmni muharrir qo'shadi; mos rasmni notesForEditor da taklif qiling.",
        )
        return []
      case 'html':
        this.warnOnce('html_removed', 'HTML teglari olib tashlandi — faqat Markdown ishlating.')
        return []
      case 'footnoteReference':
        return []
      default:
        return []
    }
  }

  private link(url: string, children: PhrasingContent[], format: number): LexicalNode[] {
    const content = mergeText(this.inline(children, format))
    const check = checkLinkUrl(url, this.options.siteHost)
    if (!check.ok) {
      this.errors.push({
        code: check.reason === 'unsafe_scheme' ? 'unsafe_url' : 'invalid_url',
        message:
          check.reason === 'unsafe_scheme'
            ? `Xavfli havola manzili: "${shortUrl(url)}". Faqat https://, http://, mailto: ` +
              "yoki nisbiy /yo'l ruxsat etiladi."
            : `Noto'g'ri havola manzili: "${shortUrl(url)}". To'liq URL (https://…) yoki ` +
              'ichki havola uchun /kategoriya/slug yozing.',
      })
      return content
    }
    if (!hasVisibleText(content)) {
      this.warnOnce('empty_link', 'Matnsiz havolalar olib tashlandi.')
      return []
    }
    if (check.kind === 'internal') this.stats.internalLinks.push(check.url)
    if (check.kind === 'external') this.stats.externalLinks.push(check.url)
    return [
      {
        ...elementBase('link', content),
        version: 3,
        id: nodeId(),
        fields: { linkType: 'custom', newTab: false, url: check.url },
      },
    ]
  }
}

function plainOf(nodes: LexicalNode[]): string {
  const parts: string[] = []
  const walk = (list: LexicalNode[]) => {
    for (const node of list) {
      if (node.type === 'text') parts.push(String(node.text))
      else if (node.type === 'linebreak') parts.push(' ')
      if (Array.isArray(node.children)) walk(node.children)
    }
  }
  walk(nodes)
  return parts.join('').replace(/\s+/g, ' ').trim()
}

/** Markdown (lotin) → Lexical holati + statistika, xatolar va ogohlantirishlar. */
export function markdownToLexical(
  markdown: string,
  options: MarkdownOptions = {},
): MarkdownConversion {
  const converter = new Converter(options)
  // CRLF → LF, NUL belgilar — olib tashlanadi.
  const normalized = markdown.replace(/\r\n?/g, '\n').replace(/\u0000/g, '')
  const children = converter.convert(normalized)
  const stats = converter.stats
  stats.words = countWordsIn(stats.plainText)
  return {
    state: {
      root: { children, direction: null, format: '', indent: 0, type: 'root', version: 1 },
    },
    stats,
    errors: converter.errors,
    warnings: converter.warnings,
  }
}

/** So'zlar soni (harf/raqam bilan boshlanadi; o'zbekcha apostroflar so'z ichida). */
export function countWordsIn(text: string): number {
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}ʻʼ'‘’-]*/gu)
  return words ? words.length : 0
}

// ---------------------------------------------------------------------------
// Lexical → Markdown (preview_cyrillic va testlar uchun)
// ---------------------------------------------------------------------------

function inlineMarkdown(nodes: LexicalNode[] | undefined): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === 'linebreak') return '  \n'
      if (node.type === 'text') {
        const format = Number(node.format) || 0
        let text = String(node.text ?? '')
        if (format & TEXT_FORMAT.code) return `\`${text}\``
        if (format & TEXT_FORMAT.bold) text = `**${text}**`
        if (format & TEXT_FORMAT.italic) text = `*${text}*`
        if (format & TEXT_FORMAT.strikethrough) text = `~~${text}~~`
        return text
      }
      if (node.type === 'link' || node.type === 'autolink') {
        const fields = (node.fields ?? {}) as { url?: string }
        return `[${inlineMarkdown(node.children)}](${fields.url ?? ''})`
      }
      return inlineMarkdown(node.children)
    })
    .join('')
}

function listMarkdown(node: LexicalNode, depth: number): string {
  const ordered = node.listType === 'number'
  let index = Number(node.start ?? 1)
  const lines: string[] = []
  for (const item of node.children ?? []) {
    const nested = (item.children ?? []).filter((child) => child.type === 'list')
    if (nested.length && nested.length === (item.children ?? []).length) {
      for (const list of nested) lines.push(listMarkdown(list, depth + 1))
      continue
    }
    const marker = ordered ? `${index++}.` : '-'
    lines.push(`${'  '.repeat(depth)}${marker} ${inlineMarkdown(item.children)}`)
  }
  return lines.join('\n')
}

function blockMarkdown(node: LexicalNode): string {
  switch (node.type) {
    case 'paragraph':
      return inlineMarkdown(node.children)
    case 'heading': {
      const level = Number(String(node.tag ?? 'h2').slice(1)) || 2
      return `${'#'.repeat(level)} ${inlineMarkdown(node.children)}`
    }
    case 'quote':
      return `> ${inlineMarkdown(node.children).replace(/ {2}\n/g, '\n> ')}`
    case 'list':
      return listMarkdown(node, 0)
    case 'horizontalrule':
      return '---'
    case 'block': {
      const fields = (node.fields ?? {}) as { blockType?: string; code?: string; language?: string }
      if (fields.blockType === 'Code') {
        const lang = fields.language && fields.language !== 'plaintext' ? fields.language : ''
        return `\`\`\`${lang}\n${fields.code ?? ''}\n\`\`\``
      }
      return ''
    }
    case 'table': {
      const rows = (node.children ?? []).map((row) =>
        (row.children ?? []).map((cell) =>
          (cell.children ?? []).map((p) => inlineMarkdown(p.children)).join(' '),
        ),
      )
      if (!rows.length) return ''
      const header = rows[0] ?? []
      const lines = [
        `| ${header.join(' | ')} |`,
        `| ${header.map(() => '---').join(' | ')} |`,
        ...rows.slice(1).map((row) => `| ${row.join(' | ')} |`),
      ]
      return lines.join('\n')
    }
    default:
      return inlineMarkdown(node.children)
  }
}

/** Lexical holati → Markdown (taxminiy; faqat ko'rish uchun). */
export function lexicalToMarkdown(state: unknown): string {
  const root = (state as { root?: LexicalNode } | null | undefined)?.root
  if (!root || !Array.isArray(root.children)) return ''
  return root.children
    .map(blockMarkdown)
    .filter((block) => block.trim() !== '')
    .join('\n\n')
}

/** Saqlangan Lexical holatidan statistika (`set_seo` / `submit_for_review` tekshiruvlari uchun). */
export function statsFromLexical(state: unknown, options: MarkdownOptions = {}): MarkdownStats {
  const stats: MarkdownStats = {
    words: 0,
    headings: [],
    internalLinks: [],
    externalLinks: [],
    firstParagraph: '',
    plainText: '',
  }
  const root = (state as { root?: LexicalNode } | null | undefined)?.root
  if (!root || !Array.isArray(root.children)) return stats
  const parts: string[] = []
  const visitLinks = (nodes: LexicalNode[] | undefined) => {
    for (const node of nodes ?? []) {
      if (node.type === 'link' || node.type === 'autolink') {
        const url = String((node.fields as { url?: unknown } | undefined)?.url ?? '')
        const check = checkLinkUrl(url, options.siteHost)
        if (check.ok && check.kind === 'internal') stats.internalLinks.push(check.url)
        if (check.ok && check.kind === 'external') stats.externalLinks.push(check.url)
      }
      visitLinks(node.children)
    }
  }
  for (const block of root.children) {
    if (block.type === 'block') continue
    visitLinks(block.children)
    const text = plainOf(block.children ?? [])
    if (!text) continue
    parts.push(text)
    if (block.type === 'heading') {
      stats.headings.push({ depth: Number(String(block.tag ?? 'h2').slice(1)) || 2, text })
    } else if (block.type === 'paragraph' && !stats.firstParagraph) {
      stats.firstParagraph = text
    }
  }
  stats.plainText = parts.join('\n')
  stats.words = countWordsIn(stats.plainText)
  return stats
}
