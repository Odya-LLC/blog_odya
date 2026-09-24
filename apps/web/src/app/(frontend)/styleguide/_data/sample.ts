/**
 * /styleguide uchun namunaviy ma'lumotlar (lotin + kirill). Haqiqiy kontent emas — faqat
 * komponentlarni real uzunlikdagi o'zbekcha matn bilan ko'rsatish uchun.
 */
import type { Locale } from '@blog-odya/shared'

import type {
  AuthorRef,
  ImageRef,
  LinkItem,
  NavCategory,
  PostSummary,
  SourceRef,
  TagRef,
  TelegramLinks,
} from '@/components/blog/types'
import { withLocalePrefix } from '@/lib/preferences'

type L = Record<Locale, string>

const CATEGORIES: Array<{ slug: string; name: L; isInMenu: boolean }> = [
  {
    slug: 'suniy-intellekt',
    name: { 'uz-Latn': 'Sunʼiy intellekt', 'uz-Cyrl': 'Сунъий интеллект' },
    isInMenu: true,
  },
  {
    slug: 'texnologiyalar',
    name: { 'uz-Latn': 'Texnologiyalar', 'uz-Cyrl': 'Технологиялар' },
    isInMenu: true,
  },
  { slug: 'gadjetlar', name: { 'uz-Latn': 'Gadjetlar', 'uz-Cyrl': 'Гаджетлар' }, isInMenu: true },
  { slug: 'dasturlash', name: { 'uz-Latn': 'Dasturlash', 'uz-Cyrl': 'Дастурлаш' }, isInMenu: true },
  {
    slug: 'kiberxavfsizlik',
    name: { 'uz-Latn': 'Kiberxavfsizlik', 'uz-Cyrl': 'Киберхавфсизлик' },
    isInMenu: true,
  },
  {
    slug: 'kibersport',
    name: { 'uz-Latn': 'Kibersport', 'uz-Cyrl': 'Киберспорт' },
    isInMenu: true,
  },
  { slug: 'oyinlar', name: { 'uz-Latn': 'Oʻyinlar', 'uz-Cyrl': 'Ўйинлар' }, isInMenu: true },
  {
    slug: 'startaplar',
    name: { 'uz-Latn': 'Startaplar va biznes', 'uz-Cyrl': 'Стартаплар ва бизнес' },
    isInMenu: true,
  },
  { slug: 'ilm-fan', name: { 'uz-Latn': 'Ilm-fan', 'uz-Cyrl': 'Илм-фан' }, isInMenu: false },
]

const COVERS: Record<string, ImageRef & { alt: string }> = {
  ai: { src: '/styleguide/cover-ai.svg', alt: '', width: 1280, height: 720 },
  esports: { src: '/styleguide/cover-esports.svg', alt: '', width: 1280, height: 720 },
  gadget: { src: '/styleguide/cover-gadget.svg', alt: '', width: 1280, height: 720 },
  security: { src: '/styleguide/cover-security.svg', alt: '', width: 1280, height: 720 },
}

const COVER_ALT: Record<string, L> = {
  ai: {
    'uz-Latn': 'Sunʼiy intellekt mavzusidagi abstrakt tasvir',
    'uz-Cyrl': 'Сунъий интеллект мавзусидаги абстракт тасвир',
  },
  esports: { 'uz-Latn': 'Kibersport turniri sahnasi', 'uz-Cyrl': 'Киберспорт турнири саҳнаси' },
  gadget: { 'uz-Latn': 'Yangi smartfon koʻrinishi', 'uz-Cyrl': 'Янги смартфон кўриниши' },
  security: {
    'uz-Latn': 'Qulf belgisi — kiberxavfsizlik',
    'uz-Cyrl': 'Қулф белгиси — киберхавфсизлик',
  },
}

type RawPost = {
  slug: string
  category: string
  title: L
  excerpt: L
  cover?: keyof typeof COVERS
  minutesAgo: number
  readingTime: number
  isBreaking?: boolean
}

