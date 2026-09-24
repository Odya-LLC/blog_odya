/**
 * Tahririyat navbati uchun e2e fixture'lari (M2-04) — faqat lokal/CI sinov uchun, production'da
 * ishlatilmaydi:
 *
 *   E2E_EDITOR_EMAIL=… E2E_EDITOR_PASSWORD=… \
 *     pnpm --filter @blog-odya/web payload run src/seed/editorial-fixtures.ts
 *
 * - `E2E_EDITOR_*` berilsa — shu `editor` foydalanuvchisi (bo'lmasa yaratiladi, parol yangilanadi);
 * - "E2E fixture manba" manbasi va bugungi (Toshkent sanasi) `pending` `scraped-items`
 *   (score/klastersiz — M2-03 gacha bo'lgan real holat). Har ishga tushirishda qayta yaratiladi:
 *   oldingi fixture elementlari va ulardan yaratilgan postlar o'chiriladi.
 *
 * Oldindan: `pnpm seed` (kategoriyalar).
 */
import { getPayload } from 'payload'

import { localDate } from '../editorial/queue'
import config from '../payload.config'

const SOURCE_SLUG = 'e2e-fixture-manba'
const BASE_URL = 'https://e2e-fixture.example'

const ITEMS = [
  {
    title: 'OpenAI unveils a smaller reasoning model for developers',
    excerpt:
      'The new model is cheaper and faster, and targets coding assistants and agents. It is available through the API starting today.',
  },
  {
    title: 'NVIDIA reports record data center revenue',
    excerpt:
      'Quarterly revenue from data center chips grew again as cloud providers expanded AI infrastructure.',
  },
  {
    title: 'Team Spirit wins the regional Dota 2 qualifier',
    excerpt: 'The team secured a slot in the international championship after a 3–1 final.',
  },
  {
    title: 'Apple releases a security update for iOS',
    excerpt: 'The update fixes two actively exploited vulnerabilities in WebKit and the kernel.',
  },
] as const

const payload = await getPayload({ config: await config })
let exitCode = 0
try {
  const email = process.env.E2E_EDITOR_EMAIL
  const password = process.env.E2E_EDITOR_PASSWORD
  if (email && password) {
    const { docs } = await payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      limit: 1,
    })
    if (docs[0]) {
      await payload.update({ collection: 'users', id: docs[0].id, data: { password } })
    } else {
      await payload.create({
        collection: 'users',
        data: { email, password, name: 'E2E muharrir', role: 'editor' },
      })
    }
    payload.logger.info(`E2E editor: ${email}`)
  }

  const { docs: categories } = await payload.find({
    collection: 'categories',
    sort: 'id',
    limit: 1,
    depth: 0,
  })
  const category = categories[0]
  if (!category) throw new Error('Kategoriya yo‘q — avval `pnpm seed` ni ishga tushiring.')

  const existing = await payload.find({
    collection: 'sources',
    where: { slug: { equals: SOURCE_SLUG } },
    limit: 1,
    depth: 0,
  })
  const source =
    existing.docs[0] ??
    (await payload.create({
      collection: 'sources',
      data: {
        name: 'E2E fixture manba',
        slug: SOURCE_SLUG,
        homepageUrl: BASE_URL,
        feeds: [{ url: `${BASE_URL}/feed.xml`, isActive: false }],
        language: 'en',
        fetchMode: 'rss_only',
        isActive: false,
      },
    }))

  // Oldingi fixture'lar va ulardan yaratilgan postlar (e2e "qoralamaga olish" natijalari).
  const { docs: previous } = await payload.find({
    collection: 'scraped-items',
    where: { source: { equals: source.id } },
    pagination: false,
    depth: 0,
    select: { title: true },
  })
  if (previous.length > 0) {
    const ids = previous.map((doc) => doc.id)
    await payload.delete({ collection: 'posts', where: { 'sources.scrapedItem': { in: ids } } })
    await payload.delete({ collection: 'scraped-items', where: { id: { in: ids } } })
  }

  const date = localDate()
  const runId = Date.now()
  for (const [index, item] of ITEMS.entries()) {
    await payload.create({
      collection: 'scraped-items',
      data: {
        title: item.title,
        excerpt: item.excerpt,
        url: `${BASE_URL}/${date}/${runId}-${index + 1}`,
        urlHash: `e2e-fixture:${runId}:${index + 1}`,
        source: source.id,
        status: 'pending',
        language: 'en',
        publishedAt: new Date(Date.now() - (index + 1) * 20 * 60_000).toISOString(),
        suggestedCategory: category.id,
      },
    })
  }
  payload.logger.info(
    `E2E fixture'lar (${date}): ${ITEMS.length} ta element (o'chirilgan: ${previous.length})`,
  )
} catch (error) {
  payload.logger.error({ err: error, msg: 'E2E fixture xatosi' })
  exitCode = 1
} finally {
  await payload.destroy()
}
process.exit(exitCode)
