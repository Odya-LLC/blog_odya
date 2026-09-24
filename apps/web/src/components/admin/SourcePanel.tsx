import type { UIFieldServerProps } from 'payload'

import { isAdminOrEditorUser } from '@/access'
import type { ScrapedItem } from '@/payload-types'

import { formatAdminDate, relId, relName } from './utils'

import './editorial.css'

/** Panelda ko'rsatiladigan matn chegarasi (juda uzun maqolalar sahifani og'irlashtirmasin). */
const TEXT_LIMIT = 20_000

/**
 * Post tahrirlash sahifasidagi yon panel (TZ §6.1 "yonma-yon tahrirlash", TASKS M2-04):
 * `sources[].scrapedItem` bo'yicha asl manba — sarlavha, matn, havola, sana. Faqat o'qish.
 * Matn — `extractedText` (M2-02 dan keyin), bo'lmasa RSS `excerpt`.
 */
export async function SourcePanel({ data, req }: UIFieldServerProps) {
  if (!isAdminOrEditorUser(req.user)) return null
  const rows = Array.isArray(data?.sources) ? (data.sources as { scrapedItem?: unknown }[]) : []
  const ids = [...new Set(rows.map((row) => relId(row?.scrapedItem)).filter((id) => id !== null))]
  if (ids.length === 0) return null

  const { docs } = await req.payload.find({
    collection: 'scraped-items',
    where: { id: { in: ids } },
    depth: 1,
    limit: ids.length,
    select: {
      title: true,
      url: true,
      canonicalUrl: true,
      source: true,
      author: true,
      publishedAt: true,
      language: true,
      excerpt: true,
      extractedText: true,
    },
    populate: { sources: { name: true } },
    overrideAccess: false,
    req,
  })
  const items = ids
    .map((id) => (docs as ScrapedItem[]).find((doc) => doc.id === id))
    .filter((item): item is ScrapedItem => Boolean(item))
  if (items.length === 0) return null

  return (
    <div data-testid="source-panel">
      {items.map((item, index) => {
        const url = item.canonicalUrl || item.url
        const full = item.extractedText?.trim()
        const text = full || item.excerpt?.trim() || ''
        return (
          <details key={item.id} className="source-panel" open={index === 0}>
            <summary>Asl manba{items.length > 1 ? ` ${index + 1}` : ''} (faqat o‘qish)</summary>
            <div className="source-panel__body">
              <p className="source-panel__title">{item.title || url}</p>
              <span className="editorial__muted">
                {relName(item.source) ?? 'Manba'}
                {item.language ? ` · ${item.language.toUpperCase()}` : ''}
                {item.author ? ` · ${item.author}` : ''} · {formatAdminDate(item.publishedAt)}
              </span>
              <a href={url} target="_blank" rel="noopener noreferrer">
                Asl maqolani ochish ↗
              </a>
              {text ? (
                <div className="source-panel__text" data-testid="source-panel-text">
                  {text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT)}…` : text}
                </div>
              ) : (
                <span className="editorial__muted">Matn hali ajratilmagan.</span>
              )}
              {!full && text && (
                <span className="editorial__muted">
                  Bu RSS’dagi qisqa matn — to‘liq matn yig‘ilgach shu yerda ko‘rinadi.
                </span>
              )}
            </div>
          </details>
        )
      })}
    </div>
  )
}
