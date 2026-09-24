import { cva } from 'class-variance-authority'

/**
 * Tugma klasslari (shadcn/ui Button variantlari) — alohida modul: client komponentlar (ThemeToggle,
 * mobil menyu) faqat shuni import qiladi, `cn()`/tailwind-merge client bundle'ga tushmaydi
 * (M1-07: birinchi yuklash JS ≤ 150 KB gzip, TZ §8.4). Server komponentlar `@/components/ui/button`
 * dan foydalanadi (u shu yerdan qayta eksport qiladi).
 */
export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-accent text-accent-fg hover:bg-accent-hover',
        secondary: 'bg-surface-muted text-fg hover:bg-border',
        outline: 'border border-border bg-bg text-fg hover:bg-surface-muted',
        ghost: 'text-fg hover:bg-surface-muted',
        soft: 'bg-accent-soft text-accent-soft-fg hover:bg-accent-soft/80',
        telegram: 'bg-telegram text-white hover:bg-telegram-hover',
        link: 'h-auto px-0 text-accent underline-offset-4 hover:text-accent-hover hover:underline',
      },
      size: {
        sm: 'h-9 px-3',
        default: 'h-10 px-4',
        lg: 'h-12 px-6 text-base',
        icon: 'size-10',
        'icon-sm': 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)
