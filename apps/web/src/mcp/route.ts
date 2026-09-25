import { createMcpHandler } from 'mcp-handler'
import type { Payload } from 'payload'

import { runWithAuditChannel } from '@/audit/channel'
import { apiKeyErrorResponse, authenticateBearer } from '@/auth/api-key'
import type { RateLimiter } from '@/auth/rate-limit'

import type { McpContext, McpMediaOptions } from './context'
import { MCP_INSTRUCTIONS, MCP_SERVER_INFO, registerOdyaMcp } from './server'

/**
 * `/api/mcp` — MCP server (TZ §6.3): `mcp-handler` + `@modelcontextprotocol/sdk`, Streamable HTTP,
 * stateless (har bir POST — yangi server va transport, sessiya yo'q) — Vercel funksiyasida ishlaydi.
 *
 * - `POST` — JSON-RPC. Majburiy `Authorization: Bearer <API kalit>` (yoki `users API-Key <kalit>`):
 *   kalit bo'yicha rate limit (60/daqiqa, 429) va egasini aniqlash (401). Toollar Local API'ni kalit
 *   egasi nomidan (`overrideAccess: false`) chaqiradi; audit kanali — `mcp`.
 * - `GET` — health: autentifikatsiyasiz 200 (UptimeRobot). `Accept: text/event-stream` bilan
 *   (serverdan oqim so'rovi) — 405: stateless serverda server → mijoz oqimi yo'q (MCP spetsifikatsiyasi
 *   bo'yicha ruxsat etilgan javob).
 * - `DELETE` — 405 (sessiya yo'q).
 */
export const MCP_PATH = '/api/mcp'

/** `mcp-handler` endpoint'ni `${basePath}/mcp` deb hisoblaydi → `/api/mcp`. */
const MCP_BASE_PATH = MCP_PATH.replace(/\/mcp$/, '')

export const MCP_MAX_DURATION = 60

export interface McpRouteDeps {
  getPayload: () => Promise<Payload>
  siteUrl: string
  limiter?: RateLimiter
  /** Media toollari (OBLOG-44): stok API kaliti; testlarda — tarmoq o'rnini bosuvchilar. */
  media?: McpMediaOptions
}

const NO_STORE = { 'Cache-Control': 'no-store' }

function methodNotAllowed(): Response {
  return Response.json(
    {
      jsonrpc: '2.0',
      error: { code: -32000, message: "Usul ruxsat etilmagan: MCP so'rovlari — faqat POST" },
      id: null,
    },
    { status: 405, headers: { ...NO_STORE, Allow: 'POST' } },
  )
}

export function healthResponse(): Response {
  return Response.json(
    {
      status: 'ok',
      service: MCP_SERVER_INFO.name,
      version: MCP_SERVER_INFO.version,
      transport: 'streamable-http',
      auth: 'Bearer <API kalit>',
    },
    { headers: NO_STORE },
  )
}

export function createMcpRoute(deps: McpRouteDeps) {
  async function POST(request: Request): Promise<Response> {
    const payload = await deps.getPayload()
    const auth = await authenticateBearer(payload, request.headers, {
      ...(deps.limiter ? { limiter: deps.limiter } : {}),
    })
    if (!auth.ok) return apiKeyErrorResponse(auth)

    const ctx: McpContext = {
      payload,
      user: auth.user,
      siteUrl: deps.siteUrl,
      ...(deps.media ? { media: deps.media } : {}),
    }
    const handler = createMcpHandler(
      (server) => registerOdyaMcp(server, ctx),
      { serverInfo: MCP_SERVER_INFO, instructions: MCP_INSTRUCTIONS },
      { basePath: MCP_BASE_PATH, maxDuration: MCP_MAX_DURATION, disableSse: true },
    )
    // Toollar ichidagi har qanday Local API chaqiruvi (hatto `context` uzatilmagan) — `mcp` kanali.
    return runWithAuditChannel('mcp', () => handler(request))
  }

  async function GET(request: Request): Promise<Response> {
    const accept = request.headers.get('accept') ?? ''
    if (accept.includes('text/event-stream')) return methodNotAllowed()
    return healthResponse()
  }

  async function DELETE(): Promise<Response> {
    return methodNotAllowed()
  }

  return { GET, POST, DELETE }
}
