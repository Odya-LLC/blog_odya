import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

/**
 * Tool javoblari va xatolari (TZ §5.3 "Xatolar agentga tushunarli matn bilan qaytariladi").
 * Agentga ko'rinadigan barcha matnlar — o'zbekcha (lotin).
 */

/** Agentga shu matn bilan qaytariladigan xato (`isError: true`). */
export class McpToolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'McpToolError'
  }
}

/** Obyektni JSON matn sifatida (inson ham, agent ham o'qiy oladigan formatda). */
export function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

export function textResult(...texts: string[]): CallToolResult {
  return { content: texts.map((text) => ({ type: 'text' as const, text })) }
}

export function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

/**
 * Istalgan xato → agent uchun tushunarli matn. Payload xatolari HTTP status bo'yicha
 * tarjima qilinadi; kutilmagan xatolar tafsilotlari (SQL va h.k.) agentga chiqarilmaydi.
 */
export function describeError(error: unknown): string {
  if (error instanceof McpToolError) return error.message
  const status = (error as { status?: unknown } | null)?.status
  if (status === 401 || status === 403) {
    return "Ruxsat yo'q: API kalit egasining huquqlari bu amal uchun yetarli emas"
  }
  if (status === 404) return "So'ralgan hujjat topilmadi"
  if (status === 400) {
    const message = error instanceof Error ? error.message : ''
    return `Noto'g'ri so'rov${message ? `: ${message}` : ''}`
  }
  return "Serverda kutilmagan xato yuz berdi — birozdan keyin qayta urinib ko'ring"
}

/** Tool handler'ini o'raydi: xato → `isError` javob (MCP protokol xatosi emas). */
export function safeTool<Args extends unknown[]>(
  name: string,
  fn: (...args: Args) => Promise<CallToolResult>,
): (...args: Args) => Promise<CallToolResult> {
  return async (...args) => {
    try {
      return await fn(...args)
    } catch (error) {
      if (!(error instanceof McpToolError)) {
        console.error(`[mcp] ${name}:`, error)
      }
      return errorResult(describeError(error))
    }
  }
}
