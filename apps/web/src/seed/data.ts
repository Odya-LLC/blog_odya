import { readFileSync } from 'node:fs'

import type { Locale } from '@blog-odya/shared'

/**
 * Seed ma'lumotlari: muallif, teglar, demo postlar, sayt sozlamalari.
 * Kategoriyalar — `packages/shared/seed/categories.json` (M0-04), huquqiy sahifalar —
 * `packages/guidelines/legal/*.md` (M0-05), kategoriya ranglari — `design/brand/tokens.json` (M0-06).
 */
export type Localized = Record<Locale, string>

export const SITE_NAME: Localized = { 'uz-Latn': 'Blog Odya', 'uz-Cyrl': 'Блог Одя' }

export const SITE_TAGLINE: Localized = {
  'uz-Latn': 'AI, IT, texnologiya va kibersport yangiliklari oʻzbek tilida',
  'uz-Cyrl': 'СИ, АТ, технология ва киберспорт янгиликлари ўзбек тилида',
}

export const SITE_DESCRIPTION: Localized = {
  'uz-Latn':
    'Sunʼiy intellekt, texnologiyalar, gadjetlar, dasturlash, kiberxavfsizlik, oʻyinlar va kibersport haqidagi yangiliklar — lotin va kirill yozuvlarida.',
  'uz-Cyrl':
    'Сунъий интеллект, технологиялар, гаджетлар, дастурлаш, киберхавфсизлик, ўйинлар ва киберспорт ҳақидаги янгиликлар — лотин ва кирилл ёзувларида.',
}

export const SEED_AUTHOR = {
  slug: 'tahririyat',
  name: { 'uz-Latn': 'Blog Odya tahririyati', 'uz-Cyrl': 'Блог Одя таҳририяти' },
  position: { 'uz-Latn': 'Tahririyat', 'uz-Cyrl': 'Таҳририят' },
  bio: {
    'uz-Latn':
      'Blog Odya tahririyati: xalqaro manbalardagi texnologiya yangiliklarini oʻzbek tilida tayyorlaydi va tekshiradi.',
    'uz-Cyrl':
      'Блог Одя таҳририяти: халқаро манбалардаги технология янгиликларини ўзбек тилида тайёрлайди ва текширади.',
  },
} as const

export const SEED_TAGS = [
  { slug: 'chatgpt', name: { 'uz-Latn': 'ChatGPT', 'uz-Cyrl': 'ChatGPT' } },
  { slug: 'cs2', name: { 'uz-Latn': 'CS2', 'uz-Cyrl': 'CS2' }, synonyms: ['Counter-Strike 2'] },
  { slug: 'iphone', name: { 'uz-Latn': 'iPhone', 'uz-Cyrl': 'iPhone' } },
] as const

export interface SeedPost {
  slug: string
  category: string
  tags: string[]
  title: Localized
  excerpt: Localized
  /** Lotin matni (Markdown → Lexical). Kirill matni — M1-03 transliteratsiyasi (hozircha fallback). */
  markdown: string
  source: { name: string; url: string }
  rewrittenBy: 'human' | 'ai_agent'
  isFeatured?: boolean
  /** Muqova: `public/styleguide/cover-<name>.svg` → PNG → media (WebP variantlar). */
  cover?: SeedCover
  /** Matn oxiriga qo'shiladigan namunaviy bloklar (renderer'ni ko'rsatish uchun). */
  richBlocks?: boolean
}

export const SEED_COVERS = {
  ai: {
    'uz-Latn': 'Sunʼiy intellekt mavzusidagi abstrakt tasvir (namuna)',
    'uz-Cyrl': 'Сунъий интеллект мавзусидаги абстракт тасвир (намуна)',
  },
  esports: {
    'uz-Latn': 'Kibersport mavzusidagi abstrakt tasvir (namuna)',
    'uz-Cyrl': 'Киберспорт мавзусидаги абстракт тасвир (намуна)',
  },
  gadget: {
    'uz-Latn': 'Smartfon mavzusidagi abstrakt tasvir (namuna)',
    'uz-Cyrl': 'Смартфон мавзусидаги абстракт тасвир (намуна)',
  },
} as const satisfies Record<string, Localized>

export type SeedCover = keyof typeof SEED_COVERS

/** Muqova SVG fayli (M1-04 styleguide namunalari). */
export function seedCoverUrl(cover: SeedCover): URL {
  return new URL(`../../public/styleguide/cover-${cover}.svg`, import.meta.url)
}

