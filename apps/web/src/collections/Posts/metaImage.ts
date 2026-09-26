import type { Config, FieldHook, Plugin } from 'payload'

import type { Post } from '@/payload-types'
import { mapFieldAtPath } from '@/translit/cyrlSync'

type Id = number | string

function relId(value: unknown): Id | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'object') return ((value as { id?: Id }).id ?? null) as Id | null
  return value as Id
}

function sameId(a: Id | null, b: Id | null): boolean {
  return a !== null && b !== null && String(a) === String(b)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Bitta locale'dagi `meta.image` ning yangi qiymati (`undefined` — o'zgarmaydi):
 *
 * - muqova bor, `meta.image` bo'sh yoki eski muqovaga teng → yangi muqova;
 * - muqova olib tashlangan, `meta.image` eski muqovaga teng → `null` (eskirgan rasm qolmasin);
 * - boshqa (qo'lda tanlangan) SEO rasmi — tegilmaydi.
 */
export function nextMetaImage(
  current: unknown,
  coverId: Id | null,
  prevCoverId: Id | null,
): Id | null | undefined {
  const currentId = relId(current)
  if (coverId !== null) {
    if (currentId === null || sameId(currentId, prevCoverId)) {
      return sameId(currentId, coverId) ? undefined : coverId
    }
    return undefined
  }
  return sameId(currentId, prevCoverId) ? null : undefined
}

/**
 * `meta.image` ← `coverImage` (OBLOG-47): plugin-seo'ning SEO tab'idagi preview va to'liqlik
 * indikatori `meta.image` ni ko'rsatadi, sayt esa `meta.image → coverImage → OG` zanjiri bilan
 * og:image tanlaydi (`site/seo/pages.ts`, o'zgarmaydi). Muqova qaysi kanal orqali qo'yilmasin
 * (admin, MCP `set_cover`, Local API) — SEO rasmi bo'sh bo'lsa muqova yoziladi.
 *
 * Maydon darajasidagi `beforeChange` hook'i (kolleksiya hook'i emas): `meta.image` lokalizatsiya
 * qilingan (`posts_locales.meta_image_id`), `coverImage` — yo'q. Kolleksiya hook'i faqat joriy
 * locale'ni ko'radi; bu yerda `cyrlSync` dagi kabi `siblingDocWithLocales` orqali **barcha**
 * locale'lar o'sha saqlashning o'zida (bitta yozuv, bitta versiya, tsikl yo'q) yangilanadi.
 * Kolleksiya `beforeChange` hook'lari (`deriveFields`) maydon hook'laridan oldin ishlaydi —
 * `data.coverImage` shu yerda yakuniy.
 *
 * `req.locale === 'all'` (barcha locale'lar bitta obyektda) — tegilmaydi. Qo'lda `meta.image`
 * ni tozalash, muqova bor bo'lsa, uni yana muqovaga qaytaradi (sayt baribir muqovani
 * ko'rsatadi — natija bir xil).
 */
export const syncMetaImageWithCover: FieldHook<Post> = ({
  data,
  field,
  operation,
  originalDoc,
  req,
  siblingDocWithLocales,
  value,
}) => {
  if (!data || !siblingDocWithLocales || !('name' in field) || !field.name) return value
  const { localization } = req.payload.config
  const locale = req.locale
  if (!localization || !locale || !localization.localeCodes.includes(locale)) return value

  const prevCoverId = operation === 'create' ? null : relId(originalDoc?.coverImage)
  const coverId = data.coverImage !== undefined ? relId(data.coverImage) : prevCoverId
  if (coverId === null && prevCoverId === null) return value

  const name = field.name
  const stored: Record<string, unknown> = isPlainObject(siblingDocWithLocales[name])
    ? { ...(siblingDocWithLocales[name] as Record<string, unknown>) }
    : {}

  let othersChanged = false
  for (const code of localization.localeCodes) {
    if (code === locale) continue
    const next = nextMetaImage(stored[code], coverId, prevCoverId)
    if (next === undefined) continue
    stored[code] = next
    othersChanged = true
  }
  if (othersChanged) siblingDocWithLocales[name] = stored

  const current = value !== undefined ? value : stored[locale]
  const next = nextMetaImage(current, coverId, prevCoverId)
  if (next !== undefined) return next
  // Boshqa locale'lar yozilganda joriy locale qiymati ham birlashtirishda bo'lsin.
  return value === undefined && othersChanged ? relId(current) : value
}

/**
 * `posts` → `meta.image` ga `syncMetaImageWithCover` ni ulaydi. `plugins` ro'yxatida
 * plugin-seo'dan keyin turadi (`meta` guruhi shu plagin qo'shadi).
 */
export function postMetaImagePlugin(): Plugin {
  return (incoming: Config): Config => ({
    ...incoming,
    collections: incoming.collections?.map((collection) => {
      if (collection.slug !== 'posts') return collection
      const result = mapFieldAtPath(collection.fields, ['meta', 'image'], (field) => {
        const hooks = 'hooks' in field ? field.hooks : undefined
        return {
          ...field,
          hooks: {
            ...hooks,
            beforeChange: [...(hooks?.beforeChange ?? []), syncMetaImageWithCover as FieldHook],
          },
        } as typeof field
      })
      if (!result.found) throw new Error('postMetaImagePlugin: "posts.meta.image" topilmadi')
      return { ...collection, fields: result.fields }
    }),
  })
}
