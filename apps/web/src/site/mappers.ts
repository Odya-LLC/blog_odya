/**
 * Payload hujjatlari → UI ko'rinish modeli (`components/blog/types.ts`). Komponentlar Payload'ga
 * bog'liq emas; bu yerda relationship'lar (id yoki obyekt), bo'sh qiymatlar va URL'lar
 * (locale prefiksi bilan) bir joyda hal qilinadi. Yon ta'sirsiz — unit testlanadi.
 */
import type { Locale } from '@blog-odya/shared'

import type {
  AuthorRef,
  CategoryRef,
  FooterColumn,
  ImageRef,
  LinkItem,
  NavCategory,
  PostSummary,
  SourceRef,
  TagRef,
  TelegramLinks,
} from '@/components/blog/types'
import { readingTimeMinutes } from '@/lib/lexical'
import { encodeMediaSrc } from '@/lib/media-image'
import type {
  Author,
  Category,
  Footer,
  Header,
  Media,
  Post,
  SiteSetting,
  Tag,
} from '@/payload-types'

import { authorPath, categoryPath, localizePath, pagePath, postPath, tagPath } from './paths'

/** Relationship maydoni populyatsiya qilingan bo'lsa — obyekt, aks holda `null`. */
export function populated<T extends object>(
  value: number | string | T | null | undefined,
): T | null {
  return value !== null && typeof value === 'object' ? value : null
}

export function toImageRef(value: Post['coverImage'] | Media | null | undefined): ImageRef | null {
  const media = populated<Media>(value)
  if (!media) return null
  const src = encodeMediaSrc(media)
  if (!src || !media.width || !media.height) return null
  return {
    src,
    alt: media.alt ?? '',
    width: media.width,
    height: media.height,
  }
}

export function toCategoryRef(
  category: Pick<Category, 'slug' | 'name'>,
  locale: Locale,
): CategoryRef {
  return {
    slug: category.slug,
    name: category.name,
    href: categoryPath(locale, category.slug),
  }
}

export function toTagRef(tag: Pick<Tag, 'slug' | 'name'>, locale: Locale): TagRef {
  return { slug: tag.slug, name: tag.name, href: tagPath(locale, tag.slug) }
}

export function toAuthorRef(author: Author, locale: Locale): AuthorRef {
  return {
    name: author.name,
    href: authorPath(locale, author.slug),
    position: author.position ?? null,
    avatar: toImageRef(author.avatar),
  }
}

