import type { Field, SanitizedConfig } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import configPromise from '@/payload.config'

/**
 * Sxema TZ §10 bo'yicha: kolleksiyalar, globals va **(L)** (lokalizatsiya) belgilari.
 * DB kerak emas — faqat sanitizatsiya qilingan config tekshiriladi.
 */
let config: SanitizedConfig

/** Nomli maydonlar (tabs/row/collapsible ichidagilar ham) — `group.child` yo'llari bilan. */
function namedFields(fields: Field[], prefix = ''): Map<string, Field> {
  const result = new Map<string, Field>()
  for (const field of fields) {
    if ('name' in field && field.name) {
      const path = `${prefix}${field.name}`
      result.set(path, field)
      if (field.type === 'group' && 'fields' in field) {
        for (const [key, value] of namedFields(field.fields, `${path}.`)) result.set(key, value)
      }
    } else if (field.type === 'tabs') {
      for (const tab of field.tabs) {
        const tabPrefix = 'name' in tab && tab.name ? `${prefix}${tab.name}.` : prefix
        for (const [key, value] of namedFields(tab.fields, tabPrefix)) result.set(key, value)
      }
    } else if ('fields' in field) {
      for (const [key, value] of namedFields(field.fields, prefix)) result.set(key, value)
    }
  }
  return result
}

const isLocalized = (field: Field | undefined) =>
  Boolean(field && 'localized' in field && field.localized)

/** TZ §10: kolleksiya/global → (L) maydonlar va lokalizatsiya qilinmaydiganlar. */
const LOCALIZED: Record<string, { localized: string[]; shared: string[] }> = {
  posts: {
    localized: [
      'title',
      'excerpt',
      'content',
      'faq',
      'meta.title',
      'meta.description',
      'meta.image',
      'meta.focusKeyword',
    ],
    shared: [
      'slug',
      'category',
      'tags',
      'authors',
      'workflowStatus',
      'assignee',
      'lockedUntil',
      'sources',
      'telegramSkip',
      'telegram',
      'rewrittenBy',
      'aiDisclosure',
      'readingTime',
      'views',
      'publishedAt',
      'scheduledAt',
      'cyrlLocked',
      'cyrlStale',
      'relatedPosts',
      'reviewNotes',
      'notesForEditor',
      'rejectReason',
      'isFeatured',
      'isBreaking',
      'coverImage',
    ],
  },
  categories: {
    localized: ['name', 'description', 'meta.title', 'meta.description'],
    shared: ['slug', 'parent', 'color', 'order', 'isInMenu'],
  },
  tags: {
    localized: ['name', 'description', 'meta.title', 'meta.description'],
    shared: ['slug', 'synonyms'],
  },
  authors: {
    localized: ['name', 'bio', 'position'],
    shared: ['slug', 'user', 'avatar', 'socials', 'isActive'],
  },
  pages: {
    localized: ['title', 'layout', 'meta.title', 'meta.description'],
    shared: ['slug'],
  },
  redirects: { localized: [], shared: ['from', 'to', 'type'] },
}

const GLOBAL_LOCALIZED: Record<string, string[]> = {
  'site-settings': ['siteName', 'tagline', 'description'],
  header: [],
  footer: ['copyright'],
  'telegram-settings': [],
  'scraping-settings': [],
}

describe('sxema: TZ §10 kolleksiyalar va globals', () => {
  beforeAll(async () => {
    config = await configPromise
  })

  it('barcha kontent kolleksiyalari va globals mavjud', () => {
    const slugs = config.collections.map((c) => c.slug)
    for (const slug of [
      'posts',
      'pages',
      'categories',
      'tags',
      'authors',
      'redirects',
      'media',
      'users',
    ]) {
      expect(slugs).toContain(slug)
    }
    expect(config.globals.map((g) => g.slug)).toEqual(
      expect.arrayContaining(Object.keys(GLOBAL_LOCALIZED)),
    )
  })

  it.each(Object.entries(LOCALIZED))('%s: (L) maydonlar lokalizatsiya qilingan', (slug, spec) => {
    const collection = config.collections.find((c) => c.slug === slug)
    if (!collection) throw new Error(`${slug} yo‘q`)
    const fields = namedFields(collection.fields)
    for (const path of spec.localized) {
      expect(fields.has(path), `${slug}.${path} mavjud`).toBe(true)
      expect(isLocalized(fields.get(path)), `${slug}.${path} (L)`).toBe(true)
    }
    for (const path of spec.shared) {
      expect(fields.has(path), `${slug}.${path} mavjud`).toBe(true)
      expect(isLocalized(fields.get(path)), `${slug}.${path} umumiy`).toBe(false)
    }
  })

  it.each(Object.entries(GLOBAL_LOCALIZED))('global %s: (L) maydonlar', (slug, localized) => {
    const global = config.globals.find((g) => g.slug === slug)
    if (!global) throw new Error(`${slug} yo‘q`)
    const fields = namedFields(global.fields)
    for (const path of localized) expect(isLocalized(fields.get(path)), path).toBe(true)
  })

  it('menyu havolalari matni (header/footer) lokalizatsiya qilingan', () => {
    const header = config.globals.find((g) => g.slug === 'header')!
    const navItems = namedFields(header.fields).get('navItems')
    const label =
      navItems && 'fields' in navItems ? namedFields(navItems.fields).get('label') : undefined
    expect(isLocalized(label)).toBe(true)
  })

  it('posts: drafts + autosave 10 s, maxPerDoc 10, schedulePublish', () => {
    const posts = config.collections.find((c) => c.slug === 'posts')!
    const versions = posts.versions
    expect(versions && versions.maxPerDoc).toBe(10)
    const drafts = versions && versions.drafts
    expect(drafts && typeof drafts === 'object' && drafts.autosave).toMatchObject({
      interval: 10_000,
    })
    expect(drafts && typeof drafts === 'object' && drafts.schedulePublish).toBeTruthy()
  })

  it('categories: nested-docs (parent + breadcrumbs), redirects: 301/302', () => {
    const categories = namedFields(config.collections.find((c) => c.slug === 'categories')!.fields)
    expect(categories.get('parent')).toMatchObject({
      type: 'relationship',
      relationTo: 'categories',
    })
    expect(categories.get('breadcrumbs')).toMatchObject({ type: 'array' })

    const redirects = namedFields(config.collections.find((c) => c.slug === 'redirects')!.fields)
    const type = redirects.get('type')
    const values =
      type && 'options' in type
        ? type.options.map((o) => (typeof o === 'string' ? o : o.value))
        : []
    expect(values).toEqual(['301', '302'])
  })
})
