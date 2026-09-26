import config from '@payload-config'
import { getPayload } from 'payload'

import { env } from '@/env'
import { createMcpRoute } from '@/mcp/route'

/**
 * `https://blog.odya.uz/api/mcp` — MCP server (TZ §6.3, M2-06). Mantiq — `src/mcp/`.
 *
 * Ulanish (Claude Code):
 * `claude mcp add --transport http odya https://blog.odya.uz/api/mcp --header "Authorization: Bearer <API kalit>"`
 *
 * Route `app/api/mcp/route.ts` da (TZ'dagi `[transport]` segmenti o'rniga): manzil aynan `/api/mcp`
 * bo'lishi kerak, `app/api/[transport]` esa Payload'ning `/api/[...slug]` REST route'larini
 * to'sib qo'yardi. SSE transporti o'chiq — faqat Streamable HTTP.
 */
/** = `MCP_MAX_DURATION` (byudjet — `src/mcp/route.ts`; Next statik literal talab qiladi). */
export const maxDuration = 120
export const dynamic = 'force-dynamic'

export const { GET, POST, DELETE } = createMcpRoute({
  getPayload: () => getPayload({ config }),
  siteUrl: env.NEXT_PUBLIC_SITE_URL,
  media: { pexelsApiKey: env.PEXELS_API_KEY },
})
