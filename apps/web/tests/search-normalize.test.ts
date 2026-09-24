import { describe, expect, it } from 'vitest'

import {
  CYRILLIC_SINGLE_FROM,
  CYRILLIC_SINGLE_TO,
  hasCyrillic,
  normalizeSearchText,
  parseSearchQuery,
  SEARCH_MAX_TERMS,
  SEARCH_QUERY_MAX_LENGTH,
} from '@/site/search/normalize'

/**
 * Qidiruv kaliti (M1-07): apostrof variantlari, kirill → lotin, `ye → e`. SQL egizagi
 * (`odya_search_normalize`) bilan bir xilligi — `search.int.test.ts`.
 */
describe('qidiruv normalizatsiyasi', () => {
  it.each([
    // oʻ / gʻ: U+02BB, ASCII, U+2018, U+2019, backtick, U+02BC — barchasi bitta shaklga
    ['Oʻzbekiston', 'ozbekiston'],
    ["O'zbekiston", 'ozbekiston'],
    ['O‘zbekiston', 'ozbekiston'],
    ['O’zbekiston', 'ozbekiston'],
    ['O`zbekiston', 'ozbekiston'],
    ['Ozbekiston', 'ozbekiston'],
    ['gʻalaba', 'galaba'],
    ["g'alaba", 'galaba'],
    ['Sunʼiy', 'suniy'],
    ["sun'iy", 'suniy'],
  ])('lotin: %s → %s', (input, expected) => {
    expect(normalizeSearchText(input)).toBe(expected)
  })

  it.each([
    ['Ўзбекистон', 'ozbekiston'],
    ['ғалаба', 'galaba'],
    ['Сунъий интеллект', 'suniy intellekt'],
    ['ШАХМАТ', 'shaxmat'],
    ['Чемпионат', 'chempionat'],
    ['Ёшлар', 'yoshlar'],
    ['юлдуз', 'yulduz'],
    ['янгилик', 'yangilik'],
    ['қидирув', 'qidiruv'],
    ['ҳафта', 'hafta'],
    ['центр', 'tsentr'],
    ['Эълон', 'elon'],
    ['компьютер', 'kompyuter'],
  ])('kirill → lotin: %s → %s', (input, expected) => {
    expect(normalizeSearchText(input)).toBe(expected)
  })

  it('kirill `е` va lotin `ye` bir xil kalit beradi', () => {
    expect(normalizeSearchText('Етакчи')).toBe(normalizeSearchText('Yetakchi'))
    expect(normalizeSearchText('келажак')).toBe(normalizeSearchText('kelajak'))
  })

  it('kirill va lotin matn bir xil kalitga keladi', () => {
    expect(normalizeSearchText('Сунъий интеллект янгиликлари қандай тайёрланади')).toBe(
      normalizeSearchText('Sunʼiy intellekt yangiliklari qanday tayyorlanadi'),
    )
  })

  it('tinish belgilari → bo‘shliq, bo‘shliqlar siqiladi', () => {
    expect(normalizeSearchText('  CS2:  Major — final!  ')).toBe('cs2 major final')
    expect(normalizeSearchText('iPhone 17 Pro')).toBe('iphone 17 pro')
    expect(normalizeSearchText('')).toBe('')
    expect(normalizeSearchText(null)).toBe('')
  })

  it('translate() jadvali: harflar soni teng (SQL bilan bir xil)', () => {
    expect([...CYRILLIC_SINGLE_FROM]).toHaveLength([...CYRILLIC_SINGLE_TO].length)
  })

  it('yozuvni aniqlash', () => {
    expect(hasCyrillic('Ўзбекистон')).toBe(true)
    expect(hasCyrillic('Oʻzbekiston')).toBe(false)
  })
})

describe('?q= tahlili', () => {
  it('bo‘sh yoki juda qisqa so‘rov — qidirilmaydi', () => {
    expect(parseSearchQuery(undefined)).toBeNull()
    expect(parseSearchQuery('')).toBeNull()
    expect(parseSearchQuery('   ')).toBeNull()
    expect(parseSearchQuery('a')).toBeNull()
    expect(parseSearchQuery("'")).toBeNull()
    expect(parseSearchQuery('—!?')).toBeNull()
  })

  it('prefiks tsquery, takroriy so‘zlarsiz', () => {
    expect(parseSearchQuery('Sunʼiy intellekt sunʼiy')).toEqual({
      display: 'Sunʼiy intellekt sunʼiy',
      normalized: 'suniy intellekt',
      terms: ['suniy', 'intellekt'],
      tsquery: 'suniy:* & intellekt:*',
    })
    expect(parseSearchQuery('Ўзбекистон')?.tsquery).toBe('ozbekiston:*')
    expect(parseSearchQuery(['cs2', 'ignored'])?.tsquery).toBe('cs2:*')
  })

  it('tsquery faqat [a-z0-9] so‘zlardan — maxsus belgilar o‘tmaydi (injection)', () => {
    const query = parseSearchQuery("x'); DROP TABLE posts; -- & | ! :* <-> (a)")
    expect(query?.tsquery).toMatch(/^[a-z0-9]+:\*( & [a-z0-9]+:\*)*$/)
    expect(query?.tsquery).toBe('x:* & drop:* & table:* & posts:* & a:*')
  })

  it('uzunlik va so‘zlar soni cheklangan', () => {
    const long = parseSearchQuery('a'.repeat(500))
    expect(long?.display).toHaveLength(SEARCH_QUERY_MAX_LENGTH)
    const many = parseSearchQuery(Array.from({ length: 20 }, (_, i) => `soz${i}`).join(' '))
    expect(many?.terms).toHaveLength(SEARCH_MAX_TERMS)
  })
})
