import { describe, expect, it } from 'vitest'

import { validateDigestTimes } from '@/globals/SocialSettings'
import { dueSlot, formatSlotTime, latestSlot, parseSlotTimes, previousSlot } from '@/jobs/slots'
import { resolveMakeConfig } from '@/social/make/config'
import { makeEventFor } from '@/social/make/deliver'
import {
  buildMakePayload,
  charLength,
  INSTAGRAM_CAPTION_LIMIT,
  type MakePostInput,
  parseSocialImageFile,
} from '@/social/make/payload'
import {
  buildDigestPayload,
  digestCoverUrl,
  digestHeader,
  type DigestPayloadPost,
  INSTAGRAM_CAROUSEL_MAX,
  INSTAGRAM_DIGEST_CTA,
  INSTAGRAM_HASHTAG_LIMIT,
  instagramDigestCaption,
  parseDigestCoverUrl,
  STORY_PRIORITY_HEADROOM,
  storyBudget,
} from '@/social/instagram/digestPayload'
import { orderDigestItems } from '@/telegram/digestCaption'

/**
 * DB'siz: Instagram story + dayjest karuseli (OBLOG-118) — slotlar (Toshkent, daqiqa aniqligi),
 * tartib va sig'im, caption chegaralari (2200 / 30 heshteg), kunlik limit qoidasi, muqova URL imzosi.
 */

const SLOTS = parseSlotTimes('07:30, 12:30, 18:30')!
/** Toshkent vaqti (UTC+05:00) → epoch ms. */
const tashkent = (local: string) => Date.parse(`${local}+05:00`)
const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString())

describe('slotlar (HH:MM, Toshkent)', () => {
  it('parse: tartiblaydi, takrorni olib tashlaydi; noto‘g‘ri — null', () => {
    expect(SLOTS).toEqual([450, 750, 1110])
    expect(parseSlotTimes('18:30;07:30 12:30, 7:30')).toEqual([450, 750, 1110])
    expect(parseSlotTimes('')).toBeNull()
    expect(parseSlotTimes('25:00')).toBeNull()
    expect(parseSlotTimes('7.30')).toBeNull()
    expect(formatSlotTime(450)).toBe('07:30')
    expect(validateDigestTimes('07:30, 12:30, 18:30')).toBe(true)
    expect(validateDigestTimes('07:30, 99:00')).toMatch(/HH:MM/)
    expect(validateDigestTimes('01:00,02:00,03:00,04:00,05:00,06:00,07:00')).toMatch(/6/)
  })

  it('07:30 / 12:30 / 18:30: slot vaqtida va 60 daqiqagacha — o‘sha slot', () => {
    expect(iso(dueSlot(tashkent('2026-10-10T07:30:00'), SLOTS))).toBe(
      iso(tashkent('2026-10-10T07:30:00')),
    )
    expect(iso(dueSlot(tashkent('2026-10-10T12:39:00'), SLOTS))).toBe(
      iso(tashkent('2026-10-10T12:30:00')),
    )
    expect(iso(dueSlot(tashkent('2026-10-10T19:30:00'), SLOTS))).toBe(
      iso(tashkent('2026-10-10T18:30:00')),
    )
  })

  it('kechikkan tick (> 60 daqiqa) va tun — null; oldingi slot — kechagi 18:30', () => {
    expect(dueSlot(tashkent('2026-10-10T19:31:00'), SLOTS)).toBeNull()
    expect(dueSlot(tashkent('2026-10-10T03:00:00'), SLOTS)).toBeNull()
    expect(dueSlot(tashkent('2026-10-10T07:29:00'), SLOTS)).toBeNull()
    expect(iso(latestSlot(tashkent('2026-10-10T07:29:00'), SLOTS))).toBe(
      iso(tashkent('2026-10-09T18:30:00')),
    )
    // 07:30 dayjesti tungi postlarni ham oladi: oyna — kechagi 18:30 dan.
    expect(iso(previousSlot(tashkent('2026-10-10T07:30:00'), SLOTS))).toBe(
      iso(tashkent('2026-10-09T18:30:00')),
    )
    expect(iso(previousSlot(tashkent('2026-10-10T18:30:00'), SLOTS))).toBe(
      iso(tashkent('2026-10-10T12:30:00')),
    )
  })
})