const POSTS: RawPost[] = [
  {
    slug: 'openai-yangi-gpt-modeli-ozbek-tili',
    category: 'suniy-intellekt',
    cover: 'ai',
    minutesAgo: 18,
    readingTime: 4,
    title: {
      'uz-Latn': 'OpenAI yangi GPT modelini taqdim etdi: u oʻzbek tilini ancha yaxshi tushunadi',
      'uz-Cyrl': 'OpenAI янги GPT моделини тақдим этди: у ўзбек тилини анча яхши тушунади',
    },
    excerpt: {
      'uz-Latn':
        'Kompaniya maʼlumotiga koʻra, model kam resursli tillarda xatolarni 40 foizgacha kamaytirgan. Yangilik ChatGPT foydalanuvchilariga bosqichma-bosqich yetib boradi.',
      'uz-Cyrl':
        'Компания маълумотига кўра, модель кам ресурсли тилларда хатоларни 40 фоизгача камайтирган. Янгилик ChatGPT фойдаланувчиларига босқичма-босқич етиб боради.',
    },
  },
  {
    slug: 'telegram-soxta-bonus-botlari',
    category: 'kiberxavfsizlik',
    cover: 'security',
    minutesAgo: 42,
    readingTime: 3,
    isBreaking: true,
    title: {
      'uz-Latn': 'Telegramdagi soxta “bonus” botlari orqali bank kartalari oʻgʻirlanmoqda',
      'uz-Cyrl': 'Телеграмдаги сохта «бонус» ботлари орқали банк карталари ўғирланмоқда',
    },
    excerpt: {
      'uz-Latn':
        'Firibgarlar mashhur doʻkonlar nomidan “bonus” vaʼda qilib, karta raqami va SMS-kodni soʻramoqda. Mutaxassislar qanday himoyalanishni tushuntirdi.',
      'uz-Cyrl':
        'Фирибгарлар машҳур дўконлар номидан «бонус» ваъда қилиб, карта рақами ва СМС-кодни сўрамоқда. Мутахассислар қандай ҳимояланишни тушунтирди.',
    },
  },
  {
    slug: 'team-spirit-cs2-major-chempioni',
    category: 'kibersport',
    cover: 'esports',
    minutesAgo: 75,
    readingTime: 5,
    title: {
      'uz-Latn': 'Team Spirit CS2 boʻyicha major chempioni boʻldi',
      'uz-Cyrl': 'Team Spirit CS2 бўйича мажор чемпиони бўлди',
    },
    excerpt: {
      'uz-Latn':
        'Finalda jamoa uch xaritalik seriyada Vitality’ni 2:1 hisobida magʻlub etdi. Turnir sovrin jamgʻarmasi 1,25 mln dollarni tashkil qildi.',
      'uz-Cyrl':
        'Финалда жамоа уч хариталик серияда Vitality’ни 2:1 ҳисобида мағлуб этди. Турнир совринлар жамғармаси 1,25 млн долларни ташкил қилди.',
    },
  },
  {
    slug: 'iphone-18-pro-kamera-batareya-narx',
    category: 'gadjetlar',
    cover: 'gadget',
    minutesAgo: 130,
    readingTime: 6,
    title: {
      'uz-Latn': 'iPhone 18 Pro: kamera, batareya va narxlar haqida bilganlarimiz',
      'uz-Cyrl': 'iPhone 18 Pro: камера, батарея ва нархлар ҳақида билганларимиз',
    },
    excerpt: {
      'uz-Latn':
        'Apple’ning yangi flagmani 48 megapiksellik uchta kamera va kattaroq batareya bilan chiqishi kutilmoqda.',
      'uz-Cyrl':
        'Apple’нинг янги флагмани 48 мегапикселлик учта камера ва каттароқ батарея билан чиқиши кутилмоқда.',
    },
  },
  {
    slug: 'python-3-15-jit-kompilyator',
    category: 'dasturlash',
    minutesAgo: 190,
    readingTime: 7,
    title: {
      'uz-Latn': 'Python 3.15 chiqdi: JIT-kompilyator endi standart holatda yoqilgan',
      'uz-Cyrl': 'Python 3.15 чиқди: JIT-компилятор энди стандарт ҳолатда ёқилган',
    },
    excerpt: {
      'uz-Latn':
        'Yangi versiyada tezlik oʻrtacha 15–30 foizga oshgan, xato xabarlari esa yanada tushunarli boʻldi.',
      'uz-Cyrl':
        'Янги версияда тезлик ўртача 15–30 фоизга ошган, хато хабарлари эса янада тушунарли бўлди.',
    },
  },
  {
    slug: 'google-ai-rejimi-ozbekistonda',
    category: 'texnologiyalar',
    minutesAgo: 260,
    readingTime: 3,
    title: {
      'uz-Latn': 'Google qidiruvda sunʼiy intellekt rejimini Oʻzbekistonda ham ishga tushirdi',
      'uz-Cyrl': 'Google қидирувда сунъий интеллект режимини Ўзбекистонда ҳам ишга туширди',
    },
    excerpt: {
      'uz-Latn':
        'AI Mode endi oʻzbek tilidagi soʻrovlarga ham javob beradi — hozircha beta holatida.',
      'uz-Cyrl': 'AI Mode энди ўзбек тилидаги сўровларга ҳам жавоб беради — ҳозирча бета ҳолатида.',
    },
  },
  {
    slug: 'toshkent-fintex-startap-investitsiya',
    category: 'startaplar',
    minutesAgo: 340,
    readingTime: 4,
    title: {
      'uz-Latn': 'Toshkentlik fintex startap 5 mln dollar investitsiya jalb qildi',
      'uz-Cyrl': 'Тошкентлик финтех стартап 5 млн доллар инвестиция жалб қилди',
    },
    excerpt: {
      'uz-Latn':
        'Mablagʻ Markaziy Osiyo boʻylab kengayish va yangi toʻlov mahsulotlariga sarflanadi.',
      'uz-Cyrl': 'Маблағ Марказий Осиё бўйлаб кенгайиш ва янги тўлов маҳсулотларига сарфланади.',
    },
  },
  {
    slug: 'gta-6-yangi-treyler-chiqish-sanasi',
    category: 'oyinlar',
    minutesAgo: 520,
    readingTime: 2,
    title: {
      'uz-Latn': 'GTA VI: Rockstar yangi treyler va chiqish sanasini eʼlon qildi',
      'uz-Cyrl': 'GTA VI: Rockstar янги трейлер ва чиқиш санасини эълон қилди',
    },
    excerpt: {
      'uz-Latn':
        'Oʻyin PlayStation 5 va Xbox Series uchun chiqadi, PC versiyasi keyinroq kutilmoqda.',
      'uz-Cyrl': 'Ўйин PlayStation 5 ва Xbox Series учун чиқади, PC версияси кейинроқ кутилмоқда.',
    },
  },
  {
    slug: 'spacex-starship-orbitaga-yuk',
    category: 'ilm-fan',
    minutesAgo: 1500,
    readingTime: 5,
    title: {
      'uz-Latn': 'SpaceX Starship birinchi marta orbitaga yuk olib chiqdi',
      'uz-Cyrl': 'SpaceX Starship биринчи марта орбитага юк олиб чиқди',
    },
    excerpt: {
      'uz-Latn': 'Parvoz davomida kema 20 ta Starlink sunʼiy yoʻldoshini orbitaga chiqardi.',
      'uz-Cyrl': 'Парвоз давомида кема 20 та Starlink сунъий йўлдошини орбитага чиқарди.',
    },
  },
  {
    slug: 'dota-2-the-international-guruh-bosqichi',
    category: 'kibersport',
    minutesAgo: 1620,
    readingTime: 4,
    title: {
      'uz-Latn': 'Dota 2: The International 2026 guruh bosqichi natijalari',
      'uz-Cyrl': 'Dota 2: The International 2026 гуруҳ босқичи натижалари',
    },
    excerpt: {
      'uz-Latn': 'Pleyoffga chiqqan 12 jamoa aniqlandi — MDH vakillari orasida uchta jamoa bor.',
      'uz-Cyrl': 'Плейоффга чиққан 12 жамоа аниқланди — МДҲ вакиллари орасида учта жамоа бор.',
    },
  },
  {
    slug: 'anthropic-claude-agent-imkoniyatlari',
    category: 'suniy-intellekt',
    minutesAgo: 1800,
    readingTime: 5,
    title: {
      'uz-Latn': 'Anthropic Claude uchun yangi agent imkoniyatlarini taqdim etdi',
      'uz-Cyrl': 'Anthropic Claude учун янги агент имкониятларини тақдим этди',
    },
    excerpt: {
      'uz-Latn':
        'Model endi brauzer va dasturlash muhitida bir necha soatlik vazifalarni mustaqil bajaradi.',
      'uz-Cyrl':
        'Модель энди браузер ва дастурлаш муҳитида бир неча соатлик вазифаларни мустақил бажаради.',
    },
  },
  {
    slug: 'samsung-galaxy-s26-ultra-sharhi',
    category: 'gadjetlar',
    minutesAgo: 2900,
    readingTime: 9,
    title: {
      'uz-Latn': 'Samsung Galaxy S26 Ultra sharhi: katta ekran, kichik yangiliklar',
      'uz-Cyrl': 'Samsung Galaxy S26 Ultra шарҳи: катта экран, кичик янгиликлар',
    },
    excerpt: {
      'uz-Latn': 'Ikki hafta davomida sinab koʻrdik: kamera ajoyib, lekin narxi savol tugʻdiradi.',
      'uz-Cyrl': 'Икки ҳафта давомида синаб кўрдик: камера ажойиб, лекин нархи савол туғдиради.',
    },
  },
]

