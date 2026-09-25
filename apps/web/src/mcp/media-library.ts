import type { PayloadRequest } from 'payload'

import type { Media, Source } from '@/payload-types'

import type { McpContext } from './context'
import {
  baseDomain,
  blockedDomainOf,
  checkMediaLicense,
  normalizeHost,
  STATIC_BLOCKED_IMAGE_DOMAINS,
} from './media-policy'
import type { Issue } from './validation'

/**
 * Media kutubxonasi yordamchilari (OBLOG-44): taqiqlangan domenlar (statik ro'yxat + `sources`
 * kolleksiyasidagi yangilik manbalari), media'ni postda ishlatish mumkinligi, ommaviy URL'lar.
 * `write-tools.ts` (save_rewrite) va `media-tools.ts` umumiy ishlatadi.
 */

function hostOf(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    return normalizeHost(new URL(raw).hostname) || null
  } catch {
    return null
  }
}

/** Manba domenlari: sayt (`homepageUrl`) va RSS lentalari (`feeds[].url`) — asosiy domen bo'yicha. */
export function sourceDomains(sources: Pick<Source, 'homepageUrl' | 'feeds'>[]): string[] {
  const domains = new Set<string>()
  for (const source of sources) {
    for (const raw of [source.homepageUrl, ...(source.feeds ?? []).map((feed) => feed.url)]) {
      const host = hostOf(raw)
      if (host) domains.add(baseDomain(host))
    }
  }
  return [...domains]
}

/** Taqiqlangan rasm domenlari: agentliklar/foto-banklar + barcha (faol va nofaol) manbalar. */
export async function loadBlockedDomains(ctx: McpContext, req: PayloadRequest): Promise<string[]> {
  const { docs } = await ctx.payload.find({
    collection: 'sources',
    depth: 0,
    pagination: false,
    select: { homepageUrl: true, feeds: true },
    // Tizim ro'yxati: agent huquqidan qat'i nazar hamma manbalar hisobga olinadi.
    overrideAccess: true,
    req,
  })
  return [...new Set([...STATIC_BLOCKED_IMAGE_DOMAINS, ...sourceDomains(docs as Source[])])]
}

/**
 * Media'ni postda (muqova yoki matn ichida) ishlatish mumkinmi: litsenziya qoidalari va manba
 * (`sourceUrl`) taqiqlangan domen emas. Muammolar — `field` bilan.
 */
export function mediaUsageIssues(
  media: Pick<Media, 'id' | 'license' | 'licenseUrl' | 'licenseNote' | 'credit' | 'sourceUrl'>,
  blockedDomains: readonly string[],
  field: string,
): Issue[] {
  const issues: Issue[] = checkMediaLicense(media).map((issue) => ({
    field,
    code: 'media_license',
    message: `Media #${media.id}: ${issue.message} Muharrir admin panelda litsenziyani to'ldirishi kerak.`,
  }))
  const host = hostOf(media.sourceUrl)
  const blocked = host ? blockedDomainOf(host, blockedDomains) : null
  if (blocked) {
    issues.push({
      field,
      code: 'media_blocked_source',
      message: `Media #${media.id} manbasi taqiqlangan (${blocked}) — bunday rasm ishlatilmaydi.`,
    })
  }
  return issues
}

/** Media fayli yoki variantining ommaviy (absolyut) URL'i. */
export function absoluteUrl(ctx: McpContext, url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url, ctx.siteUrl).toString()
  } catch {
    return null
  }
}

/** Agentga ko'rsatiladigan media ma'lumoti. */
export function mediaSummary(ctx: McpContext, media: Media) {
  return {
    id: media.id,
    filename: media.filename ?? null,
    alt: media.alt,
    caption: media.caption ?? null,
    credit: media.credit ?? null,
    license: media.license ?? null,
    licenseUrl: media.licenseUrl ?? null,
    sourceUrl: media.sourceUrl ?? null,
    width: media.width ?? null,
    height: media.height ?? null,
    mimeType: media.mimeType ?? null,
    url: absoluteUrl(ctx, media.url),
    thumbnailUrl: absoluteUrl(ctx, media.sizes?.thumb?.url ?? media.thumbnailURL),
    uploadedVia: media.uploadedVia ?? null,
    createdAt: media.createdAt,
    markdown: `![${media.alt}](media:${media.id})`,
  }
}