describe('sozlamalar va hodisa', () => {
  it('standart: rejim post, story yoqiq, 07:30/12:30/18:30, limit 50', () => {
    const config = resolveMakeConfig(null, {})
    expect(config).toMatchObject({
      instagramMode: 'post',
      instagramStories: true,
      instagramDigestTimes: [450, 750, 1110],
      instagramDailyLimit: 50,
    })
    const custom = resolveMakeConfig(
      {
        instagramMode: 'story+digest',
        instagramStories: false,
        instagramDigestTimes: 'noto‘g‘ri',
        instagramDailyLimit: 1000,
      },
      {},
    )
    expect(custom).toMatchObject({
      instagramMode: 'story+digest',
      instagramStories: false,
      instagramDigestTimes: [450, 750, 1110],
      instagramDailyLimit: 100,
    })
  })

  it('makeEventFor: post rejimi va kirill — post; story+digest lotin — story yoki yo‘q', () => {
    const post = { instagramMode: 'post', instagramStories: true } as const
    const story = { instagramMode: 'story+digest', instagramStories: true } as const
    const digestOnly = { instagramMode: 'story+digest', instagramStories: false } as const
    expect(makeEventFor(post, 'uz-Latn')).toBe('post.published')
    expect(makeEventFor(story, 'uz-Latn')).toBe('post.story')
    expect(makeEventFor(story, 'uz-Cyrl')).toBe('post.published')
    expect(makeEventFor(digestOnly, 'uz-Latn')).toBeNull()
  })

  it('story JSON: type "story", 1080×1920 rasm; post — type "post", story bloksiz', () => {
    const input: MakePostInput = {
      id: 7,
      slug: 'gpt-6',
      title: 'GPT-6 chiqdi',
      category: { slug: 'ai', name: 'AI' },
      tags: [],
      hashtagNames: ['AI'],
      hasCover: false,
      imageKey: 'k',
    }
    const options = {
      deliveryId: 'd',
      sentAt: '2026-10-10T00:00:00.000Z',
      test: false,
      locale: 'uz-Latn' as const,
      origin: 'https://blog.odya.uz',
      hashtagsCount: 5,
      instagramImage: 'portrait' as const,
    }
    const story = buildMakePayload(input, { ...options, event: 'post.story' })
    expect(story.type).toBe('story')
    expect(story.event).toBe('post.story')
    expect(story.story).toMatchObject({ width: 1080, height: 1920 })
    expect(story.story!.imageUrl).toMatch(/\/og\/latn\/social\/7\/story\.jpg\?v=[0-9a-f]{12}$/)
    expect(story.images.story).toBe(story.story!.imageUrl)
    const post = buildMakePayload(input, { ...options, event: 'post.published' })
    expect(post.type).toBe('post')
    expect(post.story).toBeUndefined()
    expect(parseSocialImageFile('story.jpg')).toBe('story')
  })
})

describe('kunlik limit (story)', () => {
  const base = { digestsSent: 0, digestSlots: 3, limit: 50 }

  it('zaxira: limit − qolgan dayjest slotlari; chegarada — yo‘q', () => {
    expect(storyBudget({ ...base, used: 0, priority: 0 })).toEqual({ allowed: true, cap: 47 })
    expect(storyBudget({ ...base, used: 47, priority: 3 })).toMatchObject({
      allowed: false,
      reason: 'daily-limit',
    })
    expect(storyBudget({ ...base, used: 46, priority: 3 }).allowed).toBe(true)
    // Bugungi 2 ta dayjest allaqachon yuborilgan — zaxira 1.
    expect(storyBudget({ ...base, digestsSent: 2, used: 48, priority: 1 })).toMatchObject({
      allowed: true,
      cap: 49,
    })
  })

  it('chegaraga 5 ta qolganda — faqat muhimligi > 0 postlar', () => {
    const edge = 47 - STORY_PRIORITY_HEADROOM
    expect(storyBudget({ ...base, used: edge - 1, priority: 0 }).allowed).toBe(true)
    expect(storyBudget({ ...base, used: edge, priority: 0 })).toMatchObject({
      allowed: false,
      reason: 'daily-limit-low-priority',
    })
    expect(storyBudget({ ...base, used: edge, priority: 1 }).allowed).toBe(true)
  })
})

