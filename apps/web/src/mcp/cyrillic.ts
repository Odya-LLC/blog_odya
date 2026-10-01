import { transliterateLexical, type Transliterator } from '@blog-odya/shared'
import type { Payload } from 'payload'

import type { Post } from '@/payload-types'
import {
  cyrillicFromLatin,
  isEmptyCyrlValue,
  normalizeSpecs,
  parseCyrlLocked,
} from '@/translit/cyrlSync'
import { postProtectedTerms } from '@/translit/post-terms'
import { CYRL_SYNC } from '@/translit/sync-config'
import { getTransliterator } from '@/translit/transliterator'

/**
 * Kirill (uz-Cyrl) versiyasi va MCP (TZ §3.6: "Agent faqat lotin yozadi; kirill avtomatik").
 *
 * Yagona manba — `posts` kolleksiyasidagi `cyrlSyncPlugin` hook'i (`src/translit/cyrlSync.ts`):
 * MCP yozish toollari faqat lotin (`uz-Latn`) saqlaydi, kirill o'sha saqlashda (bitta
 * tranzaksiya) DB lug'atlari bilan yoziladi; qulflangan maydonlar qayta yozilmaydi va
 * `cyrlStale` belgilanadi. Bu modul faqat agentga hisobot (`cyrillic: { updated, skipped }`)
 * va `preview_cyrillic` uchun.
 */

/** `posts` qulf kalitlari (TZ §10.3; `src/translit/sync-config.ts`). */
export type CyrlLockKey = 'title' | 'excerpt' | 'content' | 'meta' | 'faq' | 'coverAlt'

export function lockedFields(post: Pick<Post, 'cyrlLocked'>): Set<CyrlLockKey> {
  return new Set(Object.keys(parseCyrlLocked(post.cyrlLocked)) as CyrlLockKey[])
}

export interface CyrillicReport {
  /** Kirill versiyasi lotindan yangilangan maydonlar. */
  updated: CyrlLockKey[]
  /** Muharrir qo'lda tuzatgani (qulf) uchun yangilanmagan maydonlar. */
  skipped: CyrlLockKey[]
}

/** Saqlangan lotin maydonlari bo'yicha hisobot (qulflar — saqlashdan oldingi holat). */
export function cyrillicReport(
  written: readonly CyrlLockKey[],
  locked: ReadonlySet<CyrlLockKey>,
): CyrillicReport {
  return {
    updated: written.filter((key) => !locked.has(key)),
    skipped: written.filter((key) => locked.has(key)),
  }
}

export interface PreviewLatin {
  title?: string | null
  excerpt?: string | null
  content?: unknown
}

/**
 * `preview_cyrillic`: DB'da kirill qiymati yo'q maydonlarni hozir lotindan yaratadi (saqlanmaydi).
 * Odatda bo'sh — hook har saqlashda kirillni yozadi (eski postlar yoki `disableCyrlSync` bundan
 * mustasno).
 */
export function previewMissingCyrillic(
  latin: PreviewLatin,
  transliterator: Transliterator,
): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  if (typeof latin.title === 'string' && latin.title) {
    data.title = transliterator.toCyrillic(latin.title)
  }
  if (typeof latin.excerpt === 'string' && latin.excerpt) {
    data.excerpt = transliterator.toCyrillic(latin.excerpt)
  }
  if (latin.content) data.content = transliterateLexical(latin.content, transliterator.toCyrillic)
  return data
}

/** Ichki maydon qiymati nuqtali yo'l bo'yicha (`meta.title`). */
export function valueAtPath(doc: unknown, path: string): unknown {
  let current: unknown = doc
  for (const key of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

/** Post kirill versiyasi uchun transliterator: lug'atlar + `keepLatin` + brend teglar (OBLOG-67). */
export async function postTransliterator(
  payload: Payload,
  post: Pick<Post, 'keepLatin' | 'tags'>,
): Promise<Transliterator> {
  const terms = await postProtectedTerms(payload, { keepLatin: post.keepLatin, tags: post.tags })
  return (await getTransliterator(payload)).withProtectedTerms(terms)
}

/**
 * Shubhali so'zlar (OBLOG-67): postning lotin maydonlarida (sarlavha, lid, matn, SEO, FAQ, muqova
 * alt) katta harf bilan boshlangan, glossariy/istisnolar/teglar/`keepLatin` da yo'q va odatdagi
 * qoidalar bilan kirillga o'girilgan so'zlar — ehtimol brend yoki chet nom. Agent uchun
 * ogohlantirish: kerak bo'lsa `save_rewrite(keepLatin)` bilan himoyalaydi.
 */
export function suspiciousLatinWords(
  post: Partial<Post>,
  transliterator: Transliterator,
): string[] {
  const suspicious = new Set<string>()
  for (const spec of normalizeSpecs(CYRL_SYNC.collections?.posts ?? {})) {
    const value = valueAtPath(post, spec.path)
    if (isEmptyCyrlValue(value, spec.kind)) continue
    cyrillicFromLatin(spec, value, transliterator, undefined, suspicious)
  }
  return [...suspicious].sort((a, b) => a.localeCompare(b, 'en'))
}
