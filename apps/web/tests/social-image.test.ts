import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'

import type { FontMetrics } from '@/social/font-metrics'
import { measureText } from '@/social/font-metrics'
import {
  fitSocialTitle,
  loadTitleMetrics,
  renderSocialImage,
  socialGridInset,
  socialSafeArea,
  type SocialImageDeps,
  type SocialImageInput,
} from '@/social/image'
import { SOCIAL_IMAGE_SIZES } from '@/social/make/payload'
import {
  cleanSocialTitle,
  fitTitle,
  resolveSocialTitle,
  shortenTitle,
  truncateWords,
} from '@/social/title'

/**
 * Ijtimoiy rasm shabloni (OBLOG-94): qisqa sarlavha manbai, sig'dirish, JPEG o'lchami va
 * formati, kirill, muqovasiz holat. Namuna rasmlar: `SOCIAL_SAMPLES_DIR=... pnpm vitest run
 * tests/social-image.test.ts` — har holat shu papkaga `.jpg` bo'lib yoziladi (vizual tekshiruv).
 */

const SAMPLES_DIR = process.env.SOCIAL_SAMPLES_DIR

async function saveSample(name: string, body: Buffer) {
  if (!SAMPLES_DIR) return
  await mkdir(SAMPLES_DIR, { recursive: true })
  await writeFile(path.join(SAMPLES_DIR, name), body)
}

/** Bir xil rangli muqova — gradientlar faqat vertikal, demak matn bo'lmagan ustunlar bir xil. */
async function solidCover(): Promise<Buffer> {
  return sharp({
    create: { width: 1600, height: 1000, channels: 3, background: { r: 128, g: 128, b: 128 } },
  })
    .jpeg({ quality: 95 })
    .toBuffer()
}

/**
 * `[left, left + width)` ustunlarida har qator gorizontal bo'yicha bir xilmi (matn, chip, wordmark
 * yo'q). Qaytaradi: qatorlar ichidagi eng katta farq (0–255).
 */
async function maxRowSpread(body: Buffer, left: number, width: number): Promise<number> {
  const { data, info } = await sharp(body)
    .extract({ left, top: 0, width, height: (await sharp(body).metadata()).height! })
    .raw()
    .toBuffer({ resolveWithObject: true })
  let spread = 0
  for (let y = 0; y < info.height; y += 1) {
    for (let c = 0; c < info.channels; c += 1) {
      let min = 255
      let max = 0
      for (let x = 0; x < info.width; x += 1) {
        const value = data[(y * info.width + x) * info.channels + c]!
        if (value < min) min = value
        if (value > max) max = value
      }
      spread = Math.max(spread, max - min)
    }
  }
  return spread
}

