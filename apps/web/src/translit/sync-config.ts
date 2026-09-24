import type { TransliterateLexicalOptions } from '@blog-odya/shared'

import type { CyrlSyncFieldSpec, CyrlSyncPluginOptions } from './cyrlSync'
import { faqCyrlSpec, structuredCyrlSpec } from './cyrlSync'

/**
 * Qaysi kolleksiya/global maydonlari lotin → kirill sinxronlanadi (TZ §3.6). `cyrlSyncPlugin` ga
 * beriladi (`payload.config.ts`, plugin-seo'dan keyin — `meta.*` maydonlari mavjud bo'lsin).
 *
 * Qulf kalitlari (`cyrlLocked`) TZ §10.3 bo'yicha: SEO maydonlari bitta `meta` kaliti; menyu
 * yorliqlari — butun menyu (`navItems`, `moreItems`, `columns`) kaliti.
 *
 * Kategoriyalarning kirill nomlari qo'lda tasdiqlangan (TZ §10.4): seed ularni
 * `disableCyrlSync` bilan yozadi va qulflaydi (`src/seed/index.ts`).
 */
const seoMeta = (...names: string[]): CyrlSyncFieldSpec[] =>
  names.map((name) => ({ path: `meta.${name}`, lockKey: 'meta', lockLabel: 'SEO (meta)' }))

/** Lexical ichidagi `embed` bloki: faqat `caption` o'giriladi (URL o'zgarmaydi). */
export const embedCaptionTransformBlock: NonNullable<
  TransliterateLexicalOptions['transformBlock']
> = (node, toCyrillic) => {
  const fields = node.fields as Record<string, unknown> | undefined
  if (!fields || fields.blockType !== 'embed' || typeof fields.caption !== 'string') {
    return undefined
  }
  return { ...node, fields: { ...fields, caption: toCyrillic(fields.caption) } }
}

/** Menyu yorlig'i (`linkFields().label`) — butun menyu uchun bitta qulf. */
const menuLabel = (array: string, lockLabel: string): CyrlSyncFieldSpec => ({
  path: `${array}.label`,
  lockKey: array,
  lockLabel,
})

export const CYRL_SYNC: CyrlSyncPluginOptions = {
  collections: {
    posts: {
      fields: [
        'title',
        'excerpt',
        'coverAlt',
        faqCyrlSpec('faq'),
        ...seoMeta('title', 'description', 'focusKeyword'),
      ],
      richTextFields: [{ path: 'content', transformBlock: embedCaptionTransformBlock }],
    },
    pages: {
      fields: [
        'title',
        // `content` (Lexical) va `faq` (sarlavha, savol-javoblar) bloklari; blok nomi (`blockName`) —
        // admin uchun, o'girilmaydi.
        structuredCyrlSpec('layout', { textKeys: ['title', 'question', 'answer'] }),
        ...seoMeta('title', 'description', 'focusKeyword'),
      ],
    },
    categories: {
      fields: ['name', 'description', ...seoMeta('title', 'description', 'focusKeyword')],
    },
    tags: {
      fields: ['name', 'description', ...seoMeta('title', 'description', 'focusKeyword')],
    },
    authors: {
      fields: ['name', 'position', 'bio'],
    },
    media: {
      fields: ['alt', 'caption'],
    },
  },
  globals: {
    'site-settings': {
      fields: ['siteName', 'tagline', 'description'],
    },
    header: {
      fields: [menuLabel('navItems', 'Asosiy menyu'), menuLabel('moreItems', '"Yana" menyusi')],
    },
    footer: {
      fields: [
        { path: 'columns.title', lockKey: 'columns', lockLabel: 'Ustunlar' },
        { path: 'columns.links.label', lockKey: 'columns', lockLabel: 'Ustunlar' },
        'copyright',
      ],
    },
  },
}
