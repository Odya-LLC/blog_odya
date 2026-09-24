import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

type ArticleBodyProps = {
  /** M1-05: Lexical → JSX renderer natijasi (paragraf, sarlavha, ro'yxat, iqtibos, rasm, kod, jadval, embed). */
  children: ReactNode
  lang?: string
  className?: string
}

/**
 * Maqola matni tipografiyasi (TZ §12.3): kengligi ≤ 680 px, 18 px / 1.7, Habr uslubidagi
 * kod bloklari va jadvallar. Ranglar brend tokenlaridan (`prose-odya`, styles.css) — light/dark avtomatik.
 */
export function ArticleBody({ children, lang, className }: ArticleBodyProps) {
  return (
    <div
      lang={lang}
      className={cn('prose prose-odya mx-auto w-full max-w-[680px] break-words', className)}
    >
      {children}
    </div>
  )
}
