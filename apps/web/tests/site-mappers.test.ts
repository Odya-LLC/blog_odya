import { describe, expect, it } from 'vitest'

import { decodeMediaSrc } from '@/lib/media-image'
import type { Category, Media, Post } from '@/payload-types'
import {
  DEFAULT_TELEGRAM,
  telegramChannelUrl,
  telegramHandle,
  toImageRef,
  toLegalLinks,
  toNavCategories,
  toPostSummary,
  toSourceRefs,
  toTelegramLinks,
} from '@/site/mappers'

const category = (slug: string, name: string, extra: Partial<Category> = {}): Category => ({
  id: slug.length,
  slug,
  name,
  updatedAt: '',
  createdAt: '',
  ...extra,
})

const media: Media = {
  id: 7,
  alt: 'Muqova',
  url: 'https://media.odya.uz/a.png',
  width: 1920,
  height: 1080,
  sizes: {
    card: { url: 'https://media.odya.uz/a-640x360.webp', width: 640, height: 360 },
    hero: { url: 'https://media.odya.uz/a-1280x720.webp', width: 1280, height: 720 },
  },
  updatedAt: '',
  createdAt: '',
}

const post = (extra: Partial<Post> = {}): Post => ({
  id: 1,
  title: 'Sarlavha',
  slug: 'sarlavha',
  category: category('kibersport', 'Kibersport'),
  workflowStatus: 'published',
  publishedAt: '2026-09-24T08:00:00.000Z',
  readingTime: 4,
  updatedAt: '2026-09-24T09:00:00.000Z',
  createdAt: '2026-09-23T08:00:00.000Z',
  ...extra,
})

describe('Payload → UI modeli', () => {
  it('kartochka: lotin va kirill URL, muqova variantlari bilan', () => {
    const latn = toPostSummary(post({ coverImage: media, isBreaking: true }), 'uz-Latn')!
    expect(latn).toMatchObject({
      href: '/kibersport/sarlavha',
      category: { slug: 'kibersport', href: '/kibersport' },
      readingTime: 4,
      isBreaking: true,
      publishedAt: '2026-09-24T08:00:00.000Z',
    })
    expect(decodeMediaSrc(latn.cover!.src).variants).toHaveLength(2)
    expect(latn.cover).toMatchObject({ alt: 'Muqova', width: 1920, height: 1080 })

    const cyrl = toPostSummary(post(), 'uz-Cyrl')!
    expect(cyrl.href).toBe('/kr/kibersport/sarlavha')
    expect(cyrl.cover).toBeNull()
  })

  it('kategoriyasi populyatsiya qilinmagan post — null; publishedAt yo‘q — createdAt', () => {
    expect(toPostSummary(post({ category: 3 }), 'uz-Latn')).toBeNull()
    expect(toPostSummary(post({ publishedAt: null }), 'uz-Latn')!.publishedAt).toBe(
      '2026-09-23T08:00:00.000Z',
    )
  })

  it('rasm: id (populyatsiyasiz) yoki o‘lchamsiz — null', () => {
    expect(toImageRef(7)).toBeNull()
    expect(toImageRef({ ...media, width: null })).toBeNull()
  })

  it('manbalar: faqat http(s)', () => {
    expect(
      toSourceRefs([
        { name: 'The Verge', url: 'https://www.theverge.com/x' },
        { url: 'javascript:alert(1)' },
        { url: 'http://example.com' },
      ]),
    ).toEqual([
      { name: 'The Verge', url: 'https://www.theverge.com/x' },
      { name: null, url: 'http://example.com' },
    ])
  })

  it('menyu: header global bo‘lsa — undan (yorliq bilan), aks holda kategoriyalar tartibi', () => {
    const ai = category('suniy-intellekt', 'Sunʼiy intellekt', { order: 1 })
    const fan = category('ilm-fan', 'Ilm-fan', { order: 9, isInMenu: false })
    const nav = toNavCategories(
      {
        navItems: [{ type: 'category', category: ai, label: 'AI' }],
        moreItems: [
          { type: 'category', category: fan, label: 'Илм-фан' },
          { type: 'custom', url: 'https://x', label: 'X' },
        ],
      },
      [],
      'uz-Cyrl',
    )
    expect(nav).toEqual([
      { slug: 'suniy-intellekt', name: 'AI', href: '/kr/suniy-intellekt', isInMenu: true },
      { slug: 'ilm-fan', name: 'Илм-фан', href: '/kr/ilm-fan', isInMenu: false },
    ])
    expect(toNavCategories({ navItems: [], moreItems: [] }, [fan, ai], 'uz-Latn')).toEqual([
      {
        slug: 'suniy-intellekt',
        name: 'Sunʼiy intellekt',
        href: '/suniy-intellekt',
        isInMenu: true,
      },
      { slug: 'ilm-fan', name: 'Ilm-fan', href: '/ilm-fan', isInMenu: false },
    ])
  })

  it('footer: sahifa va ixtiyoriy havolalar', () => {
    expect(
      toLegalLinks(
        {
          columns: [
            { links: [{ type: 'category', category: 1, label: 'AI' }] },
            {
              links: [
                { type: 'page', page: { slug: 'aloqa' } as never, label: 'Алоқа' },
                { type: 'page', page: 5, label: 'Populyatsiyasiz' },
                { type: 'custom', url: 'https://odya.uz', label: 'Odya' },
              ],
            },
          ],
        },
        'uz-Cyrl',
      ),
    ).toEqual([
      { label: 'Алоқа', href: '/kr/aloqa' },
      { label: 'Odya', href: 'https://odya.uz' },
    ])
  })

  it('Telegram: site-settings → env → namuna', () => {
    expect(toTelegramLinks(null)).toEqual(DEFAULT_TELEGRAM)
    expect(
      toTelegramLinks(
        { socials: [{ platform: 'telegram_cyrl', url: 'https://t.me/odya_kr' }] },
        { TELEGRAM_CHANNEL_LATN: '@odya_latn', TELEGRAM_CHANNEL_CYRL: '@ignored' },
      ),
    ).toEqual({ 'uz-Latn': 'https://t.me/odya_latn', 'uz-Cyrl': 'https://t.me/odya_kr' })
    expect(telegramChannelUrl('https://evil.example/x')).toBeNull()
    expect(telegramHandle('https://t.me/blogodya')).toBe('@blogodya')
    expect(telegramHandle('https://t.me/+invite')).toBeUndefined()
  })
})
