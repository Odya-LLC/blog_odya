import type { CollectionConfig, TextFieldSingleValidation } from 'payload'

import { isAdmin, isAdminOrEditor } from '@/access'
import { invalidateTransliteratorCache } from '@/translit/transliterator'

export const GLOSSARY_LANGUAGE_OPTIONS = [
  { value: 'en', label: 'Inglizcha' },
  { value: 'ru', label: 'Ruscha' },
] as const

export const GLOSSARY_KIND_OPTIONS = [
  { value: 'term', label: 'Atama' },
  { value: 'brand', label: 'Brend / mahsulot' },
  { value: 'abbreviation', label: 'Qisqartma' },
] as const

/**
 * Glossariy (TZ §10.8): EN/RU atama → o'zbekcha (lotin) tarjima. `doNotTransliterate` atamalari
 * kirill versiyasida lotin yozuvida qoladi (brendlar) — transliteratsiya adapteri ularni
 * himoyalaydi. Boshlang'ich ro'yxat — `packages/guidelines/glossary.seed.json`
 * (`pnpm seed:translit`). MCP agent faqat o'qiydi (M2-06).
 *
 * Access (§4.2): admin va editor boshqaradi, o'chirish — faqat admin.
 */
export const Glossary: CollectionConfig = {
  slug: 'glossary',
  labels: {
    singular: 'Glossariy atamasi',
    plural: 'Glossariy',
  },
  admin: {
    group: 'Lugʻatlar',
    useAsTitle: 'term',
    defaultColumns: ['term', 'language', 'translation', 'kind', 'doNotTransliterate'],
    listSearchableFields: ['term', 'translation'],
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
        if (data && typeof data.term === 'string') data.term = data.term.trim()
        if (data && typeof data.translation === 'string') data.translation = data.translation.trim()
        // Brend — tarjima ham, transliteratsiya ham qilinmaydi (glossariy sxemasi bilan bir xil).
        if (data?.kind === 'brand') {
          data.doNotTranslate = true
          data.doNotTransliterate = true
        }
        return data
      },
    ],
    afterChange: [() => invalidateTransliteratorCache()],
    afterDelete: [() => invalidateTransliteratorCache()],
  },
  fields: [
    {
      name: 'term',
      type: 'text',
      label: 'Atama (asl)',
      required: true,
      index: true,
      validate: (async (value, { req, id, siblingData }) => {
        if (!value) return 'Atama kiritilishi shart'
        const language = (siblingData as { language?: string }).language
        const existing = await req.payload.find({
          collection: 'glossary',
          where: { term: { like: value } },
          depth: 0,
          limit: 50,
          overrideAccess: true,
          req,
          select: { term: true, language: true },
        })
        const duplicate = existing.docs.find(
          (doc) =>
            doc.id !== id &&
            doc.term.toLowerCase() === value.toLowerCase() &&
            doc.language === language,
        )
        return duplicate ? `"${duplicate.term}" (${duplicate.language}) allaqachon mavjud` : true
      }) satisfies TextFieldSingleValidation,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'language',
          type: 'select',
          label: 'Til',
          required: true,
          defaultValue: 'en',
          options: GLOSSARY_LANGUAGE_OPTIONS.map(({ label, value }) => ({ label, value })),
        },
        {
          name: 'kind',
          type: 'select',
          label: 'Turi',
          required: true,
          defaultValue: 'term',
          options: GLOSSARY_KIND_OPTIONS.map(({ label, value }) => ({ label, value })),
        },
      ],
    },
    {
      name: 'translation',
      type: 'text',
      label: 'Tarjima (oʻzbekcha, lotin)',
      required: true,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'doNotTranslate',
          type: 'checkbox',
          label: 'Tarjima qilinmaydi',
          defaultValue: false,
        },
        {
          name: 'doNotTransliterate',
          type: 'checkbox',
          label: 'Kirillda ham lotin yozuvida qoladi',
          defaultValue: false,
        },
      ],
    },
    {
      name: 'note',
      type: 'textarea',
      label: 'Izoh',
    },
  ],
}
