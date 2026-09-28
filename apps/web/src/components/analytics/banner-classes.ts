/**
 * Cookie banner tugmalari klasslari — `buttonVariants({ size: 'sm' })` va
 * `buttonVariants({ variant: 'outline', size: 'sm' })` ning tayyor natijasi. Banner lazy chunk'i
 * `cva`/`clsx` ni qayta olib kelmasin (JS byudjeti ≤ 150 KB, TZ §8.4); moslik —
 * `tests/analytics.test.ts`.
 */
const BASE =
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0'

export const BANNER_BUTTON = {
  accept: `${BASE} bg-accent text-accent-fg hover:bg-accent-hover h-9 px-3`,
  decline: `${BASE} border border-border bg-bg text-fg hover:bg-surface-muted h-9 px-3`,
}
