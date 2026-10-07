import { countWords, lexicalToPlainText } from '@/lib/lexical'
import type { Post } from '@/payload-types'

/**
 * Chop etilgan post va uning kutilayotgan qoralama versiyasi orasidagi qisqa farq (OBLOG-64) —
 * `/admin/review` dagi "Chop etilgan postlardagi o'zgarishlar" bo'limi uchun. Sof funksiya
 * (unit testlar): faqat lotin (asosiy) yozuv, kirill — lotindan hosila.
 *
 * - matnli maydonlar (sarlavha, lid, SEO) — `from`/`to` bilan;
 * - matn (`content`) — "matn o'zgargan" + so'zlar soni farqi;
 * - muqova, FAQ, teglar, kategoriya, manbalar — faqat "o'zgargan" belgisi.
 */

export type RevisionField =
  | 'title'
  | 'excerpt'
  | 'metaTitle'
  | 'metaDescription'
  | 'focusKeyword'
  | 'content'
  | 'coverImage'
  | 'coverAlt'
  | 'socialTitle'
  | 'faq'
  | 'tags'
  | 'category'
  | 'sources'

export const REVISION_FIELD_LABELS: Record<RevisionField, string> = {
  title: 'Sarlavha',
  excerpt: 'Lid',
  metaTitle: 'SEO sarlavha',
  metaDescription: 'Meta tavsif',
  focusKeyword: 'Kalit soʻz',
  content: 'Matn',
  coverImage: 'Muqova',
  coverAlt: 'Muqova alt matni',
  socialTitle: 'Rasm uchun qisqa sarlavha',
  faq: 'FAQ',
  tags: 'Teglar',
  category: 'Kategoriya',
  sources: 'Manbalar',
}

export interface RevisionChange {
  field: RevisionField
  label: string
  /** Matnli maydonlar uchun: eski va yangi qiymat. */
  from?: string
  to?: string
  /** `content` uchun: so'zlar soni (eski → yangi) va farqi. */
  words?: { from: number; to: number; delta: number }
}

export type RevisionSide = Pick<
  Post,
  'title' | 'excerpt' | 'meta' | 'content' | 'coverImage' | 'coverAlt' | 'faq' | 'tags'
> &
  Partial<Pick<Post, 'socialTitle'>> &
  Partial<Pick<Post, 'category' | 'sources'>>

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function relKey(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'object') {
    const id = (value as { id?: unknown }).id
    return id === undefined || id === null ? null : String(id)
  }
  return String(value)
}

function relKeys(value: unknown): string {
  if (!Array.isArray(value)) return ''
  return value
    .map(relKey)
    .filter((key): key is string => key !== null)
    .sort()
    .join(',')
}

function faqKey(value: RevisionSide['faq']): string {
  return JSON.stringify((value ?? []).map((item) => [text(item.question), text(item.answer)]))
}

function sourcesKey(value: RevisionSide['sources']): string {
  return JSON.stringify((value ?? []).map((item) => [text(item.url), text(item.name)]))
}

export function wordCount(content: unknown): number {
  return countWords(lexicalToPlainText(content))
}

export function summarizeRevision(live: RevisionSide, draft: RevisionSide): RevisionChange[] {
  const changes: RevisionChange[] = []
  const textField = (field: RevisionField, from: unknown, to: unknown) => {
    const a = text(from)
    const b = text(to)
    if (a !== b) changes.push({ field, label: REVISION_FIELD_LABELS[field], from: a, to: b })
  }
  const flag = (field: RevisionField, changed: boolean) => {
    if (changed) changes.push({ field, label: REVISION_FIELD_LABELS[field] })
  }

  textField('title', live.title, draft.title)
  textField('excerpt', live.excerpt, draft.excerpt)
  textField('metaTitle', live.meta?.title, draft.meta?.title)
  textField('metaDescription', live.meta?.description, draft.meta?.description)
  textField('focusKeyword', live.meta?.focusKeyword, draft.meta?.focusKeyword)

  const liveBody = lexicalToPlainText(live.content)
  const draftBody = lexicalToPlainText(draft.content)
  if (liveBody !== draftBody) {
    const from = countWords(liveBody)
    const to = countWords(draftBody)
    changes.push({
      field: 'content',
      label: REVISION_FIELD_LABELS.content,
      words: { from, to, delta: to - from },
    })
  }

  flag('coverImage', relKey(live.coverImage) !== relKey(draft.coverImage))
  textField('coverAlt', live.coverAlt, draft.coverAlt)
  textField('socialTitle', live.socialTitle, draft.socialTitle)
  flag('faq', faqKey(live.faq) !== faqKey(draft.faq))
  flag('tags', relKeys(live.tags) !== relKeys(draft.tags))
  if (live.category !== undefined || draft.category !== undefined) {
    flag('category', relKey(live.category) !== relKey(draft.category))
  }
  if (live.sources !== undefined || draft.sources !== undefined) {
    flag('sources', sourcesKey(live.sources) !== sourcesKey(draft.sources))
  }
  return changes
}

/** Ro'yxatda qisqa ko'rinish: `+12 soʻz`, `−5 soʻz`, `soʻzlar soni oʻzgarmagan`. */
export function formatWordDelta(delta: number): string {
  if (delta === 0) return 'soʻzlar soni oʻzgarmagan'
  return `${delta > 0 ? '+' : '−'}${Math.abs(delta)} soʻz`
}
