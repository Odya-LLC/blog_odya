import { describe, expect, it } from 'vitest'

import {
  dedupeSlug,
  isReservedSlug,
  isValidSlug,
  RESERVED_SLUGS,
  SLUG_MAX_LENGTH,
  slugifyUz,
  truncateSlug,
  validateSlug,
} from './slugify-uz'

describe('slugifyUz: asosiy qoidalar', () => {
  it.each([
    ['iPhone 18 narxi maʼlum boʻldi', 'iphone-18-narxi-malum-boldi'],
    ['Salom Dunyo', 'salom-dunyo'],
    ['  Boshida   va   oxirida  ', 'boshida-oxirida'],
    ['Sunʼiy intellekt', 'suniy-intellekt'],
    ['Oʻzbekiston', 'ozbekiston'],
    ["O'zbekiston", 'ozbekiston'],
    ['O‘zbekiston', 'ozbekiston'],
    ['O’zbekiston', 'ozbekiston'],
    ['O`zbekiston', 'ozbekiston'],
    ['Gʻalaba', 'galaba'],
    ["g'alaba", 'galaba'],
    ['Shahar choyxonasi', 'shahar-choyxonasi'],
    ['Tong otdi', 'tong-otdi'],
    ['Ilm-fan', 'ilm-fan'],
    ['2026-yil 1-sentabr', '2026-yil-1-sentabr'],
    ['CS2: Major finali!', 'cs2-major-finali'],
    ['Nima? Qayerda? Qachon?', 'nima-qayerda-qachon'],
    ['C++ va C#', 'c-c'],
    ['Café résumé naïve', 'cafe-resume-naive'],
    ['Tom & Jerry', 'tom-jerry'],
    ['---', ''],
    ['', ''],
  ])('%s → %s', (input, slug) => {
    expect(slugifyUz(input)).toBe(slug)
  })
})

describe('slugifyUz: kirill matn', () => {
  it.each([
    ['Сунъий интеллект', 'suniy-intellekt'],
    ['Ўйинлар', 'oyinlar'],
    ['Ғалаба', 'galaba'],
    ['Шаҳар ва қишлоқ', 'shahar-qishloq'],
    ['Европа', 'yevropa'],
    ['Цирк', 'sirk'],
    ['Щука', 'shuka'],
    ['Ёшлар', 'yoshlar'],
  ])('%s → %s', (input, slug) => {
    expect(slugifyUz(input)).toBe(slug)
  })
})

describe('slugifyUz: stop-so‘zlar', () => {
  it('va/bilan/uchun olib tashlanadi', () => {
    expect(slugifyUz('Apple va Samsung bilan raqobat uchun')).toBe('apple-samsung-raqobat')
  })
  it('inglizcha stop-so‘zlar', () => {
    expect(slugifyUz('The Last of Us')).toBe('last-us')
  })
  it('hammasi stop-so‘z bo‘lsa — qoldiriladi', () => {
    expect(slugifyUz('va')).toBe('va')
  })
  it('removeStopWords: false', () => {
    expect(slugifyUz('Olma va nok', { removeStopWords: false })).toBe('olma-va-nok')
  })
})

describe('slugifyUz: uzunlik', () => {
  const long =
    'Sunʼiy intellekt boʻyicha yangi qonun loyihasi parlamentda muhokama qilindi va maʼqullandi'

  it(`≤ ${SLUG_MAX_LENGTH} belgi`, () => {
    expect(slugifyUz(long).length).toBeLessThanOrEqual(SLUG_MAX_LENGTH)
  })
  it('so‘z chegarasida kesiladi', () => {
    const slug = slugifyUz(long)
    expect(slug.endsWith('-')).toBe(false)
    expect(long.toLowerCase()).toContain(slug.split('-').at(-1)!.slice(0, 3))
  })
  it('bitta uzun so‘z — qattiq kesiladi', () => {
    expect(truncateSlug('a'.repeat(80))).toHaveLength(SLUG_MAX_LENGTH)
  })
  it('maxLength opsiyasi', () => {
    expect(slugifyUz('bir ikki uch tort', { maxLength: 8 })).toBe('bir-ikki')
  })
})

describe('zaxiralangan slug’lar va validatsiya', () => {
  it('kr zaxiralangan', () => {
    expect(RESERVED_SLUGS).toContain('kr')
    expect(isReservedSlug('kr')).toBe(true)
    expect(isReservedSlug('KR')).toBe(true)
  })
  it.each(['tag', 'author', 'search', 'page', 'api', 'admin', 'sitemap'])(
    '%s zaxiralangan',
    (s) => {
      expect(isReservedSlug(s)).toBe(true)
    },
  )
  it('oddiy slug zaxiralanmagan', () => {
    expect(isReservedSlug('kibersport')).toBe(false)
  })
  it('validateSlug', () => {
    expect(validateSlug('kibersport')).toBe(true)
    expect(validateSlug('kr')).toMatch(/zaxiralangan/)
    expect(validateSlug('kr', { checkReserved: false })).toBe(true)
    expect(validateSlug('Katta')).toMatch(/kichik/)
    expect(validateSlug('a--b')).toMatch(/kichik/)
    expect(validateSlug('')).toMatch(/shart/)
    expect(validateSlug('a'.repeat(61))).toMatch(/60/)
  })
  it('isValidSlug', () => {
    expect(isValidSlug('ilm-fan')).toBe(true)
    expect(isValidSlug('-ilm')).toBe(false)
  })
})

describe('dedupeSlug', () => {
  it('bo‘sh bo‘lsa — asl slug', async () => {
    expect(await dedupeSlug('yangilik', () => false)).toBe('yangilik')
  })
  it('band bo‘lsa — -2, -3', async () => {
    const taken = new Set(['yangilik', 'yangilik-2'])
    expect(await dedupeSlug('yangilik', (s) => taken.has(s))).toBe('yangilik-3')
  })
  it('async tekshiruv', async () => {
    expect(await dedupeSlug('a', async (s) => s === 'a')).toBe('a-2')
  })
  it('zaxiralangan slug band hisoblanadi (checkReserved)', async () => {
    expect(await dedupeSlug('kr', () => false, { checkReserved: true })).toBe('kr-2')
  })
  it('uzunlik chegarasi suffiks bilan ham saqlanadi', async () => {
    const base = slugifyUz('soʻz '.repeat(30))
    const result = await dedupeSlug(base, (s) => s === base)
    expect(result.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH)
    expect(result.endsWith('-2')).toBe(true)
  })
})
