import type { Locale } from '@blog-odya/shared'
import type { Metadata } from 'next'

import { Container } from '@/components/blog/SiteShell'
import { BOT_CONTACT_EMAIL, BOT_ROBOTS_EXAMPLE, BOT_USER_AGENT, getBotStrings } from '@/i18n/bot'
import { getSiteStrings } from '@/i18n/site'
import { withLocalePrefix } from '@/lib/preferences'

import { SitePage } from './SitePage'

export const BOT_PATH = '/bot'

export function botMetadata(locale: Locale): Metadata {
  const t = getBotStrings(locale)
  return {
    title: `${t.title} — ${getSiteStrings(locale).siteName}`,
    description: t.metaDescription,
    alternates: {
      canonical: withLocalePrefix(locale, BOT_PATH),
      languages: {
        'uz-Latn': withLocalePrefix('uz-Latn', BOT_PATH),
        'uz-Cyrl': withLocalePrefix('uz-Cyrl', BOT_PATH),
      },
    },
  }
}

/**
 * `/bot` va `/kr/bot` — OdyaBlogBot haqida (TZ §2.3): User-Agent, qoidalar, robots.txt orqali
 * cheklash va aloqa. DB'dan faqat sayt karkasi (menyu) olinadi.
 */
export function BotView({ locale }: { locale: Locale }) {
  const t = getBotStrings(locale)
  return (
    <SitePage locale={locale} pathname={withLocalePrefix(locale, BOT_PATH)}>
      <Container className="py-8 lg:py-12">
        <article className="prose prose-odya mx-auto w-full max-w-[680px] break-words">
          <h1>{t.title}</h1>
          <p>{t.intro}</p>

          <h2>{t.userAgentTitle}</h2>
          <pre>
            <code>{BOT_USER_AGENT}</code>
          </pre>

          <h2>{t.rulesTitle}</h2>
          <ul>
            {t.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>

          <h2>{t.blockTitle}</h2>
          <p>{t.blockText}</p>
          <pre>
            <code>{BOT_ROBOTS_EXAMPLE}</code>
          </pre>

          <h2>{t.contactTitle}</h2>
          <p>
            {t.contactText} <a href={`mailto:${BOT_CONTACT_EMAIL}`}>{BOT_CONTACT_EMAIL}</a>
          </p>
          <p>{t.contactNote}</p>
        </article>
      </Container>
    </SitePage>
  )
}
