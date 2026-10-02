/**
 * "Ko'p o'qilgan" bloki (OBLOG-69) — tanlash qoidalari, yon ta'sirsiz (testlanadi).
 *
 * Oyna: so'nggi 7 kun → (kam bo'lsa) 30 kun → butun davr. Birinchi bo'lib kamida
 * `POPULAR_MIN_POSTS` ta (joriy maqola chiqarib tashlangandan keyin) ko'rilgan posti bor oyna
 * tanlanadi; hech biri yetmasa — blok ko'rsatilmaydi (`null`). Teng ko'rishlarda — jami ko'p
 * bo'lgani, keyin yangi (katta ID).
 */

export const POPULAR_WINDOWS = ['week', 'month', 'all'] as const
export type PopularWindow = (typeof POPULAR_WINDOWS)[number]

/** Oyna uzunligi (kun, bugun bilan); `all` — cheksiz. */
export const POPULAR_WINDOW_DAYS = { week: 7, month: 30 } as const

/** Blokda ko'pi bilan shuncha post. */
export const POPULAR_LIMIT = 5
/** Bundan kam bo'lsa blok yashiriladi. */
export const POPULAR_MIN_POSTS = 3
/** Har oyna uchun DB'dan olinadigan nomzodlar (maqola sahifasida joriy post chiqariladi). */
export const POPULAR_CANDIDATES = POPULAR_LIMIT + 1

export type PopularRow = {
  window: PopularWindow
  id: number
  views: number
  /** Butun davr bo'yicha (teng ko'rishlarda tartib uchun). */
  total: number
}

export type PopularPick = {
  window: PopularWindow
  items: Array<{ id: number; views: number }>
}

export type PopularList<T> = {
  window: PopularWindow
  items: Array<{ post: T; views: number }>
}

/**
 * `pickPopular` + kartochkalar: faqat kartochkasi topilgan (ommaga ko'rinadigan) postlar
 * hisobga olinadi. `exclude` — joriy maqola.
 */
export function resolvePopular<T extends { id: number | string }>(
  rows: readonly PopularRow[],
  posts: readonly T[],
  options: { exclude?: number | string | null; min?: number; limit?: number } = {},
): PopularList<T> | null {
  const byId = new Map(posts.map((post) => [Number(post.id), post]))
  const pick = pickPopular(
    rows.filter((row) => byId.has(row.id)),
    options,
  )
  if (!pick) return null
  return {
    window: pick.window,
    items: pick.items.map((item) => ({ post: byId.get(item.id)!, views: item.views })),
  }
}

export function pickPopular(
  rows: readonly PopularRow[],
  options: { exclude?: number | string | null; min?: number; limit?: number } = {},
): PopularPick | null {
  const min = options.min ?? POPULAR_MIN_POSTS
  const limit = options.limit ?? POPULAR_LIMIT
  const exclude = options.exclude == null ? null : Number(options.exclude)
  for (const window of POPULAR_WINDOWS) {
    const items = rows
      .filter((row) => row.window === window && row.views > 0 && row.id !== exclude)
      .sort((a, b) => b.views - a.views || b.total - a.total || b.id - a.id)
    const unique = [...new Map(items.map((row) => [row.id, row])).values()]
    if (unique.length >= min) {
      return {
        window,
        items: unique.slice(0, limit).map(({ id, views }) => ({ id, views })),
      }
    }
  }
  return null
}
