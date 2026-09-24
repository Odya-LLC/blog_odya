import { InboxIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import { AdSlot } from '@/components/blog/AdSlot'
import { ArticleBody } from '@/components/blog/ArticleBody'
import { ArticleHeader } from '@/components/blog/ArticleHeader'
import { CategoryBlock } from '@/components/blog/CategoryBlock'
import { CategoryChip } from '@/components/blog/CategoryChip'
import { NoImagePlaceholder } from '@/components/blog/CoverImage'
import { EmptyState } from '@/components/blog/EmptyState'
import { Footer } from '@/components/blog/Footer'
import { Header } from '@/components/blog/Header'
import { HeroBlock } from '@/components/blog/HeroBlock'
import { LatestFeed } from '@/components/blog/LatestFeed'
import { NotFound } from '@/components/blog/NotFound'
import { Pagination } from '@/components/blog/Pagination'
import { PostCard } from '@/components/blog/PostCard'
import { RelatedPosts } from '@/components/blog/RelatedPosts'
import { ScriptSwitcher } from '@/components/blog/ScriptSwitcher'
import { ShareButtons } from '@/components/blog/ShareButtons'
import { SourceBox } from '@/components/blog/SourceBox'
import { TagList } from '@/components/blog/TagList'
import { TelegramCTA } from '@/components/blog/TelegramCTA'
import { ThemeToggle } from '@/components/blog/ThemeToggle'
import { Wordmark } from '@/components/blog/Wordmark'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getSiteStrings } from '@/i18n/site'
import { isStyleguideEnabled } from '@/lib/styleguide'

import { SampleArticleBody } from './_data/article'
import { LAYOUTS, styleguideHrefs, type LayoutName } from './_data/layouts'
import { localeFromParam } from './_data/params'
import { getSample, SAMPLE_SITE_URL, SAMPLE_TELEGRAM_NAME } from './_data/sample'

export const metadata: Metadata = {
  title: 'Styleguide — Blog Odya',
  description: 'UI kit va sahifa maketlari (M1-04). Faqat dev/preview.',
  robots: { index: false, follow: false, nocache: true },
}

type Props = {
  searchParams: Promise<{ script?: string | string[] }>
}

const SECTIONS = [
  ['brand', 'Brend va tokenlar'],
  ['primitives', 'UI primitivlar'],
  ['header', 'Header'],
  ['cards', 'PostCard'],
  ['home', 'Bosh sahifa bloklari'],
  ['article', 'Maqola'],
  ['states', 'Holatlar'],
  ['layouts', 'Maketlar 360 / 1280'],
  ['footer', 'Footer'],
] as const

const COLOR_TOKENS = [
  ['bg', 'bg-bg'],
  ['surface', 'bg-surface'],
  ['surface-muted', 'bg-surface-muted'],
  ['border', 'bg-border'],
  ['text (fg)', 'bg-fg'],
  ['text-muted', 'bg-muted'],
  ['text-subtle', 'bg-subtle'],
  ['accent', 'bg-accent'],
  ['accent-hover', 'bg-accent-hover'],
  ['accent-soft', 'bg-accent-soft'],
  ['telegram', 'bg-telegram'],
] as const

/**
 * /styleguide — UI kit (M1-04 / OBLOG-11). Faqat dev va Vercel preview'da (`isStyleguideEnabled`),
 * `noindex`. Yozuv: `?script=kr`; tema: yuqoridagi tugma (cookie).
 */
