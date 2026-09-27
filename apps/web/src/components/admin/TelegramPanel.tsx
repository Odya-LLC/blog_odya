import { LOCALES, type Locale } from '@blog-odya/shared/locales'
import type { UIFieldServerProps } from 'payload'

import { isAdminOrEditorUser } from '@/access'
import { TELEGRAM_POST_TASK } from '@/jobs/constants'
import { readTelegramState, type TelegramEntry } from '@/telegram/autopost'
import { telegramMessageLink } from '@/telegram/caption'
import { loadTelegramConfig } from '@/telegram/config'

import { formatAdminDate } from './utils'

import './editorial.css'

const SCRIPT_LABEL: Record<Locale, string> = {
  'uz-Latn': 'Lotin kanal',
  'uz-Cyrl': 'Kirill kanal',
}

type Status = { tone: 'ok' | 'warn' | 'error' | 'muted'; text: string }

function statusOf(
  entry: TelegramEntry | undefined,
  pending: boolean,
  configured: boolean,
  published: boolean,
): Status {
  if (entry?.messageId && entry.error) {
    return { tone: 'error', text: `Yuborilgan, tahrirlashda xato: ${entry.error}` }
  }
  if (entry?.messageId) return { tone: 'ok', text: `Yuborilgan · ${formatAdminDate(entry.sentAt)}` }
  if (pending) return { tone: 'warn', text: 'Navbatda (tez orada yuboriladi)' }
  if (entry?.error) return { tone: 'error', text: `Xato: ${entry.error}` }
  if (!configured) return { tone: 'muted', text: 'Kanal sozlanmagan' }
  return { tone: 'muted', text: published ? 'Yuborilmagan' : 'Chop etilganda yuboriladi' }
}

/**
 * Post yon panelidagi Telegram holati (TZ §7.1, M3-01): har kanal uchun — yuborilgan (havola
 * bilan), navbatda, xato yoki yuborilmagan. Holat asosiy jadvaldan o'qiladi (job yozadi —
 * versiyadagi nusxa eskirgan bo'lishi mumkin). Faqat o'qish.
 */
export async function TelegramPanel({ data, req }: UIFieldServerProps) {
  if (!isAdminOrEditorUser(req.user)) return null
  const id = typeof data?.id === 'number' || typeof data?.id === 'string' ? data.id : null
  if (id === null) return null

  // `req` Local API'ga berilmaydi — admin render so'rovining `locale`/`fallbackLocale` i
  // o'zgarmasin (o'qishlar tranzaksiyaga bog'liq emas; kirish yuqorida tekshirilgan).
  const [entries, config, jobs] = await Promise.all([
    readTelegramState(req.payload, id),
    loadTelegramConfig(req.payload),
    req.payload.find({
      collection: 'payload-jobs',
      where: {
        and: [
          { taskSlug: { equals: TELEGRAM_POST_TASK } },
          { 'input.postId': { equals: Number(id) } },
          { completedAt: { exists: false } },
          { hasError: { not_equals: true } },
        ],
      },
      depth: 0,
      limit: 10,
    }),
  ])
  const pendingScripts = new Set(
    jobs.docs.map((job) => (job.input as { script?: unknown } | null)?.script),
  )
  const published = data?.workflowStatus === 'published'

  return (
    <details className="source-panel" open data-testid="telegram-panel">
      <summary>Telegram</summary>
      <div className="source-panel__body">
        {data?.telegramSkip ? (
          <span className="editorial__muted">“Telegram’ga yubormaslik” belgilangan.</span>
        ) : null}
        {!config.token ? (
          <span className="telegram-panel__status telegram-panel__status--warn">
            Bot tokeni (TELEGRAM_BOT_TOKEN) sozlanmagan — avtopost o‘chiq.
          </span>
        ) : null}
        {LOCALES.map((script) => {
          const entry = entries.find((row) => row.script === script)
          const channel = config.channels[script]
          const status = statusOf(entry, pendingScripts.has(script), Boolean(channel), published)
          const link = telegramMessageLink(entry?.chatId ?? channel?.chatId, entry?.messageId)
          return (
            <div key={script} className="telegram-panel__row">
              <strong>{SCRIPT_LABEL[script]}</strong>
              <span className="editorial__muted">
                {channel?.chatId ?? entry?.chatId ?? '—'}
                {config.disabled.includes(script) ? ' (o‘chirilgan)' : ''}
              </span>
              <span className={`telegram-panel__status telegram-panel__status--${status.tone}`}>
                {status.text}
              </span>
              {link ? (
                <a href={link} target="_blank" rel="noopener noreferrer">
                  Xabarni ochish ↗
                </a>
              ) : null}
            </div>
          )
        })}
      </div>
    </details>
  )
}
