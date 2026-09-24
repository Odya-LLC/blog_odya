import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/utils'

/** shadcn/ui Badge — teglar, belgilar ("Muhim", "Yangi"), kategoriya chip'lari uchun asos. */
export const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full font-semibold transition-colors [&_svg]:size-3.5',
  {
    variants: {
      variant: {
        default: 'bg-accent text-accent-fg',
        soft: 'bg-accent-soft text-accent-soft-fg',
        secondary: 'bg-surface-muted text-fg',
        outline: 'border border-border text-muted',
        breaking: 'bg-[#B91C1C] text-white',
      },
      size: {
        sm: 'px-2 py-0.5 text-xs',
        default: 'px-2.5 py-1 text-xs',
        lg: 'px-3 py-1.5 text-sm',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export type BadgeProps = React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }

export function Badge({ className, variant, size, asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot : 'span'
  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
}
