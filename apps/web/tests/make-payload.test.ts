import { createHmac } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { resolveMakeConfig } from '@/social/make/config'
import { classifyMakeStatus, makeDeliveryKey } from '@/social/make/deliver'
import {
  buildMakePayload,
  charLength,
  DEFAULT_SOCIAL_IMAGE_STYLE,
  INSTAGRAM_CAPTION_LIMIT,
  instagramCaption,
  leadText,
  type MakePayloadOptions,
  type MakePostInput,
  parseSocialImageFile,
  signMakeBody,
  socialHashtags,
  socialImageUrl,
  socialImageVersion,
  socialPostUrl,
  THREADS_TEXT_LIMIT,
  threadsText,
  xText,
} from '@/social/make/payload'

/** Make.com webhook JSON'i (OBLOG-91) — sof funksiyalar. */

const ORIGIN = 'https://blog.odya.uz'

const POST: MakePostInput = {
  id: 42,
  slug: 'openai-yangi-model',
  title: 'OpenAI yangi modelni taqdim etdi',
  excerpt:
    'Kompaniya yangi sun’iy intellekt modelini e’lon qildi. U avvalgisidan ikki baravar tez. Model bepul foydalanuvchilarga ham ochiladi. Narxlar keyinroq e’lon qilinadi.',
  publishedAt: '2026-10-07T08:00:00.000Z',
  updatedAt: '2026-10-07T08:00:05.000Z',
  isBreaking: false,
  category: { slug: 'suniy-intellekt', name: "Sun'iy intellekt" },
  tags: [
    { slug: 'openai', name: 'OpenAI' },
    { slug: 'chatgpt', name: 'ChatGPT' },
  ],
  hashtagNames: ['OpenAI', 'ChatGPT', "Sun'iy intellekt"],
  coverAlt: 'OpenAI logotipi',
  hasCover: true,
}

const OPTIONS: MakePayloadOptions = {
  event: 'post.published',
  deliveryId: '00000000-0000-4000-8000-000000000001',
  sentAt: '2026-10-07T08:00:06.000Z',
  test: false,
  locale: 'uz-Latn',
  origin: ORIGIN,
  hashtagsCount: 8,
  brandHashtag: '#BlogOdya',
  instagramCta: 'To‘liq maqola — profildagi havolada.',
  instagramImage: 'square',
}

describe('socialHashtags', () => {
  it('lotin, apostroflarsiz, takrorlarsiz, brend oxirida', () => {
    expect(
      socialHashtags(["Sun'iy intellekt", 'O‘yinlar', 'AI', 'ai', 'Кибер спорт', 'G‘alaba!'], {
        count: 8,
        brand: '#BlogOdya',
      }),
    ).toEqual(['#SuniyIntellekt', '#Oyinlar', '#AI', '#Galaba', '#BlogOdya'])
  })

  it('count brend bilan birga; ≤ 15', () => {
    const names = Array.from({ length: 30 }, (_, i) => `Teg${i}`)
    expect(socialHashtags(names, { count: 3, brand: 'BlogOdya' })).toEqual([
      '#Teg0',
      '#Teg1',
      '#BlogOdya',
    ])
    expect(socialHashtags(names, { count: 40, brand: null })).toHaveLength(15)
    expect(socialHashtags(names, { count: 2, brand: '' })).toEqual(['#Teg0', '#Teg1'])
  })

  it('bo‘sh joy, tinish belgilari va bitta harfli teglar tushiriladi', () => {
    expect(socialHashtags(['Next.js 16', 'X', '2026', 'C++'], { count: 8 })).toEqual(['#NextJs16'])
  })
})