const TAGS: Array<{ slug: string; name: L }> = [
  { slug: 'chatgpt', name: { 'uz-Latn': 'ChatGPT', 'uz-Cyrl': 'ChatGPT' } },
  { slug: 'openai', name: { 'uz-Latn': 'OpenAI', 'uz-Cyrl': 'OpenAI' } },
  { slug: 'llm', name: { 'uz-Latn': 'LLM', 'uz-Cyrl': 'LLM' } },
  { slug: 'ozbek-tili', name: { 'uz-Latn': 'Oʻzbek tili', 'uz-Cyrl': 'Ўзбек тили' } },
  { slug: 'cs2', name: { 'uz-Latn': 'CS2', 'uz-Cyrl': 'CS2' } },
]

const LEGAL: Array<{ path: string; label: L }> = [
  { path: '/biz-haqimizda', label: { 'uz-Latn': 'Biz haqimizda', 'uz-Cyrl': 'Биз ҳақимизда' } },
  {
    path: '/tahririyat-siyosati',
    label: { 'uz-Latn': 'Tahririyat siyosati', 'uz-Cyrl': 'Таҳририят сиёсати' },
  },
  {
    path: '/tuzatishlar',
    label: { 'uz-Latn': 'Tuzatishlar siyosati', 'uz-Cyrl': 'Тузатишлар сиёсати' },
  },
  {
    path: '/maxfiylik',
    label: { 'uz-Latn': 'Maxfiylik siyosati', 'uz-Cyrl': 'Махфийлик сиёсати' },
  },
  { path: '/aloqa', label: { 'uz-Latn': 'Aloqa', 'uz-Cyrl': 'Алоқа' } },
]

