import { getDefaultTransliterator, transliterateLexical } from '@blog-odya/shared'

import type { Post } from '@/payload-types'

/**
 * Kirill (uz-Cyrl) versiyasi — MCP yozish toollari uchun (TZ §3.6: "Agent faqat lotin yozadi;
 * kirill avtomatik").
 *
 * Transliteratsiya — `@blog-odya/shared` adapteri (`lotin-kirill` + seed istisnolari va glossariy
 * `doNotTransliterate`). Lexical'da faqat matn tugunlari o'giriladi; kod, URL'lar o'zgarmaydi.
 *
 * `cyrlLocked` (muharrir qo'lda tuzatgan kirill maydonlari) hurmat qilinadi: qulflangan maydon
 * qayta yozilmaydi, o'rniga `cyrlStale` belgilanadi (TZ §3.6). Umumiy `beforeChange` hook
 * (`withCyrlSync`, admin'dagi tahrirlar uchun ham) — M1-03 integratsiyasi; u ulangach bu modul
 * faqat `preview_cyrillic` uchun qoladi.
 */

export type CyrlLockKey = 'title' | 'excerpt' | 'content' | 'meta' | 'faq' | 'coverAlt'

export function toCyrillic(text: string): string {
  return getDefaultTransliterator().toCyrillic(text)
}

export function lockedFields(post: Pick<Post, 'cyrlLocked'>): Set<CyrlLockKey> {
  const raw = post.cyrlLocked
  const locked = new Set<CyrlLockKey>()
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      if (value === true) locked.add(key as CyrlLockKey)
    }
  }
  return locked
}

export interface LatinFields {
  title?: string | null
  excerpt?: string | null
  content?: unknown
  meta?: { title?: string | null; description?: string | null; focusKeyword?: string | null }
  faq?: { question: string; answer: string }[] | null
  coverAlt?: string | null
}

export interface CyrillicPlan {
  /** `locale: 'uz-Cyrl'` bilan yoziladigan ma'lumot (bo'sh bo'lsa — yozilmaydi). */
  data: Record<string, unknown>
  /** Qulflangani uchun o'tkazib yuborilgan maydonlar. */
  skipped: CyrlLockKey[]
}

/** Lotin maydonlaridan kirill ma'lumotini tayyorlaydi (faqat berilgan maydonlar). */
export function planCyrillic(latin: LatinFields, locked: Set<CyrlLockKey>): CyrillicPlan {
  const data: Record<string, unknown> = {}
  const skipped: CyrlLockKey[] = []
  const put = (key: CyrlLockKey, value: () => unknown) => {
    if (locked.has(key)) skipped.push(key)
    else data[key] = value()
  }
  if (typeof latin.title === 'string') put('title', () => toCyrillic(latin.title as string))
  if (typeof latin.excerpt === 'string') put('excerpt', () => toCyrillic(latin.excerpt as string))
  if (latin.content !== undefined) {
    put('content', () => transliterateLexical(latin.content, toCyrillic))
  }
  if (latin.meta) {
    const meta = latin.meta
    put('meta', () => ({
      ...(typeof meta.title === 'string' ? { title: toCyrillic(meta.title) } : {}),
      ...(typeof meta.description === 'string'
        ? { description: toCyrillic(meta.description) }
        : {}),
      ...(typeof meta.focusKeyword === 'string'
        ? { focusKeyword: toCyrillic(meta.focusKeyword) }
        : {}),
    }))
  }
  if (latin.faq) {
    const faq = latin.faq
    put('faq', () =>
      faq.map((item) => ({ question: toCyrillic(item.question), answer: toCyrillic(item.answer) })),
    )
  }
  if (typeof latin.coverAlt === 'string') {
    put('coverAlt', () => toCyrillic(latin.coverAlt as string))
  }
  return { data, skipped }
}