export default async function StyleguidePage({ searchParams }: Props) {
  // searchParams — avval: sahifa doim dinamik (ENABLE_STYLEGUIDE runtime'da ham ishlaydi).
  const { script } = await searchParams
  if (!isStyleguideEnabled()) notFound()
  const locale = localeFromParam(script)
  const t = getSiteStrings(locale)
  const sample = getSample(locale)
  const { posts, categories } = sample
  const [main, ...rest] = posts
  const noCover = posts.find((post) => !post.cover)!
  const scriptParam = locale === 'uz-Cyrl' ? '?script=kr' : ''

  return (
    <div lang={locale} className="min-h-dvh bg-bg">
      {/* Styleguide asboblar paneli */}
      <div className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-2 lg:px-6">
          <p className="text-sm font-bold text-fg">
            Styleguide <span className="font-medium text-subtle">· M1-04 · noindex</span>
          </p>
          <div className="ml-auto flex items-center gap-2">
            <ScriptSwitcher
              locale={locale}
              hrefs={styleguideHrefs('/styleguide')}
              label={t.scriptSwitcher}
            />
            <ThemeToggle label={t.themeToggle} />
          </div>
        </div>
        <nav aria-label="Styleguide bo'limlari" className="border-t border-border">
          <ul className="scrollbar-none mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-1.5 lg:px-6">
            {SECTIONS.map(([id, label]) => (
              <li key={id} className="shrink-0">
                <a
                  href={`#${id}`}
                  className="inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold text-muted hover:bg-surface-muted hover:text-fg"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="mx-auto flex max-w-7xl flex-col gap-16 px-4 py-10 lg:px-6">
        <Section
          id="brand"
          title="Brend va tokenlar"
          note="design/brand/tokens.json → tokens.css → Tailwind @theme"
        >
          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-4 rounded-lg border border-border p-6">
              <Wordmark locale="uz-Latn" className="h-7" />
              <Wordmark locale="uz-Cyrl" className="h-7" />
              <div className="rounded-md bg-[#39577F] p-4 text-white">
                <Wordmark locale={locale} mono className="h-6 text-white" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {COLOR_TOKENS.map(([name, className]) => (
                <div key={name} className="flex flex-col gap-1">
                  <span className={`h-12 rounded-md border border-border ${className}`} />
                  <span className="text-xs text-muted">{name}</span>
                </div>
              ))}
            </div>
          </div>
          <SubHeading>Kategoriya chipʼlari (9 ta, AA)</SubHeading>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <CategoryChip key={category.slug} category={category} size="md" />
            ))}
          </div>
          <SubHeading>Tipografiya (Inter, opsz)</SubHeading>
          <div className="flex flex-col gap-3">
            <p className="font-display text-[2.75rem] leading-[1.1] font-extrabold">
              {locale === 'uz-Latn'
                ? 'Sarlavha 44/800 — Oʻzbekiston'
                : 'Сарлавҳа 44/800 — Ўзбекистон'}
            </p>
            <p className="font-display text-2xl font-bold">
              {locale === 'uz-Latn'
                ? 'Blok sarlavhasi 24/700 — gʻalaba'
                : 'Блок сарлавҳаси 24/700 — ғалаба'}
            </p>
            <p className="text-lg leading-[1.7]">
              {locale === 'uz-Latn'
                ? 'Maqola matni 18/1.7 — Sunʼiy intellekt, oʻyinlar va gadjetlar haqida.'
                : 'Мақола матни 18/1.7 — Сунъий интеллект, ўйинлар ва гаджетлар ҳақида. Ққ Ғғ Ҳҳ Ўў'}
            </p>
            <p className="text-sm text-muted">UI / meta 14/500 — text-muted</p>
            <p className="text-xs text-subtle">
              Vaqt, meta 12 — text-subtle (faqat bg/surface ustida)
            </p>
          </div>
        </Section>

        <Section id="primitives" title="UI primitivlar" note="components/ui — shadcn/ui asosida">
          <div className="flex flex-wrap items-center gap-3">
            <Button>{t.telegramCtaButton}</Button>
            <Button variant="secondary">{t.viewAll}</Button>
            <Button variant="outline">{t.next}</Button>
            <Button variant="ghost">{t.more}</Button>
            <Button variant="soft">{t.latestNews}</Button>
            <Button variant="telegram">{t.telegram}</Button>
            <Button variant="link">{t.backHome}</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Default</Badge>
            <Badge variant="soft">Soft</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="breaking">{t.breaking}</Badge>
          </div>
          <Input placeholder={t.searchPlaceholder} className="max-w-sm" aria-label={t.search} />
        </Section>

        <Section
          id="header"
          title="Header"
          note="Client orollar: almashtirgich, tema, mobil menyu, “Yana”"
        >
          <div className="overflow-hidden rounded-lg border border-border">
            <Header
              locale={locale}
              categories={categories}
              alternateHrefs={styleguideHrefs('/styleguide')}
              telegramHref={sample.telegram[locale]}
              activeCategorySlug="kibersport"
            />
          </div>
        </Section>

        <Section
          id="cards"
          title="PostCard"
          note="large · medium · small · list; rasm yoʻq — placeholder"
        >
          <SubHeading>large</SubHeading>
          <PostCard post={main!} locale={locale} variant="large" className="max-w-3xl" />
          <SubHeading>medium</SubHeading>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <PostCard post={posts[2]!} locale={locale} variant="medium" />
            <PostCard post={posts[1]!} locale={locale} variant="medium" />
            <PostCard post={noCover} locale={locale} variant="medium" />
          </div>
          <SubHeading>small</SubHeading>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <PostCard post={posts[3]!} locale={locale} variant="small" />
            <PostCard post={posts[4]!} locale={locale} variant="small" />
            <PostCard post={posts[6]!} locale={locale} variant="small" />
          </div>
          <SubHeading>list</SubHeading>
          <div className="flex max-w-4xl flex-col gap-6">
            <PostCard post={posts[1]!} locale={locale} variant="list" />
            <PostCard post={posts[5]!} locale={locale} variant="list" />
          </div>
        </Section>

        <Section
          id="home"
          title="Bosh sahifa bloklari"
          note="HeroBlock · LatestFeed · CategoryBlock · TelegramCTA"
        >
          <HeroBlock locale={locale} main={main!} secondary={rest.slice(0, 4)} />
          <div className="grid gap-12 lg:grid-cols-12">
            <CategoryBlock
              locale={locale}
              category={posts[2]!.category}
              posts={[posts[2]!, posts[9]!, posts[7]!, posts[3]!]}
              className="lg:col-span-8"
            />
            <LatestFeed
              locale={locale}
              posts={posts.slice(0, 7)}
              moreHref="#home"
              className="lg:col-span-4"
            />
          </div>
          <TelegramCTA
            locale={locale}
            href={sample.telegram[locale]}
            channelName={SAMPLE_TELEGRAM_NAME[locale]}
          />
          <TelegramCTA
            locale={locale}
            href={sample.telegram[locale]}
            channelName={SAMPLE_TELEGRAM_NAME[locale]}
            variant="compact"
            className="max-w-sm"
          />
        </Section>

        <Section
          id="article"
          title="Maqola"
          note="ArticleHeader · ArticleBody (prose) · SourceBox · TagList · ShareButtons · RelatedPosts"
        >
          <article className="flex flex-col gap-8">
            <ArticleHeader
              locale={locale}
              category={main!.category}
              title={main!.title}
              excerpt={main!.excerpt}
              authors={sample.authors}
              publishedAt={main!.publishedAt}
              updatedAt={new Date(Date.parse(main!.publishedAt) + 45 * 60_000).toISOString()}
              readingTime={main!.readingTime}
              cover={main!.cover}
              coverCaption={locale === 'uz-Latn' ? 'Tasvir: OpenAI' : 'Тасвир: OpenAI'}
            />
            <ArticleBody lang={locale}>
              <SampleArticleBody locale={locale} />
            </ArticleBody>
            <div className="mx-auto flex w-full max-w-[680px] flex-col gap-6">
              <SourceBox locale={locale} sources={sample.sources} aiDisclosure />
              <SourceBox locale={locale} sources={sample.sources.slice(0, 1)} />
              <TagList locale={locale} tags={sample.tags} />
              <ShareButtons
                locale={locale}
                url={`${SAMPLE_SITE_URL}${main!.href}`}
                title={main!.title}
              />
            </div>
          </article>
          <RelatedPosts locale={locale} posts={posts.slice(1, 4)} />
        </Section>

        <Section
          id="states"
          title="Holatlar"
          note="Pagination · EmptyState · 404 · rasm yoʻq placeholder · reklama joyi"
        >
          <SubHeading>Pagination</SubHeading>
          <div className="flex flex-col gap-4">
            <Pagination locale={locale} currentPage={1} totalPages={5} basePath="/kibersport" />
            <Pagination locale={locale} currentPage={6} totalPages={20} basePath="/kibersport" />
            <Pagination locale={locale} currentPage={20} totalPages={20} basePath="/kibersport" />
          </div>
          <SubHeading>EmptyState</SubHeading>
          <div className="grid gap-6 md:grid-cols-2">
            <EmptyState
              title={t.emptyTitle}
              description={t.emptySearch(
                locale === 'uz-Latn' ? 'kvant kompyuter' : 'квант компьютер',
              )}
            />
            <EmptyState title={t.emptyTitle} description={t.emptyCategory} icon={InboxIcon} />
          </div>
          <SubHeading>404</SubHeading>
          <div className="rounded-lg border border-border">
            <NotFound locale={locale} />
          </div>
          <SubHeading>Rasm yoʻq — kategoriya placeholderʼi</SubHeading>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {categories.map((category) => (
              <div key={category.slug} className="relative aspect-video overflow-hidden rounded-md">
                <NoImagePlaceholder category={category} label={t.noImage} />
              </div>
            ))}
          </div>
          <SubHeading>
            Reklama joylari (standart holatda yashirin — bu yerda faqat preview)
          </SubHeading>
          <div className="flex flex-col items-start gap-6 lg:flex-row">
            <AdSlot locale={locale} position="below-header" preview className="lg:flex-1" />
            <AdSlot locale={locale} position="in-article" preview />
            <AdSlot locale={locale} position="sidebar" preview className="max-lg:flex" />
          </div>
        </Section>

        <Section
          id="layouts"
          title="Maketlar 360 / 1280"
          note="Toʻliq sahifalar iframe ichida — mobil 360 px va desktop 1280 px (50% masshtab)"
        >
          <ul className="flex flex-wrap gap-2">
            {(Object.keys(LAYOUTS) as LayoutName[]).map((layout) => (
              <li key={layout}>
                <Link
                  href={`/styleguide/layouts/${layout}${scriptParam}`}
                  className="inline-flex h-9 items-center rounded-full border border-border px-4 text-sm font-semibold text-fg hover:border-accent hover:text-accent"
                >
                  {LAYOUTS[layout][locale]} ↗
                </Link>
              </li>
            ))}
          </ul>
          {(Object.keys(LAYOUTS) as LayoutName[]).map((layout) => (
            <div key={layout} className="flex flex-col gap-3">
              <SubHeading>{LAYOUTS[layout][locale]}</SubHeading>
              <div className="flex gap-6 overflow-x-auto pb-2">
                <Frame
                  src={`/styleguide/layouts/${layout}${scriptParam}`}
                  title={`${LAYOUTS[layout][locale]} — 360`}
                  width={360}
                  scale={1}
                />
                <Frame
                  src={`/styleguide/layouts/${layout}${scriptParam}`}
                  title={`${LAYOUTS[layout][locale]} — 1280`}
                  width={1280}
                  scale={0.5}
                />
              </div>
            </div>
          ))}
        </Section>
      </div>

      <section id="footer" aria-label="Footer" className="scroll-mt-28">
        <Footer
          locale={locale}
          categories={categories}
          legalLinks={sample.legalLinks}
          telegram={sample.telegram}
        />
      </section>
    </div>
  )
}

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string
  title: string
  note?: string
  children: ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-28 flex-col gap-6">
      <div className="flex flex-col gap-1 border-b-2 border-fg pb-3">
        <h2 id={`${id}-title`} className="font-display text-3xl font-extrabold text-fg">
          {title}
        </h2>
        {note ? <p className="text-sm text-muted">{note}</p> : null}
      </div>
      {children}
    </section>
  )
}

function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="text-xs font-bold tracking-wider text-subtle uppercase">{children}</h3>
}

function Frame({
  src,
  title,
  width,
  scale,
}: {
  src: string
  title: string
  width: number
  scale: number
}) {
  const height = 1400
  return (
    <figure className="flex shrink-0 flex-col gap-2">
      <div
        className="overflow-hidden rounded-lg border border-border bg-bg"
        style={{ width: width * scale, height: height * scale }}
      >
        <iframe
          src={src}
          title={title}
          loading="lazy"
          width={width}
          height={height}
          style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}
          className="border-0"
        />
      </div>
      <figcaption className="text-xs text-subtle tabular-nums">{width} px</figcaption>
    </figure>
  )
}
