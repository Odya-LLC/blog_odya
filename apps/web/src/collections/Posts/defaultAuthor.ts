import type { Locale } from '@blog-odya/shared'
import type { CollectionBeforeChangeHook, Payload, PayloadRequest } from 'payload'

import type { Post } from '@/payload-types'

/**
 * Standart muallif — "Blog Odya tahririyati" (`/author/tahririyat`), OBLOG-57, TZ §8.2
 * (`author → Person`, E-E-A-T).
 *
 * Muallifsiz post (MCP `create_draft`, muharrirning "Qoralamaga olish" amali, admin'da muallif
 * tanlanmagan) JSON-LD'da `NewsMediaOrganization` ga tushardi — Google News/Discover uchun
 * `author` sifatida `Person` kutiladi. Shuning uchun:
 *
 * - `applyDefaultAuthor` (`posts` `beforeChange`): post yaratilganda va chop etilganda (`_status:
 *   'published'`) `authors` bo'sh bo'lsa — standart muallif qo'yiladi (muharrir keyin
 *   almashtirishi mumkin). MCP va "Qoralamaga olish" `payload.create` orqali ishlaydi — ular ham
 *   shu hook'dan o'tadi.
 * - Muallif hujjati `pnpm seed` (prod — `seed-prod` workflow) da yaratiladi; topilmasa, shu yerda
 *   bir marta yaratiladi (`ensureDefaultAuthorId`) — alohida data migratsiyasi shart emas.
 * - Eski (muallifsiz chop etilgan) postlar: sayt runtime'da standart muallifni ko'rsatadi
 *   (`site/data.ts` → `loadArticle`, `site/seo/pages.ts` → `authorPersons`) — ma'lumot migratsiyasiz.
 *
 * `req.context.skipDefaultAuthor = true` — o'chirish (masalan, maxsus import).
 */
export const DEFAULT_AUTHOR = {
  slug: 'tahririyat',
  name: { 'uz-Latn': 'Blog Odya tahririyati', 'uz-Cyrl': 'Блог Одя таҳририяти' },
  position: { 'uz-Latn': 'Tahririyat', 'uz-Cyrl': 'Таҳририят' },
  bio: {
    'uz-Latn':
      'Blog Odya tahririyati: xalqaro manbalardagi texnologiya yangiliklarini oʻzbek tilida tayyorlaydi va tekshiradi.',
    'uz-Cyrl':
      'Блог Одя таҳририяти: халқаро манбалардаги технология янгиликларини ўзбек тилида тайёрлайди ва текширади.',
  },
} as const satisfies {
  slug: string
  name: Record<Locale, string>
  position: Record<Locale, string>
  bio: Record<Locale, string>
}

export const DEFAULT_AUTHOR_SLUG = DEFAULT_AUTHOR.slug

type Id = number

/** Standart muallif ID'si (bo'lmasa — `null`). O'qish — access'siz (tizim amali). */
export async function findDefaultAuthorId(
  payload: Payload,
  req?: PayloadRequest,
): Promise<Id | null> {
  const { docs } = await payload.find({
    collection: 'authors',
    where: { slug: { equals: DEFAULT_AUTHOR_SLUG } },
    limit: 1,
    depth: 0,
    pagination: false,
    select: {},
    overrideAccess: true,
    ...(req ? { req } : {}),
  })
  return (docs[0]?.id as Id | undefined) ?? null
}

/**
 * Standart muallif ID'si; hujjat yo'q bo'lsa — yaratiladi (lotin + qo'lda tasdiqlangan kirill,
 * seed bilan bir xil ma'lumot). Idempotent: slug bo'yicha qidiriladi.
 */
export async function ensureDefaultAuthorId(payload: Payload, req?: PayloadRequest): Promise<Id> {
  const existing = await findDefaultAuthorId(payload, req)
  if (existing !== null) return existing
  const latn: Locale = 'uz-Latn'
  const cyrl: Locale = 'uz-Cyrl'
  const created = await payload.create({
    collection: 'authors',
    locale: latn,
    data: {
      slug: DEFAULT_AUTHOR.slug,
      name: DEFAULT_AUTHOR.name[latn],
      position: DEFAULT_AUTHOR.position[latn],
      bio: DEFAULT_AUTHOR.bio[latn],
      isActive: true,
    },
    overrideAccess: true,
    ...(req ? { req } : {}),
  })
  await payload.update({
    collection: 'authors',
    id: created.id,
    locale: cyrl,
    data: {
      name: DEFAULT_AUTHOR.name[cyrl],
      position: DEFAULT_AUTHOR.position[cyrl],
      bio: DEFAULT_AUTHOR.bio[cyrl],
    },
    overrideAccess: true,
    ...(req ? { req } : {}),
  })
  payload.logger.info({
    authorId: created.id,
    msg: `Standart muallif (/author/${DEFAULT_AUTHOR_SLUG}) yaratildi`,
  })
  return created.id
}

function hasAuthors(value: unknown): boolean {
  return Array.isArray(value) && value.some((item) => item !== null && item !== undefined)
}

/** `posts` `beforeChange`: yaratishda va chop etishda bo'sh `authors` → standart muallif. */
export const applyDefaultAuthor: CollectionBeforeChangeHook<Post> = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (req.context?.skipDefaultAuthor) return data
  const publishing = data._status === 'published'
  if (operation !== 'create' && !publishing) return data
  const current = data.authors !== undefined ? data.authors : originalDoc?.authors
  if (hasAuthors(current)) return data
  // Ichki Local API chaqiruvlari `req.locale` / `req.fallbackLocale` ni qayta yozadi — post
  // saqlanishi davom etadigan locale o'zgarmasligi uchun tiklanadi.
  const { fallbackLocale, locale } = req
  try {
    const authorId = await ensureDefaultAuthorId(req.payload, req)
    return { ...data, authors: [authorId] }
  } finally {
    req.locale = locale
    req.fallbackLocale = fallbackLocale
  }
}
