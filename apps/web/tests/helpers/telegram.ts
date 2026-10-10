import { Api } from 'grammy'

import type { TelegramApi } from '@/telegram/client'

/**
 * Soxta Telegram Bot API: haqiqiy grammY `Api` + `fetch` o'rnini bosuvchi (tarmoqsiz). Har
 * chaqiruv yoziladi; `fail()` bilan navbatdagi mos chaqiruvga xato javobi (429 `retry_after`,
 * 5xx, 400) beriladi — grammY uni odatdagidek `GrammyError` ga aylantiradi.
 */
export interface TelegramCall {
  method: string
  body: Record<string, unknown>
}

interface Failure {
  method?: string
  code: number
  description: string
  retryAfter?: number
}

export class FakeTelegram {
  readonly calls: TelegramCall[] = []
  readonly tokens: string[] = []
  private failures: Failure[] = []
  private nextMessageId = 1000

  fail(failure: Failure, times = 1): void {
    for (let i = 0; i < times; i++) this.failures.push(failure)
  }

  reset(): void {
    this.calls.length = 0
    this.tokens.length = 0
    this.failures = []
  }

  callsOf(method: string): TelegramCall[] {
    return this.calls.filter((call) => call.method === method)
  }

  readonly fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input))
    const [, botToken, method = ''] = url.pathname.split('/')
    this.tokens.push(botToken?.replace(/^bot/, '') ?? '')
    const body =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {}
    this.calls.push({ method, body })

    const index = this.failures.findIndex((f) => !f.method || f.method === method)
    if (index >= 0) {
      const [failure] = this.failures.splice(index, 1)
      return Response.json(
        {
          ok: false,
          error_code: failure!.code,
          description: failure!.description,
          ...(failure!.retryAfter ? { parameters: { retry_after: failure!.retryAfter } } : {}),
        },
        { status: failure!.code },
      )
    }
    const chat = { id: -100123, type: 'channel', title: String(body.chat_id) }
    const date = Math.floor(Date.now() / 1000)
    switch (method) {
      case 'sendPhoto':
        return Response.json({
          ok: true,
          result: {
            message_id: this.nextMessageId++,
            chat,
            date,
            photo: [],
            caption: body.caption,
          },
        })
      case 'sendMediaGroup': {
        // OBLOG-116: galereya — har rasmga alohida xabar (birinchisida caption).
        const media = (body.media as Record<string, unknown>[] | undefined) ?? []
        return Response.json({
          ok: true,
          result: media.map((item) => ({
            message_id: this.nextMessageId++,
            chat,
            date,
            photo: [],
            ...(item.caption ? { caption: item.caption } : {}),
          })),
        })
      }
      case 'sendMessage':
        return Response.json({
          ok: true,
          result: { message_id: this.nextMessageId++, chat, date, text: body.text },
        })
      case 'editMessageCaption':
      case 'editMessageText':
        return Response.json({ ok: true, result: true })
      default:
        return Response.json(
          { ok: false, error_code: 404, description: 'Not Found' },
          { status: 404 },
        )
    }
  }) as typeof fetch

  api = (token: string): TelegramApi => new Api(token, { fetch: this.fetch })
}
