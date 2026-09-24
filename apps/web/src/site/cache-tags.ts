/**
 * ISR kesh teglari (TZ §3.5 `post.onPublish`, §8.4): sayt ma'lumotlari `unstable_cache` bilan
 * shu teglar ostida keshlanadi, Payload hook'lari publish/unpublish'da `revalidateTag` chaqiradi.
 *
 * - `posts`        — postlar ro'yxati bor har qanday joy (bosh sahifa, kategoriya, o'xshash postlar);
 * - `home`         — bosh sahifa bloklari;
 * - `post:{slug}`  — bitta maqola;
 * - `category:{slug}` — kategoriya sahifasi (nomi, tavsifi);
 * - `nav`          — header/footer: kategoriyalar menyusi, globals;
 * - `redirects`    — plugin-redirects yozuvlari (eski slug → yangi URL);
 * - `pages`        — statik sahifalar ro'yxati (sitemap, M1-06).
 *
 * Yon ta'sirsiz modul (testlanadi).
 */
export const CACHE_TAGS = {
  posts: 'posts',
  home: 'home',
  nav: 'nav',
  redirects: 'redirects',
  pages: 'pages',
} as const

export function postTag(slug: string): string {
  return `post:${slug}`
}

export function categoryTag(slug: string): string {
  return `category:${slug}`
}

type PostLike =
  | {
      slug?: string | null
      _status?: 'draft' | 'published' | null
    }
  | null
  | undefined

/**
 * Post o'zgarganda qaysi teglar yangilanadi. Faqat ommaga ko'rinadigan holat o'zgarganda:
 * publish, chop etilgan postni yangilash, unpublish yoki arxivlash. Hech qachon chop etilmagan
 * qoralama (autosave har 10 s) — keshga tegmaydi.
 */
export function postRevalidationTags(doc: PostLike, previousDoc?: PostLike): string[] {
  const isPublic = doc?._status === 'published'
  const wasPublic = previousDoc?._status === 'published'
  if (!isPublic && !wasPublic) return []
  const tags = new Set<string>([CACHE_TAGS.posts, CACHE_TAGS.home])
  if (doc?.slug) tags.add(postTag(doc.slug))
  if (previousDoc?.slug) tags.add(postTag(previousDoc.slug))
  return [...tags]
}

type SlugLike = { slug?: string | null } | null | undefined

/** Kategoriya o'zgardi: menyu, kategoriya sahifasi va kartochkalardagi nom. */
export function categoryRevalidationTags(doc: SlugLike, previousDoc?: SlugLike): string[] {
  const tags = new Set<string>([CACHE_TAGS.nav, CACHE_TAGS.posts, CACHE_TAGS.home])
  if (doc?.slug) tags.add(categoryTag(doc.slug))
  if (previousDoc?.slug) tags.add(categoryTag(previousDoc.slug))
  return [...tags]
}
