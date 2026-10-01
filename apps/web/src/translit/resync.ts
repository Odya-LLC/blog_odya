import { lexicalPlainText } from '@blog-odya/shared'
import type { Endpoint, Payload, PayloadRequest, Where } from 'payload'

import { isAdminUser } from '@/access'

import {
  CYRILLIC_LOCALE,
  CYRL_CONTEXT_REGENERATE,
  LATIN_LOCALE,
  cyrillicFromLatin,
  cyrlValuesEqual,
  isEmptyCyrlValue,
  normalizeSpecs,
  parseCyrlLocked,
  type NormalizedSpec,
} from './cyrlSync'
import { postProtectedTerms } from './post-terms'
import { CYRL_SYNC } from './sync-config'
import { getTransliterator, invalidateTransliteratorCache } from './transliterator'

/**
 * Chop etilgan postlarning kirill versiyasini joriy qoidalar va lug'atlar bilan qayta yaratish
 * (OBLOG-67: transliterator yangilangach — brendlar, qisqartmalar, asl ismlar).
 *
 * - Standart — **dry-run**: hech narsa yozilmaydi, faqat o'zgarishlar hisoboti (`diff`).
 * - `apply` — o'zgargan va **qulflanmagan** maydonlar `cyrlRegenerate` konteksti bilan qayta
 *   yoziladi (hook o'sha saqlashda yozadi). Muharrir qo'lda tuzatgan maydonlar (`cyrlLocked`)
 *   o'zgarmaydi — hisobotda `locked` sifatida ko'rsatiladi.
 * - Saqlanmagan qoralamasi bor post (chop etilgandan keyingi o'zgarishlar) o'tkazib yuboriladi —
 *   aks holda saqlash qoralamani chop etib yuborardi.
 * - Telegram xabarlari tahrirlanmaydi (`skipTelegram`): kanaldagi kirill xabarlar o'zgarmaydi,
 *   ommaviy tahrir kanal obunachilariga "tahrirlangan" belgisi bilan ko'rinadi. IndexNow — URL
 *   o'zgarmaydi, yuborilmaydi (`skipIndexNow`).
 * - Sayt keshi: Next.js kontekstida (admin endpoint) — `revalidateTag` hook'lar orqali darhol;
 *   CLI'da (`payload run`) — sahifalar ISR muddati (≤ 1 soat) bo'yicha yangilanadi.
 */

export type CyrlResyncFilter = 'all' | 'ai'

export interface CyrlResyncOptions {
  /** `true` — yozish; standart — dry-run. */
  apply?: boolean
  /** Faqat shu postlar (bo'lmasa — filtr bo'yicha barcha chop etilganlar). */
  ids?: number[]
  /** `ai` — faqat AI agent qayta yozgan postlar (`rewrittenBy = ai_agent`, MCP). Standart — `all`. */
  filter?: CyrlResyncFilter
  /** Ko'pi bilan N ta post. */
  limit?: number
  log?: (message: string) => void
  /** Next.js so'rovi (admin endpoint) — revalidate shu kontekstda ishlaydi. */
  req?: PayloadRequest
}

export interface CyrlResyncChange {
  /** Qulf kaliti (`title`, `excerpt`, `content`, `meta`, `faq`, `coverAlt`). */
  field: string
  /** O'zgargan so'zlar: `Фигуре → Figure` (bo'lmasa — qisqartirilgan oldin/keyin). */
  words: string[]
}

export type CyrlResyncStatus = 'unchanged' | 'would_update' | 'updated' | 'skipped' | 'failed'

export interface CyrlResyncPostResult {
  id: number
  slug: string
  status: CyrlResyncStatus
  reason?: string
  changes: CyrlResyncChange[]
  /** O'zgarishi kerak, lekin qo'lda tuzatilgan (qulflangan) maydonlar — tegilmadi. */
  locked: string[]
  /** Hali ham kirillga o'girilayotgan katta harfli so'zlar (glossariy/keepLatin uchun nomzodlar). */
  suspicious: string[]
}

export interface CyrlResyncSummary {
  apply: boolean
  scanned: number
  changed: number
  updated: number
  unchanged: number
  skipped: number
  failed: number
  lockedFields: number
  posts: CyrlResyncPostResult[]
}

type Localized = Partial<Record<string, unknown>>