/** Demo postlar — aniq "Namuna" deb belgilangan, haqiqiy yangilik emas. */
export const SEED_POSTS: SeedPost[] = [
  {
    slug: 'namuna-suniy-intellekt-yangiliklari-qanday-tayyorlanadi',
    category: 'suniy-intellekt',
    tags: ['chatgpt'],
    title: {
      'uz-Latn': 'Namuna: sunʼiy intellekt yangiliklari qanday tayyorlanadi',
      'uz-Cyrl': 'Намуна: сунъий интеллект янгиликлари қандай тайёрланади',
    },
    excerpt: {
      'uz-Latn':
        'Bu demo maqola: manbadan qayta yozish, muharrir tekshiruvi va chop etish bosqichlarini koʻrsatadi.',
      'uz-Cyrl':
        'Бу демо мақола: манбадан қайта ёзиш, муҳаррир текшируви ва чоп этиш босқичларини кўрсатади.',
    },
    markdown: [
      'Bu — **namuna maqola**. U sayt maketini va tahririyat jarayonini sinash uchun yaratilgan.',
      '',
      '## Jarayon',
      '',
      '- Yangilik manbadan yigʻiladi va toʻliq nusxasi saqlanadi.',
      '- AI agent yoki muharrir matnni oʻzbek tilida qayta yozadi.',
      '- Muharrir tekshiradi va chop etadi; kirill versiyasi avtomatik tayyorlanadi.',
      '',
      'Har bir materialda manba havola bilan koʻrsatiladi.',
    ].join('\n'),
    source: { name: 'The Verge', url: 'https://www.theverge.com/ai-artificial-intelligence' },
    rewrittenBy: 'ai_agent',
    isFeatured: true,
    cover: 'ai',
    richBlocks: true,
  },
  {
    slug: 'namuna-kibersport-turniri-haqidagi-maqola-tuzilmasi',
    category: 'kibersport',
    tags: ['cs2'],
    title: {
      'uz-Latn': 'Namuna: kibersport turniri haqidagi maqola tuzilmasi',
      'uz-Cyrl': 'Намуна: киберспорт турнири ҳақидаги мақола тузилмаси',
    },
    excerpt: {
      'uz-Latn':
        'Demo maqola: turnir natijalari, jamoalar va keyingi oʻyinlar haqidagi yangilik qanday tuziladi.',
      'uz-Cyrl':
        'Демо мақола: турнир натижалари, жамоалар ва кейинги ўйинлар ҳақидаги янгилик қандай тузилади.',
    },
    markdown: [
      'Bu — **namuna maqola**: kibersport yangiligi uchun tavsiya etilgan tuzilma.',
      '',
      '## Nimalar boʻlishi kerak',
      '',
      '1. Turnir nomi, bosqichi va sanasi.',
      '2. Oʻyin natijasi va hal qiluvchi lahzalar.',
      '3. Keyingi oʻyinlar jadvali.',
    ].join('\n'),
    source: { name: 'HLTV', url: 'https://www.hltv.org/' },
    rewrittenBy: 'human',
    cover: 'esports',
  },
  {
    slug: 'namuna-smartfon-sharhi-uchun-andoza',
    category: 'gadjetlar',
    tags: ['iphone'],
    title: {
      'uz-Latn': 'Namuna: smartfon sharhi uchun andoza',
      'uz-Cyrl': 'Намуна: смартфон шарҳи учун андоза',
    },
    excerpt: {
      'uz-Latn': 'Demo maqola: yangi qurilma sharhida qaysi boʻlimlar boʻlishi kerak.',
      'uz-Cyrl': 'Демо мақола: янги қурилма шарҳида қайси бўлимлар бўлиши керак.',
    },
    markdown: [
      'Bu — **namuna maqola**: qurilma sharhi uchun andoza.',
      '',
      '## Boʻlimlar',
      '',
      '- Dizayn va ekran',
      '- Unumdorlik va batareya',
      '- Kamera',
      '- Narx va Oʻzbekistonda sotuvda boʻlishi',
    ].join('\n'),
    source: { name: 'iXBT', url: 'https://www.ixbt.com/' },
    rewrittenBy: 'human',
    cover: 'gadget',
  },
]

/** Kategoriya ranglari: `design/brand/tokens.json` → `color.category.<slug>.solid`. */
export function loadCategoryColors(): Record<string, string> {
  try {
    const url = new URL('../../../../design/brand/tokens.json', import.meta.url)
    const tokens = JSON.parse(readFileSync(url, 'utf8')) as {
      color?: { category?: Record<string, { solid?: string }> }
    }
    const result: Record<string, string> = {}
    for (const [slug, value] of Object.entries(tokens.color?.category ?? {})) {
      if (value?.solid && /^#[0-9a-fA-F]{6}$/.test(value.solid)) result[slug] = value.solid
    }
    return result
  } catch {
    return {}
  }
}
