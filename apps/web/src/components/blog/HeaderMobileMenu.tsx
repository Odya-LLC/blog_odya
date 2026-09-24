'use client'

import { MenuIcon, XIcon } from 'lucide-react'
// clsx (tailwind-merge'siz): client bundle'da twMerge bo'lmasin — JS byudjeti (TZ §8.4).
import { clsx as cn } from 'clsx'
import { type ReactNode, useId, useRef } from 'react'

import { buttonVariants } from '@/components/ui/button-variants'

type HeaderMobileMenuProps = {
  openLabel: string
  closeLabel: string
  title: string
  /** Menyu mazmuni server'da render qilinadi (qidiruv, kategoriyalar, almashtirgich) — client JS kichik. */
  children: ReactNode
  className?: string
}

/**
 * Mobil menyu (burger → o'ng panel) — brauzerning `<dialog>` elementi (`showModal()`): sahifaning
 * qolgan qismi `inert`, Esc yopadi, fokus panel ichida va yopilganda tugmaga qaytadi. Radix Dialog
 * o'rniga (M1-07: birinchi yuklash JS ≤ 150 KB gzip, TZ §8.4).
 */
export function HeaderMobileMenu({
  openLabel,
  closeLabel,
  title,
  children,
  className,
}: HeaderMobileMenuProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const close = () => dialogRef.current?.close()

  return (
    <>
      <button
        type="button"
        aria-label={openLabel}
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'rounded-full!',
          className,
        )}
      >
        <MenuIcon aria-hidden />
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClick={(event) => {
          // Fonga (backdrop) bosish yoki havola tanlash — panel yopiladi.
          const target = event.target as HTMLElement
          if (target === event.currentTarget || target.closest('a')) close()
        }}
        className="m-0 ml-auto h-dvh max-h-dvh w-[88%] max-w-sm border-0 border-l border-border bg-bg p-0 text-fg shadow-xl backdrop:bg-black/50"
      >
        <div className="relative flex min-h-full flex-col gap-4 p-5">
          <h2 id={titleId} className="pr-10 font-display text-lg font-bold text-fg">
            {title}
          </h2>
          {children}
          <button
            type="button"
            aria-label={closeLabel}
            onClick={close}
            className="absolute top-3 right-3 inline-flex size-10 items-center justify-center rounded-md text-muted hover:bg-surface-muted hover:text-fg"
          >
            <XIcon className="size-5" aria-hidden />
          </button>
        </div>
      </dialog>
    </>
  )
}
