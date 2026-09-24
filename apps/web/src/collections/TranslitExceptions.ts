import { exceptionKey, normalizeApostrophes } from '@blog-odya/shared'
import type { CollectionConfig, TextFieldSingleValidation } from 'payload'

import { isAdmin, isAdminOrEditor } from '@/access'
import { invalidateTransliteratorCache } from '@/translit/transliterator'

const LATIN_RE = /^[A-Za-z][A-Za-zʻʼ-]*$/
const CYRILLIC_RE = /^[Ѐ-ӿ][Ѐ-ӿ-]*$/

export const TRANSLIT_MATCH_TYPE_OPTIONS = [
  { value: 'whole_word', label: 'Butun soʻz' },
  { value: 'prefix', label: 'Soʻz boshlanishi (prefiks)' },
] as const

/**
 * Transliteratsiya istisnolari (TZ §3.6, §10.9). Adapter avval `whole_word`, keyin eng uzun
 * `prefix` yozuvini qo'llaydi (`packages/shared/src/translit.ts`). Boshlang'ich ro'yxat —
 * `packages/guidelines/translit-exceptions.seed.json` (`pnpm seed:translit`).
 *
 * Access (§4.2): admin va editor o'qiydi/qo'shadi/tahrirlaydi (editor xatoni ko'rsa lug'atga
 * qo'shadi, §3.6), o'chirish — faqat admin.
 */
export const TranslitExceptions: CollectionConfig = {
  slug: 'translit-exceptions',
  labels: {
    singular: 'Transliteratsiya istisnosi',
    plural: 'Transliteratsiya istisnolari',
  },
  admin: {
    group: 'Lugʻatlar',
    useAsTitle: 'latin',
    defaultColumns: ['latin', 'cyrillic', 'matchType', 'updatedAt'],
    listSearchableFields: ['latin', 'cyrillic'],
    description:
      'Lotin → kirill: avval butun soʻz, keyin eng uzun prefiks. Katta-kichik harf farqlanmaydi.',
  },
  access: {
    read: isAdminOrEditor,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdmin,
  },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (data && typeof data.latin === 'string') {
          data.latin = normalizeApostrophes(data.latin.trim())
        }
        if (data && typeof data.cyrillic === 'string') data.cyrillic = data.cyrillic.trim()
        return data
      },
    ],
    afterChange: [() => invalidateTransliteratorCache()],
    afterDelete: [() => invalidateTransliteratorCache()],
  },
  fields: [
    {
      name: 'latin',
      type: 'text',
      label: 'Lotin (soʻz yoki oʻzak)',
      required: true,
      unique: true,
      index: true,
      validate: (async (value, { req, id }) => {
        if (!value || !LATIN_RE.test(value)) return 'Faqat lotin harflari, ʻ, ʼ va chiziqcha'
        // Katta-kichik harfni farqlamasdan takrorlanishni tekshirish.
        const existing = await req.payload.find({
          collection: 'translit-exceptions',
          where: { latin: { like: value } },
          depth: 0,
          limit: 50,
          overrideAccess: true,
          req,
          select: { latin: true },
        })
        const duplicate = existing.docs.find(
          (doc) => doc.id !== id && exceptionKey(doc.latin) === exceptionKey(value),
        )
        return duplicate ? `"${duplicate.latin}" allaqachon mavjud` : true
      }) satisfies TextFieldSingleValidation,
    },
    {
      name: 'cyrillic',
      type: 'text',
      label: 'Kirill shakli',
      required: true,
      validate: (value: string | null | undefined) =>
        value && CYRILLIC_RE.test(value) ? true : 'Faqat kirill harflari va chiziqcha',
    },
    {
      name: 'matchType',
      type: 'select',
      label: 'Moslik turi',
      required: true,
      defaultValue: 'whole_word',
      options: TRANSLIT_MATCH_TYPE_OPTIONS.map(({ label, value }) => ({ label, value })),
    },
    {
      name: 'note',
      type: 'textarea',
      label: 'Izoh',
    },
  ],
}
