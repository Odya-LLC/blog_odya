import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  CACHE_TAGS,
  categoryRevalidationTags,
  categoryTag,
  postRevalidationTags,
  postTag,
} from '@/site/cache-tags'
import { revalidateTags, setRevalidator } from '@/site/revalidate'

describe('kesh teglari: post', () => {
  it('hech qachon chop etilmagan qoralama (autosave) — hech narsa', () => {
    expect(
      postRevalidationTags({ slug: 'a', _status: 'draft' }, { slug: 'a', _status: 'draft' }),
    ).toEqual([])
    expect(postRevalidationTags({ slug: 'a', _status: 'draft' })).toEqual([])
  })

  it('publish: ro‘yxatlar, bosh sahifa va maqola', () => {
    expect(
      postRevalidationTags({ slug: 'a', _status: 'published' }, { slug: 'a', _status: 'draft' }),
    ).toEqual([CACHE_TAGS.posts, CACHE_TAGS.home, postTag('a')])
  })

  it('unpublish (published → draft) ham sahifani yangilaydi', () => {
    expect(
      postRevalidationTags({ slug: 'a', _status: 'draft' }, { slug: 'a', _status: 'published' }),
    ).toContain(postTag('a'))
  })

  it('slug o‘zgarsa — eski va yangi maqola', () => {
    const tags = postRevalidationTags(
      { slug: 'yangi', _status: 'published' },
      { slug: 'eski', _status: 'published' },
    )
    expect(tags).toEqual(expect.arrayContaining([postTag('yangi'), postTag('eski')]))
  })

  it('kategoriya: menyu, ro‘yxatlar va kategoriya sahifasi (eski/yangi slug)', () => {
    expect(categoryRevalidationTags({ slug: 'yangi' }, { slug: 'eski' })).toEqual(
      expect.arrayContaining([
        CACHE_TAGS.nav,
        CACHE_TAGS.posts,
        categoryTag('yangi'),
        categoryTag('eski'),
      ]),
    )
  })
})

describe('revalidateTags', () => {
  afterEach(() => setRevalidator(null))

  it('har bir tegni chaqiradi; disableRevalidate — o‘tkazib yuboradi', () => {
    const spy = vi.fn()
    setRevalidator(spy)
    revalidateTags(['posts', 'home'])
    expect(spy.mock.calls.map(([tag]) => tag)).toEqual(['posts', 'home'])

    spy.mockClear()
    revalidateTags(['posts'], { context: { disableRevalidate: true } } as never)
    expect(spy).not.toHaveBeenCalled()
  })

  it('Next.js kontekstidan tashqarida xato otmaydi (seed, CLI)', () => {
    // Haqiqiy `revalidateTag` — "static generation store missing" xatosi ichkarida yutiladi.
    setRevalidator(null)
    expect(() => revalidateTags(['posts'])).not.toThrow()
  })
})
