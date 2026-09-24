import { ChevronRightIcon } from 'lucide-react'
import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'

import { cn } from '@/lib/utils'

type SectionHeadingProps = {
  id?: string
  children: ReactNode
  /** "Barchasi →" havolasi. */
  action?: { label: string; href: string }
  as?: 'h2' | 'h3'
  /** Chiziq rangi (masalan, kategoriya rangi); standart — aksent. */
  barStyle?: CSSProperties
  className?: string
}

/** Blok sarlavhasi: chapda rangli chiziq + katta qalin matn, o'ngda "Barchasi". */
export function SectionHeading({
  id,
  children,
  action,
  as: Heading = 'h2',
  barStyle,
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn('flex items-end justify-between gap-4 border-b border-border pb-3', className)}
    >
      <Heading
        id={id}
        className="flex items-center gap-2.5 font-display text-xl font-extrabold text-fg sm:text-2xl"
      >
        <span aria-hidden className="h-5 w-1.5 rounded-full bg-accent sm:h-6" style={barStyle} />
        {children}
      </Heading>
      {action ? (
        <Link
          href={action.href}
          className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-accent hover:text-accent-hover"
        >
          {action.label}
          <ChevronRightIcon className="size-4" aria-hidden />
        </Link>
      ) : null}
    </div>
  )
}
