import { LOCALES } from '@blog-odya/shared/locales'
import { after } from 'next/server'
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeChangeHook,
  Payload,
  PayloadRequest,
} from 'payload'

import { INDEXNOW_SKIP_MESSAGES, indexNowDeps, indexNowReadiness } from '@/indexnow'
import { DEFAULT_QUEUE, INDEXNOW_SUBMIT_TASK } from '@/jobs/constants'
import { getRunDeadline } from '@/jobs/context'
import type { Post } from '@/payload-types'
import { postPath } from '@/site/paths'
import { absoluteUrl } from '@/site/seo/config'

/**
 * Posts ↔ IndexNow (TZ §8.3, OBLOG-57): maqolaning **ommaviy** holati o'zgarganda
 * `indexnow.submit` job'i (lotin + `/kr` URL'lari):
 *
 * - birinchi chop etish (yoki qayta chop etish) — yangi URL'lar;
 * - chop etishdan olish (unpublish), arxivlash, o'chirish — eski URL'lar (qidiruv tizimi 404 /
 *   redirect'ni tezroq ko'radi);
 * - slug yoki kategoriya o'zgargan (chop etilgan post) — yangi va eski URL'lar.
 *
 * Chop etilgan postni o'zgarishsiz qayta saqlash, qoralama/autosave — trigger emas. Solishtirish
 * **asosiy hujjat** (chop etilgan holat) bo'yicha: Payload `originalDoc`/`previousDoc` — oxirgi
 * versiya (qoralama bo'lishi mumkin), shuning uchun `beforeChange` asosiy hujjat holatini
 * `req.context` ga yozib qo'yadi (`slugRedirect.ts` dagi yondashuv).
 *
 * Darhol bajarish — Next.js `after()` (Telegram bilan bir xil, `Posts/telegram.ts`); so'rov
 * kontekstidan tashqarida yoki `/api/jobs/run` ichida — navbatdagi scheduler tsikli.
 * Kalit (`INDEXNOW_KEY`) yo'q — `warn` log, job qo'yilmaydi. Preview — jim o'tkazib yuboriladi.
 *
 * `req.context.skipIndexNow = true` — o'chirish (ommaviy import va h.k.).
 */

type Id = number | string
type PublicState = { path: string } | null

const SNAPSHOT_KEY = 'indexNowPublicState'

export const indexNowHookDeps: { runAfter: (task: () => Promise<void>) => boolean } = {
  runAfter: (task) => {
    try {
      after(task)
      return true
    } catch {
      return false
    }
  },
}

type PostState = Pick<Post, 'slug' | 'category' | 'workflowStatus' | '_status'>

async function categorySlug(payload: Payload, value: unknown): Promise<string | null> {
  if (value && typeof value === 'object') {
    const slug = (value as { slug?: unknown }).slug
    if (typeof slug === 'string' && slug) return slug
    value = (value as { id?: unknown }).id
  }
  if (typeof value !== 'number' && typeof value !== 'string') return null
  // `req` berilmaydi: kategoriya shu tranzaksiyada o'zgarmaydi, Local API esa `req.locale` ni
  // qayta yozadi.
  const category = await payload.findByID({
    collection: 'categories',
    id: value,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
    select: { slug: true },
  })
  return category?.slug || null
}

/** Ommaviy (sayt ko'rsatadigan) holat: chop etilgan va arxivlanmagan → lotin yo'li. */
async function publicState(
  payload: Payload,
  doc: PostState | null | undefined,
): Promise<PublicState> {
  if (!doc || doc._status !== 'published' || doc.workflowStatus === 'archived' || !doc.slug) {
    return null
  }
  const category = await categorySlug(payload, doc.category)
  return category ? { path: postPath('uz-Latn', category, doc.slug) } : null
}

/** Lotin yo'lidan ikkala yozuvdagi to'liq URL'lar. */
function urlsFor(path: string, origin: string): string[] {
  const [, category, slug] = path.split('/')
  if (!category || !slug) return []
  return LOCALES.map((locale) => absoluteUrl(postPath(locale, category, slug), origin))
}

/** Oldingi va yangi ommaviy holatdan yuboriladigan URL'lar (o'zgarish bo'lmasa — bo'sh). */
export function indexNowUrls(prev: PublicState, next: PublicState, origin: string): string[] {
  if (prev?.path === next?.path) return []
  return [
    ...new Set([
      ...(next ? urlsFor(next.path, origin) : []),
      ...(prev ? urlsFor(prev.path, origin) : []),
    ]),
  ]
}

function snapshots(req: PayloadRequest): Record<string, PublicState> {
  const context = req.context as Record<string, unknown>
  const existing = context[SNAPSHOT_KEY]
  if (existing && typeof existing === 'object') return existing as Record<string, PublicState>
  const created: Record<string, PublicState> = {}
  context[SNAPSHOT_KEY] = created
  return created
}

