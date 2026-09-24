import type { Locale } from '@blog-odya/shared'

/** `?script=kr` → kirill, aks holda lotin. */
export function localeFromParam(script: string | string[] | undefined): Locale {
  const value = Array.isArray(script) ? script[0] : script
  return value === 'kr' || value === 'cyrl' || value === 'uz-Cyrl' ? 'uz-Cyrl' : 'uz-Latn'
}
