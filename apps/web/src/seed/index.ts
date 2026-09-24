import { fillPlaceholders, LEGAL_PLACEHOLDERS, loadLegalPages } from '@blog-odya/guidelines'
import categoriesJson from '@blog-odya/shared/seed/categories.json' with { type: 'json' }
import sourcesJson from '@blog-odya/shared/seed/sources.json' with { type: 'json' }
import { categoriesSeedSchema, sourcesSeedSchema, type Locale } from '@blog-odya/shared'
import { convertMarkdownToLexical, editorConfigFactory } from '@payloadcms/richtext-lexical'
import { readFile } from 'node:fs/promises'
import type { CollectionSlug, Payload } from 'payload'
import sharp from 'sharp'

import {
  loadCategoryColors,
  SEED_AUTHOR,
  SEED_COVERS,
  SEED_POSTS,
  SEED_TAGS,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  type SeedCover,
  seedCoverUrl,
} from './data'
import { DEMO_RICH_MARKDOWN, demoRichNodes } from './rich'

const LATN: Locale = 'uz-Latn'
const CYRL: Locale = 'uz-Cyrl'

type Count = { created: number; existing: number }

export interface SeedSummary {
  /** Demo kontent (teglar, postlar, muqovalar) yuklandimi — `SeedOptions.demo`. */
  demo: boolean
  categories: Count
  pages: Count
  authors: Count
  tags: Count
  posts: Count
  /** Demo muqovalar (media); S3 mavjud bo'lmasa — `failed`. */
  media: Count & { failed: number }
  sources: Count
  globals: { siteSettings: boolean; header: boolean; footer: boolean }
  /** Seed'da to'ldirilmagan huquqiy sahifa o'rinbosarlari (`{{...}}`). */
  unfilledPlaceholders: string[]
}

export interface SeedOptions {
  log?: (message: string) => void
  /**
   * Demo kontent: 3 ta namuna post, ularning teglari va muqovalari (S3 ga yuklanadi).
   * Default — `true` (lokal/dev/testlar). Prod'da — `false` (`SEED_DEMO=false`,
   * `.github/workflows/seed-prod.yml`): faqat kategoriyalar, manbalar, huquqiy sahifalar,
   * muallif va globals.
   */
  demo?: boolean
  /** Huquqiy sahifalardagi `{{KEY}}` qiymatlari; berilmasa `SEED_<KEY>` env'dan olinadi. */
  placeholders?: Partial<Record<(typeof LEGAL_PLACEHOLDERS)[number], string>>
}

type Id = number | string

/** Relationship qiymati: `updateGlobal` natijasida obyekt (populyatsiya) yoki id. */
function relId(value: unknown): Id | undefined {
  if (value !== null && typeof value === 'object') return (value as { id?: Id }).id
  return (value ?? undefined) as Id | undefined
}

async function findIdBySlug(payload: Payload, collection: CollectionSlug, slug: string) {
  const { docs } = await payload.find({
    collection,
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    pagination: false,
    // Drafts yoqilgan kolleksiyalarda qoralama hujjatlar ham topilsin.
    draft: true,
  })
  return (docs[0]?.id as Id | undefined) ?? null
}

/**
 * Demo muqova: SVG → 1920×1080 PNG → `media` (Payload WebP variantlarni tayyorlaydi).
 * Fayl nomi bo'yicha idempotent. S3 ishlamasa — post muqovasiz yaratiladi (ogohlantirish bilan).
 */
async function seedCover(
  payload: Payload,
  cover: SeedCover,
  summary: SeedSummary,
  log: (message: string) => void,
): Promise<Id | null> {
  const filename = `namuna-muqova-${cover}.png`
  try {
    const { docs } = await payload.find({
      collection: 'media',
      where: { filename: { equals: filename } },
      limit: 1,
      depth: 0,
    })
    if (docs[0]) {
      summary.media.existing++
      return docs[0].id
    }
    const svg = await readFile(seedCoverUrl(cover))
    const data = await sharp(svg, { density: 144 }).resize(1920, 1080).png().toBuffer()
    const created = await payload.create({
      collection: 'media',
      locale: LATN,
      data: { alt: SEED_COVERS[cover][LATN], credit: 'Blog Odya', license: 'own' },
      file: { data, mimetype: 'image/png', name: filename, size: data.length },
    })
    await payload.update({
      collection: 'media',
      id: created.id,
      locale: CYRL,
      data: { alt: SEED_COVERS[cover][CYRL] },
    })
    summary.media.created++
    return created.id
  } catch (error) {
    summary.media.failed++
    log(`Diqqat: demo muqova yuklanmadi (${cover}): ${(error as Error).message}`)
    return null
  }
}

