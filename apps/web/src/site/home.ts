/**
 * Bosh sahifa kompozitsiyasi (OBLOG-68) — yon ta'sirsiz, unit testlanadi.
 *
 * Tartib: (1) eng so'nggi yangilik (katta) + keyingi 4 tasi, (2) "So'nggi yangiliklar" xronologik
 * lentasi, (3) kategoriya bo'limlari — har xil ko'rinishda (`HOME_LAYOUT_CYCLE`), eng yangi posti
 * bor kategoriya birinchi. Yuqorida ko'rsatilgan postlar bo'limlarda imkon qadar takrorlanmaydi:
 * (1) dagilar — hech qachon, (2) dagilar — faqat bo'limni to'ldirishga yetmasa.
 */
import type { CategoryRef, PostSummary, TagRef } from '@/components/blog/types'

/** Yuqori blok: 1 ta katta + 4 ta keyingi. */
export const HOME_TOP_COUNT = 5
/** "So'nggi yangiliklar" lentasi. */
export const HOME_FEED_COUNT = 12

/**
 * Kategoriya bo'limi ko'rinishlari:
 * - `feature`   — 1 katta (lid bilan) + 3 ixcham;
 * - `grid`      — 4 kartochkali qator (rasm bilan);
 * - `headlines` — rasmsiz sarlavhalar ro'yxati (ketma-ket ikkitasi yonma-yon);
 * - `strip`     — mobilda gorizontal aylantiriladigan lenta, desktopda 4 ustun.
 */
export type HomeLayout = 'feature' | 'grid' | 'headlines' | 'strip'

export const HOME_LAYOUT_CYCLE: readonly HomeLayout[] = [
  'feature',
  'grid',
  'headlines',
  'headlines',
  'strip',
]

export const HOME_LAYOUT_SIZE: Record<HomeLayout, number> = {
  feature: 4,
  grid: 4,
  headlines: 5,
  strip: 4,
}

/** Bo'lim ko'rsatilishi uchun kamida shuncha (takrorlanmagan) post. */
export const HOME_SECTION_MIN_POSTS = 2

/** Bitta kategoriya uchun so'raladigan nomzodlar (yuqoridagilar chiqarib tashlangandan keyin ham yetsin). */
export const HOME_SECTION_CANDIDATES = HOME_TOP_COUNT + HOME_FEED_COUNT + 5

export type HomeSection = {
  category: CategoryRef
  layout: HomeLayout
  posts: PostSummary[]
}

export type HomeTop = {
  lead: PostSummary | null
  top: PostSummary[]
  feed: PostSummary[]
}

/** Eng yangi postlar (`-publishedAt`) → katta + 4 ta + lenta. */
export function splitLatest(latest: PostSummary[]): HomeTop {
  const [lead = null, ...rest] = latest
  return {
    lead,
    top: rest.slice(0, HOME_TOP_COUNT - 1),
    feed: rest.slice(HOME_TOP_COUNT - 1, HOME_TOP_COUNT - 1 + HOME_FEED_COUNT),
  }
}

type Id = PostSummary['id']

/**
 * Bo'lim postlari: avval sahifada hali ko'rinmaganlar, yetmasa — faqat lentada (rasmsiz)
 * ko'ringanlar. Yuqori blokdagilar (`hidden`) hech qachon takrorlanmaydi.
 */
export function pickSectionPosts(
  candidates: PostSummary[],
  hidden: ReadonlySet<Id>,
  soft: ReadonlySet<Id>,
  size: number,
): PostSummary[] {
  const allowed = candidates.filter((post) => !hidden.has(post.id))
  const fresh = allowed.filter((post) => !soft.has(post.id))
  const repeated = allowed.filter((post) => soft.has(post.id))
  if (fresh.length >= size) return fresh.slice(0, size)
  // Tartib — xronologik (nomzodlar `-publishedAt` bo'yicha keladi).
  const chosen = new Set([...fresh, ...repeated.slice(0, size - fresh.length)].map((p) => p.id))
  return allowed.filter((post) => chosen.has(post.id))
}

function time(value: string): number {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export type CategoryCandidates = { category: CategoryRef; posts: PostSummary[] }

/**
 * Kategoriya bo'limlari: bo'sh (yoki faqat yuqorida ko'rsatilgan postli) kategoriyalar tashlanadi,
 * qolganlari eng yangi posti bo'yicha tartiblanadi (teng bo'lsa — tahririyat tartibi), ko'rinish
 * `HOME_LAYOUT_CYCLE` bo'yicha navbat bilan beriladi.
 */
export function buildHomeSections(categories: CategoryCandidates[], top: HomeTop): HomeSection[] {
  const hidden = new Set<Id>([...(top.lead ? [top.lead.id] : []), ...top.top.map((p) => p.id)])
  const soft = new Set<Id>(top.feed.map((post) => post.id))
  const maxSize = Math.max(...Object.values(HOME_LAYOUT_SIZE))
  const ranked = categories
    .map((entry, order) => ({
      entry,
      order,
      newest: Math.max(0, ...entry.posts.map((post) => time(post.publishedAt))),
      posts: pickSectionPosts(entry.posts, hidden, soft, maxSize),
    }))
    .filter(({ posts }) => posts.length >= HOME_SECTION_MIN_POSTS)
    .sort((a, b) => b.newest - a.newest || a.order - b.order)
  return ranked.map(({ entry, posts }, index) => {
    const layout = HOME_LAYOUT_CYCLE[index % HOME_LAYOUT_CYCLE.length] ?? 'grid'
    return { category: entry.category, layout, posts: posts.slice(0, HOME_LAYOUT_SIZE[layout]) }
  })
}

/**
 * Ketma-ket `headlines` bo'limlari juftlanadi (desktopda yonma-yon ikki ustun). Qolganlari —
 * bittadan qator.
 */
export function groupSectionRows(sections: HomeSection[]): HomeSection[][] {
  const rows: HomeSection[][] = []
  for (const section of sections) {
    const last = rows.at(-1)
    if (section.layout === 'headlines' && last?.length === 1 && last[0]?.layout === 'headlines') {
      last.push(section)
    } else {
      rows.push([section])
    }
  }
  return rows
}

/**
 * Trend teglar: so'nggi postlarda eng ko'p uchraganlari. Faqat `minCount` dan ko'p uchraganlari —
 * teg sahifasi < 3 postda `noindex` (TZ §8.1), indekslanmaydigan sahifaga havola bermaymiz.
 */
export function trendingTags(postTags: TagRef[][], minCount: number, limit: number): TagRef[] {
  const counts = new Map<string, { tag: TagRef; count: number; first: number }>()
  postTags.forEach((tags, index) => {
    for (const tag of new Map(tags.map((item) => [item.slug, item])).values()) {
      const entry = counts.get(tag.slug)
      if (entry) entry.count += 1
      else counts.set(tag.slug, { tag, count: 1, first: index })
    }
  })
  return [...counts.values()]
    .filter((entry) => entry.count >= minCount)
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .slice(0, limit)
    .map((entry) => entry.tag)
}