/** Namunaviy kanal havolalari (haqiqiy kanal nomlari M0-03 / TelegramSettings'dan keladi). */
export const SAMPLE_TELEGRAM: TelegramLinks = {
  'uz-Latn': 'https://t.me/blogodya',
  'uz-Cyrl': 'https://t.me/blogodya_kr',
}

export const SAMPLE_TELEGRAM_NAME: Record<Locale, string> = {
  'uz-Latn': '@blogodya',
  'uz-Cyrl': '@blogodya_kr',
}

export const SAMPLE_SITE_URL = 'https://blog.odya.uz'

export type Sample = {
  locale: Locale
  categories: NavCategory[]
  posts: PostSummary[]
  tags: TagRef[]
  authors: AuthorRef[]
  sources: SourceRef[]
  legalLinks: LinkItem[]
  telegram: TelegramLinks
}

/** `now` — namunaviy sanalar "hozir"dan hisoblanadi (lentada vaqt real koʻrinadi). */
export function getSample(locale: Locale, now: number = Date.now()): Sample {
  const categories: NavCategory[] = CATEGORIES.map((category) => ({
    slug: category.slug,
    name: category.name[locale],
    href: withLocalePrefix(locale, `/${category.slug}`),
    isInMenu: category.isInMenu,
  }))
  const bySlug = new Map(categories.map((category) => [category.slug, category]))

  const posts: PostSummary[] = POSTS.map((post, index) => {
    const category = bySlug.get(post.category) ?? categories[0]!
    return {
      id: index + 1,
      title: post.title[locale],
      href: withLocalePrefix(locale, `/${post.category}/${post.slug}`),
      excerpt: post.excerpt[locale],
      category: { slug: category.slug, name: category.name, href: category.href },
      cover: post.cover ? { ...COVERS[post.cover]!, alt: COVER_ALT[post.cover]![locale] } : null,
      publishedAt: new Date(now - post.minutesAgo * 60_000).toISOString(),
      readingTime: post.readingTime,
      isBreaking: post.isBreaking,
    }
  })

  return {
    locale,
    categories,
    posts,
    tags: TAGS.map((tag) => ({
      slug: tag.slug,
      name: tag.name[locale],
      href: withLocalePrefix(locale, `/tag/${tag.slug}`),
    })),
    authors: [
      {
        name: locale === 'uz-Latn' ? 'Dilnoza Karimova' : 'Дилноза Каримова',
        href: withLocalePrefix(locale, '/author/dilnoza-karimova'),
      },
      {
        name: locale === 'uz-Latn' ? 'Tahririyat' : 'Таҳририят',
        href: withLocalePrefix(locale, '/author/tahririyat'),
      },
    ],
    sources: [
      { name: 'TechCrunch', url: 'https://techcrunch.com/2026/09/24/openai-new-model/' },
      { name: 'The Verge', url: 'https://www.theverge.com/ai-artificial-intelligence' },
    ],
    legalLinks: LEGAL.map((link) => ({
      label: link.label[locale],
      href: withLocalePrefix(locale, link.path),
    })),
    telegram: SAMPLE_TELEGRAM,
  }
}