/** `@username` → `https://t.me/username`. */
function telegramUrl(channel: string | undefined): string | undefined {
  if (!channel) return undefined
  if (channel.startsWith('https://')) return channel
  return channel.startsWith('@') ? `https://t.me/${channel.slice(1)}` : undefined
}

/**
 * `SEED_DEMO` env → `SeedOptions.demo`. Berilmagan/bo'sh — `true` (avvalgi xatti-harakat);
 * `false`/`0` — demo o'chiq. Boshqa qiymat — xato (prod'da imlo xatosi demo yuklab yubormasin).
 */
export function parseSeedDemo(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase() ?? ''
  if (normalized === '' || normalized === 'true' || normalized === '1') return true
  if (normalized === 'false' || normalized === '0') return false
  throw new Error(`SEED_DEMO noto'g'ri: "${value}" (true/false yoki 1/0 bo'lishi kerak)`)
}

function placeholderValues(options: SeedOptions) {
  const values: Record<string, string | undefined> = {}
  for (const key of LEGAL_PLACEHOLDERS) {
    values[key] = options.placeholders?.[key] ?? process.env[`SEED_${key}`] ?? undefined
  }
  values.TELEGRAM_LATN_URL ??= telegramUrl(process.env.TELEGRAM_CHANNEL_LATN)
  values.TELEGRAM_CYRL_URL ??= telegramUrl(process.env.TELEGRAM_CHANNEL_CYRL)
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v)) as Record<string, string>
}

/**
 * Boshlang'ich ma'lumotlar (`pnpm seed`): 9 kategoriya, 6 huquqiy sahifa, 1 muallif, 3 teg,
 * 3 demo post, 7 manba (`sources.json`, M0-04), `site-settings`, `header`, `footer`.
 * `demo: false` — teglar, demo postlar va muqovalar o'tkazib yuboriladi (header/footer faqat
 * kategoriya va huquqiy sahifalarga havola qiladi, demo kontentga bog'liq emas).
 *
 * Idempotent: hujjatlar `slug` bo'yicha, globals — to'ldirilganligi bo'yicha tekshiriladi;
 * mavjudlari o'zgartirilmaydi (admin'dagi tahrirlar saqlanadi), dublikat yaratilmaydi.
 */
