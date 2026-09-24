import { describe, expect, it } from 'vitest'

import mediaImageLoader from '@/lib/image-loader'
import { chooseMediaUrl, decodeMediaSrc, encodeMediaSrc, mediaVariants } from '@/lib/media-image'

const BASE = 'https://media.odya.uz'

const media = {
  url: `${BASE}/cover.png`,
  width: 2400,
  sizes: {
    thumb: { url: `${BASE}/cover-320x180.webp`, width: 320 },
    card: { url: `${BASE}/cover-640x360.webp`, width: 640 },
    hero: { url: `${BASE}/cover-1280x720.webp`, width: 1280 },
    og: { url: `${BASE}/cover-1200x630.webp`, width: 1200 },
    full: { url: `${BASE}/cover-1920x1080.webp`, width: 1920 },
  },
}

describe('media variantlari (custom loader, TZ §8.4)', () => {
  it('og (kesilgan) variant tanlovga kirmaydi, tartib — kenglik bo‘yicha', () => {
    expect(mediaVariants(media).map((v) => v.width)).toEqual([320, 640, 1280, 1920])
  })

  it('bo‘sh / yaratilmagan variantlar tashlanadi', () => {
    const small = {
      url: `${BASE}/small.png`,
      sizes: {
        thumb: { url: `${BASE}/small-320x200.webp`, width: 320 },
        card: { url: null, width: null },
        hero: {},
      },
    }
    expect(mediaVariants(small)).toEqual([{ width: 320, url: `${BASE}/small-320x200.webp` }])
  })

  it('encode → decode: bir papkadagi variantlar faqat fayl nomi bilan yoziladi', () => {
    const src = encodeMediaSrc(media)!
    expect(src.startsWith(`${BASE}/cover.png#odya-img=`)).toBe(true)
    expect(src).not.toContain(`${BASE}/cover-640x360.webp`)
    expect(decodeMediaSrc(src)).toEqual({
      base: `${BASE}/cover.png`,
      variants: mediaVariants(media),
    })
  })

  it('boshqa papka / nisbiy URL (Payload orqali) ham to‘g‘ri tiklanadi', () => {
    const local = {
      url: '/api/media/file/a%20b.png',
      sizes: { card: { url: '/api/media/file/a%20b-640x360.webp', width: 640 } },
    }
    const src = encodeMediaSrc(local)!
    expect(chooseMediaUrl(src, 640)).toBe('/api/media/file/a%20b-640x360.webp')
    const other = {
      url: `${BASE}/x/orig.png`,
      sizes: { card: { url: 'https://cdn.example.com/y/card.webp', width: 640 } },
    }
    expect(chooseMediaUrl(encodeMediaSrc(other)!, 100)).toBe('https://cdn.example.com/y/card.webp')
  })

  it('kenglikka eng mos (≥) variant; kattaroq so‘ralsa — eng kattasi', () => {
    const src = encodeMediaSrc(media)!
    expect(chooseMediaUrl(src, 100)).toBe(`${BASE}/cover-320x180.webp`)
    expect(chooseMediaUrl(src, 320)).toBe(`${BASE}/cover-320x180.webp`)
    expect(chooseMediaUrl(src, 321)).toBe(`${BASE}/cover-640x360.webp`)
    expect(chooseMediaUrl(src, 1280)).toBe(`${BASE}/cover-1280x720.webp`)
    expect(chooseMediaUrl(src, 3840)).toBe(`${BASE}/cover-1920x1080.webp`)
  })

  it('loader hech qachon /_next/image qaytarmaydi', () => {
    const src = encodeMediaSrc(media)!
    for (const width of [16, 320, 640, 750, 1080, 1920, 3840]) {
      const url = mediaImageLoader({ src, width, quality: 75 })
      expect(url).not.toContain('/_next/image')
      expect(url.endsWith('.webp')).toBe(true)
    }
  })

  it('variantsiz rasm — asl URL; variantsiz media ham null emas', () => {
    expect(encodeMediaSrc({ url: `${BASE}/raw.gif`, sizes: {} })).toBe(`${BASE}/raw.gif`)
    expect(mediaImageLoader({ src: '/styleguide/cover-ai.svg', width: 640 })).toBe(
      '/styleguide/cover-ai.svg',
    )
    expect(encodeMediaSrc({ url: null, sizes: {} })).toBeNull()
  })

  it('buzilgan fragment xavfsiz o‘qiladi', () => {
    expect(decodeMediaSrc(`${BASE}/a.png#odya-img=abc,:x,0:y,640:`)).toEqual({
      base: `${BASE}/a.png`,
      variants: [],
    })
  })
})