async function readMainState(
  payload: Payload,
  id: Id,
  req?: PayloadRequest,
): Promise<PostState | null> {
  const run = () =>
    payload.findByID({
      collection: 'posts',
      id,
      draft: false,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
      select: { slug: true, category: true, workflowStatus: true, _status: true },
      ...(req ? { req } : {}),
    })
  if (!req) return (await run()) as PostState | null
  // Ichki Local API `req.locale` / `req.fallbackLocale` ni qayta yozadi — tiklanadi.
  const { fallbackLocale, locale } = req
  try {
    return (await run()) as PostState | null
  } finally {
    req.locale = locale
    req.fallbackLocale = fallbackLocale
  }
}

/** `beforeChange`: saqlashdan oldingi asosiy (chop etilgan) holat. */
export const rememberIndexNowState: CollectionBeforeChangeHook<Post> = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (operation !== 'update' || !originalDoc?.id || req.context?.skipIndexNow) return data
  // Oxirgi versiya chop etilgan bo'lsa — u asosiy hujjat bilan bir xil (o'qish shart emas).
  const main =
    originalDoc._status === 'published'
      ? originalDoc
      : // Shu tranzaksiyada (asosiy qator hali o'zgarmagan) — alohida ulanish olinmaydi.
        await readMainState(req.payload, originalDoc.id, req)
  snapshots(req)[String(originalDoc.id)] = await publicState(req.payload, main)
  return data
}

function runSoon(payload: Payload, ids: Id[]): void {
  // `/api/jobs/run` ichida (scheduled publish) runner o'zi keyingi batch'da oladi.
  if (ids.length === 0 || getRunDeadline() !== undefined) return
  indexNowHookDeps.runAfter(async () => {
    try {
      await payload.jobs.run({
        queue: DEFAULT_QUEUE,
        where: { id: { in: ids } },
        limit: ids.length,
      })
    } catch (error) {
      payload.logger.error({ err: error, msg: 'IndexNow: job’ni darhol bajarib bo‘lmadi' })
    }
  })
}

async function queueSubmit(req: PayloadRequest, postId: Id, urls: string[]): Promise<void> {
  if (urls.length === 0) return
  const job = await req.payload.jobs.queue({
    task: INDEXNOW_SUBMIT_TASK,
    queue: DEFAULT_QUEUE,
    input: { urls },
    req,
  })
  req.payload.logger.debug({ postId, urls, msg: 'IndexNow: navbatga qo‘yildi' })
  runSoon(req.payload, [job.id])
}

/** Tayyor emas (kalit yo'q va h.k.) — `null`; kalit yo'qligi `warn` log bilan. */
function readyOrigin(payload: Payload, postId: Id): string | null {
  const ready = indexNowReadiness(indexNowDeps)
  if (ready.ok) return ready.origin
  if (ready.reason !== 'indexing-disabled') {
    payload.logger.warn({ postId, msg: INDEXNOW_SKIP_MESSAGES[ready.reason] })
  }
  return null
}

export const queueIndexNowAfterChange: CollectionAfterChangeHook<Post> = async ({
  doc,
  operation,
  req,
}) => {
  if (req.context?.skipIndexNow) return doc
  const snapshot = operation === 'update' ? snapshots(req)[String(doc.id)] : null
  if (operation === 'update') delete snapshots(req)[String(doc.id)]
  const prev = snapshot ?? null

  // Publish saqlash (`_status: published`) — asosiy hujjat = `doc`. Qoralama saqlash: asosiy
  // hujjat o'zgarmaydi (autosave) yoki qoralamaga o'tadi (unpublish) — faqat avval ommaviy
  // bo'lganda tekshiriladi.
  let next: PublicState
  if (doc._status === 'published') {
    next = await publicState(req.payload, doc)
  } else if (prev) {
    next = await publicState(req.payload, await readMainState(req.payload, doc.id, req))
  } else {
    return doc
  }
  if (prev?.path === next?.path) return doc

  const origin = readyOrigin(req.payload, doc.id)
  if (!origin) return doc
  await queueSubmit(req, doc.id, indexNowUrls(prev, next, origin))
  return doc
}

export const queueIndexNowAfterDelete: CollectionAfterDeleteHook<Post> = async ({ doc, req }) => {
  if (req.context?.skipIndexNow) return doc
  const prev = await publicState(req.payload, doc)
  if (!prev) return doc
  const origin = readyOrigin(req.payload, doc.id)
  if (!origin) return doc
  await queueSubmit(req, doc.id, indexNowUrls(prev, null, origin))
  return doc
}