export async function seed(payload: Payload, options: SeedOptions = {}): Promise<SeedSummary> {
  const log = options.log ?? (() => {})
  const demo = options.demo ?? true
  const summary: SeedSummary = {
    demo,
    categories: { created: 0, existing: 0 },
    pages: { created: 0, existing: 0 },
    authors: { created: 0, existing: 0 },
    tags: { created: 0, existing: 0 },
    posts: { created: 0, existing: 0 },
    media: { created: 0, existing: 0, failed: 0 },
    sources: { created: 0, existing: 0 },
    globals: { siteSettings: false, header: false, footer: false },
    unfilledPlaceholders: [],
  }
  const editorConfig = await editorConfigFactory.default({ config: payload.config })
  const markdownToLexical = (markdown: string) =>
    convertMarkdownToLexical({ editorConfig, markdown }) as unknown as Record<string, unknown>

  // --- Kategoriyalar (M0-04) ---
  const categories = categoriesSeedSchema.parse(categoriesJson)
  const colors = loadCategoryColors()
  const categoryIds = new Map<string, Id>()
  for (const category of categories) {
    const existing = await findIdBySlug(payload, 'categories', category.slug)
    if (existing !== null) {
      categoryIds.set(category.slug, existing)
      summary.categories.existing++
      continue
    }
    const parent = category.parent ? (categoryIds.get(category.parent) ?? null) : null
    const created = await payload.create({
      collection: 'categories',
      locale: LATN,
      data: {
        name: category.name[LATN],
        slug: category.slug,
        description: category.description[LATN],
        parent: parent as number | null,
        color: category.color ?? colors[category.slug],
        order: category.order,
        isInMenu: category.isInMenu,
        meta: {
          title: category.meta?.title?.[LATN],
          description: category.meta?.description?.[LATN],
        },
      },
    })
    await payload.update({
      collection: 'categories',
      id: created.id,
      locale: CYRL,
      data: {
        name: category.name[CYRL],
        description: category.description[CYRL],
        meta: {
          title: category.meta?.title?.[CYRL],
          description: category.meta?.description?.[CYRL],
        },
      },
    })
    categoryIds.set(category.slug, created.id)
    summary.categories.created++
  }
  log(`Kategoriyalar: +${summary.categories.created}, mavjud ${summary.categories.existing}`)

  // --- Manbalar (M0-04 → M2-01): kategoriya slug'lari ID'ga aylantiriladi ---
  for (const source of sourcesSeedSchema.parse(sourcesJson)) {
    if ((await findIdBySlug(payload, 'sources', source.slug)) !== null) {
      summary.sources.existing++
      continue
    }
    const categoryId = (slug: string) => {
      const id = categoryIds.get(slug)
      if (id === undefined) throw new Error(`Seed: ${source.slug} — kategoriya topilmadi: ${slug}`)
      return id as number
    }
    await payload.create({
      collection: 'sources',
      data: {
        name: source.name,
        slug: source.slug,
        homepageUrl: source.homepageUrl,
        feeds: source.feeds.map((feed) => ({
          url: feed.url,
          feedCategory: feed.feedCategory,
          mapsTo: categoryId(feed.mapsTo),
          isActive: feed.isActive,
        })),
        language: source.language,
        fetchMode: source.fetchMode,
        selectors: source.selectors,
        pollIntervalMin: source.pollIntervalMin,
        rateLimitSec: source.rateLimitSec,
        robotsCheckedAt: source.robotsCheckedAt,
        tosNotes: source.tosNotes,
        priority: source.priority,
        keywordRules: source.keywordRules.map((rule) => ({
          keyword: rule.keyword,
          category: categoryId(rule.category),
          boost: rule.boost,
        })),
        isActive: source.isActive,
      },
    })
    summary.sources.created++
  }
  log(`Manbalar: +${summary.sources.created}, mavjud ${summary.sources.existing}`)

  // --- Huquqiy sahifalar (M0-05) ---
  const values = placeholderValues(options)
  const pageIds = new Map<string, Id>()
  const unfilled = new Set<string>()
  for (const doc of loadLegalPages()) {
    const existing = await findIdBySlug(payload, 'pages', doc.slug)
    if (existing !== null) {
      pageIds.set(doc.slug, existing)
      summary.pages.existing++
      continue
    }
    // Sarlavha `title` maydonida — Markdown'dagi birinchi `# ...` takrorlanmaydi.
    const body = fillPlaceholders(doc.markdown, values).replace(/^#\s+.*\n+/, '')
    for (const match of body.matchAll(/\{\{([A-Z_]+)\}\}/g)) unfilled.add(match[1] ?? '')
    const created = await payload.create({
      collection: 'pages',
      locale: LATN,
      data: {
        title: doc.frontMatter.title,
        slug: doc.slug,
        _status: 'published',
        layout: [{ blockType: 'content', richText: markdownToLexical(body) as never }],
      },
    })
    pageIds.set(doc.slug, created.id)
    summary.pages.created++
  }
  summary.unfilledPlaceholders = [...unfilled].sort()
  log(`Sahifalar: +${summary.pages.created}, mavjud ${summary.pages.existing}`)
  if (summary.unfilledPlaceholders.length) {
    log(
      `Diqqat: huquqiy sahifalarda to'ldirilmagan o'rinbosarlar: ${summary.unfilledPlaceholders.join(', ')} ` +
        `(SEED_<KEY> env bilan bering yoki admin'da tahrirlang)`,
    )
  }

  // --- Muallif ---
  let authorId = await findIdBySlug(payload, 'authors', SEED_AUTHOR.slug)
  if (authorId === null) {
    const author = await payload.create({
      collection: 'authors',
      locale: LATN,
      data: {
        slug: SEED_AUTHOR.slug,
        name: SEED_AUTHOR.name[LATN],
        position: SEED_AUTHOR.position[LATN],
        bio: SEED_AUTHOR.bio[LATN],
        isActive: true,
      },
    })
    await payload.update({
      collection: 'authors',
      id: author.id,
      locale: CYRL,
      data: {
        name: SEED_AUTHOR.name[CYRL],
        position: SEED_AUTHOR.position[CYRL],
        bio: SEED_AUTHOR.bio[CYRL],
      },
    })
    authorId = author.id
    summary.authors.created++
  } else {
    summary.authors.existing++
  }

  if (demo) {
    await seedDemoContent(payload, { authorId, categoryIds, markdownToLexical, summary, log })
  } else {
    log("Demo kontent o'tkazib yuborildi (demo: false): teglar, postlar, muqovalar yaratilmadi")
  }

  await seedGlobals(payload, { categories, categoryIds, pageIds, summary, log })

  return summary
}

/** Teglar, 3 demo post va ularning muqovalari (faqat `demo: true`). */
async function seedDemoContent(
  payload: Payload,
  ctx: {
    authorId: Id
    categoryIds: Map<string, Id>
    markdownToLexical: (markdown: string) => Record<string, unknown>
    summary: SeedSummary
    log: (message: string) => void
  },
): Promise<void> {
  const { authorId, categoryIds, markdownToLexical, summary, log } = ctx

  // --- Teglar ---
  const tagIds = new Map<string, Id>()
  for (const tag of SEED_TAGS) {
    const existing = await findIdBySlug(payload, 'tags', tag.slug)
    if (existing !== null) {
      tagIds.set(tag.slug, existing)
      summary.tags.existing++
      continue
    }
    const created = await payload.create({
      collection: 'tags',
      locale: LATN,
      data: {
        slug: tag.slug,
        name: tag.name[LATN],
        synonyms: 'synonyms' in tag ? tag.synonyms.map((value) => ({ value })) : [],
      },
    })
    await payload.update({
      collection: 'tags',
      id: created.id,
      locale: CYRL,
      data: { name: tag.name[CYRL] },
    })
    tagIds.set(tag.slug, created.id)
    summary.tags.created++
  }

  // --- Demo postlar: workflow bo'yicha draft → in_progress → review → published ---
  for (const post of SEED_POSTS) {
    const existing = await findIdBySlug(payload, 'posts', post.slug)
    if (existing !== null) {
      summary.posts.existing++
      continue
    }
    const category = categoryIds.get(post.category)
    if (category === undefined) throw new Error(`Seed: kategoriya topilmadi: ${post.category}`)
    const coverImage = post.cover ? await seedCover(payload, post.cover, summary, log) : null
    const content = markdownToLexical(
      post.richBlocks ? `${post.markdown}\n\n${DEMO_RICH_MARKDOWN}` : post.markdown,
    ) as { root: { children: unknown[] } }
    if (post.richBlocks) content.root.children.push(...demoRichNodes())
    const created = await payload.create({
      collection: 'posts',
      locale: LATN,
      data: {
        title: post.title[LATN],
        slug: post.slug,
        excerpt: post.excerpt[LATN],
        content: content as never,
        coverImage: coverImage as number | null,
        category: category as number,
        tags: post.tags
          .map((slug) => tagIds.get(slug))
          .filter((id) => id !== undefined) as number[],
        authors: [authorId as number],
        sources: [{ name: post.source.name, url: post.source.url }],
        rewrittenBy: post.rewrittenBy,
        isFeatured: post.isFeatured ?? false,
        workflowStatus: 'draft',
      },
    })
    const id = created.id
    await payload.update({ collection: 'posts', id, data: { workflowStatus: 'in_progress' } })
    await payload.update({ collection: 'posts', id, data: { workflowStatus: 'review' } })
    await payload.update({
      collection: 'posts',
      id,
      locale: CYRL,
      data: { title: post.title[CYRL], excerpt: post.excerpt[CYRL] },
    })
    await payload.update({ collection: 'posts', id, data: { _status: 'published' } })
    summary.posts.created++
  }
  log(`Postlar: +${summary.posts.created}, mavjud ${summary.posts.existing}`)
  log(
    `Demo muqovalar: +${summary.media.created}, mavjud ${summary.media.existing}` +
      (summary.media.failed ? `, xato ${summary.media.failed}` : ''),
  )
}

/** `site-settings`, `header`, `footer` — faqat kategoriya va huquqiy sahifalarga havola qiladi. */
async function seedGlobals(
  payload: Payload,
  ctx: {
    categories: ReturnType<typeof categoriesSeedSchema.parse>
    categoryIds: Map<string, Id>
    pageIds: Map<string, Id>
    summary: SeedSummary
    log: (message: string) => void
  },
): Promise<void> {
  const { categories, categoryIds, pageIds, summary, log } = ctx

  // --- Globals ---
  // Har bir yozuv alohida tekshiriladi (fallback'siz): bittasi to'ldirilgan bo'lsa ham ikkinchisi to'ladi.
  for (const locale of [LATN, CYRL]) {
    const settings = await payload.findGlobal({
      slug: 'site-settings',
      locale,
      fallbackLocale: false,
      depth: 0,
    })
    if (settings.siteName) continue
    await payload.updateGlobal({
      slug: 'site-settings',
      locale,
      data: {
        siteName: SITE_NAME[locale],
        tagline: settings.tagline || SITE_TAGLINE[locale],
        description: settings.description || SITE_DESCRIPTION[locale],
      },
    })
    summary.globals.siteSettings = true
  }

  const menuCategories = categories.filter((c) => c.isInMenu).sort((a, b) => a.order - b.order)
  const moreCategories = categories.filter((c) => !c.isInMenu).sort((a, b) => a.order - b.order)
  const categoryLink = (slug: string) => ({
    type: 'category' as const,
    category: categoryIds.get(slug) as number,
  })

  const header = await payload.findGlobal({ slug: 'header', depth: 0 })
  if (!header.navItems?.length && !header.moreItems?.length) {
    const saved = await payload.updateGlobal({
      slug: 'header',
      locale: LATN,
      data: {
        navItems: menuCategories.map((c) => ({ ...categoryLink(c.slug), label: c.name[LATN] })),
        moreItems: moreCategories.map((c) => ({ ...categoryLink(c.slug), label: c.name[LATN] })),
      },
    })
    // Massiv qatorlari umumiy, `label` — lokalizatsiya: kirill uchun shu qatorlarni yangilaymiz.
    const byCategory = new Map(categories.map((c) => [categoryIds.get(c.slug), c]))
    const cyrl = (rows: typeof saved.navItems) =>
      (rows ?? []).map((row) => ({
        ...row,
        label: byCategory.get(relId(row.category))?.name[CYRL] ?? row.label,
      }))
    await payload.updateGlobal({
      slug: 'header',
      locale: CYRL,
      data: { navItems: cyrl(saved.navItems), moreItems: cyrl(saved.moreItems) },
    })
    summary.globals.header = true
  }

  const footer = await payload.findGlobal({ slug: 'footer', depth: 0 })
  if (!footer.columns?.length) {
    const legal = loadLegalPages()
    const saved = await payload.updateGlobal({
      slug: 'footer',
      locale: LATN,
      data: {
        copyright: '© Odya LLC',
        columns: [
          {
            title: 'Kategoriyalar',
            links: [...menuCategories, ...moreCategories].map((c) => ({
              ...categoryLink(c.slug),
              label: c.name[LATN],
            })),
          },
          {
            title: 'Blog Odya',
            links: legal.map((doc) => ({
              type: 'page' as const,
              page: pageIds.get(doc.slug) as number,
              label: doc.frontMatter.title,
            })),
          },
        ],
      },
    })
    const byCategory = new Map(categories.map((c) => [categoryIds.get(c.slug), c]))
    await payload.updateGlobal({
      slug: 'footer',
      locale: CYRL,
      data: {
        copyright: '© Odya LLC',
        columns: (saved.columns ?? []).map((column, index) => ({
          ...column,
          title: index === 0 ? 'Категориялар' : 'Блог Одя',
          links: (column.links ?? []).map((link) => ({
            ...link,
            // Huquqiy sahifalar kirill nomi — M1-03 transliteratsiyasigacha lotin (fallback).
            label:
              link.type === 'category'
                ? (byCategory.get(relId(link.category))?.name[CYRL] ?? link.label)
                : link.label,
          })),
        })),
      },
    })
    summary.globals.footer = true
  }
  log(
    `Globals: site-settings ${summary.globals.siteSettings ? 'yaratildi' : 'mavjud'}, ` +
      `header ${summary.globals.header ? 'yaratildi' : 'mavjud'}, ` +
      `footer ${summary.globals.footer ? 'yaratildi' : 'mavjud'}`,
  )
}
