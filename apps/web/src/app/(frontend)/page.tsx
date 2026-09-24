import { DEFAULT_LOCALE } from '@blog-odya/shared'
import Link from 'next/link'

import { Wordmark } from '@/components/blog/Wordmark'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Vaqtinchalik bosh sahifa — haqiqiy sahifa M1-05 da (HeroBlock, LatestFeed, CategoryBlock…). */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-6 px-4 text-center">
      <h1>
        <Wordmark locale={DEFAULT_LOCALE} className="h-12 sm:h-16" />
      </h1>
      <p className="text-lg text-muted">
        AI, IT, texnologiya va kibersport yangiliklari oʻzbek tilida. Tez orada.
      </p>
      <Link href="/admin" className={cn(buttonVariants(), 'rounded-full')}>
        Admin panel
      </Link>
      <p className="text-sm text-subtle">
        Asosiy yozuv: <code>{DEFAULT_LOCALE}</code>
      </p>
    </main>
  )
}
