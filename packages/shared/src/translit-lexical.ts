/**
 * Lexical JSON (Payload richText) transliteratsiyasi (TZ §3.6).
 *
 * - Faqat `text` tugunlarining `text` qiymati o'giriladi; tuzilma, formatlar, id'lar saqlanadi.
 * - `code` bloklari (va ichidagi `code-highlight` tugunlari) hamda inline kod formatidagi matn
 *   (`format & 16`) o'zgarmaydi.
 * - Havolalar (`link`, `autolink`): `fields.url` va boshqa maydonlarga tegilmaydi — faqat
 *   ko'rinadigan matn (bolalar `text` tugunlari) o'giriladi; URL ko'rinishidagi matn baribir
 *   himoyalangan.
 * - Payload bloklari (`block`, `inlineBlock`), `upload`, `relationship` — default holatda
 *   o'zgarmaydi; kerak bo'lsa `transformBlock` orqali (masalan, iqtibos yoki FAQ bloki matni).
 *
 * Kirish obyekti o'zgartirilmaydi — yangi nusxa qaytariladi.
 */

/** Lexical `IS_CODE` format biti. */
export const LEXICAL_FORMAT_CODE = 16

/** Ichiga kirilmaydigan tugunlar. */
export const LEXICAL_SKIPPED_NODE_TYPES = ['code', 'code-highlight'] as const

/** Default holatda o'zgarishsiz qoldiriladigan Payload tugunlari. */
export const LEXICAL_OPAQUE_NODE_TYPES = ['block', 'inlineBlock', 'upload', 'relationship'] as const

export interface LexicalNodeLike {
  type?: string
  text?: string
  format?: number | string
  children?: LexicalNodeLike[]
  [key: string]: unknown
}

export interface LexicalStateLike {
  root: LexicalNodeLike
  [key: string]: unknown
}

export interface TransliterateLexicalOptions {
  /** `block`/`inlineBlock` tugunlari uchun; `undefined` qaytarsa — tugun o'zgarishsiz. */
  transformBlock?: (
    node: LexicalNodeLike,
    toCyrillic: (text: string) => string,
  ) => LexicalNodeLike | undefined
}

export function isLexicalState(value: unknown): value is LexicalStateLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'root' in value &&
    typeof (value as { root?: unknown }).root === 'object' &&
    (value as { root?: unknown }).root !== null
  )
}

function isCodeFormatted(node: LexicalNodeLike): boolean {
  return typeof node.format === 'number' && (node.format & LEXICAL_FORMAT_CODE) !== 0
}

function transformNode(
  node: LexicalNodeLike,
  toCyrillic: (text: string) => string,
  options: TransliterateLexicalOptions,
): LexicalNodeLike {
  const type = node.type ?? ''
  if ((LEXICAL_SKIPPED_NODE_TYPES as readonly string[]).includes(type)) return structuredClone(node)
  if ((LEXICAL_OPAQUE_NODE_TYPES as readonly string[]).includes(type)) {
    if (type === 'block' || type === 'inlineBlock') {
      const transformed = options.transformBlock?.(structuredClone(node), toCyrillic)
      if (transformed) return transformed
    }
    return structuredClone(node)
  }

  const copy: LexicalNodeLike = { ...node }
  if (type === 'text' && typeof node.text === 'string' && !isCodeFormatted(node)) {
    copy.text = toCyrillic(node.text)
  }
  if (Array.isArray(node.children)) {
    copy.children = node.children.map((child) =>
      child && typeof child === 'object' ? transformNode(child, toCyrillic, options) : child,
    )
  }
  // Boshqa ichki obyektlar (masalan, link `fields`) chuqur nusxalanadi, lekin o'girilmaydi.
  for (const [key, value] of Object.entries(node)) {
    if (key === 'children' || key === 'text') continue
    if (value && typeof value === 'object') copy[key] = structuredClone(value)
  }
  return copy
}

/** Lexical holatini (`{ root }`) kirillga o'giradi. Lexical bo'lmagan qiymat o'zgarishsiz qaytadi. */
export function transliterateLexical<T>(
  state: T,
  toCyrillic: (text: string) => string,
  options: TransliterateLexicalOptions = {},
): T {
  if (!isLexicalState(state)) return state
  const { root, ...rest } = state
  return {
    ...structuredClone(rest),
    root: transformNode(root, toCyrillic, options),
  } as T
}

/** Lexical holatidagi barcha matnni (kod bloklarisiz) ketma-ket yig'adi — solishtirish uchun. */
export function lexicalPlainText(state: unknown): string {
  if (!isLexicalState(state)) return ''
  const parts: string[] = []
  const walk = (node: LexicalNodeLike): void => {
    if (node.type === 'text' && typeof node.text === 'string') parts.push(node.text)
    if (Array.isArray(node.children)) {
      for (const child of node.children) if (child && typeof child === 'object') walk(child)
      parts.push('\n')
    }
  }
  walk(state.root)
  return parts.join('')
}
