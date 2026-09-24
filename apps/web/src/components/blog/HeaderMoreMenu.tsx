'use client'

import { ChevronDownIcon } from 'lucide-react'
import Link from 'next/link'
import { type FocusEvent, useEffect, useId, useRef, useState } from 'react'

import { cx } from './client-classes'
import type { LinkItem } from './types'

type HeaderMoreMenuProps = {
  label: string
  items: Array<LinkItem & { active?: boolean }>
  className?: string
}

/**
 * "Yana" — menyuga sig'magan bandlar (`isInMenu: false`, masalan Ilm-fan). Navigatsiya uchun
 * "disclosure" namunasi (WAI-ARIA): tugma `aria-expanded` + havolalar ro'yxati; Esc, tashqariga
 * bosish yoki fokus chiqib ketganda yopiladi. Kutubxonasiz (JS byudjeti, TZ §8.4 — M1-07).
 */
export function HeaderMoreMenu({ label, items, className }: HeaderMoreMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (items.length === 0) return null

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
  }

  return (
    <div ref={rootRef} className={cx('relative', className)} onBlur={onBlur}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        data-state={open ? 'open' : 'closed'}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold text-muted transition-colors hover:bg-surface-muted hover:text-fg data-[state=open]:bg-surface-muted data-[state=open]:text-fg"
      >
        {label}
        <ChevronDownIcon
          className={cx('size-4 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      <ul
        id={listId}
        hidden={!open}
        className="absolute top-full right-0 z-50 mt-1 min-w-48 overflow-hidden rounded-md border border-border bg-bg p-1 text-fg shadow-lg"
      >
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              onClick={() => setOpen(false)}
              {...(item.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className="flex items-center gap-2 rounded-sm px-3 py-2 text-sm font-medium outline-none hover:bg-surface-muted focus-visible:bg-surface-muted aria-[current=page]:text-accent"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
