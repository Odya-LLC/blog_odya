import { LOCALES, type Locale } from '@blog-odya/shared/locales'
import type { UIFieldServerProps } from 'payload'

import { isAdminOrEditorUser, isAdminUser } from '@/access'
import { MAKE_WEBHOOK_TASK } from '@/jobs/constants'
import type { SocialDelivery } from '@/payload-types'
import { loadMakeConfig } from '@/social/make/config'
import { isFinalDelivery, makeEventFor } from '@/social/make/deliver'

import { MakeActions } from './MakeActions'
import { SocialImagePreview } from './SocialImagePreview'
import { formatAdminDate } from './utils'

import './editorial.css'

const SCRIPT_LABEL: Record<Locale, string> = { 'uz-Latn': 'Lotin', 'uz-Cyrl': 'Kirill' }

type Status = { tone: 'ok' | 'warn' | 'error' | 'muted'; text: string }

function statusOf(
  delivery: SocialDelivery | undefined,
  pending: boolean,
  active: boolean,
  published: boolean,
  digestOnly: boolean,
): Status {
  const story = delivery?.event === 'post.story' ? ' (story)' : ''
  if (delivery?.status === 'sent') {
    return { tone: 'ok', text: `Make’ga yuborilgan${story} · ${formatAdminDate(delivery.sentAt)}` }
  }
  if (delivery?.status === 'skipped') {
    return { tone: 'muted', text: `Story o‘tkazildi (kunlik limit) — dayjestga tushadi` }
  }
  if (digestOnly && !pending) {
    return { tone: 'muted', text: 'Instagram dayjest karuselida chiqadi (story o‘chiq)' }
  }
  if (pending) {
    return {
      tone: 'warn',
      text: delivery?.error ? `Qayta urinish kutilmoqda: ${delivery.error}` : 'Navbatda',
    }
  }
  if (delivery?.error) return { tone: 'error', text: `Xato: ${delivery.error}` }
  if (!active) return { tone: 'muted', text: 'Bu yozuv yuborilmaydi' }
  return { tone: 'muted', text: published ? 'Yuborilmagan' : 'Chop etilganda yuboriladi' }
}

/**
 * Post yon panelidagi Make.com avtopost holati (OBLOG-91): yozuv bo'yicha — yuborilgan, navbatda,
 * xato. Admin uchun — "Sinov yuborish" (test: true) va "Make'ga yuborish" (yuborilmaganlar).
 * Admin/muharrir uchun — Instagram rasmining oldindan ko'rinishi (OBLOG-94, 1:1 va 4:5).
 */
export async function MakePanel({ data, req }: UIFieldServerProps) {
  if (!isAdminOrEditorUser(req.user)) return null
  const id = typeof data?.id === 'number' || typeof data?.id === 'string' ? data.id : null
  if (id === null) return null

  const [config, deliveries, jobs] = await Promise.all([
    loadMakeConfig(req.payload),
    req.payload.find({
      collection: 'social-deliveries',
      where: { post: { equals: Number(id) } },
      depth: 0,
      limit: 10,
      overrideAccess: true,
    }),
    req.payload.find({
      collection: 'payload-jobs',
      where: {
        and: [
          { taskSlug: { equals: MAKE_WEBHOOK_TASK } },
          { 'input.postId': { equals: Number(id) } },
          { completedAt: { exists: false } },
          { hasError: { not_equals: true } },
        ],
      },
      depth: 0,
      limit: 10,
    }),
  ])
  const pending = new Set(
    jobs.docs.map((job) => (job.input as { script?: unknown } | null)?.script),
  )
  const published = data?.workflowStatus === 'published' && data?._status === 'published'
  const admin = isAdminUser(req.user)
  /** Shu yozuvning joriy hodisasi (post / story, OBLOG-118) qatori, bo'lmasa — oxirgisi. */
  const deliveryOf = (script: Locale) => {
    const rows = deliveries.docs.filter((row) => row.script === script)
    const event = makeEventFor(config, script)
    return rows.find((row) => row.event === event) ?? rows[0]
  }

  return (
    <details className="source-panel" open data-testid="make-panel">
      <summary>Instagram / Make</summary>
      <div className="source-panel__body">
        {!config.enabled ? (
          <span className="telegram-panel__status telegram-panel__status--muted">
            Make o‘chiq (Ijtimoiy tarmoqlar (Make) sozlamalari).
          </span>
        ) : null}
        {config.enabled && !config.webhookUrl ? (
          <span className="telegram-panel__status telegram-panel__status--warn">
            Webhook URL sozlanmagan — yuborilmaydi.
          </span>
        ) : null}
        {data?.socialSkip ? (
          <span className="editorial__muted">“Ijtimoiy tarmoqlarga yubormaslik” belgilangan.</span>
        ) : null}
        {LOCALES.map((script) => {
          const delivery = deliveryOf(script)
          const active = config.scripts.includes(script)
          if (!active && !delivery) return null
          const status = statusOf(
            delivery,
            pending.has(script),
            active,
            published,
            active && makeEventFor(config, script) === null,
          )
          return (
            <div key={script} className="telegram-panel__row">
              <strong>{SCRIPT_LABEL[script]}</strong>
              <span className={`telegram-panel__status telegram-panel__status--${status.tone}`}>
                {status.text}
              </span>
            </div>
          )
        })}
        {admin && config.webhookUrl ? (
          <MakeActions
            apiRoute={req.payload.config.routes.api}
            postId={Number(id)}
            scripts={config.scripts.length ? config.scripts : ['uz-Latn']}
            canSend={
              config.enabled &&
              published &&
              !data?.socialSkip &&
              config.scripts.some((script) => {
                const event = makeEventFor(config, script)
                return (
                  event !== null &&
                  !pending.has(script) &&
                  !isFinalDelivery(
                    deliveries.docs.find((row) => row.script === script && row.event === event),
                  )
                )
              })
            }
          />
        ) : null}
        <SocialImagePreview
          postId={Number(id)}
          scripts={config.scripts.length ? config.scripts : ['uz-Latn']}
        />
      </div>
    </details>
  )
}
