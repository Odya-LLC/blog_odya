import type { CollectionSlug, TextField } from 'payload'

import { slugCollisionMessage, toSlug, validateRouteSlug, validateSlug } from '@/lib/slug'

type SlugFieldOptions = {
  /**
   * Ildiz darajasidagi URL (`/{slug}`: kategoriya, statik sahifa): marshrut nomlari band
   * (`ROUTE_RESERVED_SLUGS` — `tag`, `author`, `search`, `bot`, …) va shu kolleksiyadagi
   * slug'lar bilan to'qnashuv ham xato (kategoriya ↔ sahifa, TZ §8.1).
   */
  uniqueAcross?: 'categories' | 'pages'
}

/**
 * `slug` maydoni: lotin, lokalizatsiya qilinmaydi (ikkala yozuvda bir xil — TZ §8.1, §10.4), unique.
 * Bo'sh qoldirilsa lotin `source` maydonidan (masalan, `title`) avtomatik yasaladi.
 */
export function slugField(source: string, options: SlugFieldOptions = {}): TextField {
  const { uniqueAcross } = options
  return {
    name: 'slug',
    type: 'text',
    label: 'Slug',
    unique: true,
    index: true,
    required: true,
    validate: async (value: string | null | undefined, { req }) => {
      if (!uniqueAcross) return validateSlug(value)
      const format = validateRouteSlug(value)
      if (format !== true || !value || !req?.payload) return format
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
        ({ value, data, originalDoc }) => {
          if (typeof value === 'string' && value.trim()) return value.trim()
          const raw = (data?.[source] ?? originalDoc?.[source]) as unknown
          // Lokalizatsiya qilingan manba maydoni `{ 'uz-Latn': ... }` ko'rinishida kelishi mumkin.
          const text =
            typeof raw === 'string'
              ? raw
              : raw && typeof raw === 'object'
                ? (raw as Record<string, unknown>)['uz-Latn']
                : undefined
          return typeof text === 'string' && text.trim() ? toSlug(text) : value
        },
      ],
    },
    admin: {
      position: 'sidebar',
      description: "Lotin, ikkala yozuvda bir xil. Bo'sh qoldirilsa sarlavhadan yasaladi.",
    },
  }
}
