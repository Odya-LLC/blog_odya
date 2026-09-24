import Image from 'next/image'

import { cn } from '@/lib/utils'

import { categoryColorStyle } from './CategoryChip'
import type { CategoryRef, ImageRef } from './types'

const ASPECT = {
  '16/9': 'aspect-video',
  '4/3': 'aspect-[4/3]',
  '1/1': 'aspect-square',
} as const

export type CoverAspect = keyof typeof ASPECT

type CoverImageProps = {
  image?: ImageRef | null
  /** Rasm bo'lmasa — placeholder shu kategoriya rangida. */
  category: CategoryRef
  aspect?: CoverAspect
  /** `next/image` `sizes` — tarmoq sarfini kamaytirish uchun har joyda aniq beriladi. */
  sizes: string
  /** LCP rasmi (hero) uchun `true` (TZ §8.4). */
  priority?: boolean
  className?: string
  /** Placeholder'dagi yorliq ("Rasm yo'q") — ekran o'quvchilar uchun. */
  noImageLabel: string
}

/**
 * Muqova rasm: qat'iy nisbatli konteyner (CLS = 0) + `next/image`.
 * Rasm yo'q bo'lsa — kategoriya `solid` rangidagi placeholder (TZ §12.3).
 */
export function CoverImage({
  image,
  category,
  aspect = '16/9',
  sizes,
  priority = false,
  className,
  noImageLabel,
}: CoverImageProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md bg-surface-muted',
        ASPECT[aspect],
        className,
      )}
    >
      {image ? (
        <Image
          src={image.src}
          alt={image.alt}
          fill
          sizes={sizes}
          // Next.js 16: `priority` eskirgan — LCP rasmi uchun `loading="eager"` + `fetchPriority="high"`
          // (hujjat tavsiyasi; `preload` bir nechta LCP nomzodida ortiqcha yuklaydi).
          {...(priority ? { loading: 'eager' as const, fetchPriority: 'high' as const } : {})}
          placeholder={image.blurDataURL ? 'blur' : 'empty'}
          blurDataURL={image.blurDataURL}
          className="object-cover"
        />
      ) : (
        <NoImagePlaceholder category={category} label={noImageLabel} />
      )}
    </div>
  )
}

type NoImagePlaceholderProps = {
  category: CategoryRef
  label: string
  className?: string
}

/** Rasmsiz kartochka placeholder'i: kategoriya `solid` fon + oq "O" belgisi (AA, brend README §7). */
export function NoImagePlaceholder({ category, label, className }: NoImagePlaceholderProps) {
  return (
    <div
      role="img"
      aria-label={`${label}: ${category.name}`}
      style={categoryColorStyle(category.slug)}
      className={cn(
        '@container absolute inset-0 flex items-end overflow-hidden bg-[var(--cat-solid)] p-3 text-white',
        className,
      )}
    >
      {/* Dekorativ yorug'lik — rasm o'rnini bosuvchi yengil tekstura */}
      <span
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(255,255,255,0.22),transparent_60%)]"
      />
      <span
        aria-hidden
        className="absolute top-1/2 right-[8%] -translate-y-1/2 font-display text-[min(9rem,40cqw)] leading-none font-extrabold text-white/15 select-none"
      >
        O
      </span>
      <span
        aria-hidden
        className="relative line-clamp-1 text-xs font-semibold tracking-wide uppercase @max-[9rem]:hidden"
      >
        {category.name}
      </span>
    </div>
  )
}
