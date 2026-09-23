import { dedupeSlug, slugifyUz, validateSlug } from '@blog-odya/shared'
import type { CollectionSlug, FieldHook, TextField, Where } from 'payload'

export interface SlugFieldOptions {
  /** Slug qaysi maydondan yaratiladi (default `title`; kategoriya/teg uchun `name`). */
  sourceField?: string
  /**
   * Zaxiralangan slug'larni (`kr`, `tag`, ...) taqiqlash — kategoriya va sahifalar uchun `true`
   * (ular URL'ning birinchi segmenti, TZ §8.1). Post slug'i `/{category}/{slug}` ichida — `false`.
   */
  checkReserved?: boolean
  /** Kolleksiya ichida takrorlanmas (default `true`): band bo'lsa `-2`, `-3` qo'shiladi. */
  unique?: boolean
}

/**
 * Bo'sh slug'ni manba maydonidan `slugifyUz` bilan yaratadi va (kerak bo'lsa) takrorlanmas
 * qiladi. Qo'lda kiritilgan slug o'zgartirilmaydi — faqat `validate` tekshiradi.
 */
export function createSlugBeforeValidateHook(options: SlugFieldOptions = {}): FieldHook {
  const sourceField = options.sourceField ?? 'title'
  return async ({ value, data, originalDoc, collection, req }) => {
    if (typeof value === 'string' && value.trim()) return value.trim()
    const source =
      (data as Record<string, unknown> | undefined)?.[sourceField] ??
      (originalDoc as Record<string, unknown> | undefined)?.[sourceField]
    if (typeof source !== 'string' || !source.trim()) return value
    const base = slugifyUz(source)
    if (!base) return value
    if (options.unique === false || !collection) return base

    const currentId = (originalDoc as { id?: number | string } | undefined)?.id
    return dedupeSlug(
      base,
      async (candidate) => {
        const where: Where = { slug: { equals: candidate } }
        if (currentId !== undefined) where.id = { not_equals: currentId }
        const { totalDocs } = await req.payload.count({
          collection: collection.slug as CollectionSlug,
          where,
          overrideAccess: true,
          req,
        })
        return totalDocs > 0
      },
      { checkReserved: options.checkReserved ?? false },
    )
  }
}

/** Slug maydoni (lokalizatsiya qilinmaydi — ikkala yozuvda bir xil, TZ §3.6, §8.1). */
export function slugField(options: SlugFieldOptions = {}): TextField {
  return {
    name: 'slug',
    type: 'text',
    label: 'Slug',
    index: true,
    unique: options.unique ?? true,
    admin: {
      position: 'sidebar',
      description: 'Boʻsh qoldirilsa sarlavhadan avtomatik yaratiladi (lotin, ≤ 60 belgi).',
    },
    hooks: { beforeValidate: [createSlugBeforeValidateHook(options)] },
    validate: (value: string | null | undefined) =>
      validateSlug(value, { checkReserved: options.checkReserved ?? false }),
  }
}
