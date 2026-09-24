'use client'

import { ChevronDownIcon } from 'lucide-react'
import Link from 'next/link'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

import type { LinkItem } from './types'

type HeaderMoreMenuProps = {
  label: string
  items: Array<LinkItem & { active?: boolean }>
  className?: string
}

/** "Yana" — menyuga sig'magan kategoriyalar (`isInMenu: false`, masalan Ilm-fan). Strelkalar bilan boshqariladi. */
export function HeaderMoreMenu({ label, items, className }: HeaderMoreMenuProps) {
  if (items.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold text-muted transition-colors hover:bg-surface-muted hover:text-fg data-[state=open]:bg-surface-muted data-[state=open]:text-fg',
          className,
        )}
      >
        {label}
        <ChevronDownIcon className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link href={item.href} aria-current={item.active ? 'page' : undefined}>
              {item.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
