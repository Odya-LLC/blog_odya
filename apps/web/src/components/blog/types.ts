/**
 * UI komponentlarining ko'rinish modeli (view model). Payload hujjatlari (posts, categories, tags,
 * authors, media — TZ §10) M1-05 da shu tiplarga map qilinadi: komponentlar Payload'ga bog'liq emas,
 * `/styleguide` esa namunaviy ma'lumot bilan ishlaydi.
 *
 * Barcha matnlar joriy locale'da (lotin yoki kirill) keladi; `href` — locale prefiksi bilan tayyor URL.
 */
import type { Locale } from '@blog-odya/shared'

export type { Locale }

/** `media` → tayyor rasm (M1-05: custom loader `card`/`hero` variantlarini tanlaydi). */
export type ImageRef = {
  src: string
  /** Majburiy (TZ §12.3, §10.7) — `media.alt` lokalizatsiya qilingan. */
  alt: string
  width: number
  height: number
  blurDataURL?: string
}

export type CategoryRef = {
  /** Rang tokenlari slug bo'yicha: `--cat-<slug>-bg|fg|solid` (tokens.css). */
  slug: string
  name: string
  href: string
}

export type NavCategory = CategoryRef & {
  /** `false` — "Yana" menyusida (masalan, Ilm-fan). */
  isInMenu: boolean
}

export type TagRef = {
  slug: string
  name: string
  href: string
}

export type AuthorRef = {
  name: string
  href?: string
  position?: string | null
  avatar?: ImageRef | null
}

/** `posts.sources[]` — atributsiya (TZ §2.3). */
export type SourceRef = {
  name?: string | null
  url: string
}

export type PostSummary = {
  id: string | number
  title: string
  href: string
  excerpt?: string | null
  category: CategoryRef
  cover?: ImageRef | null
  /** ISO 8601 */
  publishedAt: string
  /** Daqiqalarda. */
  readingTime?: number | null
  isBreaking?: boolean
}

export type LinkItem = {
  label: string
  href: string
}

/** Footer ustuni (`footer` global — sarlavha + havolalar). */
export type FooterColumn = {
  title: string
  links: LinkItem[]
}

/** Har bir yozuv uchun Telegram kanal havolasi (TZ §7.1: ikkita kanal). */
export type TelegramLinks = Record<Locale, string>
