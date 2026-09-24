/**
 * Avtomatik OG rasm (TZ §8.2): 1200×630, `next/og` (satori). Maket — brend README §6
 * (M0-06, `design/brand/scripts/build.mjs` → `ogElement`): "Fon A" (muqovasiz) — qorong'i fon +
 * aksent nurlari, yuqorida kategoriya chipi, o'rtada sarlavha (Inter Display 800, ≤ 3 qator),
 * pastda wordmark va domen. Ikkala yozuv: kirillda "Блог Одя" va `…/kr`.
 *
 * Shriftlar — `assets/og-fonts/*.ttf` (Inter 4.1, SIL OFL 1.1; satori WOFF2/variable'ni
 * qo'llamaydi): lotin + kirill subset, `fs` bilan yuklanadi (runtime `nodejs`).
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { Locale } from '@blog-odya/shared'
import { ImageResponse } from 'next/og'

import { BRAND_NAME, siteOrigin } from './config'

export const OG_SIZE = { width: 1200, height: 630 } as const
const PADDING = 72

/** Brend tokenlari (design/brand/tokens.json, `activeAccent: blue`). */
const COLORS = {
  background: '#0B0B0F',
  accent600: '#2563EB',
  accent900: '#1E3A8A',
  wordmarkFirst: '#F4F4F5',
  wordmarkAccent: '#60A5FA',
  domain: '#A1A1AA',
  glowAlpha: 0.55,
} as const

/** Kategoriya `solid` ranglari (tokens.json → color.category.*.solid) — DB'da rang bo'lmasa. */
export const CATEGORY_SOLID: Record<string, string> = {
  'suniy-intellekt': '#52397F',
  texnologiyalar: '#39577F',
  gadjetlar: '#39737F',
  dasturlash: '#397F59',
  kiberxavfsizlik: '#7F3940',
  kibersport: '#7F5239',
  oyinlar: '#7F396A',
  startaplar: '#7F6739',
  'ilm-fan': '#597F39',
}

/** Sarlavha uzunligiga qarab shrift o'lchami (brend README §6: 3 qatorga sig'ishi uchun). */
export function ogTitleSize(title: string): number {
  const length = [...title].length
  if (length <= 50) return 72
  if (length <= 80) return 64
  if (length <= 110) return 56
  return 48
}

/** Juda uzun sarlavha — satori `lineClamp` bilan ham qisqartiriladi, bu yerda — xavfsizlik uchun. */
function clampTitle(title: string, max = 160): string {
  const chars = [...title.trim()]
  return chars.length <= max ? chars.join('') : `${chars.slice(0, max - 1).join('')}…`
}

export type OgCardProps = {
  locale: Locale
  title: string
  category?: { name: string; color?: string | null; slug?: string | null } | null
  /** Pastki o'ngdagi domen (`blog.odya.uz` / `blog.odya.uz/kr`). */
  domain?: string
}

export function ogDomain(locale: Locale, origin: string = siteOrigin()): string {
  const host = new URL(origin).host
  return locale === 'uz-Cyrl' ? `${host}/kr` : host
}

function hexAlpha(alpha: number): string {
  return Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')
}

export function OgCard({ locale, title, category, domain }: OgCardProps) {
  const [first, second] = BRAND_NAME[locale].split(' ')
  const glow = `${COLORS.accent600}${hexAlpha(COLORS.glowAlpha)}`
  const chipColor =
    (category?.color && /^#[0-9a-f]{6}$/i.test(category.color) ? category.color : null) ??
    (category?.slug ? CATEGORY_SOLID[category.slug] : undefined) ??
    COLORS.accent600
  const text = clampTitle(title)
  return (
    <div
      style={{
        width: OG_SIZE.width,
        height: OG_SIZE.height,
        padding: PADDING,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        fontFamily: 'Inter',
        color: '#FFFFFF',
        backgroundColor: COLORS.background,
        backgroundImage: `radial-gradient(circle at 100% 0%, ${glow} 0%, ${COLORS.accent600}00 62%), radial-gradient(circle at 0% 100%, ${COLORS.accent900}66 0%, ${COLORS.accent900}00 45%)`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', minHeight: 58 }}>
        {category?.name ? (
          <div
            style={{
              display: 'flex',
              backgroundColor: chipColor,
              color: '#FFFFFF',
              fontSize: 26,
              fontWeight: 600,
              padding: '10px 22px',
              borderRadius: 9999,
              letterSpacing: '-0.005em',
            }}
          >
            {category.name}
          </div>
        ) : null}
      </div>
      <div
        style={{
          display: 'block',
          fontFamily: 'Inter Display',
          fontWeight: 800,
          fontSize: ogTitleSize(text),
          lineHeight: 1.12,
          letterSpacing: '-0.025em',
          maxWidth: OG_SIZE.width - PADDING * 2,
          lineClamp: 3,
        }}
      >
        {text}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontFamily: 'Inter Display',
            fontSize: 40,
            letterSpacing: '-0.025em',
          }}
        >
          <span style={{ fontWeight: 600, color: COLORS.wordmarkFirst }}>{first}</span>
          <span style={{ fontWeight: 800, color: COLORS.wordmarkAccent, marginLeft: 11 }}>
            {second}
          </span>
        </div>
        <div style={{ display: 'flex', fontSize: 26, fontWeight: 500, color: COLORS.domain }}>
          {domain ?? ogDomain(locale)}
        </div>
      </div>
    </div>
  )
}

type FontSpec = { name: string; file: string; weight: 500 | 600 | 800 }

const FONT_SPECS: FontSpec[] = [
  { name: 'Inter', file: 'Inter-Medium.ttf', weight: 500 },
  { name: 'Inter', file: 'Inter-SemiBold.ttf', weight: 600 },
  { name: 'Inter Display', file: 'InterDisplay-SemiBold.ttf', weight: 600 },
  { name: 'Inter Display', file: 'InterDisplay-ExtraBold.ttf', weight: 800 },
]

/** `apps/web/assets/og-fonts` — `next.config.ts` → `outputFileTracingIncludes` (`/og/**`). */
export const OG_FONTS_DIR = path.join('assets', 'og-fonts')

type LoadedFont = {
  name: string
  data: ArrayBuffer
  weight: 500 | 600 | 800
  style: 'normal'
}

let fontsPromise: Promise<LoadedFont[]> | null = null

export function loadOgFonts(): Promise<LoadedFont[]> {
  fontsPromise ??= Promise.all(
    FONT_SPECS.map(async (spec) => {
      const buffer = await readFile(path.join(process.cwd(), OG_FONTS_DIR, spec.file))
      const data = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ) as ArrayBuffer
      return { name: spec.name, data, weight: spec.weight, style: 'normal' as const }
    }),
  ).catch((error: unknown) => {
    fontsPromise = null
    throw error
  })
  return fontsPromise
}

/** OG rasm javobi (PNG). `cacheSeconds` — CDN keshi (URL `?v=` bilan versiyalanadi). */
export async function ogImageResponse(
  props: OgCardProps,
  cacheSeconds = 60 * 60 * 24,
): Promise<ImageResponse> {
  return new ImageResponse(<OgCard {...props} />, {
    ...OG_SIZE,
    fonts: await loadOgFonts(),
    headers: {
      'Cache-Control': `public, max-age=3600, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds}`,
    },
  })
}
