import { ExternalLinkIcon } from 'lucide-react'

import { parseEmbedUrl } from '@/lib/embed'
import { cn } from '@/lib/utils'

import { TelegramEmbedLoader, XEmbedLoader } from './EmbedScript'

type EmbedProps = {
  url: string
  caption?: string | null
  className?: string
}

function Caption({ caption }: { caption?: string | null }) {
  return caption ? <figcaption>{caption}</figcaption> : null
}

function FallbackLink({ url, label }: { url: string; label?: string }) {
  return (
    <a
      data-embed-fallback
      href={url}
      target="_blank"
      rel="noopener"
      className="flex items-center gap-2 rounded-md border border-border bg-surface p-4 text-base font-semibold break-all text-accent no-underline hover:border-accent"
    >
      <ExternalLinkIcon className="size-4 shrink-0" aria-hidden />
      {label ?? url}
    </a>
  )
}

/**
 * Lexical `embed` bloki (TZ §10.3): YouTube (youtube-nocookie iframe, lazy), X va Telegram
 * (havola + ko'ringanda yuklanadigan rasmiy widget). Noma'lum URL — oddiy havola kartochkasi.
 */
export function Embed({ url, caption, className }: EmbedProps) {
  const embed = parseEmbedUrl(url)
  switch (embed.kind) {
    case 'youtube': {
      const params = new URLSearchParams({ rel: '0' })
      if (embed.start) params.set('start', String(embed.start))
      return (
        <figure className={cn('not-prose my-8', className)} data-embed="youtube">
          <div className="relative aspect-video overflow-hidden rounded-md bg-surface-muted">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${embed.id}?${params}`}
              title={caption || 'YouTube'}
              loading="lazy"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              className="absolute inset-0 size-full border-0"
            />
          </div>
          {caption ? (
            <figcaption className="mt-2 text-center text-sm text-subtle">{caption}</figcaption>
          ) : null}
        </figure>
      )
    }
    case 'x':
      return (
        <figure className={cn('my-8', className)} data-embed="x">
          <XEmbedLoader>
            <blockquote className="twitter-tweet" data-dnt="true">
              <a href={embed.url} target="_blank" rel="noopener">
                {embed.url}
              </a>
            </blockquote>
          </XEmbedLoader>
          <Caption caption={caption} />
        </figure>
      )
    case 'telegram':
      return (
        <figure className={cn('not-prose my-8', className)} data-embed="telegram">
          <TelegramEmbedLoader post={embed.post}>
            <FallbackLink url={embed.url} label={`t.me/${embed.post}`} />
          </TelegramEmbedLoader>
          {caption ? (
            <figcaption className="mt-2 text-center text-sm text-subtle">{caption}</figcaption>
          ) : null}
        </figure>
      )
    case 'link':
      return (
        <figure className={cn('not-prose my-8', className)} data-embed="link">
          <FallbackLink url={embed.url} label={caption ?? undefined} />
        </figure>
      )
    case 'invalid':
      return null
  }
}
