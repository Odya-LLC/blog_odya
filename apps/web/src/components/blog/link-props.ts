/**
 * Menyu havolasi `newTab` (`header`/`footer` global'lari, `fields/link.ts`) — yangi oynada,
 * `noopener noreferrer`. Yon ta'sirsiz, bog'liqliksiz (client komponentlarda ham ishlatiladi).
 */
export function newTabProps(
  newTab: boolean | null | undefined,
): { target: '_blank'; rel: 'noopener noreferrer' } | Record<string, never> {
  return newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {}
}
