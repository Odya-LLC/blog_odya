import * as React from 'react'

import { cn } from '@/lib/utils'

/** shadcn/ui Input. */
export function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-10 w-full min-w-0 rounded-md border border-input bg-bg px-3 text-sm text-fg transition-colors placeholder:text-subtle focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
