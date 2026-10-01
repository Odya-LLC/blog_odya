import type { Payload, PayloadRequest } from 'payload'

import type { Post } from '@/payload-types'
import { postPath } from '@/site/paths'

import type { McpContext } from './context'
import { relationId } from './tools'

/**
 * Avtomatik nashr (OBLOG-61): `scraping-settings.mcpAutoPublish` yoqilgan bo'lsa, MCP
 * `submit_for_review` postni tekshiruvga emas, darhol chop etadi.
 *
 * Sozlama — `scraping-settings` global'ida (yangiliklar pipeline'i: yig'ish → navbat → agent):
 * o'qish — admin/editor, o'zgartirish — faqat admin (global `access.update`).
 *
 * O'qib bo'lmasa (DB xatosi va h.k.) — `false`: xavfsiz tomonga, post tekshiruvga tushadi.
 */
export async function isMcpAutoPublishEnabled(payload: Payload): Promise<boolean> {
  try {
    // `req` berilmaydi: sozlama tranzaksiyaga bog'liq emas, Local API esa `req.locale` ni qayta
    // yozadi (`telegram/config.ts` dagi kabi). Tizim o'qishi — kalit egasi huquqiga bog'liq emas.
    const settings = await payload.findGlobal({
      slug: 'scraping-settings',
      depth: 0,
      overrideAccess: true,
      select: { mcpAutoPublish: true },
    })
    return settings?.mcpAutoPublish === true
  } catch (error) {
    payload.logger.warn({
      err: error,
      msg: 'MCP: scraping-settings.mcpAutoPublish o‘qilmadi — post tekshiruvga yuboriladi',
    })
    return false
  }
}

/** Chop etilgan postning ommaviy URL'lari: lotin (ildiz) va kirill (`/kr`). */
export async function publishedPostUrls(
  ctx: McpContext,
  req: PayloadRequest,
  post: Pick<Post, 'slug' | 'category'>,
): Promise<{ url: string; urlCyrl: string } | null> {
  const categoryId = relationId(post.category)
  if (categoryId === null || !post.slug) return null
  const category = await ctx.payload.findByID({
    collection: 'categories',
    id: categoryId,
    depth: 0,
    disableErrors: true,
    select: { slug: true },
    req,
    user: ctx.user,
    overrideAccess: false,
    locale: 'uz-Latn',
    fallbackLocale: false,
  })
  if (!category?.slug) return null
  return {
    url: new URL(postPath('uz-Latn', category.slug, post.slug), ctx.siteUrl).toString(),
    urlCyrl: new URL(postPath('uz-Cyrl', category.slug, post.slug), ctx.siteUrl).toString(),
  }
}
