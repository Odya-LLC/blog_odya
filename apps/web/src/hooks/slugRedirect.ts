import { LOCALE_PATH_PREFIX } from '@blog-odya/shared'
import type { CollectionAfterChangeHook, CollectionSlug, PayloadRequest, Where } from 'payload'

/**
 * Slug (yoki URL yo'li) o'zgarganda avtomatik 301 redirect (TZ §8.1).
 *
 * `redirects` kolleksiyasi (plugin-redirects) OBLOG-9 da qo'shiladi — shuning uchun kolleksiya
 * slug'i va yozuv shakli sozlanadi. Default shakl `@payloadcms/plugin-redirects` ga mos:
 * `{ from, to: { type: 'custom', url }, type: '301' }`.
 *
 * Har bir yozuv prefiksi uchun (lotin `''`, kirill `/kr`) alohida redirect yaratiladi. Zanjirlar
 * qisqartiriladi (`A → B` mavjud bo'lsa va `B → C` bo'lsa, `A → C`), yangi yo'ldan chiquvchi eski
 * redirect (sikl) o'chiriladi.
 */

export interface RedirectPair {
  from: string
  to: string
}

export interface SlugRedirectHookOptions<TDoc = Record<string, unknown>> {
  /** Redirect kolleksiyasi slug'i (default `redirects`). */
  redirectsCollection?: string
  /**
   * Hujjatning lotin yo'li (prefikssiz), masalan `/{category}/{slug}`. `null` — URL yo'q
   * (masalan, hali publish qilinmagan).
   */
  buildPath: (args: { doc: TDoc; req: PayloadRequest }) => Promise<string | null> | string | null
  /** Yozuv prefikslari (default: `LOCALE_PATH_PREFIX` — `''` va `/kr`). */
  prefixes?: readonly string[]
  /** Redirect yozuvining ma'lumoti (default — plugin-redirects shakli). */
  toRedirectData?: (pair: RedirectPair) => Record<string, unknown>
  /** `from` maydoni nomi (default `from`). */
  fromField?: string
  /** Manzil URL maydoni yo'li (zanjirlarni topish uchun, default `to.url`). */
  toUrlField?: string
  /**
   * Redirect kerakmi (default: oldingi versiya chop etilgan yoki drafts yo'q —
   * `previousDoc._status !== 'draft'`).
   */
  shouldRedirect?: (args: { doc: TDoc; previousDoc: TDoc }) => boolean
}

export const SLUG_REDIRECT_SKIP_CONTEXT = 'skipSlugRedirect'

const defaultRedirectData = ({ from, to }: RedirectPair) => ({
  from,
  to: { type: 'custom', url: to },
  type: '301',
})

function joinPath(prefix: string, path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  if (!prefix) return normalized
  return normalized === '/' ? prefix : `${prefix}${normalized}`
}

/** Eski va yangi yo'ldan har bir prefiks uchun redirect juftlari. */
export function planSlugRedirects(
  oldPath: string | null | undefined,
  newPath: string | null | undefined,
  prefixes: readonly string[] = Object.values(LOCALE_PATH_PREFIX),
): RedirectPair[] {
  if (!oldPath || !newPath) return []
  const pairs = prefixes.map((prefix) => ({
    from: joinPath(prefix, oldPath),
    to: joinPath(prefix, newPath),
  }))
  return pairs.filter((pair) => pair.from !== pair.to)
}

/**
 * `item` ning yuqori darajadagi maydonini `path` bo'yicha yangi qiymat bilan qaytaradi
 * (`to.url` → `{ to: { ...item.to, url } }`).
 */
export function withValueAtPath(
  item: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const [head, ...rest] = path.split('.') as [string, ...string[]]
  if (rest.length === 0) return { [head]: value }
  const current = item[head]
  const base =
    current && typeof current === 'object' ? { ...(current as Record<string, unknown>) } : {}
  return { [head]: { ...base, ...withValueAtPath(base, rest.join('.'), value) } }
}

export function createSlugRedirectHook<TDoc = Record<string, unknown>>(
  options: SlugRedirectHookOptions<TDoc>,
): CollectionAfterChangeHook {
  const collection = options.redirectsCollection ?? 'redirects'
  const fromField = options.fromField ?? 'from'
  const toUrlField = options.toUrlField ?? 'to.url'
  const toData = options.toRedirectData ?? defaultRedirectData
  const shouldRedirect =
    options.shouldRedirect ??
    (({ previousDoc }: { previousDoc: TDoc }) =>
      (previousDoc as { _status?: unknown } | undefined)?._status !== 'draft')

  return async ({ doc, previousDoc, operation, req, context }) => {
    if (operation !== 'update' || !previousDoc || context?.[SLUG_REDIRECT_SKIP_CONTEXT]) return doc
    if (!shouldRedirect({ doc: doc as TDoc, previousDoc: previousDoc as TDoc })) return doc

    const oldPath = await options.buildPath({ doc: previousDoc as TDoc, req })
    const newPath = await options.buildPath({ doc: doc as TDoc, req })
    const pairs = planSlugRedirects(oldPath, newPath, options.prefixes)
    if (pairs.length === 0) return doc

    // Kolleksiya OBLOG-9 da paydo bo'ladi — tur darajasida umumiy slug.
    const redirects = collection as CollectionSlug
    const common = {
      depth: 0,
      overrideAccess: true,
      req,
      context: { [SLUG_REDIRECT_SKIP_CONTEXT]: true },
    }

    for (const { from, to } of pairs) {
      // 1) Yangi yo'ldan chiquvchi redirect endi sikl bo'ladi — o'chiriladi.
      await req.payload.delete({
        ...common,
        collection: redirects,
        where: { [fromField]: { equals: to } } as Where,
      })
      // 2) Eski yo'lga olib boruvchi redirect'lar to'g'ridan-to'g'ri yangi yo'lga.
      const chained = await req.payload.find({
        ...common,
        collection: redirects,
        where: { [toUrlField]: { equals: from } } as Where,
        pagination: false,
      })
      for (const item of chained.docs) {
        await req.payload.update({
          ...common,
          collection: redirects,
          id: item.id,
          data: withValueAtPath(
            item as unknown as Record<string, unknown>,
            toUrlField,
            to,
          ) as never,
        })
      }
      // 3) Eski yo'l → yangi yo'l (mavjud bo'lsa — yangilanadi).
      const existing = await req.payload.find({
        ...common,
        collection: redirects,
        where: { [fromField]: { equals: from } } as Where,
        limit: 1,
      })
      const data = toData({ from, to })
      const current = existing.docs[0]
      if (current) {
        await req.payload.update({
          ...common,
          collection: redirects,
          id: current.id,
          data: data as never,
        })
      } else {
        await req.payload.create({ ...common, collection: redirects, data: data as never })
      }
    }
    return doc
  }
}
