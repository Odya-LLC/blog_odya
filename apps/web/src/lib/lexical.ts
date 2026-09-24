/** Lexical JSON (richText) dan oddiy matn olish — o'qish vaqti va shu kabi hisoblar uchun. */
type LexicalNode = { text?: unknown; children?: unknown }

export function lexicalToPlainText(value: unknown): string {
  const root = (value as { root?: unknown } | null | undefined)?.root
  if (!root) return ''
  const parts: string[] = []
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const { text, children } = node as LexicalNode
    if (typeof text === 'string') parts.push(text)
    if (Array.isArray(children)) {
      children.forEach(walk)
      parts.push(' ')
    }
  }
  walk(root)
  return parts.join('').replace(/\s+/g, ' ').trim()
}

/** So'zlar soni (harf/raqam bilan boshlanadigan ketma-ketliklar; o'zbekcha apostroflar so'z ichida). */
export function countWords(text: string): number {
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}ʻʼ'‘’-]*/gu)
  return words ? words.length : 0
}

/** O'rtacha o'qish tezligi (so'z/daqiqa). */
export const WORDS_PER_MINUTE = 200

/** O'qish vaqti, daqiqada (matn bo'lsa kamida 1, bo'sh bo'lsa 0). */
export function readingTimeMinutes(content: unknown): number {
  const words = countWords(lexicalToPlainText(content))
  return words === 0 ? 0 : Math.max(1, Math.ceil(words / WORDS_PER_MINUTE))
}
