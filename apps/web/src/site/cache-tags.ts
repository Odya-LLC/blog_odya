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

/** Teg sahifasi (`/tag/{slug}`) — nomi, tavsifi (M1-07). */
export function tagTag(slug: string): string {
  return `tag:${slug}`
}

/** Muallif sahifasi (`/author/{slug}`) — profil (M1-07). */
export function authorTag(slug: string): string {
  return `author:${slug}`
}

/** Statik sahifa (`/{slug}`, `pages`) (M1-07). */
export function pageTag(slug: string): string {
  return `page:${slug}`
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

function withSlugTags(
  base: string[],
  make: (slug: string) => string,
  doc: SlugLike,
  previousDoc?: SlugLike,
): string[] {
  const tags = new Set<string>(base)
  if (doc?.slug) tags.add(make(doc.slug))
  if (previousDoc?.slug) tags.add(make(previousDoc.slug))
  return [...tags]
}

/** Teg o'zgardi: teg sahifasi va maqolalardagi teg nomlari (`posts`). */
export function tagRevalidationTags(doc: SlugLike, previousDoc?: SlugLike): string[] {
  return withSlugTags([CACHE_TAGS.posts], tagTag, doc, previousDoc)
}

/** Muallif o'zgardi: profil sahifasi va maqolalardagi muallif bloki (`posts`). */
export function authorRevalidationTags(doc: SlugLike, previousDoc?: SlugLike): string[] {
  return withSlugTags([CACHE_TAGS.posts], authorTag, doc, previousDoc)
}

type PageLike = SlugLike & { _status?: 'draft' | 'published' | null }

/**
 * Statik sahifa o'zgardi: sahifaning o'zi, sahifalar ro'yxati (sitemap) va karkas (`nav`: footer
 * havolalari slug'dan yasaladi). Hech qachon chop etilmagan qoralama keshga tegmaydi.
 */
export function pageRevalidationTags(doc: PageLike, previousDoc?: PageLike): string[] {
  const isPublic = doc?._status !== 'draft'
  const wasPublic = Boolean(previousDoc) && previousDoc?._status !== 'draft'
  if (!isPublic && !wasPublic) return []
  return withSlugTags([CACHE_TAGS.pages, CACHE_TAGS.nav], pageTag, doc, previousDoc)
}

/** Kategoriya o'zgardi: menyu, kategoriya sahifasi va kartochkalardagi nom. */
export function categoryRevalidationTags(doc: SlugLike, previousDoc?: SlugLike): string[] {
  const tags = new Set<string>([CACHE_TAGS.nav, CACHE_TAGS.posts, CACHE_TAGS.home])
  if (doc?.slug) tags.add(categoryTag(doc.slug))
  if (previousDoc?.slug) tags.add(categoryTag(previousDoc.slug))
  return [...tags]
}