function atPath(doc: unknown, path: string): unknown {
  let current: unknown = doc
  for (const key of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

function inLocale(value: unknown, locale: string): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return (value as Localized)[locale]
}

/** Solishtirish uchun ko'rinadigan matn (satr, Lexical, FAQ qatorlari). */
function visibleText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map((row) =>
        typeof row === 'object' && row !== null
          ? Object.entries(row as Record<string, unknown>)
              .filter(([key, cell]) => key !== 'id' && typeof cell === 'string')
              .map(([, cell]) => cell as string)
              .join('\n')
          : '',
      )
      .join('\n')
  }
  return lexicalPlainText(value)
}

const truncate = (value: string, max = 120) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value

/** So'z darajasidagi farq (o'girish so'zlar sonini o'zgartirmaydi — odatda pozitsiya bo'yicha). */
export function wordChanges(before: string, after: string, max = 20): string[] {
  const a = before.split(/\s+/).filter(Boolean)
  const b = after.split(/\s+/).filter(Boolean)
  if (a.length !== b.length) {
    const show = (words: string[]) => (words.length ? truncate(words.join(' ')) : '(boʻsh)')
    return [`${show(a)} → ${show(b)}`]
  }
  const out = new Set<string>()
  for (let i = 0; i < a.length && out.size < max; i++) {
    if (a[i] !== b[i]) out.add(`${a[i]} → ${b[i]}`)
  }
  return [...out]
}

const POST_SPECS = (): NormalizedSpec[] => normalizeSpecs(CYRL_SYNC.collections?.posts ?? {})

export async function resyncPostsCyrillic(
  payload: Payload,
  options: CyrlResyncOptions = {},
): Promise<CyrlResyncSummary> {
  const apply = options.apply === true
  const log = options.log ?? (() => undefined)
  const and: Where[] = [
    { _status: { equals: 'published' } },
    { workflowStatus: { equals: 'published' } },
  ]
  if (options.ids?.length) and.push({ id: { in: options.ids } })
  if (options.filter === 'ai') and.push({ rewrittenBy: { equals: 'ai_agent' } })

  // Lug'atlar (seed + DB) — eng yangi holat.
  invalidateTransliteratorCache()
  const base = await getTransliterator(payload)
  const specs = POST_SPECS()

  const { docs } = await payload.find({
    collection: 'posts',
    where: { and },
    locale: 'all',
    fallbackLocale: false,
    depth: 0,
    sort: 'id',
    overrideAccess: true,
    // `pagination: false` da `limit` hisobga olinmaydi.
    ...(options.limit ? { limit: options.limit } : { pagination: false }),
  })

  const summary: CyrlResyncSummary = {
    apply,
    scanned: docs.length,
    changed: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    failed: 0,
    lockedFields: 0,
    posts: [],
  }

  for (const doc of docs) {
    const record = doc as unknown as Record<string, unknown>
    const result: CyrlResyncPostResult = {
      id: doc.id,
      slug: String(inLocale(record.slug, LATIN_LOCALE) ?? record.slug ?? ''),
      status: 'unchanged',
      changes: [],
      locked: [],
      suspicious: [],
    }
    summary.posts.push(result)
    try {
      const locks = parseCyrlLocked(record.cyrlLocked)
      const terms = await postProtectedTerms(payload, {
        keepLatin: record.keepLatin,
        tags: record.tags,
      })
      const transliterator = base.withProtectedTerms(terms)
      const suspicious = new Set<string>()
      const changedKeys = new Set<string>()
      const lockedKeys = new Set<string>()
      for (const spec of specs) {
        const stored = atPath(record, spec.path)
        const latin = inLocale(stored, LATIN_LOCALE)
        const cyrillic = inLocale(stored, CYRILLIC_LOCALE)
        if (isEmptyCyrlValue(latin, spec.kind)) continue
        const next = cyrillicFromLatin(spec, latin, transliterator, cyrillic, suspicious)
        if (cyrlValuesEqual(next, cyrillic, spec.kind)) continue
        if (locks[spec.lockKey]) {
          lockedKeys.add(spec.lockKey)
          continue
        }
        changedKeys.add(spec.lockKey)
        result.changes.push({
          field: spec.path,
          words: wordChanges(visibleText(cyrillic), visibleText(next)),
        })
      }
      result.locked = [...lockedKeys]
      result.suspicious = [...suspicious].sort()
      summary.lockedFields += lockedKeys.size
      if (changedKeys.size === 0) {
        summary.unchanged++
        continue
      }
      summary.changed++

      // Chop etilgandan keyin saqlangan qoralama bor — publish saqlash uni chop etib yuborardi.
      const { docs: latest } = await payload.findVersions({
        collection: 'posts',
        where: { and: [{ parent: { equals: doc.id } }, { latest: { equals: true } }] },
        depth: 0,
        limit: 1,
        overrideAccess: true,
      })
      if (latest[0]?.version?._status === 'draft') {
        result.status = 'skipped'
        result.reason = 'unpublished_draft'
        summary.skipped++
        log(`#${doc.id}: chop etilmagan qoralama bor — oʻtkazib yuborildi`)
        continue
      }

      if (!apply) {
        result.status = 'would_update'
        continue
      }
      await payload.update({
        collection: 'posts',
        id: doc.id,
        locale: LATIN_LOCALE,
        fallbackLocale: false,
        data: {},
        depth: 0,
        overrideAccess: true,
        ...(options.req ? { req: options.req } : {}),
        context: {
          [CYRL_CONTEXT_REGENERATE]: [...changedKeys],
          skipTelegram: true,
          skipIndexNow: true,
          cyrlResync: true,
        },
      })
      result.status = 'updated'
      summary.updated++
      log(`#${doc.id}: kirill yangilandi (${[...changedKeys].join(', ')})`)
    } catch (error) {
      result.status = 'failed'
      result.reason = error instanceof Error ? error.message : String(error)
      summary.failed++
      log(`#${doc.id}: xato — ${result.reason}`)
    }
  }
  return summary
}

