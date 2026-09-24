import { AsyncLocalStorage } from 'node:async_hooks'

import type { PayloadRequest } from 'payload'

/**
 * Audit log kanallari (TZ §6.4, §10.12): o'zgarish qaysi yo'l bilan kelgani.
 */
export const AUDIT_CHANNELS = ['admin', 'rest', 'graphql', 'mcp', 'job'] as const

export type AuditChannel = (typeof AUDIT_CHANNELS)[number]

export const AUDIT_CHANNEL_LABELS: Record<AuditChannel, string> = {
  admin: 'Admin panel',
  rest: 'REST API',
  graphql: 'GraphQL',
  mcp: 'MCP',
  job: 'Job (fon vazifa)',
}

export const AUDIT_ACTOR_TYPES = ['user', 'system'] as const

export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number]

/**
 * `req.context` kalitlari — Local API chaqiruvchilari (MCP server, skriptlar) kanalni aniq
 * belgilaydi: `payload.update({ ..., context: { channel: 'mcp', mcpTool: 'save_rewrite' } })`.
 */
export interface AuditRequestContext {
  channel?: AuditChannel
  /** MCP tool nomi (TZ §6.4: "MCP uchun — tool nomi"). */
  mcpTool?: string
}

export function isAuditChannel(value: unknown): value is AuditChannel {
  return typeof value === 'string' && (AUDIT_CHANNELS as readonly string[]).includes(value)
}

/**
 * "Muhit" kanali — `req` uzatilmaydigan chaqiruvlar uchun (masalan, Payload'ning o'z
 * `schedulePublish` task'i yangi Local API `req` yaratadi, `context` yo'qoladi).
 * `/api/jobs/run` butun ishini `runWithAuditChannel('job', ...)` ichida bajaradi.
 */
const ambient = new AsyncLocalStorage<AuditChannel>()

export function runWithAuditChannel<T>(channel: AuditChannel, fn: () => Promise<T>): Promise<T> {
  return ambient.run(channel, fn)
}

export function getAmbientAuditChannel(): AuditChannel | undefined {
  return ambient.getStore()
}

type ChannelRequest = Pick<PayloadRequest, 'context' | 'payloadAPI' | 'user'>

/**
 * Kanalni aniqlash (ustuvorlik tartibida):
 *
 * 1. `req.context.channel` — chaqiruvchi aniq belgilagan (MCP: `mcp`).
 * 2. Muhit kanali (`runWithAuditChannel`) — `/api/jobs/run` ichidagi hamma narsa `job`.
 * 3. `req.payloadAPI === 'GraphQL'` — `graphql`.
 * 4. Foydalanuvchi API kalit bilan kirgan (`user._strategy === 'api-key'`) — `rest`.
 * 5. Foydalanuvchi yo'q (seed, job'lar, `overrideAccess` bilan tizim yozuvlari) — `job`.
 * 6. Qolgani (JWT/cookie sessiya — admin panel REST so'rovlari va server funksiyalari) — `admin`.
 *
 * Cheklov: JWT token bilan qo'lda yuborilgan REST so'rov ham `admin` deb yoziladi (mashina
 * kirishi uchun API kalit — TZ §6.2).
 */
export function resolveAuditChannel(req: ChannelRequest): AuditChannel {
  const fromContext = (req.context as AuditRequestContext | undefined)?.channel
  if (isAuditChannel(fromContext)) return fromContext

  const fromAmbient = getAmbientAuditChannel()
  if (fromAmbient) return fromAmbient

  if (req.payloadAPI === 'GraphQL') return 'graphql'
  if (!req.user) return 'job'
  if ((req.user as { _strategy?: unknown })._strategy === 'api-key') return 'rest'
  return 'admin'
}
