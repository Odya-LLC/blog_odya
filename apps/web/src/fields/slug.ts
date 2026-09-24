import type { PayloadRequest, TextField } from 'payload'

import {
  TOP_LEVEL_SLUG_COLLECTIONS,
  type TopLevelSlugCollection,
  toSlug,
  topLevelCollisionMessage,
  validateSlug,
} from '@/lib/slug'

type SlugFieldOptions = {
  /**
   * Ildiz darajasidagi URL (`/{slug}`) — kategoriya va statik sahifa (TZ §8.1, M1-07): band
   * qilingan marshrutlar (`kr`, `tag`, `author`, `search`, `bot`, …) va boshqa ildiz kolleksiyasi
   * (kategoriya ↔ sahifa) bilan to'qnashuv tekshiriladi.
   */
  topLevel?: boolean
}

/**
 * Boshqa ildiz kolleksiyasida shu slug bormi (kategoriya ↔ statik sahifa). Qoralama sahifalar
 * ham hisobga olinadi: keyin chop etilganda to'qnashuv bo'lmasin.
 */
export async function findTopLevelCollision(
  req: Pick<PayloadRequest, 'payload'>,
  slug: string,
  currentCollection: string | undefined,
): Promise<TopLevelSlugCollection | null> {
  for (const collection of TOP_LEVEL_SLUG_COLLECTIONS) {
    if (collection === currentCollection) continue
    const { totalDocs } = await req.payload.count({
      collection,
      where: { slug: { equals: slug } },
      overrideAccess: true,
    })
    if (totalDocs > 0) return collection
  }
  return null
}

/**
 * `slug` maydoni: lotin, lokalizatsiya qilinmaydi (ikkala yozuvda bir xil — TZ §8.1, §10.4), unique.
 * Bo'sh qoldirilsa lotin `source` maydonidan (masalan, `title`) avtomatik yasaladi.
 */
export function slugField(source: string, options: SlugFieldOptions = {}): TextField {
  return {
    name: 'slug',
    type: 'text',
    label: 'Slug',
    unique: true,
    index: true,
    required: true,
    validate: async (value, { req, collectionSlug }) => {
      const result = validateSlug(value, { topLevel: options.topLevel })
      if (result !== true || !options.topLevel || typeof value !== 'string' || !value) {
        return result
      }
      // Admin formasi (client) — faqat sinxron qoidalar; DB tekshiruvi server'da.
      if (!req?.payload) return true
      const collision = await findTopLevelCollision(req, value, collectionSlug)
      return collision ? topLevelCollisionMessage(value, collision) : true
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
      description: options.topLevel
        ? "Lotin, ikkala yozuvda bir xil; URL: /{slug}. Kategoriya va sahifa slug'lari takrorlanmasligi, " +
          'band marshrutlar (kr, tag, author, search, bot, page…) bo‘lmasligi kerak.'
        : "Lotin, ikkala yozuvda bir xil. Bo'sh qoldirilsa sarlavhadan yasaladi.",
    },
  }
}
