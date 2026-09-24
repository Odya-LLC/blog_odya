import { transliterateLexical, type Transliterator } from '@blog-odya/shared'

import type { Post } from '@/payload-types'
import { parseCyrlLocked } from '@/translit/cyrlSync'

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
