'use client'

import { MenuIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { buttonVariants } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

type HeaderMobileMenuProps = {
  openLabel: string
  closeLabel: string
  title: string
  /** Menyu mazmuni server'da render qilinadi (qidiruv, kategoriyalar, almashtirgich) — client JS kichik. */
  children: ReactNode
  className?: string
}

/** Mobil menyu (burger → o'ng panel). Fokus tuzog'i, Esc, fokus qaytishi — Radix Dialog. */
export function HeaderMobileMenu({
  openLabel,
  closeLabel,
  title,
  children,
  className,
}: HeaderMobileMenuProps) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label={openLabel}
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'rounded-full',
          className,
        )}
      >
        <MenuIcon aria-hidden />
      </SheetTrigger>
      <SheetContent
        side="right"
        closeLabel={closeLabel}
        aria-describedby={undefined}
        onClickCapture={(event) => {
          // Havola bosilganda panel yopiladi (client navigatsiyada Dialog o'zi yopilmaydi).
          if ((event.target as HTMLElement).closest('a')) setOpen(false)
        }}
      >
        <SheetTitle className="pr-10">{title}</SheetTitle>
        {children}
      </SheetContent>
    </Sheet>
  )
}
