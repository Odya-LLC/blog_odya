import { readdirSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  RESERVED_SLUGS,
  ROUTE_RESERVED_SLUGS,
  SLUG_PATTERN,
  slugCollisionMessage,
  validateRouteSlug,
  validateSlug,
} from '@/lib/slug'
import { resolveSiteRoute } from '@/site/route'

const APP_DIR = path.resolve(__dirname, '../src/app')

/** `app/` ichidagi ildiz darajasidagi statik marshrut papkalari (route group'lar ochiladi). */
function topLevelRouteSegments(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      if (/^\(.+\)$/.test(entry.name)) return topLevelRouteSegments(path.join(dir, entry.name))
      if (entry.name.startsWith('[') || entry.name.startsWith('_')) return []
      return [entry.name]
    })
}

/** M1-07: kategoriya/statik sahifa slug'i sayt marshrutlari bilan to'qnashmasligi (TZ §8.1). */
describe('ildiz darajasidagi slug to‘qnashuvlari', () => {
  it('kr, tag, author, search, bot, api, admin, og, feeds… — band', () => {
    for (const slug of [
      'kr',
      'tag',
      'author',
      'search',
      'bot',
      'api',
      'admin',
      'og',
      'feeds',
      'sitemaps',
      'page',
    ]) {
      expect(validateRouteSlug(slug), slug).not.toBe(true)
    }
    expect(validateRouteSlug('aloqa')).toBe(true)
    expect(validateRouteSlug('kibersport')).toBe(true)
  })

  it('app/ dagi har bir ildiz papka (slug shaklida bo‘lsa) band qilingan', () => {
    const segments = topLevelRouteSegments(APP_DIR).filter((name) => SLUG_PATTERN.test(name))
    expect(segments).toEqual(expect.arrayContaining(['admin', 'api', 'search', 'og', 'feeds']))
    for (const segment of segments) {
      expect(ROUTE_RESERVED_SLUGS as readonly string[], segment).toContain(segment)
    }
  })

  it('catch-all dispetcheri band qilgan birinchi segmentlar ham ro‘yxatda', () => {
    for (const slug of ROUTE_RESERVED_SLUGS) {
      if (!SLUG_PATTERN.test(slug)) continue
      // Bu slug'li kategoriya/sahifa bo'lganida `resolveSiteRoute` uni kategoriya deb hal qilmasligi
      // kerak bo'lgan holatlar: `bot`, `tag`, `author` — maxsus marshrutlar.
      if (['bot', 'tag', 'author'].includes(slug)) {
        expect(resolveSiteRoute([slug]).kind, slug).not.toBe('category')
      }
    }
  })

  it('oddiy slug (teg, muallif, post) uchun faqat asosiy band so‘zlar', () => {
    expect(validateSlug('search')).toBe(true)
    expect(validateSlug('tag')).toBe(true)
    for (const slug of RESERVED_SLUGS) expect(validateSlug(slug)).not.toBe(true)
  })

  it('format xatolari ikkala validatorda bir xil', () => {
    for (const bad of ['Katta', 'a--b', '-a', 'a_b', 'ў']) {
      expect(validateRouteSlug(bad)).not.toBe(true)
      expect(validateSlug(bad)).not.toBe(true)
    }
    expect(validateRouteSlug('')).toBe(true)
    expect(validateRouteSlug(null)).toBe(true)
  })

  it('kategoriya ↔ sahifa xabari', () => {
    expect(slugCollisionMessage('aloqa', 'pages')).toContain('sahifa')
    expect(slugCollisionMessage('kibersport', 'categories')).toContain('kategoriya')
  })
})