/** "Fotosurat"ga o'xshash muqova: yorug' osmon (eng yomon holat — oq fon ustida oq matn). */
async function syntheticCover(width = 1600, height = 1000): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f8fbff"/><stop offset="0.6" stop-color="#cfe3ff"/>
        <stop offset="1" stop-color="#f3efe6"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#sky)"/>
    <circle cx="${width * 0.72}" cy="${height * 0.3}" r="${height * 0.16}" fill="#fff7d6"/>
    <rect x="${width * 0.18}" y="${height * 0.45}" width="${width * 0.22}" height="${height * 0.55}" fill="#e9eef5"/>
    <rect x="${width * 0.46}" y="${height * 0.35}" width="${width * 0.16}" height="${height * 0.65}" fill="#ffffff"/>
    <rect x="${width * 0.66}" y="${height * 0.55}" width="${width * 0.2}" height="${height * 0.45}" fill="#dfe7f1"/>
  </svg>`
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer()
}

const LONG_TITLE =
  'Apple iPhone 18 Pro Max’ning yangi kamerasi, batareyasi va sun’iy intellekt funksiyalari haqida bilishingiz kerak bo‘lgan barcha tafsilotlar va narxlar'

let metrics: FontMetrics
let cover: Buffer
let deps: SocialImageDeps

beforeAll(async () => {
  metrics = await loadTitleMetrics()
  cover = await syntheticCover()
  deps = {
    fetch: async () =>
      new Response(new Uint8Array(cover), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      }),
  }
})

const base: Omit<SocialImageInput, 'variant'> = {
  locale: 'uz-Latn',
  title: 'OpenAI GPT-6 modelini taqdim etdi: o‘zbek tilini ham tushunadi',
  category: { name: 'Sun’iy intellekt', slug: 'suniy-intellekt' },
  cover: { url: 'https://cdn.test/cover.jpg', focalX: 50, focalY: 40 },
  domain: 'blog.odya.uz',
}

describe('qisqa sarlavha manbai', () => {
  it('socialTitle ustun; bo‘lmasa — title, keyin meta.title', () => {
    expect(resolveSocialTitle({ socialTitle: '  GPT-6 chiqdi  ', title: 'Uzun sarlavha' })).toBe(
      'GPT-6 chiqdi',
    )
    expect(resolveSocialTitle({ socialTitle: '', title: 'OpenAI GPT-6 ni taqdim etdi.' })).toBe(
      'OpenAI GPT-6 ni taqdim etdi',
    )
    expect(
      resolveSocialTitle({ title: LONG_TITLE, metaTitle: 'iPhone 18 Pro Max: kamera va narx' }),
    ).toBe('iPhone 18 Pro Max: kamera va narx')
  })

  it('aqlli qisqartirish: ":" gacha qism yoki so‘z bo‘yicha "…"', () => {
    expect(
      shortenTitle(
        'Samsung Galaxy S27 Ultra taqdim etildi: kamera, batareya, narx va O‘zbekistonda sotuvga chiqish sanasi',
      ),
    ).toBe('Samsung Galaxy S27 Ultra taqdim etildi')
    const short = shortenTitle(LONG_TITLE)
    expect([...short].length).toBeLessThanOrEqual(70)
    expect(short.endsWith('…')).toBe(true)
    expect(short).not.toMatch(/\s…$/)
    expect(truncateWords('bir ikki uch', 70)).toBe('bir ikki uch')
    expect(cleanSocialTitle('Yangilik — Blog Odya')).toBe('Yangilik')
  })
})

describe('sarlavhani sig‘dirish', () => {
  it('qisqa sarlavha — katta shrift, ≤ 4 qator', () => {
    const fitted = fitSocialTitle('GPT-6 chiqdi', 'square', metrics)
    expect(fitted.fontSize).toBe(84)
    expect(fitted.lines).toEqual(['GPT-6 chiqdi'])
    expect(fitted.truncated).toBe(false)
  })

  it('70 belgilik sarlavha — shrift kichrayadi, lekin qisqarmaydi', () => {
    const title = 'O‘zbekistonda sun’iy intellekt bo‘yicha yangi milliy strategiya qabul qilindi'
    const fitted = fitSocialTitle(title, 'square', metrics)
    expect(fitted.lines.length).toBeLessThanOrEqual(4)
    expect(fitted.truncated).toBe(false)
    expect(fitted.lines.join(' ')).toBe(title)
    for (const line of fitted.lines) {
      expect(measureText(metrics, line, fitted.fontSize, -0.02)).toBeLessThanOrEqual(1080 - 360)
    }
  })

  it('juda uzun — 4 qator, oxiri "…"', () => {
    const fitted = fitSocialTitle(`${LONG_TITLE} ${LONG_TITLE}`, 'portrait', metrics)
    expect(fitted.lines).toHaveLength(4)
    expect(fitted.truncated).toBe(true)
    expect(fitted.lines[3]!.endsWith('…')).toBe(true)
    const landscape = fitSocialTitle(LONG_TITLE, 'landscape', metrics)
    expect(landscape.lines.length).toBeLessThanOrEqual(3)
  })

  it('bo‘linmaydigan uzun so‘z — belgilar bo‘yicha bo‘linadi', () => {
    const fitted = fitTitle('a'.repeat(200), metrics, { width: 400, maxLines: 2, sizes: [60] })
    expect(fitted.lines).toHaveLength(2)
    expect(fitted.lines[1]!.endsWith('…')).toBe(true)
  })

  it('kirill va o‘zbek apostroflari shriftda bor', () => {
    for (const char of [...'ʻʼ‘’…ЎўҚқҒғҲҳЁё']) {
      expect(metrics.advance(char.codePointAt(0)!)).not.toBeNull()
    }
  })
})

describe('JPEG rasm', () => {
  it.each([
    ['square', 'latn-square.jpg'],
    ['portrait', 'latn-portrait.jpg'],
    ['landscape', 'latn-landscape.jpg'],
  ] as const)('%s: muqova + sarlavha, JPEG va o‘lcham', async (variant, file) => {
    const { body, source } = await renderSocialImage({ ...base, variant }, deps)
    await saveSample(file, body)
    expect(source).toBe('cover')
    const meta = await sharp(body).metadata()
    expect(meta).toMatchObject({ format: 'jpeg', ...SOCIAL_IMAGE_SIZES[variant] })
    // Pastki qism qorong'i (gradient) — yorug' muqovada ham sarlavha o'qiladi.
    const { width, height } = SOCIAL_IMAGE_SIZES[variant]
    const bottom = await sharp(body)
      .extract({ left: 0, top: height - 20, width, height: 20 })
      .toBuffer()
      .then((strip) => sharp(strip).stats())
    expect(bottom.channels[0]!.mean).toBeLessThan(60)
  })

  it('kirill, brend sxemasi', async () => {
    const { body } = await renderSocialImage(
      {
        ...base,
        variant: 'square',
        locale: 'uz-Cyrl',
        title: 'OpenAI GPT-6 моделини тақдим этди: ўзбек тилини ҳам тушунади',
        category: { name: 'Сунъий интеллект', slug: 'suniy-intellekt' },
        domain: 'blog.odya.uz/kr',
        scheme: 'brand',
      },
      deps,
    )
    expect(await sharp(body).metadata()).toMatchObject({ format: 'jpeg', width: 1080 })
    await saveSample('cyrl-square-brand.jpg', body)
  })

  it('uzun sarlavha (qisqartirish) — portrait', async () => {
    const { body } = await renderSocialImage(
      { ...base, variant: 'portrait', title: `${LONG_TITLE} ${LONG_TITLE}` },
      deps,
    )
    expect(await sharp(body).metadata()).toMatchObject({ width: 1080, height: 1350 })
    await saveSample('latn-portrait-long.jpg', body)
  })

  it('muqovasiz — brend kartochkasi (shu dizayn)', async () => {
    const { body, source } = await renderSocialImage({ ...base, variant: 'square', cover: null })
    expect(source).toBe('card')
    expect(await sharp(body).metadata()).toMatchObject({
      format: 'jpeg',
      width: 1080,
      height: 1080,
    })
    await saveSample('latn-square-no-cover.jpg', body)
  })

  // OBLOG-97: Instagram profil to'ri 3:4 plitka — markazdan kesadi.
  it('profil to‘ri: xavfsiz zona kesimdan kamida 40 px ichkarida', () => {
    expect(socialGridInset('square')).toBe(135)
    expect(socialGridInset('portrait')).toBe(34)
    expect(socialGridInset('landscape')).toBe(0)
    for (const variant of ['square', 'portrait'] as const) {
      expect(socialSafeArea(variant).x - socialGridInset(variant)).toBeGreaterThanOrEqual(40)
    }
  })

  it.each(['square', 'portrait'] as const)(
    '%s: 3:4 kesimdan tashqarida matn/chip/wordmark yo‘q',
    async (variant) => {
      const solid = await solidCover()
      const solidDeps: SocialImageDeps = {
        fetch: async () => new Response(new Uint8Array(solid), { status: 200 }),
      }
      const { body, source } = await renderSocialImage(
        {
          ...base,
          variant,
          title: `${LONG_TITLE} ${LONG_TITLE}`,
          category: { name: 'Juda uzun kategoriya nomi: texnologiya va innovatsiyalar' },
        },
        solidDeps,
      )
      expect(source).toBe('cover')
      await saveSample(`grid-safe-${variant}.jpg`, body)
      const inset = socialGridInset(variant)
      const { width } = SOCIAL_IMAGE_SIZES[variant]
      // Kesiladigan chap va o'ng chiziqlar — faqat vertikal gradient (har qator bir xil rang).
      expect(await maxRowSpread(body, 0, inset)).toBeLessThanOrEqual(8)
      expect(await maxRowSpread(body, width - inset, inset)).toBeLessThanOrEqual(8)
      // Nazorat: xavfsiz zona ichida esa matn bor.
      const safe = socialSafeArea(variant).x
      expect(await maxRowSpread(body, safe, width - safe * 2)).toBeGreaterThan(100)
    },
  )

  it('muqova yuklanmasa — kartochka; overlay o‘chiq — oddiy kesim', async () => {
    const errors: unknown[] = []
    const failing: SocialImageDeps = { fetch: async () => new Response('', { status: 404 }) }
    const fallback = await renderSocialImage({ ...base, variant: 'portrait' }, failing, (error) =>
      errors.push(error),
    )
    expect(fallback.source).toBe('card')
    expect(errors).toHaveLength(1)

    const plain = await renderSocialImage({ ...base, variant: 'square', overlay: false }, deps)
    expect(plain.source).toBe('cover')
    // Sarlavhasiz kesim — pastki qism yorug' (muqovaning o'zi).
    const bottom = await sharp(plain.body)
      .extract({ left: 0, top: 1060, width: 1080, height: 20 })
      .toBuffer()
      .then((strip) => sharp(strip).stats())
    expect(bottom.channels[0]!.mean).toBeGreaterThan(150)
  })
})
