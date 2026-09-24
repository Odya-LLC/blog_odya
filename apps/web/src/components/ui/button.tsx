import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/utils'

/** shadcn/ui Button — brend tokenlariga moslangan. Server komponent (asChild bilan havola ham bo'ladi). */
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

export type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}
