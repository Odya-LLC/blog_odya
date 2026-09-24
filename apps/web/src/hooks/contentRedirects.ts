import type { CollectionSlug, PayloadRequest } from 'payload'

import { slugRedirectHooks } from './slugRedirect'

/**
 * Kontent kolleksiyalari uchun slug redirect'lari (TZ §8.1, §10.10): slug (yoki post kategoriyasi)
 * o'zgarganda eski lotin yo'l → yangi yo'l, `redirects` kolleksiyasida 301 yozuvi.
 *
 * Faqat lotin (prefikssiz) yo'l yoziladi: sayt `/kr/...` so'rovini ham prefikssiz yo'l bo'yicha
 * qidiradi va maqsadni `/kr` bilan qaytaradi (`site/redirects.ts` → `resolveRedirect`) — bitta
 * yozuv ikkala yozuvni qamraydi. Yo'llar `site/paths.ts` sxemasi bilan bir xil.
 */

type Slugged = { id?: number | string; slug?: string | null }
type PostLike = Slugged & { category?: unknown }

const slugOf = (doc: Slugged): string | null =>
  typeof doc.slug === 'string' && doc.slug ? doc.slug : null

/** Relationship qiymati (id yoki populyatsiya qilingan obyekt) → kategoriya slug'i. */
async function categorySlug(value: unknown, req: PayloadRequest): Promise<string | null> {
  let id = value
  if (value && typeof value === 'object') {
    const slug = (value as Slugged).slug
    if (typeof slug === 'string' && slug) return slug
    id = (value as Slugged).id
  }
  if (typeof id !== 'number' && typeof id !== 'string') return null
  const category = await req.payload.findByID({
    collection: 'categories' as CollectionSlug,
    id,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
    req,
  })
  return slugOf((category ?? {}) as Slugged)
}

const rootPath = ({ doc }: { doc: Slugged }) => {
  const slug = slugOf(doc)
  return slug ? `/${slug}` : null
}

/** `/{category}/{slug}` — drafts: faqat publish'da, eski yo'l — oxirgi chop etilgan versiya. */
export const postRedirectHooks = slugRedirectHooks<PostLike>({
  drafts: true,
  buildPath: async ({ doc, req }) => {
    const slug = slugOf(doc)
    const category = await categorySlug(doc.category, req)
    return slug && category ? `/${category}/${slug}` : null
  },
})

/** Statik sahifa: `/{slug}` (drafts). */
export const pageRedirectHooks = slugRedirectHooks<Slugged>({ drafts: true, buildPath: rootPath })

/**
 * Kategoriya: `/{slug}`. Uning postlari (`/{eski}/{slug}`) alohida yozuvsiz — ArticleView post
 * slug'i bo'yicha topib, kanonik URL'ga 301 qiladi.
 */
export const categoryRedirectHooks = slugRedirectHooks<Slugged>({ buildPath: rootPath })

/** Teg: `/tag/{slug}`. */
export const tagRedirectHooks = slugRedirectHooks<Slugged>({
  buildPath: ({ doc }) => {
    const slug = slugOf(doc)
    return slug ? `/tag/${slug}` : null
  },
})

/** Muallif: `/author/{slug}`. */
export const authorRedirectHooks = slugRedirectHooks<Slugged>({
  buildPath: ({ doc }) => {
    const slug = slugOf(doc)
    return slug ? `/author/${slug}` : null
  },
})
