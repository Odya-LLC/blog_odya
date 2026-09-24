import { ExternalLinkIcon, SparklesIcon } from 'lucide-react'

import { getSiteStrings } from '@/i18n/site'
import { cn } from '@/lib/utils'

import type { Locale, SourceRef } from './types'

type SourceBoxProps = {
  locale: Locale
  /** `posts.sources[]` — kamida bittasi (atributsiya, TZ §2.3). */
  sources: SourceRef[]
  /** `posts.aiDisclosure` — AI shaffoflik izohi. */
  aiDisclosure?: boolean
  className?: string
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * "Manba: …" bloki — asl manbaga dofollow havola (TZ §2.3, §8.5: 1+ tashqi havola) va
 * ixtiyoriy AI izohi. Havolalar yangi oynada, `noopener` bilan.
 */
export function SourceBox({ locale, sources, aiDisclosure = false, className }: SourceBoxProps) {
  const t = getSiteStrings(locale)
  if (sources.length === 0 && !aiDisclosure) return null
  return (
    <aside
      aria-label={sources.length > 1 ? t.sources : t.source}
      className={cn(
        'mx-auto flex w-full max-w-[680px] flex-col gap-3 rounded-md border border-border bg-surface p-4 text-sm',
        className,
      )}
    >
      {sources.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-fg">
            <span className="font-semibold">{sources.length > 1 ? t.sources : t.source}:</span>
            {sources.map((source, index) => (
              <span key={source.url}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1 font-medium text-accent underline underline-offset-2 hover:text-accent-hover"
                >
                  {source.name || hostname(source.url)}
                  <ExternalLinkIcon className="size-3.5" aria-hidden />
                </a>
                {index < sources.length - 1 ? ',' : null}
              </span>
            ))}
          </p>
          <p className="text-muted">{t.sourceNote}</p>
        </div>
      ) : null}
      {aiDisclosure ? (
        <p className="flex items-start gap-2 border-t border-border pt-3 text-muted">
          <SparklesIcon className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          {t.aiDisclosure}
        </p>
      ) : null}
    </aside>
  )
}