/** Hisobotning matn ko'rinishi (CLI, GitHub Summary). */
export function formatResyncSummary(summary: CyrlResyncSummary): string {
  const lines = [
    `cyrl:resync${summary.apply ? '' : ' (dry-run)'}: koʻrildi ${summary.scanned}, ` +
      `oʻzgaradi ${summary.changed}, yangilandi ${summary.updated}, oʻzgarishsiz ${summary.unchanged}, ` +
      `oʻtkazildi ${summary.skipped}, xato ${summary.failed}, qulflangan maydonlar ${summary.lockedFields}`,
  ]
  for (const post of summary.posts) {
    if (post.status === 'unchanged' && !post.locked.length && !post.suspicious.length) continue
    lines.push(
      `#${post.id} ${post.slug} [${post.status}${post.reason ? `: ${post.reason}` : ''}]` +
        (post.locked.length ? ` qulflangan (tegilmadi): ${post.locked.join(', ')}` : ''),
    )
    for (const change of post.changes) {
      lines.push(`  ${change.field}: ${change.words.join('; ')}`)
    }
    if (post.suspicious.length) lines.push(`  shubhali: ${post.suspicious.join(', ')}`)
  }
  return lines.join('\n')
}

/**
 * `POST /api/posts/resync-cyrl` (faqat admin) — xuddi shu qayta sinxronlash Next.js kontekstida:
 * sayt keshi (`revalidateTag`) darhol yangilanadi. Body: `{ apply?: boolean, ids?: number[],
 * filter?: "all" | "ai", limit?: number }` — standart dry-run. Javob — `CyrlResyncSummary`.
 */
export const RESYNC_CYRL_ENDPOINT = 'resync-cyrl'

export const resyncCyrlEndpoint: Endpoint = {
  path: `/${RESYNC_CYRL_ENDPOINT}`,
  method: 'post',
  handler: async (req) => {
    if (!isAdminUser(req.user)) {
      return Response.json({ errors: [{ message: 'Faqat admin.' }] }, { status: 403 })
    }
    let body: Record<string, unknown> = {}
    try {
      const parsed: unknown = await req.json?.()
      if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>
    } catch {
      // bo'sh body — dry-run, barcha chop etilgan postlar
    }
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is number => Number.isSafeInteger(id) && (id as number) > 0)
      : []
    const limit = Number.isSafeInteger(body.limit) && (body.limit as number) > 0 ? body.limit : 0
    try {
      const summary = await resyncPostsCyrillic(req.payload, {
        apply: body.apply === true,
        filter: body.filter === 'ai' ? 'ai' : 'all',
        ...(ids.length ? { ids } : {}),
        ...(limit ? { limit: limit as number } : {}),
        req,
        log: (message) => req.payload.logger.info(message),
      })
      return Response.json(summary)
    } catch (error) {
      req.payload.logger.error({ err: error, msg: 'cyrl:resync xatosi' })
      return Response.json({ errors: [{ message: 'Ichki xatolik.' }] }, { status: 500 })
    }
  },
}
