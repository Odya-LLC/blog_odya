import type { Locale } from '@blog-odya/shared'
import { permanentRedirect, redirect } from 'next/navigation'

import { findRedirect, type RedirectTarget } from './data'
import { localeFromPathname, localizePath, stripLocalePrefix } from './paths'

/**
 * Eski URL'lar (plugin-redirects, TZ §8.1, §10.10). Yozuvlar lotin (prefikssiz) yo'l bilan
 * saqlanadi (`hooks/contentRedirects.ts`): `/kr/...` so'rovi prefikssiz yo'l bo'yicha qidiriladi
 * va maqsad joriy yozuv prefiksi bilan qaytariladi — `/kr/eski` → `/kr/yangi`.
 *
 * Kontent topilmaganda sahifa (maqola, kategoriya/statik sahifa, teg, muallif) chaqiradi —
 * mavjud kontent URL'lari DB'dagi redirect bilan "yopilmaydi".
 */
export type RedirectLookup = (from: string) => Promise<RedirectTarget | null>

/** `latinPath` — prefikssiz yo'l (`/texnologiyalar/eski-slug`); natija `locale` yozuvida. */
export async function resolveRedirect(
  locale: Locale,
  latinPath: string,
  lookup: RedirectLookup = findRedirect,
): Promise<RedirectTarget | null> {
  const target = await lookup(latinPath)
  return target ? { ...target, to: localizePath(locale, target.to) } : null
}

/** To'liq so'rov yo'li (`/kr/tag/eski` yoki `/tag/eski`) bo'yicha. */
export function resolveRedirectForPathname(
  pathname: string,
  lookup: RedirectLookup = findRedirect,
): Promise<RedirectTarget | null> {
  return resolveRedirect(localeFromPathname(pathname), stripLocalePrefix(pathname), lookup)
}

/** Redirect bo'lsa — yo'naltiradi (301 yozuvi → doimiy, 302 → vaqtinchalik); bo'lmasa qaytadi. */
export async function redirectIfMoved(locale: Locale, latinPath: string): Promise<void> {
  const target = await resolveRedirect(locale, latinPath)
  if (!target) return
  if (target.permanent) permanentRedirect(target.to)
  redirect(target.to)
}
