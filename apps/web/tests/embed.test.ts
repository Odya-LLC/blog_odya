import { describe, expect, it } from 'vitest'

import { parseEmbedUrl } from '@/lib/embed'

describe('embed URL tahlili', () => {
  it.each([
    ['https://www.youtube.com/watch?v=aircAruvnKk', 'aircAruvnKk', undefined],
    ['https://youtu.be/aircAruvnKk?t=90', 'aircAruvnKk', 90],
    ['https://youtube.com/shorts/aircAruvnKk', 'aircAruvnKk', undefined],
    ['https://www.youtube.com/embed/aircAruvnKk?start=15', 'aircAruvnKk', 15],
    ['https://m.youtube.com/watch?v=aircAruvnKk&t=1m30s', 'aircAruvnKk', 90],
    ['https://www.youtube.com/live/aircAruvnKk', 'aircAruvnKk', undefined],
  ])('YouTube: %s', (url, id, start) => {
    const embed = parseEmbedUrl(url)
    expect(embed.kind).toBe('youtube')
    if (embed.kind !== 'youtube') return
    expect(embed.id).toBe(id)
    expect(embed.start).toBe(start)
  })

  it('YouTube: noto‘g‘ri id — oddiy havola', () => {
    expect(parseEmbedUrl('https://www.youtube.com/watch?v=<script>').kind).toBe('link')
    expect(parseEmbedUrl('https://www.youtube.com/@channel').kind).toBe('link')
  })

  it.each([
    [
      'https://x.com/OpenAI/status/1834320155989664067',
      'https://x.com/OpenAI/status/1834320155989664067',
    ],
    ['https://twitter.com/elonmusk/status/123456789/', 'https://x.com/elonmusk/status/123456789'],
    ['https://mobile.twitter.com/i/web/status/42', 'https://x.com/i/web/status/42'],
  ])('X: %s', (url, canonical) => {
    const embed = parseEmbedUrl(url)
    expect(embed).toMatchObject({ kind: 'x', url: canonical })
  })

  it('X: status bo‘lmagan sahifa — havola', () => {
    expect(parseEmbedUrl('https://x.com/OpenAI').kind).toBe('link')
  })

  it.each([
    ['https://t.me/durov/43', 'durov/43'],
    ['https://t.me/s/blogodya/120', 'blogodya/120'],
    ['https://telegram.me/blogodya_kr/7/', 'blogodya_kr/7'],
  ])('Telegram: %s', (url, post) => {
    expect(parseEmbedUrl(url)).toMatchObject({
      kind: 'telegram',
      post,
      url: `https://t.me/${post}`,
    })
  })

  it('Telegram: shaxsiy (t.me/c/…) va kanalning o‘zi — havola', () => {
    expect(parseEmbedUrl('https://t.me/c/123456/78').kind).toBe('link')
    expect(parseEmbedUrl('https://t.me/blogodya').kind).toBe('link')
  })

  it('boshqa sayt — havola; javascript:/bo‘sh/buzilgan — invalid', () => {
    expect(parseEmbedUrl('https://www.theverge.com/x')).toEqual({
      kind: 'link',
      url: 'https://www.theverge.com/x',
    })
    expect(parseEmbedUrl('javascript:alert(1)').kind).toBe('invalid')
    expect(parseEmbedUrl('data:text/html,hi').kind).toBe('invalid')
    expect(parseEmbedUrl('')).toEqual({ kind: 'invalid' })
    expect(parseEmbedUrl('not a url')).toEqual({ kind: 'invalid' })
    expect(parseEmbedUrl(null)).toEqual({ kind: 'invalid' })
  })
})