describe('dayjest: tartib, sig‘im va caption', () => {
  const post = (id: number, overrides: Partial<DigestPayloadPost> = {}): DigestPayloadPost => ({
    id,
    title: `Sarlavha ${id}`,
    imageUrl: `https://blog.odya.uz/og/latn/social/${id}/portrait.jpg?v=abc`,
    url: `https://blog.odya.uz/ai/post-${id}?utm_source=instagram`,
    ...overrides,
  })

  it('tartib: muhimlik, keyin yangiligi', () => {
    const at = (minute: number) => new Date(Date.UTC(2026, 9, 10, 8, minute)).toISOString()
    const ordered = orderDigestItems([
      { id: 1, priority: 0, publishedAt: at(5) },
      { id: 2, priority: 2, publishedAt: at(1) },
      { id: 3, priority: 0, publishedAt: at(9) },
      { id: 4, priority: 2, publishedAt: at(3) },
    ])
    expect(ordered.map((item) => item.id)).toEqual([4, 2, 3, 1])
  })

  it('JSON: muqova + ≤ 9 post (jami ≤ 10), caption raqamlangan, "Havola profilda"', () => {
    const posts = Array.from({ length: 12 }, (_, index) => post(index + 1))
    const header = digestHeader('uz-Latn', '10-oktabr')
    const payload = buildDigestPayload({
      key: 'ig-digest:x',
      slotAt: tashkent('2026-10-10T12:30:00'),
      header,
      cover: {
        imageUrl: 'https://blog.odya.uz/og/latn/digest/cover.jpg?s=1',
        url: 'https://blog.odya.uz/',
      },
      posts,
      hashtags: ['#AI', '#BlogOdya'],
      test: false,
      deliveryId: 'd',
      sentAt: '2026-10-10T07:30:00.000Z',
      script: 'uz-Latn',
    })
    expect(header).toBe('Kun yangiliklari · 10-oktabr')
    expect(payload).toMatchObject({
      type: 'digest',
      event: 'digest.published',
      digest: { count: 9 },
    })
    expect(payload.slides).toHaveLength(INSTAGRAM_CAROUSEL_MAX)
    expect(payload.slides[0]).toMatchObject({ postId: null, title: header })
    expect(payload.slides.slice(1).map((slide) => slide.postId)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ])
    expect(payload.instagram.imageUrls).toEqual(payload.slides.map((slide) => slide.imageUrl))
    expect(payload.caption).toBe(
      [
        header,
        Array.from({ length: 9 }, (_, i) => `${i + 1}. Sarlavha ${i + 1}`).join('\n'),
        INSTAGRAM_DIGEST_CTA,
        '#AI #BlogOdya',
      ].join('\n\n'),
    )
  })

  it('caption ≤ 2200 belgi va ≤ 30 heshteg: uzun sarlavhalar qisqaradi, bandlar soni o‘zgarmaydi', () => {
    const long = 'Juda uzun sarlavha '.repeat(30).trim()
    const tags = Array.from({ length: 40 }, (_, index) => `#Teg${index}`)
    const caption = instagramDigestCaption({
      header: 'Kun yangiliklari · 10-oktabr',
      items: Array.from({ length: 9 }, () => ({ title: long })),
      cta: INSTAGRAM_DIGEST_CTA,
      hashtags: tags,
    })
    expect(charLength(caption)).toBeLessThanOrEqual(INSTAGRAM_CAPTION_LIMIT)
    expect(caption.match(/#\w+/g)!.length).toBeLessThanOrEqual(INSTAGRAM_HASHTAG_LIMIT)
    expect(caption).toContain('9. ')
    expect(caption).toContain('…')

    const tiny = instagramDigestCaption({
      header: 'H',
      items: [{ title: 'A' }, { title: 'B' }],
      hashtags: tags,
      limit: 60,
    })
    expect(charLength(tiny)).toBeLessThanOrEqual(60)
  })

  it('muqova URL: deterministik, imzo tekshiriladi', () => {
    const params = {
      script: 'uz-Latn' as const,
      slotAt: tashkent('2026-10-10T12:30:00'),
      postIds: [5, 3, 9],
    }
    const url = digestCoverUrl({ ...params, origin: 'https://blog.odya.uz/', secret: 's3cret' })
    expect(url).toBe(
      digestCoverUrl({ ...params, origin: 'https://blog.odya.uz', secret: 's3cret' }),
    )
    expect(url).toMatch(
      /^https:\/\/blog\.odya\.uz\/og\/latn\/digest\/cover\.jpg\?at=\d+&p=5\.3\.9&v=\d+&s=[0-9a-f]{16}$/,
    )
    const search = new URL(url).searchParams
    expect(parseDigestCoverUrl('uz-Latn', search, 's3cret')).toEqual(params)
    expect(parseDigestCoverUrl('uz-Latn', search, 'boshqa')).toBeNull()
    expect(parseDigestCoverUrl('uz-Cyrl', search, 's3cret')).toBeNull()
    const tampered = new URLSearchParams(search)
    tampered.set('p', '5.3.10')
    expect(parseDigestCoverUrl('uz-Latn', tampered, 's3cret')).toBeNull()
  })
})
