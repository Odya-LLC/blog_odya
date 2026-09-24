import type { Payload, RequestContext } from 'payload'

import type { AuditRequestContext } from '@/audit/channel'
import type { ApiKeyUser } from '@/auth/api-key'

/**
 * Bitta MCP so'rovi konteksti (TZ §6.3): kalit egasi va Payload. Server har bir HTTP so'rov
 * uchun yangidan yaratiladi (stateless), shuning uchun kontekst closure orqali uzatiladi.
 */
export interface McpContext {
  payload: Payload
  /** API kalit egasi — Local API `user` (`overrideAccess: false`). */
  user: ApiKeyUser
  /** Sayt manzili (ichki havolalar uchun absolyut URL). */
  siteUrl: string
}

/**
 * Local API argumentlari: kirish qoidalari kalit egasi nomidan (`overrideAccess: false`),
 * audit kanali — `mcp` + tool nomi (TZ §6.4: "MCP uchun — tool nomi").
 */
export function localApiArgs(
  ctx: McpContext,
  tool: string,
): {
  user: ApiKeyUser
  overrideAccess: false
  context: AuditRequestContext & RequestContext
} {
  return { user: ctx.user, overrideAccess: false, context: { channel: 'mcp', mcpTool: tool } }
}
