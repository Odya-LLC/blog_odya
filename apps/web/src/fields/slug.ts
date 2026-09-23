import type { TextField } from 'payload'

import { toSlug, validateSlug } from '@/lib/slug'

/**
 * `slug` maydoni: lotin, lokalizatsiya qilinmaydi (ikkala yozuvda bir xil — TZ §8.1, §10.4), unique.
 * Bo'sh qoldirilsa lotin `source` maydonidan (masalan, `title`) avtomatik yasaladi.
 */
export function slugField(source: string): TextField {
  return {
    name: 'slug',
    type: 'text',
    label: 'Slug',
    unique: true,
    index: true,
    required: true,
    validate: (value: string | null | undefined) => validateSlug(value),
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
