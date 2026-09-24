import { dedupeSlug, slugifyUz } from '@blog-odya/shared'
import type { CollectionSlug, FieldHook, TextField, Where } from 'payload'

import {
  RESERVED_SLUGS,
  ROUTE_RESERVED_SLUGS,
  slugCollisionMessage,
  SLUG_MAX_LENGTH,
  validateRouteSlug,
  validateSlug,
} from '@/lib/slug'

type UniqueAcross = 'categories' | 'pages'

export interface SlugFieldOptions {
  /**
   * Ildiz darajasidagi marshrut nomlari (`ROUTE_RESERVED_SLUGS` — `tag`, `author`, `search`, …)
   * band: kategoriya va statik sahifa uchun `true` (`uniqueAcross` berilsa — avtomatik). Aks
   * holda faqat `RESERVED_SLUGS` (`kr`, `admin`, `api`) — post, teg, muallif (TZ §8.1).
   */
  checkReserved?: boolean
  /**
   * Ildiz darajasidagi URL (`/{slug}`: kategoriya, statik sahifa): marshrut nomlari band
   * (`ROUTE_RESERVED_SLUGS` — `tag`, `author`, `search`, `bot`, …) va shu kolleksiyadagi
   * slug'lar bilan to'qnashuv ham xato (kategoriya ↔ sahifa, TZ §8.1).
   */
  uniqueAcross?: UniqueAcross
}

export interface SlugHookOptions {
  /** Slug qaysi maydondan yaratiladi (default `title`; kategoriya/teg uchun `name`). */
  sourceField?: string
  /**
   * Ildiz darajasidagi marshrut nomlari (`ROUTE_RESERVED_SLUGS`) ham band — kategoriya va
   * sahifalar uchun `true`. Aks holda faqat `RESERVED_SLUGS` (`kr`, `admin`, `api`).
   */
  checkReserved?: boolean
  /** Kolleksiya ichida takrorlanmas (default `true`): band bo'lsa `-2`, `-3` qo'shiladi. */
  unique?: boolean
  /** Shu kolleksiyadagi slug'lar ham band (kategoriya ↔ sahifa). */
  uniqueAcross?: UniqueAcross
}

/** Lokalizatsiya qilingan manba maydoni `{ 'uz-Latn': ... }` ko'rinishida kelishi mumkin. */
function latinText(raw: unknown): string | undefined {
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object') {
    const latin = (raw as Record<string, unknown>)['uz-Latn']
    return typeof latin === 'string' ? latin : undefined
  }
  return undefined
}

/**
 * Bo'sh slug'ni manba maydonidan `slugify-uz` bilan yaratadi va (kerak bo'lsa) takrorlanmas
 * qiladi (`-2`, `-3`, …; band marshrut nomlari ham). Qo'lda kiritilgan slug o'zgartirilmaydi —
 * faqat `validate` tekshiradi.
 */
export function createSlugBeforeValidateHook(options: SlugHookOptions = {}): FieldHook {
  const sourceField = options.sourceField ?? 'title'
  const reserved: readonly string[] =
    options.checkReserved || options.uniqueAcross ? ROUTE_RESERVED_SLUGS : RESERVED_SLUGS
  return async ({ value, data, originalDoc, collection, req }) => {
    if (typeof value === 'string' && value.trim()) return value.trim()
    const source = latinText(
      (data as Record<string, unknown> | undefined)?.[sourceField] ??
        (originalDoc as Record<string, unknown> | undefined)?.[sourceField],
    )
    if (!source?.trim()) return value
    const base = slugifyUz(source)
    if (!base) return value
    if (options.unique === false || !collection || !req?.payload) return base

    const currentId = (originalDoc as { id?: number | string } | undefined)?.id
    const count = async (slug: CollectionSlug, candidate: string, excludeSelf: boolean) => {
      const where: Where = { slug: { equals: candidate } }
      if (excludeSelf && currentId !== undefined) where.id = { not_equals: currentId }
      const { totalDocs } = await req.payload.count({
        collection: slug,
        where,
        overrideAccess: true,
        req,
      })
      return totalDocs
    }
    return dedupeSlug(
      base,
      async (candidate) =>
        reserved.includes(candidate) ||
        (await count(collection.slug as CollectionSlug, candidate, true)) > 0 ||
        (options.uniqueAcross ? (await count(options.uniqueAcross, candidate, false)) > 0 : false),
      { maxLength: SLUG_MAX_LENGTH },
    )
  }
}

/**
 * `slug` maydoni: lotin, lokalizatsiya qilinmaydi (ikkala yozuvda bir xil — TZ §8.1, §10.4), unique.
 * Bo'sh qoldirilsa lotin `source` maydonidan (masalan, `title`) `slugify-uz` bilan avtomatik
 * yasaladi va takrorlanmas qilinadi. Slug o'zgarganda 301 — `createSlugRedirectHook`
 * (`@/hooks/slugRedirect`).
 */
export function slugField(source: string, options: SlugFieldOptions = {}): TextField {
  const { uniqueAcross } = options
  const checkReserved = options.checkReserved ?? Boolean(uniqueAcross)
  return {
    name: 'slug',
    type: 'text',
    label: 'Slug',
    unique: true,
    index: true,
    required: true,
    validate: async (value: string | null | undefined, { req }) => {
      const format = checkReserved ? validateRouteSlug(value) : validateSlug(value)
      if (format !== true || !value || !req?.payload || !uniqueAcross) return format
      const { totalDocs } = await req.payload.count({
        collection: uniqueAcross as CollectionSlug,
        where: { slug: { equals: value } },
        overrideAccess: true,
        req,
      })
      return totalDocs > 0 ? slugCollisionMessage(value, uniqueAcross) : true
    },
    hooks: {
      beforeValidate: [
        createSlugBeforeValidateHook({ sourceField: source, checkReserved, uniqueAcross }),
      ],
    },
    admin: {
      position: 'sidebar',
      description: "Lotin, ikkala yozuvda bir xil. Bo'sh qoldirilsa sarlavhadan yasaladi.",
    },
  }
}
