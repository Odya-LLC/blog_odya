import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
  PayloadRequest,
} from 'payload'

import { AUDIT_LOGS_SLUG, type AuditAction } from '@/collections/AuditLogs'

import { type AuditRequestContext, resolveAuditChannel } from './channel'
import { type AuditDiff, computeDiff } from './diff'

const MAX_TITLE = 200
const MAX_USER_AGENT = 500
const MAX_TOOL = 100

export interface CollectionAuditOptions {
  /**
   * Foydalanuvchisiz (job/tizim) yozuvlarni audit qilmaslik — tez-tez o'zgaradigan texnik
   * holat uchun (`sources` feed holati, `scraped-items` pipeline'i). Inson/MCP amallari baribir
   * yoziladi.
   */
  skipSystemWrites?: boolean
  /** Sarlavha maydoni (`admin.useAsTitle`). */
  titleField?: string
}

type Id = number | string

interface AuditEntry {
  action: AuditAction
  collection?: string
  global?: string
  docId?: Id | null
  title?: unknown
  diff?: AuditDiff | null
}

function truncate(value: unknown, max: number): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = String(value).trim()
  if (!text) return null
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** Mijoz IP'si: Vercel/proksi `x-forwarded-for` ning birinchi qiymati. */
export function clientIp(headers: Headers | undefined): string | null {
  const forwarded = headers?.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || headers?.get('x-real-ip')?.trim() || null
}

/** Admin'dagi avtomatik saqlash (autosave, har 10 s) — audit'ga yozilmaydi. */
function isAutosave(req: PayloadRequest): boolean {
  const flag = (req.query as Record<string, unknown> | undefined)?.autosave
  return flag === true || flag === 'true'
}

/**
 * Audit yozuvini yaratish. `req` uzatiladi — asosiy amal bilan bitta tranzaksiyada (amal bekor
 * bo'lsa, yozuv ham qolmaydi). Audit yozuvi yaratilmasa, amal ham xato bilan tugaydi: izsiz
 * o'zgarish bo'lmasligi kerak.
 */
async function writeAuditLog(req: PayloadRequest, entry: AuditEntry): Promise<void> {
  const context = (req.context ?? {}) as AuditRequestContext
  const user = req.user?.collection === 'users' ? req.user : null
  await req.payload.create({
    collection: AUDIT_LOGS_SLUG,
    data: {
      action: entry.action,
      collection: entry.collection ?? null,
      global: entry.global ?? null,
      docId: entry.docId === null || entry.docId === undefined ? null : String(entry.docId),
      title: truncate(entry.title, MAX_TITLE),
      locale: typeof req.locale === 'string' ? req.locale : null,
      diff: entry.diff ?? null,
      actorType: req.user ? 'user' : 'system',
      user: user?.id ?? null,
      channel: resolveAuditChannel(req),
      tool: truncate(context.mcpTool, MAX_TOOL),
      ip: clientIp(req.headers),
      userAgent: truncate(req.headers?.get('user-agent'), MAX_USER_AGENT),
    },
    req,
    overrideAccess: true,
    depth: 0,
  })
}

export function auditCollectionAfterChange(
  options: CollectionAuditOptions = {},
): CollectionAfterChangeHook {
  return async ({ collection, doc, operation, previousDoc, req }) => {
    if (options.skipSystemWrites && !req.user) return doc
    if (operation === 'update' && isAutosave(req)) return doc

    const before = operation === 'create' ? null : (previousDoc as Record<string, unknown>)
    const after = doc as Record<string, unknown>
    const diff = computeDiff(before, after)
    // Hech narsa o'zgarmagan saqlash — iz qoldirmaydi.
    if (operation === 'update' && Object.keys(diff).length === 0) return doc

    let action: AuditAction = operation === 'create' ? 'create' : 'update'
    if (
      operation === 'update' &&
      after._status === 'published' &&
      before?._status !== 'published'
    ) {
      action = 'publish'
    }

    await writeAuditLog(req, {
      action,
      collection: collection.slug,
      docId: doc.id as Id,
      title: options.titleField ? after[options.titleField] : undefined,
      diff,
    })
    return doc
  }
}

export function auditCollectionAfterDelete(
  options: CollectionAuditOptions = {},
): CollectionAfterDeleteHook {
  return async ({ collection, doc, id, req }) => {
    if (options.skipSystemWrites && !req.user) return doc
    await writeAuditLog(req, {
      action: 'delete',
      collection: collection.slug,
      docId: id as Id,
      title: options.titleField ? (doc as Record<string, unknown>)[options.titleField] : undefined,
    })
    return doc
  }
}

export function auditGlobalAfterChange(): GlobalAfterChangeHook {
  return async ({ doc, global, previousDoc, req }) => {
    const diff = computeDiff(previousDoc as Record<string, unknown>, doc as Record<string, unknown>)
    if (Object.keys(diff).length === 0) return doc
    await writeAuditLog(req, {
      action: 'update',
      global: global.slug,
      title: typeof global.label === 'string' ? global.label : global.slug,
      diff,
    })
    return doc
  }
}
