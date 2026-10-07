import { DEFAULT_LOCALE, type Locale } from '@blog-odya/shared/locales'
import type { Payload } from 'payload'

import type { Category, Media, Post, Tag } from '@/payload-types'
import { postProtectedTerms } from '@/translit/post-terms'
import { getTransliterator } from '@/translit/transliterator'

import type { SocialImageCover } from './image'
import type { MakePostInput } from './make/payload'
import { resolveSocialTitle } from './title'

/**
 * Ijtimoiy tarmoqlar uchun post ma'lumoti (OBLOG-91): Make webhook JSON'i va JPEG rasm route'i
 * bitta manbadan o'qiydi. Faqat **ommaviy** post (chop etilgan, arxivlanmagan, kategoriya va
 * slug bor) — aks holda `null` (rasm route'i 404 beradi, qoralama oshkor bo'lmaydi).
 */
export interface SocialPost {
  post: Post
  category: Category
  input: MakePostInput
  cover: SocialImageCover | null
  /** Rasm ustidagi qisqa sarlavha (OBLOG-94). */
  socialTitle: string
}

export interface LoadSocialPostOptions {
  /**
   * Admin oldindan ko'rish (OBLOG-94): oxirgi qoralama versiya, chop etilmagan post ham.
   * Faqat autentifikatsiyadan o'tgan admin/muharrir uchun chaqiriladi.
   */
  preview?: boolean
}

const CYRILLIC = /[Ѐ-ӿ]/
const LATIN = /[A-Za-z]/

/**
 * Qisqa sarlavha shu yozuvda. Kirill: `socialTitle` odatda sinxron hook bilan yoziladi; yo'q
 * bo'lsa Payload lotin qiymatini qaytaradi (fallback) — u holda shu yerda translit qilinadi.
 */
async function socialTitleFor(payload: Payload, post: Post, locale: Locale): Promise<string> {
  let social = post.socialTitle?.trim() || null
  if (social && locale === 'uz-Cyrl' && !CYRILLIC.test(social) && LATIN.test(social)) {
    const terms = await postProtectedTerms(payload, { keepLatin: post.keepLatin, tags: post.tags })
    social = (await getTransliterator(payload)).withProtectedTerms(terms).toCyrillic(social)
  }
  return resolveSocialTitle({ socialTitle: social, title: post.title, metaTitle: post.meta?.title })
}

/** `?v=` uchun rasm mazmuni kaliti: sarlavha, kategoriya, muqova (id, vaqt, focal point). */
export function socialImageKey(parts: {
  locale: Locale
  socialTitle: string
  category: Pick<Category, 'id' | 'name' | 'slug' | 'color'>
  media: Pick<Media, 'id' | 'updatedAt' | 'focalX' | 'focalY' | 'filename'> | null
}): string {
  return JSON.stringify([
    parts.locale,
    parts.socialTitle,
    parts.category.id,
    parts.category.name,
    parts.category.slug,
    parts.category.color ?? null,
    parts.media
      ? [
          parts.media.id,
          parts.media.updatedAt,
          parts.media.filename ?? null,
          parts.media.focalX ?? null,
          parts.media.focalY ?? null,
        ]
      : null,
  ])
}

function populated<T extends object>(value: unknown): T | null {
  return value && typeof value === 'object' ? (value as T) : null
}

function idOf(value: unknown): number | null {
  if (typeof value === 'number') return value
  const id = populated<{ id?: unknown }>(value)?.id
  return typeof id === 'number' ? id : null
}

/** Muqova manbasi: `full` (1920 WebP) → asl fayl; nisbiy URL — sayt manzili bilan. */
export function coverSource(media: Media | null, origin: string): SocialImageCover | null {
  if (!media) return null
  const raw = media.sizes?.full?.url || media.url
  if (!raw) return null
  try {
    return {
      url: new URL(raw, `${origin.replace(/\/+$/, '')}/`).toString(),
      focalX: media.focalX ?? null,
      focalY: media.focalY ?? null,
    }
  } catch {
    return null
  }
}

/**
 * Heshteg uchun lotin nomlar: teglar (post tartibida), keyin kategoriya. Kirill yozuvda ham
 * heshteglar lotin (Instagram qidiruvi va brend izchilligi uchun).
 */
async function latinNames(payload: Payload, post: Post, category: Category): Promise<string[]> {
  const tagIds = (post.tags ?? []).map(idOf).filter((id): id is number => id !== null)
  const [tags, latinCategory] = await Promise.all([
    tagIds.length
      ? payload.find({
          collection: 'tags',
          where: { id: { in: tagIds } },
          locale: 'uz-Latn',
          depth: 0,
          limit: tagIds.length,
          overrideAccess: true,
          select: { name: true },
        })
      : null,
    payload.findByID({
      collection: 'categories',
      id: category.id,
      locale: 'uz-Latn',
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
      select: { name: true },
    }),
  ])
  const byId = new Map((tags?.docs ?? []).map((tag) => [tag.id, tag.name]))
  return [...tagIds.map((id) => byId.get(id)), latinCategory?.name ?? category.name].filter(
    (name): name is string => Boolean(name),
  )
}

export async function loadSocialPost(
  payload: Payload,
  postId: number,
  locale: Locale,
  origin: string,
  options: LoadSocialPostOptions = {},
): Promise<SocialPost | null> {
  // `req` berilmaydi: job'da parallel ishlaydigan boshqa yozuv `req.locale` ni buzmasin.
  const post = (await payload.findByID({
    collection: 'posts',
    id: postId,
    locale,
    fallbackLocale: DEFAULT_LOCALE,
    depth: 1,
    draft: options.preview === true,
    overrideAccess: true,
    disableErrors: true,
  })) as Post | null
  if (!post) return null
  if (!options.preview && (post._status !== 'published' || post.workflowStatus !== 'published')) {
    return null
  }
  const category = populated<Category>(post.category)
  if (!category?.slug || !post.slug) return null
  const tags = (post.tags ?? [])
    .map((tag) => populated<Tag>(tag))
    .filter((tag): tag is Tag => Boolean(tag?.slug && tag.name))
    .map((tag) => ({ slug: tag.slug, name: tag.name }))
  const media = populated<Media>(post.coverImage)
  const cover = coverSource(media, origin)
  const socialTitle = await socialTitleFor(payload, post, locale)
  return {
    post,
    category,
    cover,
    socialTitle,
    input: {
      id: post.id,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
      isBreaking: post.isBreaking,
      category: { slug: category.slug, name: category.name },
      tags,
      hashtagNames: await latinNames(payload, post, category),
      coverAlt: media?.alt || post.coverAlt,
      hasCover: Boolean(cover),
      socialTitle,
      imageKey: socialImageKey({ locale, socialTitle, category, media: cover ? media : null }),
    },
  }
}
