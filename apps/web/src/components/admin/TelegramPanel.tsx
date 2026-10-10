import { LOCALES, type Locale } from '@blog-odya/shared/locales'
import type { UIFieldServerProps } from 'payload'

import { isAdminOrEditorUser } from '@/access'
import { TELEGRAM_POST_TASK } from '@/jobs/constants'
import { readTelegramState, type TelegramEntry } from '@/telegram/autopost'
import { telegramMessageLink } from '@/telegram/caption'
import { loadTelegramConfig } from '@/telegram/config'
import type { TelegramDigest } from '@/payload-types'

import { formatAdminDate, relId } from './utils'

import './editorial.css'

const SCRIPT_LABEL: Record<Locale, string> = {
  'uz-Latn': 'Lotin kanal',
  'uz-Cyrl': 'Kirill kanal',
}

type Status = { tone: 'ok' | 'warn' | 'error' | 'muted'; text: string }

type DigestRow = Pick<
  TelegramDigest,
  | 'id'
  | 'script'
  | 'slotAt'
  | 'status'
  | 'format'
  | 'chatId'
  | 'messageIds'
  | 'posts'
  | 'skippedPosts'
>

/** Post shu kanal dayjestida: o'rni (1 dan) yoki sig'magan. */
function digestOf(rows: DigestRow[], script: Locale, postId: number) {
  for (const row of rows) {
    if (row.script !== script) continue
    const position = (row.posts ?? []).findIndex((value) => relId(value) === postId)
    if (position >= 0 && row.status === 'sent') return { row, position: position + 1 }
    if ((row.skippedPosts ?? []).some((value) => relId(value) === postId)) {
      return { row, position: null }
    }
  }
  return null
}

function statusOf(
  entry: TelegramEntry | undefined,
  pending: boolean,
  configured: boolean,
  published: boolean,
  digest: ReturnType<typeof digestOf>,
  waitsForDigest: boolean,
): Status {
  if (entry?.messageId && entry.error) {
    return { tone: 'error', text: `Yuborilgan, tahrirlashda xato: ${entry.error}` }
  }
  if (entry?.messageId) return { tone: 'ok', text: `Yuborilgan · ${formatAdminDate(entry.sentAt)}` }
  if (digest?.position) {
    return {
      tone: 'ok',
      text: `Dayjestda (${digest.position}-o‘rin) · ${formatAdminDate(digest.row.slotAt)}`,
    }
  }
  if (digest) {
    return {
      tone: 'muted',
      text: `${formatAdminDate(digest.row.slotAt)} dayjestiga sig‘madi — Telegram’ga yuborilmadi`,
    }
  }
  if (pending) return { tone: 'warn', text: 'Navbatda (tez orada yuboriladi)' }
  if (entry?.error) return { tone: 'error', text: `Xato: ${entry.error}` }
  if (!configured) return { tone: 'muted', text: 'Kanal sozlanmagan' }
  if (waitsForDigest) {
    return {
      tone: 'muted',
      text: published ? 'Keyingi dayjestda yuboriladi' : 'Chop etilgach — keyingi dayjestda',
    }
  }
  return { tone: 'muted', text: published ? 'Yuborilmagan' : 'Chop etilganda yuboriladi' }
}

/**
 * Post yon panelidagi Telegram holati (TZ §7.1, M3-01): har kanal uchun — yuborilgan (havola
 * bilan), navbatda, xato yoki yuborilmagan. Holat asosiy jadvaldan o'qiladi (job yozadi —
 * versiyadagi nusxa eskirgan bo'lishi mumkin). Dayjest rejimida (OBLOG-116) — qaysi dayjestga
 * (o'rni, havola) kirgani, sig'magani yoki keyingi dayjestni kutayotgani. Faqat o'qish.
 */
export async function TelegramPanel({ data, req }: UIFieldServerProps) {
  if (!isAdminOrEditorUser(req.user)) return null
  const id = typeof data?.id === 'number' || typeof data?.id === 'string' ? data.id : null
  if (id === null) return null

  // `req` Local API'ga berilmaydi — admin render so'rovining `locale`/`fallbackLocale` i
  // o'zgarmasin (o'qishlar tranzaksiyaga bog'liq emas; kirish yuqorida tekshirilgan).
  const [entries, config, jobs, digests] = await Promise.all([
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
    // OBLOG-116: post kirgan (yoki sig'magan) dayjestlar.
    req.payload.find({
      collection: 'telegram-digests',
      where: {
        or: [{ posts: { in: [Number(id)] } }, { skippedPosts: { in: [Number(id)] } }],
      },
      select: {
        script: true,
        slotAt: true,
        status: true,
        format: true,
        chatId: true,
        messageIds: true,
        posts: true,
        skippedPosts: true,
      },
      sort: '-slotAt',
      depth: 0,
      limit: 10,
    }),
  ])
  const pendingScripts = new Set(
    jobs.docs.map((job) => (job.input as { script?: unknown } | null)?.script),
  )
  const published = data?.workflowStatus === 'published'
  const waitsForDigest =
    config.mode === 'digest' || (config.mode === 'hybrid' && data?.telegramUrgent !== true)
  const modeLabel =
    config.mode === 'post'
      ? 'Rejim: har post alohida'
      : config.mode === 'hybrid'
        ? 'Rejim: aralash (“Tezkor” — darhol, qolgani dayjestda)'
        : 'Rejim: dayjest'

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
        <span className="editorial__muted">{modeLabel}</span>
        {LOCALES.map((script) => {
          const entry = entries.find((row) => row.script === script)
          const channel = config.channels[script]
          const digest = entry?.messageId ? null : digestOf(digests.docs, script, Number(id))
          const status = statusOf(
            entry,
            pendingScripts.has(script),
            Boolean(channel),
            published,
            digest,
            waitsForDigest,
          )
          const digestMessageId = digest?.position
            ? String((digest.row.messageIds as unknown[] | null)?.[0] ?? '')
            : null
          const link = digestMessageId
            ? telegramMessageLink(digest!.row.chatId ?? channel?.chatId, digestMessageId)
            : telegramMessageLink(entry?.chatId ?? channel?.chatId, entry?.messageId)
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
              {digest ? (
                <a href={`/admin/collections/telegram-digests/${digest.row.id}`}>Dayjest yozuvi</a>
              ) : null}
            </div>
          )
        })}
      </div>
    </details>
  )
}
