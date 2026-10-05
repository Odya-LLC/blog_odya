import type { Locale } from '@blog-odya/shared'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'

import { ArticleBody } from '@/components/blog/ArticleBody'
import { ArticleHeader } from '@/components/blog/ArticleHeader'
import { PopularPosts } from '@/components/blog/PopularPosts'
import { RelatedPosts } from '@/components/blog/RelatedPosts'
import { ShareButtons } from '@/components/blog/ShareButtons'
import { Container } from '@/components/blog/SiteShell'
import { SourceBox } from '@/components/blog/SourceBox'
import { TagList } from '@/components/blog/TagList'
import { TelegramCTA } from '@/components/blog/TelegramCTA'
import { RichText } from '@/components/richtext/RichText'
import { resolvePopular } from '@/pageviews/popular'
import type { Author, Media, Tag } from '@/payload-types'

import { getArticle, getArticleViews, getPopularData, getSiteChrome } from '../data'
import {
  populated,
  postDate,
  postReadingTime,
  telegramHandle,
  toAuthorRef,
  toCategoryRef,
  toImageRef,
  toSourceRefs,
  toTagRef,
} from '../mappers'
import { postPath } from '../paths'
import { redirectIfMoved } from '../redirects'
import { absoluteUrl } from '../seo/config'
import { JsonLd } from '../seo/JsonLd'
import { articleSeo } from '../seo/pages'
import { SitePage } from './SitePage'

type ArticleViewProps = { locale: Locale; categorySlug: string; slug: string }

async function loadOrRedirect({ locale, categorySlug, slug }: ArticleViewProps) {
  const data = await getArticle(locale, slug)
  if (data) {
    // Post boshqa kategoriyaga ko'chirilgan (yoki URL'da xato kategoriya) — kanonik URL'ga 301.
    if (data.category.slug !== categorySlug) {
      permanentRedirect(postPath(locale, data.category.slug, slug))
    }
    return data
  }
  // Slug o'zgargan: plugin-redirects yozuvi (publish'da avtomatik — `hooks/contentRedirects.ts`).
  await redirectIfMoved(locale, `/${categorySlug}/${slug}`)
  notFound()
}

/** SEO (TZ §8.2): title, description, canonical, hreflang, OG (`article:*`), Twitter Card. */
export async function articleMetadata(props: ArticleViewProps): Promise<Metadata> {
  const data = await getArticle(props.locale, props.slug)
  // Kategoriya URL'i noto'g'ri bo'lsa sahifa 301 qiladi — metadata ham kanonik URL bilan.
  if (!data) return {}
  return articleSeo(props.locale, data).metadata
}

/**
 * Maqola (TZ §12.3; maket — `/styleguide/layouts/article`): kategoriya → sarlavha → lid →
 * muallif, sana, o'qish vaqti, ko'rishlar soni (OBLOG-72) → muqova → matn (Lexical) → manba bloki + AI izohi → teglar →
 * ulashish → o'xshash maqolalar → "Ko'p o'qilgan" (OBLOG-69, joriy maqolasiz) → Telegram CTA.
 */
export async function ArticleView(props: ArticleViewProps) {
  const { locale } = props
  const [data, chrome, popular] = await Promise.all([
    loadOrRedirect(props),
    getSiteChrome(locale),
    getPopularData(locale),
  ])
  const { post, category } = data
  // Ko'rishlar soni — alohida kesh (`views:{id}`, OBLOG-72); brauzer yangirog'ini o'zi oladi.
  const views = await getArticleViews(Number(post.id))
  const path = postPath(locale, category.slug, post.slug)
  const cover = populated<Media>(post.coverImage)
  const authors = (post.authors ?? []).flatMap((author) => {
    const doc = populated<Author>(author)
    return doc ? [toAuthorRef(doc, locale)] : []
  })
  const tags = (post.tags ?? []).flatMap((tag) => {
    const doc = populated<Tag>(tag)
    return doc ? [toTagRef(doc, locale)] : []
  })
  const telegramHref = chrome.telegram[locale]
  const { jsonLd } = articleSeo(locale, { ...data, views })

  return (
    <SitePage locale={locale} pathname={path} activeCategorySlug={category.slug}>
      <JsonLd data={jsonLd} />
      <Container className="flex flex-col gap-10 py-6 lg:py-10">
        {/* `data-pv` — ko'rishlar mayog'i shu post ID'sini yuboradi (`pageviews/beacon.ts`). */}
        <article className="flex flex-col gap-8" data-testid="article" data-pv={post.id}>
          <ArticleHeader
            locale={locale}
            category={toCategoryRef(category, locale)}
            title={post.title}
            excerpt={post.excerpt}
            authors={authors}
            publishedAt={postDate(post)}
            updatedAt={post.updatedAt}
            readingTime={postReadingTime(post)}
            views={views ?? 0}
            cover={toImageRef(cover)}
            coverCaption={cover ? cover.caption || cover.credit : null}
            isBreaking={Boolean(post.isBreaking)}
          />
          <ArticleBody lang={locale}>
            <RichText data={post.content} locale={locale} />
          </ArticleBody>
          <div className="mx-auto flex w-full max-w-[680px] flex-col gap-6">
            <SourceBox
              locale={locale}
              sources={toSourceRefs(post.sources)}
              aiDisclosure={Boolean(post.aiDisclosure)}
              className="max-w-none"
            />
            <TagList locale={locale} tags={tags} />
            <ShareButtons
              locale={locale}
              url={absoluteUrl(path)}
              title={post.title}
              className="border-t border-border pt-6"
            />
          </div>
        </article>
        <RelatedPosts locale={locale} posts={data.related} />
        <PopularPosts
          locale={locale}
          list={resolvePopular(popular.rows, popular.posts, { exclude: post.id })}
          variant="wide"
        />
        <TelegramCTA
          locale={locale}
          href={telegramHref}
          channelName={telegramHandle(telegramHref)}
        />
      </Container>
    </SitePage>
  )
}
