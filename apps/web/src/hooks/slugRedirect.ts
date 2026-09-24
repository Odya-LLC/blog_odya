import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionSlug,
  PayloadRequest,
  RequestContext,
  Where,
} from 'payload'

/**
 * Slug (yoki URL yo'li) o'zgarganda avtomatik 301 redirect (TZ §8.1).
 *
 * `redirects` kolleksiyasi — `@payloadcms/plugin-redirects` (`payload.config.ts`); sayt uni
 * `site/data.ts` `findRedirect` orqali o'qiydi. Kolleksiya slug'i va yozuv shakli sozlanadi;
 * default — plugin shakli: `{ from, to: { type: 'custom', url }, type: '301' }`.
 *
 * Kontent kolleksiyalariga ulash — `slugRedirectHooks` (`src/hooks/contentRedirects.ts`).
 * Drafts yoqilgan kolleksiyalarda (`posts`, `pages`) eski yo'l — oxirgi **chop etilgan** versiya
 * (asosiy jadval), redirect faqat publish'da yaratiladi.
 *
 * Default — faqat lotin (prefikssiz) yo'l: sayt `/kr/...` so'rovlarini ham prefikssiz yo'l bo'yicha
 * qidiradi va maqsadni kirill prefiksi bilan qaytaradi (`localizePath`). Boshqa prefikslar kerak
 * bo'lsa (`prefixes: ['', '/kr']`) — har biri uchun alohida redirect yaratiladi. Zanjirlar
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
  /** Yo'l prefikslari (default: `DEFAULT_REDIRECT_PREFIXES` — faqat lotin `''`). */
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
  /**
   * Eski hujjatni aniqlash (default — `afterChange` ning `previousDoc`). `null` — redirect yo'q.
   * Drafts kolleksiyalari uchun — `slugRedirectHooks({ drafts: true })`.
   */
  resolvePreviousDoc?: (args: {
    /** Hook ulangan kolleksiya slug'i. */
    collection: string
    doc: TDoc
    previousDoc: TDoc
    req: PayloadRequest
    context: RequestContext
  }) => Promise<TDoc | null | undefined> | TDoc | null | undefined
}

export const SLUG_REDIRECT_SKIP_CONTEXT = 'skipSlugRedirect'

/** Sayt redirect'larni prefikssiz (lotin) yo'l bo'yicha qidiradi — `site/data.ts` `loadRedirect`. */
export const DEFAULT_REDIRECT_PREFIXES: readonly string[] = ['']

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
  prefixes: readonly string[] = DEFAULT_REDIRECT_PREFIXES,
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

  return async ({ collection: owner, doc, previousDoc, operation, req, context }) => {
    if (operation !== 'update' || !previousDoc || context?.[SLUG_REDIRECT_SKIP_CONTEXT]) return doc
    if (!shouldRedirect({ doc: doc as TDoc, previousDoc: previousDoc as TDoc })) return doc

    const previous = options.resolvePreviousDoc
      ? await options.resolvePreviousDoc({
          collection: owner?.slug ?? '',
          doc: doc as TDoc,
          previousDoc: previousDoc as TDoc,
          req,
          context,
        })
      : (previousDoc as TDoc)
    if (!previous) return doc

    const oldPath = await options.buildPath({ doc: previous, req })
    const newPath = await options.buildPath({ doc: doc as TDoc, req })
    const pairs = planSlugRedirects(oldPath, newPath, options.prefixes)
    if (pairs.length === 0) return doc

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

const PUBLISHED_SNAPSHOT_CONTEXT = 'slugRedirectPublished'

type Snapshots = Record<string, Record<string, unknown> | null>

function snapshotsOf(context: RequestContext): Snapshots {
  const current = context[PUBLISHED_SNAPSHOT_CONTEXT]
  if (current && typeof current === 'object') return current as Snapshots
  const created: Snapshots = {}
  context[PUBLISHED_SNAPSHOT_CONTEXT] = created
  return created
}

/**
 * Kolleksiya uchun tayyor hook'lar (`hooks.beforeChange` / `hooks.afterChange` ga qo'shiladi).
 *
 * `drafts: true` (versiyalar + qoralamalar): qoralama saqlash (autosave ham) redirect
 * yaratmaydi; publish'da eski yo'l oxirgi chop etilgan versiyadan olinadi — `beforeChange`
 * asosiy jadvaldagi hujjatni (Payload qoralamalarni faqat `versions` jadvaliga yozadi) o'qib
 * `req.context` ga saqlaydi. Hech qachon chop etilmagan hujjat uchun redirect yo'q.
 */
export function slugRedirectHooks<TDoc = Record<string, unknown>>(
  options: SlugRedirectHookOptions<TDoc> & { drafts?: boolean },
): { beforeChange: CollectionBeforeChangeHook[]; afterChange: CollectionAfterChangeHook[] } {
  const { drafts, ...rest } = options
  if (!drafts) return { beforeChange: [], afterChange: [createSlugRedirectHook(rest)] }

  const keyOf = (collection: string, id: unknown) => `${collection}:${String(id)}`

  const rememberPublished: CollectionBeforeChangeHook = async ({
    collection,
    context,
    data,
    operation,
    originalDoc,
    req,
  }) => {
    const id = (originalDoc as { id?: number | string } | undefined)?.id
    if (operation !== 'update' || id === undefined || context?.[SLUG_REDIRECT_SKIP_CONTEXT]) {
      return data
    }
    // Qoralama saqlash (autosave) — publish emas, o'qish shart emas.
    if ((data as { _status?: unknown })._status === 'draft') return data
    const main = await req.payload.findByID({
      collection: collection.slug as CollectionSlug,
      id,
      draft: false,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
      req,
    })
    const published = (main as { _status?: unknown } | null)?._status === 'published'
    // `req.context` — hook argumenti emas: ichki Local API chaqiruvi (`findByID({ req })`)
    // bo'sh `req.context` ni yangi obyekt bilan almashtiradi (`createLocalReq`); afterChange
    // `req.context` ni oladi. Kalit qo'yilgach, keyingi ichki chaqiruvlar uni nusxalaydi.
    snapshotsOf(req.context)[keyOf(collection.slug, id)] = published
      ? (main as unknown as Record<string, unknown>)
      : null
    return data
  }

  const afterChange = createSlugRedirectHook<TDoc>({
    ...rest,
    shouldRedirect: ({ doc }) => (doc as { _status?: unknown })._status === 'published',
    resolvePreviousDoc: ({ collection, doc, context }) => {
      const key = keyOf(collection, (doc as { id?: number | string }).id)
      const snapshots = snapshotsOf(context)
      const snapshot = snapshots[key]
      delete snapshots[key]
      return (snapshot ?? null) as TDoc | null
    },
  })
  return { beforeChange: [rememberPublished], afterChange: [afterChange] }
}