describe('leadText', () => {
  it('ko‘pi bilan 3 gap', () => {
    expect(leadText(POST.excerpt)).toBe(
      'Kompaniya yangi sun’iy intellekt modelini e’lon qildi. U avvalgisidan ikki baravar tez. Model bepul foydalanuvchilarga ham ochiladi.',
    )
  })
  it('uzun birinchi gap — qisqartiriladi', () => {
    const lead = leadText('a '.repeat(400), 100)
    expect(lead.length).toBeLessThanOrEqual(100)
    expect(lead.endsWith('…')).toBe(true)
  })
  it('bo‘sh lid', () => {
    expect(leadText(null)).toBe('')
  })
})

describe('instagramCaption', () => {
  it('sarlavha → lid → chaqiruv → heshteglar', () => {
    const caption = instagramCaption({
      title: 'Sarlavha',
      lead: 'Lid matni.',
      cta: 'To‘liq maqola — profildagi havolada.',
      hashtags: ['#AI', '#BlogOdya'],
    })
    expect(caption).toBe(
      'Sarlavha\n\nLid matni.\n\nTo‘liq maqola — profildagi havolada.\n\n#AI #BlogOdya',
    )
  })

  it('≤ 2200 belgi: uzun lid qisqartiriladi, heshteglar qoladi', () => {
    const caption = instagramCaption({
      title: 'Sarlavha',
      lead: 'so‘z '.repeat(1000),
      cta: 'CTA',
      hashtags: ['#AI'],
    })
    expect(charLength(caption)).toBeLessThanOrEqual(INSTAGRAM_CAPTION_LIMIT)
    expect(caption.startsWith('Sarlavha\n\n')).toBe(true)
    expect(caption.endsWith('CTA\n\n#AI')).toBe(true)
  })

  it('juda uzun sarlavha ham chegaraga sig‘adi', () => {
    const caption = instagramCaption({ title: 'x'.repeat(5000), hashtags: ['#AI'] })
    expect(charLength(caption)).toBeLessThanOrEqual(INSTAGRAM_CAPTION_LIMIT)
  })

  it('heshteglar ≤ 15', () => {
    const hashtags = Array.from({ length: 20 }, (_, i) => `#T${i}`)
    const caption = instagramCaption({ title: 'S', hashtags })
    expect(caption.match(/#/g)).toHaveLength(15)
  })
})

describe('threadsText / xText', () => {
  it('Threads ≤ 500, havola oxirida', () => {
    const url = 'https://blog.odya.uz/a/b?utm_source=threads'
    const text = threadsText({ title: 'Sarlavha', lead: 'x '.repeat(600), url })
    expect(charLength(text)).toBeLessThanOrEqual(THREADS_TEXT_LIMIT)
    expect(text.endsWith(url)).toBe(true)
  })
  it('X: sarlavha + havola, URL 23 deb hisoblanadi', () => {
    const text = xText({ title: 'y'.repeat(400), url: 'https://blog.odya.uz/' + 'z'.repeat(200) })
    const [title] = text.split('\n\n')
    expect(charLength(title!) + 2 + 23).toBeLessThanOrEqual(280)
  })
})

describe('URL’lar', () => {
  it('UTM bilan maqola havolasi (lotin / kirill)', () => {
    expect(
      socialPostUrl({
        origin: ORIGIN,
        locale: 'uz-Cyrl',
        categorySlug: 'ai',
        slug: 'x',
        source: 'facebook',
      }),
    ).toBe('https://blog.odya.uz/kr/ai/x?utm_source=facebook&utm_medium=social&utm_campaign=cyrl')
  })
  it('JPEG rasm URL’i va fayl nomini o‘qish', () => {
    expect(
      socialImageUrl({
        origin: ORIGIN,
        postId: 7,
        variant: 'portrait',
        locale: 'uz-Latn',
        version: '123',
      }),
    ).toBe('https://blog.odya.uz/og/latn/social/7/portrait.jpg?v=123')
    expect(parseSocialImageFile('square.jpg')).toBe('square')
    expect(parseSocialImageFile('landscape.jpeg')).toBe('landscape')
    expect(parseSocialImageFile('square.webp')).toBeNull()
    expect(parseSocialImageFile('../x.jpg')).toBeNull()
  })
})

describe('buildMakePayload', () => {
  it('lotin: Instagram caption, rasm, tarmoq maydonlari', () => {
    const payload = buildMakePayload(POST, OPTIONS)
    expect(payload).toMatchObject({
      version: 1,
      event: 'post.published',
      test: false,
      script: 'uz-Latn',
      post: {
        id: 42,
        url: 'https://blog.odya.uz/suniy-intellekt/openai-yangi-model',
        urls: {
          'uz-Latn': 'https://blog.odya.uz/suniy-intellekt/openai-yangi-model',
          'uz-Cyrl': 'https://blog.odya.uz/kr/suniy-intellekt/openai-yangi-model',
        },
        category: { slug: 'suniy-intellekt', name: "Sun'iy intellekt" },
      },
      hashtags: ['#OpenAI', '#ChatGPT', '#SuniyIntellekt', '#BlogOdya'],
    })
    const version = String(Date.parse(POST.updatedAt!) / 1000)
    expect(payload.images.square).toBe(
      `https://blog.odya.uz/og/latn/social/42/square.jpg?v=${version}`,
    )
    expect(payload.instagram.imageUrl).toBe(payload.images.square)
    expect(payload.instagram.caption.split('\n')[0]).toBe('OpenAI yangi modelni taqdim etdi')
    expect(payload.instagram.caption).toContain('To‘liq maqola — profildagi havolada.')
    expect(payload.instagram.caption).not.toContain('https://')
    expect(payload.instagram.caption.endsWith('#OpenAI #ChatGPT #SuniyIntellekt #BlogOdya')).toBe(
      true,
    )
    expect(payload.facebook.link).toContain('utm_source=facebook')
    expect(payload.threads.text).toContain('utm_source=threads')
    expect(payload.x.text).toContain('utm_source=x')
    expect(payload.linkedin.link).toContain('utm_source=linkedin')
    expect(payload.images.width.portrait).toBe(1080)
    expect(payload.images.height.portrait).toBe(1350)
  })

  it('kirill varianti: /kr havolalari, kirill matn, lotin heshteglar, portrait', () => {
    const payload = buildMakePayload(
      { ...POST, title: 'OpenAI янги моделни тақдим этди', excerpt: 'Компания янги модел.' },
      {
        ...OPTIONS,
        locale: 'uz-Cyrl',
        instagramCta: 'Тўлиқ мақола — профилдаги ҳаволада.',
        instagramImage: 'portrait',
      },
    )
    expect(payload.script).toBe('uz-Cyrl')
    expect(payload.post.url).toBe('https://blog.odya.uz/kr/suniy-intellekt/openai-yangi-model')
    expect(payload.instagram.imageUrl).toContain('/og/cyrl/social/42/portrait.jpg')
    expect(payload.instagram.caption).toBe(
      'OpenAI янги моделни тақдим этди\n\nКомпания янги модел.\n\nТўлиқ мақола — профилдаги ҳаволада.\n\n#OpenAI #ChatGPT #SuniyIntellekt #BlogOdya',
    )
    expect(payload.facebook.link).toContain('utm_campaign=cyrl')
  })

  it('OBLOG-94: ?v= — rasm kaliti va shablon sozlamalari xeshi; socialTitle maydoni', () => {
    const withKey = { ...POST, imageKey: '["uz-Latn","GPT-6 chiqdi"]', socialTitle: 'GPT-6 chiqdi' }
    const payload = buildMakePayload(withKey, OPTIONS)
    const version = new URL(payload.instagram.imageUrl).searchParams.get('v')
    expect(version).toBe(socialImageVersion(withKey.imageKey, DEFAULT_SOCIAL_IMAGE_STYLE))
    expect(version).toMatch(/^[0-9a-f]{12}$/)
    expect(payload.post.socialTitle).toBe('GPT-6 chiqdi')
    // updatedAt o'zgarishi rasm URL'iga ta'sir qilmaydi; sarlavha va sozlama — ta'sir qiladi.
    expect(
      buildMakePayload({ ...withKey, updatedAt: '2030-01-01T00:00:00Z' }, OPTIONS).images,
    ).toEqual(payload.images)
    expect(buildMakePayload({ ...withKey, imageKey: 'boshqa' }, OPTIONS).images.square).not.toBe(
      payload.images.square,
    )
    expect(
      buildMakePayload(withKey, { ...OPTIONS, imageStyle: { overlay: false, scheme: 'dark' } })
        .images.square,
    ).not.toBe(payload.images.square)
    // socialTitle yo'q — sarlavha.
    expect(buildMakePayload(POST, OPTIONS).post.socialTitle).toBe(POST.title)
  })
})

describe('imzo va sozlamalar', () => {
  it('X-Odya-Signature = sha256=HMAC(tana)', () => {
    const body = JSON.stringify({ a: 1, t: 'Ўзбек' })
    const expected = createHmac('sha256', 'secret-1234567890').update(body).digest('hex')
    expect(signMakeBody(body, 'secret-1234567890')).toBe(`sha256=${expected}`)
  })

  it('HTTP status tasnifi', () => {
    expect(classifyMakeStatus(200).ok).toBe(true)
    expect(classifyMakeStatus(429)).toMatchObject({ ok: false, retry: true })
    expect(classifyMakeStatus(503)).toMatchObject({ ok: false, retry: true })
    expect(classifyMakeStatus(410)).toMatchObject({ ok: false, retry: false })
    expect(classifyMakeStatus(400)).toMatchObject({ ok: false, retry: false })
  })

  it('kalit', () => {
    expect(makeDeliveryKey(5, 'post.published', 'uz-Cyrl')).toBe('make:5:post.published:uz-Cyrl')
  })

  it('config: standart o‘chiq; URL — global ustun, keyin env; sir faqat env', () => {
    const empty = resolveMakeConfig(null, {})
    expect(empty).toMatchObject({
      enabled: false,
      webhookUrl: undefined,
      scripts: ['uz-Latn'],
      hashtagsCount: 8,
      brandHashtag: '#BlogOdya',
      // OBLOG-97: standart — 4:5 (profil to'rining 3:4 kesimi).
      instagramImage: 'portrait',
      // OBLOG-94: standart — rasm ustida sarlavha, qorong'i sxema.
      imageOverlay: true,
      imageScheme: 'dark',
    })
    expect(resolveMakeConfig({ instagramImage: 'square' }, {}).instagramImage).toBe('square')
    expect(resolveMakeConfig({ imageOverlay: false, imageScheme: 'brand' }, {})).toMatchObject({
      imageOverlay: false,
      imageScheme: 'brand',
    })
    const env = {
      MAKE_WEBHOOK_URL: 'https://hook.eu2.make.com/env',
      MAKE_WEBHOOK_SECRET: 'sir-1234567890abcdef',
    }
    expect(resolveMakeConfig({ enabled: true }, env)).toMatchObject({
      enabled: true,
      webhookUrl: 'https://hook.eu2.make.com/env',
      urlSource: 'env',
      secret: 'sir-1234567890abcdef',
    })
    expect(
      resolveMakeConfig(
        {
          webhookUrl: 'https://hook.eu2.make.com/admin',
          scripts: ['uz-Cyrl', 'uz-Latn'],
          hashtagsCount: 99,
        },
        env,
      ),
    ).toMatchObject({
      webhookUrl: 'https://hook.eu2.make.com/admin',
      urlSource: 'settings',
      scripts: ['uz-Latn', 'uz-Cyrl'],
      hashtagsCount: 15,
    })
    // http:// — e'tiborsiz (validatsiyadan o'tmaydi) → env.
    expect(resolveMakeConfig({ webhookUrl: 'http://x' }, env).webhookUrl).toBe(
      'https://hook.eu2.make.com/env',
    )
  })
})
