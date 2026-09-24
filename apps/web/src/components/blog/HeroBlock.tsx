import { getSiteStrings } from '@/i18n/site'
import { cn } from '@/lib/utils'

import { PostCard } from './PostCard'
import type { Locale, PostSummary } from './types'

type HeroBlockProps = {
  locale: Locale
  /** Asosiy yangilik (`isFeatured`). */
  main: PostSummary
  /** 2–4 ta ikkinchi darajali yangilik (TZ §12.3). */
  secondary: PostSummary[]
  className?: string
}

/**
 * Bosh sahifa "hero" bloki (The Verge uslubi): chapda katta kartochka (LCP rasmi — `priority`),
 * o'ngda ikkinchi darajali yangiliklar (birinchisi — o'rta, qolganlari — ixcham).
 * Mobil: ustma-ust; ≥1024px: 8 + 4 ustun.
 */
export function HeroBlock({ locale, main, secondary, className }: HeroBlockProps) {
  const t = getSiteStrings(locale)
  const items = secondary.slice(0, 4)
  return (
    <section aria-label={t.mainNews} className={cn('grid gap-8 lg:grid-cols-12', className)}>
      <PostCard
        post={main}
        locale={locale}
        variant="large"
        headingLevel="h2"
        priority
        className="lg:col-span-8"
      />
      {items.length > 0 ? (
        <ul className="flex flex-col gap-5 lg:col-span-4 lg:border-l lg:border-border lg:pl-8">
          {items.map((post, index) => (
            <li key={post.id} className={cn(index > 0 && 'border-t border-border pt-5')}>
              <PostCard
                post={post}
                locale={locale}
                variant={index === 0 ? 'medium' : 'small'}
                headingLevel="h3"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
