/**
 * Telegram Bot API — minimal `sendMessage` (ogohlantirishlar, M2-03; avtopost — M3-01).
 * Token faqat env'da (`TELEGRAM_BOT_TOKEN`); xato matnlariga token tushmaydi.
 */

export const TELEGRAM_TIMEOUT_MS = 5_000

export interface SendTelegramOptions {
  token: string
  chatId: string
  /** HTML (`parse_mode: HTML`) — foydalanuvchi matnini `escapeTelegramHtml` bilan tozalang. */
  text: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export class TelegramError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'TelegramError'
  }
}

export function escapeTelegramHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Telegram xabar chegarasi — 4096 belgi. */
const MAX_TEXT = 4000

export async function sendTelegramMessage(options: SendTelegramOptions): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch
  let response: Response
  try {
    response = await fetchImpl(`https://api.telegram.org/bot${options.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: options.chatId,
        text: options.text.slice(0, MAX_TEXT),
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? TELEGRAM_TIMEOUT_MS),
    })
  } catch (error) {
    const name = (error as Error)?.name
    // Tarmoq xatosi matnida URL (token) bo'lishi mumkin — faqat turini qaytaramiz.
    throw new TelegramError(
      name === 'TimeoutError' || name === 'AbortError'
        ? 'Telegram: timeout'
        : 'Telegram: tarmoq xatosi',
    )
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { description?: string } | null
    throw new TelegramError(
      `Telegram: HTTP ${response.status}${body?.description ? ` — ${body.description}` : ''}`,
      response.status,
    )
  }
}
