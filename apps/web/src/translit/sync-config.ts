import type { CyrlSyncFieldSpec, CyrlSyncPluginOptions } from './cyrlSync'
import { faqCyrlSpec } from './cyrlSync'

/**
 * Qaysi kolleksiya maydonlari lotin → kirill sinxronlanadi (TZ §3.6). `cyrlSyncPlugin` ga
 * beriladi (`payload.config.ts`, plugin-seo'dan keyin — `meta.*` maydonlari mavjud bo'lsin).
 *
 * Qulf kalitlari (`cyrlLocked`) TZ §10.3 bo'yicha: postlarda SEO maydonlari bitta `meta` kaliti.
 *
 * Hozircha: `posts`, `tags` (MCP teg yaratadi), `media` (alt, caption). `pages`, `categories`,
 * `authors`, globals va slug redirect'lari — OBLOG-29.
 */
const seoMeta = (...names: string[]): CyrlSyncFieldSpec[] =>
  names.map((name) => ({ path: `meta.${name}`, lockKey: 'meta' }))

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
      richTextFields: ['content'],
    },
    tags: {
      fields: ['name', 'description', ...seoMeta('title', 'description')],
    },
    media: {
      fields: ['alt', 'caption'],
    },
  },
}