export function toSourceRefs(sources: Post['sources']): SourceRef[] {
  return (sources ?? [])
    .filter((source) => typeof source.url === 'string' && /^https?:\/\//i.test(source.url))
    .map((source) => ({ name: source.name ?? null, url: source.url }))
}

/** O'qish vaqti: saqlangan qiymat (lotin matnidan, `deriveFields`) yoki joriy matndan. */
export function postReadingTime(post: Pick<Post, 'readingTime' | 'content'>): number | null {
  if (post.readingTime && post.readingTime > 0) return post.readingTime
  const computed = readingTimeMinutes(post.content)
  return computed > 0 ? computed : null
}

/** Chop etilgan sana: `publishedAt`, bo'lmasa `createdAt`. */
export function postDate(post: Pick<Post, 'publishedAt' | 'createdAt'>): string {
  return post.publishedAt ?? post.createdAt
}

/** Kartochka modeli. Kategoriyasi populyatsiya qilinmagan post — `null` (URL tuzib bo'lmaydi). */
export function toPostSummary(post: Post, locale: Locale): PostSummary | null {
  const category = populated<Category>(post.category)
  if (!category) return null
  return {
    id: post.id,
    title: post.title,
    href: postPath(locale, category.slug, post.slug),
    excerpt: post.excerpt ?? null,
    category: toCategoryRef(category, locale),
    cover: toImageRef(post.coverImage),
    publishedAt: postDate(post),
    readingTime: postReadingTime(post),
    isBreaking: Boolean(post.isBreaking),
  }
}

export function toPostSummaries(posts: Post[], locale: Locale): PostSummary[] {
  return posts.flatMap((post) => {
    const summary = toPostSummary(post, locale)
    return summary ? [summary] : []
  })
}

type NavItem = NonNullable<Header['navItems']>[number]

/**
 * Header menyusi: `header` global'idagi kategoriya havolalari (asosiy + "Yana"); global bo'sh
 * bo'lsa — `categories` kolleksiyasi (`order`, `isInMenu`).
 */
export function toNavCategories(
  header: Pick<Header, 'navItems' | 'moreItems'> | null,
  categories: Category[],
  locale: Locale,
): NavCategory[] {
  const fromItems = (items: NavItem[] | null | undefined, isInMenu: boolean): NavCategory[] =>
    (items ?? []).flatMap((item) => {
      if (item.type === 'category') {
        const category = populated<Category>(item.category)
        if (!category) return []
        return [
          {
            ...toCategoryRef(category, locale),
            name: item.label || category.name,
            isInMenu,
            ...(item.newTab ? { newTab: true } : {}),
          },
        ]
      }
      // Sahifa yoki ixtiyoriy URL ham menyuda bo'lishi mumkin (TZ §7 "Menyular").
      const link = toMenuLink(item, locale)
      if (!link) return []
      const { key, label, href, newTab } = link
      return [{ slug: key, name: label, href, isInMenu, ...(newTab ? { newTab } : {}) }]
    })
  const fromHeader = [...fromItems(header?.navItems, true), ...fromItems(header?.moreItems, false)]
  if (fromHeader.length > 0) return fromHeader
  return [...categories]
    .sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
    .map((category) => ({
      ...toCategoryRef(category, locale),
      isInMenu: category.isInMenu !== false,
    }))
}

type MenuLinkInput = {
  label?: string | null
  type?: 'category' | 'page' | 'custom' | null
  category?: number | Category | null
  page?: number | { slug?: string | null } | null
  url?: string | null
  newTab?: boolean | null
}

/**
 * Menyu havolasi (`fields/link.ts`) → joriy yozuvdagi URL. `key` — barqaror kalit (React `key`,
 * faol bandni aniqlash): kategoriya/sahifa slug'i yoki URL. Hal qilib bo'lmasa — `null`.
 */
export function toMenuLink(
  item: MenuLinkInput,
  locale: Locale,
): (LinkItem & { key: string }) | null {
  const link = resolveMenuLink(item, locale)
  return link && item.newTab ? { ...link, newTab: true } : link
}

function resolveMenuLink(item: MenuLinkInput, locale: Locale): (LinkItem & { key: string }) | null {
  switch (item.type) {
    case 'category': {
      const category = populated<Category>(item.category)
      if (!category?.slug) return null
      return {
        key: category.slug,
        label: item.label || category.name,
        href: categoryPath(locale, category.slug),
      }
    }
    case 'page': {
      const page = populated<{ slug?: string | null }>(item.page)
      if (!page?.slug || !item.label) return null
      return { key: page.slug, label: item.label, href: pagePath(locale, page.slug) }
    }
    case 'custom': {
      const url = item.url?.trim()
      if (!url || !item.label) return null
      return { key: url, label: item.label, href: localizePath(locale, url) }
    }
    default:
      return null
  }
}

/** Footer ustunlari (`footer.columns`): sarlavha + hal qilingan havolalar (bo'sh ustunlar tashlanadi). */
export function toFooterColumns(
  footer: Pick<Footer, 'columns'> | null,
  locale: Locale,
): FooterColumn[] {
  return (footer?.columns ?? []).flatMap((column) => {
    const links = (column.links ?? []).flatMap((link) => {
      const resolved = toMenuLink(link, locale)
      if (!resolved) return []
      const { label, href, newTab } = resolved
      return [{ label, href, ...(newTab ? { newTab } : {}) }]
    })
    return links.length > 0 ? [{ title: column.title ?? '', links }] : []
  })
}

/** Footer'dagi ma'lumot sahifalari (huquqiy): `footer` global'idagi `page`/`custom` havolalar. */
export function toLegalLinks(footer: Pick<Footer, 'columns'> | null, locale: Locale): LinkItem[] {
  const links: LinkItem[] = []
  for (const column of footer?.columns ?? []) {
    for (const link of column.links ?? []) {
      if (link.type === 'page') {
        const page = populated<{ slug?: string | null }>(link.page)
        if (page?.slug) {
          links.push({
            label: link.label,
            href: pagePath(locale, page.slug),
            ...(link.newTab ? { newTab: true } : {}),
          })
        }
      } else if (link.type === 'custom' && link.url) {
        links.push({ label: link.label, href: link.url, ...(link.newTab ? { newTab: true } : {}) })
      }
    }
  }
  return links
}

/** Namuna kanallar (TASKS M0-03); haqiqiysi — `site-settings.socials` yoki env. */
export const DEFAULT_TELEGRAM: TelegramLinks = {
  'uz-Latn': 'https://t.me/blogodya',
  'uz-Cyrl': 'https://t.me/blogodya_kr',
}

/** `@username` / `https://t.me/...` → URL. */
export function telegramChannelUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  if (/^https:\/\/t\.me\/[\w/+-]+$/i.test(trimmed)) return trimmed
  if (/^@[a-z][\w]{3,31}$/i.test(trimmed)) return `https://t.me/${trimmed.slice(1)}`
  return null
}

export function toTelegramLinks(
  settings: Pick<SiteSetting, 'socials'> | null,
  env: { TELEGRAM_CHANNEL_LATN?: string; TELEGRAM_CHANNEL_CYRL?: string } = {},
): TelegramLinks {
  const social = (platform: 'telegram_latn' | 'telegram_cyrl') =>
    telegramChannelUrl(settings?.socials?.find((item) => item.platform === platform)?.url)
  return {
    'uz-Latn':
      social('telegram_latn') ??
      telegramChannelUrl(env.TELEGRAM_CHANNEL_LATN) ??
      DEFAULT_TELEGRAM['uz-Latn'],
    'uz-Cyrl':
      social('telegram_cyrl') ??
      telegramChannelUrl(env.TELEGRAM_CHANNEL_CYRL) ??
      DEFAULT_TELEGRAM['uz-Cyrl'],
  }
}

/** `https://t.me/blogodya` → `@blogodya` (Telegram CTA uchun). */
export function telegramHandle(url: string): string | undefined {
  const match = /^https:\/\/t\.me\/([a-z][\w]{3,31})$/i.exec(url)
  return match ? `@${match[1]}` : undefined
}
