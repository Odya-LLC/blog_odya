/**
 * Payload hook'lari → Next.js `revalidateTag` (TZ §3.5 `post.onPublish`, M1-05).
 *
 * `revalidateTag(tag, { expire: 0 })` — keyingi so'rov eskirgan sahifani emas, yangisini oladi
 * (publish'dan keyin sayt ≤ 10 s ichida yangilanadi). Next.js so'rov kontekstidan tashqarida
 * (`pnpm seed`, migratsiya, vitest) `revalidateTag` ishlamaydi — xato jim o'tkazib yuboriladi:
 * u holda sahifalar `revalidate` muddati bo'yicha yangilanadi.
 *
 * `req.context.disableRevalidate = true` — ommaviy import va shu kabilarda o'chirish uchun.
 */
import { revalidateTag } from 'next/cache'
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
  PayloadRequest,
} from 'payload'

import { CACHE_TAGS, categoryRevalidationTags, postRevalidationTags } from './cache-tags'

type Revalidator = (tag: string) => void

let revalidator: Revalidator = (tag) => revalidateTag(tag, { expire: 0 })

/** Testlar uchun: `revalidateTag` o'rniga soxta funksiya. */
export function setRevalidator(fn: Revalidator | null): void {
  revalidator = fn ?? ((tag) => revalidateTag(tag, { expire: 0 }))
}

export function revalidateTags(tags: string[], req?: PayloadRequest): void {
  if (tags.length === 0 || req?.context?.disableRevalidate) return
  for (const tag of tags) {
    try {
      revalidator(tag)
    } catch (error) {
      // Next.js kontekstidan tashqarida (seed, CLI) — kutilgan holat.
      req?.payload.logger.debug({ msg: `revalidateTag o'tkazib yuborildi: ${tag}`, err: error })
    }
  }
}

export const revalidatePostAfterChange: CollectionAfterChangeHook = ({ doc, previousDoc, req }) => {
  revalidateTags(postRevalidationTags(doc, previousDoc), req)
  return doc
}

export const revalidatePostAfterDelete: CollectionAfterDeleteHook = ({ doc, req }) => {
  revalidateTags(postRevalidationTags(doc), req)
  return doc
}

export const revalidateCategoryAfterChange: CollectionAfterChangeHook = ({
  doc,
  previousDoc,
  req,
}) => {
  revalidateTags(categoryRevalidationTags(doc, previousDoc), req)
  return doc
}

export const revalidateCategoryAfterDelete: CollectionAfterDeleteHook = ({ doc, req }) => {
  revalidateTags(categoryRevalidationTags(doc), req)
  return doc
}

/** Teg/muallif nomi maqola sahifasida ko'rinadi. */
export const revalidatePostListsAfterChange: CollectionAfterChangeHook = ({ doc, req }) => {
  revalidateTags([CACHE_TAGS.posts], req)
  return doc
}

/** Header/footer/site-settings — barcha sahifalar karkasi. */
export const revalidateNavAfterChange: GlobalAfterChangeHook = ({ doc, req }) => {
  revalidateTags([CACHE_TAGS.nav], req)
  return doc
}

/** plugin-redirects: eski URL → yangi (maqola/kategoriya 404 o'rniga 301). */
export const revalidateRedirectsAfterChange: CollectionAfterChangeHook = ({ doc, req }) => {
  revalidateTags([CACHE_TAGS.redirects], req)
  return doc
}
