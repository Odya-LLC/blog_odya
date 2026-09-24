'use client'

import { MenuIcon, XIcon } from 'lucide-react'
import { type MouseEvent, type ReactNode, useId, useRef } from 'react'

import { cx, ICON_BUTTON_CLASS } from './client-classes'

type HeaderMobileMenuProps = {
  openLabel: string
  closeLabel: string
  title: string
  /** Menyu mazmuni server'da render qilinadi (qidiruv, kategoriyalar, almashtirgich) — client JS kichik. */
  children: ReactNode
  className?: string
}

/**
 * Mobil menyu (burger → o'ng panel) — brauzerning `<dialog>` elementi (`showModal`): fokus
 * modal ichida, orqa fon `inert`, Esc bilan yopiladi, fokus tugmaga qaytadi. Kutubxonasiz —
 * birinchi yuklash JS byudjeti (TZ §8.4: ≤ 150 KB gzip) uchun Radix Dialog o'rniga (M1-07).
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

  const onDialogClick = (event: MouseEvent<HTMLDialogElement>) => {
    // Orqa fon (dialog elementining o'zi) yoki havola bosilganda — yopiladi (client navigatsiya).
    const target = event.target as HTMLElement
    if (target === event.currentTarget || target.closest('a')) close()
  }

  return (
    <>
      <button
        type="button"
        aria-label={openLabel}
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
        className={cx(ICON_BUTTON_CLASS, className)}
      >
        <MenuIcon aria-hidden />
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClick={onDialogClick}
        className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-[88%] max-w-sm overflow-y-auto border-l border-border bg-bg p-0 text-fg shadow-xl backdrop:bg-black/50"
      >
        <div className="flex min-h-full flex-col gap-4 p-5">
          <h2 id={titleId} className="pr-10 font-display text-lg font-bold text-fg">
            {title}
          </h2>
          {children}
        </div>
        <button
          type="button"
          // Ochilganda fokus — yopish tugmasiga (mobil klaviatura qidiruv maydonida ochilmasin).
          autoFocus
          onClick={close}
          aria-label={closeLabel}
          className="absolute top-3 right-3 inline-flex size-10 items-center justify-center rounded-md text-muted hover:bg-surface-muted hover:text-fg"
        >
          <XIcon className="size-5" aria-hidden />
        </button>
      </dialog>
    </>
  )
}
