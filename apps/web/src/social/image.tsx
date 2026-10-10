/**
 * Ijtimoiy tarmoqlar uchun JPEG rasm (OBLOG-91, shablon — OBLOG-94). Instagram API faqat
 * **JPEG** qabul qiladi (bizning media variantlari — WebP), nisbat 4:5 … 1.91:1.
 *
 * Shablon (`SocialCard`): fon — muqova (focal point bo'yicha kesilgan) yoki muqovasiz brend foni;
 * pastki ~55% qismida qorong'i gradient; pastda **qisqa sarlavha** (Inter Display 800, 2–4
 * qator, o'lchami avtomatik, sig'masa "…"), uning tepasida aksent chiziq, ostida domen; yuqorida —
 * kategoriya chipi (chapda) va "b" belgisi + "Blog Odya" wordmark'i (o'ngda).
 *
 * - Muqova bor — `sharp` bilan kesiladi, ustiga `next/og` (satori) chizgan shaffof qatlam
 *   (gradient + matn) qo'yiladi → JPEG (sifat 85, progressive, mozjpeg).
 * - Muqova yo'q yoki yuklab bo'lmadi — butun kartochka `next/og` da (brend foni), PNG → JPEG.
 * - `overlay: false` (sozlama "Rasm ustida sarlavha" o'chiq) — muqova oddiy kesim (OBLOG-91 kabi).
 *
 * Qatorlar satori'dan oldin o'zimiz bo'linadi (`fitTitle`, shrift glif kengliklari bo'yicha) —
 * shunda 4 qatordan oshmaydi va "…" aniq joyda turadi.
 *
 * Profil to'ri (OBLOG-97): Instagram profil sahifasida postlar **3:4** (vertikal) plitka bo'lib,
 * markazdan kesib ko'rsatiladi — kvadratdan har yondan 135 px, 4:5 dan ~34 px kesiladi. Shuning
 * uchun Instagram variantlarida (square, portrait) chip, wordmark, sarlavha va domen gorizontal
 * "xavfsiz zona" ichida (`paddingX` ≥ kesim + ichki chekka) — to'rda ham hech narsa kesilmaydi.
 *
 * OBLOG-118: `story` (1080×1920) — o'sha shablon, yuqori/pastki ~250 px (Instagram UI) bo'sh, domen
 * o'rnida "Batafsil — profildagi havola"; dayjest karuseli muqovasi — `renderDigestCoverJpeg` (4:5).
 */
import type { Locale } from '@blog-odya/shared/locales'
import { ImageResponse } from 'next/og'
import sharp, { type Metadata, type Sharp } from 'sharp'

import { BRAND_NAME } from '@/site/seo/config'
import { categoryChipColor, loadOgFonts, OgMark, ogDomain } from '@/site/seo/og'

import { type FontMetrics, parseFontMetrics } from './font-metrics'
import { SOCIAL_IMAGE_SIZES, type SocialImageScheme, type SocialImageVariant } from './make/payload'
import { type FittedTitle, fitTitle } from './title'

export const SOCIAL_JPEG_QUALITY = 85
/** Muqova manbasini yuklab olish chegarasi. */
export const SOCIAL_SOURCE_TIMEOUT_MS = 10_000
export const SOCIAL_SOURCE_MAX_BYTES = 25 * 1024 * 1024
export type { SocialImageScheme }

export interface SocialImageCover {
  url: string
  /** Payload focal point, foizda (0–100). */
  focalX?: number | null
  focalY?: number | null
}

export interface SocialImageInput {
  variant: SocialImageVariant
  locale: Locale
  /** Rasm ustidagi qisqa sarlavha (`resolveSocialTitle`). */
  title: string
  category?: { name: string; slug?: string | null; color?: string | null } | null
  cover?: SocialImageCover | null
  /** Muqova ustida sarlavha/brend qatlami (standart — ha). */
  overlay?: boolean
  /** Gradient rangi: `dark` — qora, `brand` — brend ko'k (standart — `dark`). */
  scheme?: SocialImageScheme
  /** Domen yozuvi (standart — `ogDomain(locale)`). */
  domain?: string
}

export interface SocialImageDeps {
  fetch: typeof fetch
}

export const socialImageDeps: SocialImageDeps = { fetch: (...args) => fetch(...args) }

/** Brend tokenlari (design/brand/tokens.json, `activeAccent: blue`). */
const COLORS = {
  background: '#0B0B0F',
  accent600: '#2563EB',
  accent400: '#60A5FA',
  accent900: '#1E3A8A',
  wordmarkFirst: '#F4F4F5',
  domain: '#D4D4D8',
} as const

/** Gradient rangi (RGB) — sxema bo'yicha. */
const SHADE: Record<SocialImageScheme, string> = {
  dark: '0,0,0',
  brand: '8,18,52',
}

/** Story: yuqori va pastki chekka (Instagram UI zonasi ~250 px + ichki chekka). */
export const STORY_SAFE_Y = 288
/** Story: Instagram interfeysi egallaydigan yuqori/pastki zona (px) — matn bo'lmasligi kerak. */
export const STORY_UI_ZONE = 250

/** Story pastki qatori (domen o'rnida) — havola stikeri API'da yo'q, o'quvchi profilga boradi. */
export const STORY_FOOTER: Record<Locale, string> = {
  'uz-Latn': 'Batafsil — profildagi havola',
  'uz-Cyrl': 'Батафсил — профилдаги ҳавола',
}

interface Layout {
  /** Yuqori/pastki chekka. */
  padding: number
  /** Chap/o'ng chekka — Instagram variantlarida profil to'rining 3:4 kesimi + ichki chekka. */
  paddingX: number
  sizes: readonly number[]
  maxLines: number
  lineHeight: number
  chipFont: number
  wordmarkFont: number
  domainFont: number
  /** Pastki gradient balandligi (rasm balandligining ulushi). */
  shade: number
}

const LAYOUTS: Record<SocialImageVariant, Layout> = {
  // 3:4 kesim: 135 px har yondan → 135 + 45. Matn eni 720 px — shrift biroz kichikroq.
  square: {
    padding: 64,
    paddingX: 180,
    sizes: [84, 76, 70, 64, 58, 54, 50],
    maxLines: 4,
    lineHeight: 1.08,
    chipFont: 30,
    wordmarkFont: 40,
    domainFont: 28,
    shade: 0.58,
  },
  // 3:4 kesim: ~34 px har yondan → 34 + 66.
  portrait: {
    padding: 64,
    paddingX: 100,
    sizes: [96, 88, 80, 72, 64, 58],
    maxLines: 4,
    lineHeight: 1.08,
    chipFont: 30,
    wordmarkFont: 40,
    domainFont: 28,
    shade: 0.55,
  },
  // OBLOG-118: story 9:16 — profil to'rida ko'rinmaydi (kesim yo'q). Yuqori va pastki ~250 px da
  // Instagram UI (progress, profil nomi, javob maydoni) — matn 288 px ichkarida.
  story: {
    padding: STORY_SAFE_Y,
    paddingX: 88,
    sizes: [104, 96, 88, 80, 72, 64],
    maxLines: 5,
    lineHeight: 1.08,
    chipFont: 34,
    wordmarkFont: 44,
    domainFont: 34,
    shade: 0.6,
  },
  // Instagram'ga yuborilmaydi (Facebook/LinkedIn) — kesim yo'q.
  landscape: {
    padding: 56,
    paddingX: 56,
    sizes: [66, 60, 54, 48, 44],
    maxLines: 3,
    lineHeight: 1.08,
    chipFont: 24,
    wordmarkFont: 32,
    domainFont: 22,
    shade: 0.68,
  },
}

const TITLE_LETTER_SPACING = -0.02

/** Instagram profil to'ri plitkasining nisbati (eni / bo'yi). */
export const INSTAGRAM_GRID_ASPECT = 3 / 4

/**
 * Profil to'rida variantning har yondan kesiladigan qismi (px, yuqoriga yaxlitlangan). Landscape
 * Instagram'ga yuborilmaydi — 0.
 */
export function socialGridInset(variant: SocialImageVariant): number {
  // Landscape Instagram'ga yuborilmaydi, story profil to'rida ko'rinmaydi.
  if (variant === 'landscape' || variant === 'story') return 0
  const { width, height } = SOCIAL_IMAGE_SIZES[variant]
  return Math.max(0, Math.ceil((width - height * INSTAGRAM_GRID_ASPECT) / 2))
}

/** Variant maketining chekkalari (testlar va oldindan ko'rish uchun). */
export function socialSafeArea(variant: SocialImageVariant): { x: number; y: number } {
  const layout = LAYOUTS[variant]
  return { x: layout.paddingX, y: layout.padding }
}

let metricsPromise: Promise<FontMetrics> | null = null

/** Sarlavha shrifti (Inter Display 800) metrikasi — bir marta o'qiladi. */
export function loadTitleMetrics(): Promise<FontMetrics> {
  metricsPromise ??= loadOgFonts()
    .then((fonts) => {
      const font = fonts.find((item) => item.name === 'Inter Display' && item.weight === 800)
      if (!font) throw new Error('Inter Display 800 shrifti topilmadi')
      return parseFontMetrics(font.data)
    })
    .catch((error: unknown) => {
      metricsPromise = null
      throw error
    })
  return metricsPromise
}

/** Sarlavhani variant maketiga sig'diradi. */
export function fitSocialTitle(
  title: string,
  variant: SocialImageVariant,
  metrics: FontMetrics,
): FittedTitle {
  const layout = LAYOUTS[variant]
  const { width } = SOCIAL_IMAGE_SIZES[variant]
  return fitTitle(title, metrics, {
    // Bir oz zaxira: kerning va satori yaxlitlashi.
    width: width - layout.paddingX * 2 - 8,
    maxLines: layout.maxLines,
    sizes: layout.sizes,
    letterSpacingEm: TITLE_LETTER_SPACING,
  })
}

export interface SocialCardProps {
  variant: SocialImageVariant
  locale: Locale
  fitted: FittedTitle
  category?: SocialImageInput['category']
  scheme: SocialImageScheme
  domain: string
  /** `true` — shaffof fon (muqova ustiga qo'yiladi); `false` — brend foni (muqovasiz). */
  transparent: boolean
}

export function SocialCard({
  variant,
  locale,
  fitted,
  category,
  scheme,
  domain,
  transparent,
}: SocialCardProps) {
  const size = SOCIAL_IMAGE_SIZES[variant]
  const layout = LAYOUTS[variant]
  const [first, second] = BRAND_NAME[locale].split(' ')
  const chipColor = categoryChipColor(category)
  const shade = SHADE[scheme]
  // Sarlavha bloki (chiziq + qatorlar + domen) qayerdan boshlanadi — gradient shunga moslanadi.
  const barHeight = Math.max(6, Math.round(layout.sizes[0]! * 0.085))
  const blockHeight =
    barHeight +
    Math.round(fitted.fontSize * 0.36) +
    fitted.lines.length * fitted.fontSize * layout.lineHeight +
    Math.round(layout.domainFont * 1.1) +
    layout.domainFont * 1.25
  const titleTop = Math.round(size.height - layout.padding - blockHeight)
  const shadeTop = Math.max(
    0,
    Math.min(
      Math.round(size.height * (1 - layout.shade)),
      titleTop - Math.round(size.height * 0.16),
    ),
  )
  // Wordmark ("Blog Odya" pill) ~ 6.5 × shrift; qolgani — chip uchun.
  const chipMaxWidth = size.width - layout.paddingX * 2 - Math.round(layout.wordmarkFont * 7)
  const titleStop = Math.round(((titleTop - shadeTop) / (size.height - shadeTop)) * 100)
  const background = transparent
    ? {}
    : {
        backgroundColor: scheme === 'brand' ? '#0A1638' : COLORS.background,
        backgroundImage: `radial-gradient(circle at 100% 0%, ${COLORS.accent600}A6 0%, ${COLORS.accent600}00 60%), radial-gradient(circle at 0% 100%, ${chipColor}99 0%, ${chipColor}00 55%)`,
      }
  return (
    <div
      style={{
        width: size.width,
        height: size.height,
        display: 'flex',
        position: 'relative',
        fontFamily: 'Inter',
        color: '#FFFFFF',
        ...background,
      }}
    >
      {transparent ? (
        <>
          {/* Yuqori soya — chip va wordmark yorug' muqovada ham o'qilsin. */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: size.width,
              height: Math.round(size.height * 0.24),
              backgroundImage: `linear-gradient(to bottom, rgba(${shade},0.55) 0%, rgba(${shade},0) 100%)`,
            }}
          />
          {/* Pastki gradient: 0 → 92%; sarlavha tepasida kamida 62% — oq muqovada ham oq matn
              kontrasti ≥ 6:1 (WCAG AA, katta matn ≥ 3:1). */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: shadeTop,
              width: size.width,
              height: size.height - shadeTop,
              backgroundImage: `linear-gradient(to bottom, rgba(${shade},0) 0%, rgba(${shade},0.62) ${titleStop}%, rgba(${shade},0.84) ${Math.round((titleStop + 100) / 2)}%, rgba(${shade},0.92) 100%)`,
            }}
          />
        </>
      ) : null}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: size.width,
          height: size.height,
          padding: `${layout.padding}px ${layout.paddingX}px`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
          }}
        >
          {category?.name ? (
            <div
              style={{
                display: 'flex',
                // Uzun kategoriya nomi wordmark'ga tegmasin — "…" bilan qisqaradi.
                maxWidth: chipMaxWidth,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                backgroundColor: chipColor,
                color: '#FFFFFF',
                fontSize: layout.chipFont,
                fontWeight: 600,
                padding: `${Math.round(layout.chipFont * 0.36)}px ${Math.round(layout.chipFont * 0.8)}px`,
                borderRadius: 9999,
                border: '2px solid rgba(255,255,255,0.18)',
              }}
            >
              {category.name}
            </div>
          ) : (
            <div style={{ display: 'flex' }} />
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              fontFamily: 'Inter Display',
              fontSize: layout.wordmarkFont,
              letterSpacing: '-0.025em',
              // Muqova ustida — yarim shaffof qorong'i "pill": yorug' fonda ham o'qiladi.
              ...(transparent
                ? {
                    backgroundColor: 'rgba(11,11,15,0.62)',
                    padding: `${Math.round(layout.chipFont * 0.22)}px ${Math.round(layout.chipFont * 0.7)}px`,
                    borderRadius: 9999,
                  }
                : {}),
            }}
          >
            <OgMark
              height={Math.round(layout.wordmarkFont * 1.2)}
              color={COLORS.wordmarkFirst}
              style={{ marginRight: Math.round(layout.wordmarkFont * 0.35) }}
            />
            <span style={{ fontWeight: 600, color: COLORS.wordmarkFirst }}>{first}</span>
            <span
              style={{
                fontWeight: 800,
                color: COLORS.accent400,
                marginLeft: Math.round(layout.wordmarkFont * 0.27),
              }}
            >
              {second}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              width: Math.round(layout.sizes[0]! * 0.75),
              height: barHeight,
              borderRadius: 9999,
              backgroundColor: COLORS.accent400,
              marginBottom: Math.round(fitted.fontSize * 0.36),
            }}
          />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontFamily: 'Inter Display',
              fontWeight: 800,
              fontSize: fitted.fontSize,
              lineHeight: layout.lineHeight,
              letterSpacing: `${TITLE_LETTER_SPACING}em`,
              ...(transparent ? { textShadow: '0 2px 16px rgba(0,0,0,0.35)' } : {}),
            }}
          >
            {fitted.lines.map((line, index) => (
              <div key={index} style={{ display: 'flex', whiteSpace: 'nowrap' }}>
                {line}
              </div>
            ))}
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: Math.round(layout.domainFont * 1.1),
              fontSize: layout.domainFont,
              fontWeight: 500,
              color: COLORS.domain,
            }}
          >
            {domain}
          </div>
        </div>
      </div>
    </div>
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/** Rasmni `width×height` ga focal point atrofida kesadi (kichik bo'lsa — kattalashtiradi). */
function cropPipeline(
  source: Buffer,
  meta: Metadata,
  target: { width: number; height: number },
  focal: { x?: number | null; y?: number | null },
): Sharp {
  // `rotate()` EXIF bo'yicha buradi — 90/270 da eni va bo'yi almashadi.
  const swap = (meta.orientation ?? 1) >= 5
  const srcW = (swap ? meta.height : meta.width) ?? 0
  const srcH = (swap ? meta.width : meta.height) ?? 0
  if (!srcW || !srcH) throw new Error('rasm o‘lchami aniqlanmadi')
  const scale = Math.max(target.width / srcW, target.height / srcH)
  const width = Math.max(target.width, Math.round(srcW * scale))
  const height = Math.max(target.height, Math.round(srcH * scale))
  const fx = clamp((focal.x ?? 50) / 100, 0, 1)
  const fy = clamp((focal.y ?? 50) / 100, 0, 1)
  const left = clamp(Math.round(width * fx - target.width / 2), 0, width - target.width)
  const top = clamp(Math.round(height * fy - target.height / 2), 0, height - target.height)
  return sharp(source, { failOn: 'error' })
    .rotate()
    .resize(width, height, { fit: 'fill' })
    .extract({ left, top, width: target.width, height: target.height })
    .flatten({ background: COLORS.background })
}

const toJpeg = (image: Sharp) =>
  image.jpeg({ quality: SOCIAL_JPEG_QUALITY, progressive: true, mozjpeg: true }).toBuffer()

/** Muqovani kesib JPEG qiladi (sarlavhasiz — `overlay: false`). */
export async function cropToJpeg(
  source: Buffer,
  target: { width: number; height: number },
  focal: { x?: number | null; y?: number | null } = {},
): Promise<Buffer> {
  const meta = await sharp(source, { failOn: 'error' }).metadata()
  return toJpeg(cropPipeline(source, meta, target, focal))
}

async function fetchSource(url: string, deps: SocialImageDeps): Promise<Buffer> {
  const response = await deps.fetch(url, { signal: AbortSignal.timeout(SOCIAL_SOURCE_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`muqova yuklanmadi: HTTP ${response.status}`)
  const length = Number(response.headers.get('content-length') ?? 0)
  if (length > SOCIAL_SOURCE_MAX_BYTES) throw new Error('muqova juda katta')
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.byteLength > SOCIAL_SOURCE_MAX_BYTES) throw new Error('muqova juda katta')
  return buffer
}

/** Sarlavha ostidagi qator: story — "Batafsil — profildagi havola", boshqalar — domen. */
function defaultFooter(variant: SocialImageVariant, locale: Locale): string {
  return variant === 'story' ? STORY_FOOTER[locale] : ogDomain(locale)
}

/** Shablon qatlami (PNG): `transparent` — muqova ustiga, aks holda to'liq kartochka. */
async function renderCardPng(input: SocialImageInput, transparent: boolean): Promise<Buffer> {
  const size = SOCIAL_IMAGE_SIZES[input.variant]
  const [fonts, metrics] = await Promise.all([loadOgFonts(), loadTitleMetrics()])
  const fitted = fitSocialTitle(input.title, input.variant, metrics)
  const response = new ImageResponse(
    <SocialCard
      variant={input.variant}
      locale={input.locale}
      fitted={fitted}
      category={input.category}
      scheme={input.scheme ?? 'dark'}
      domain={input.domain ?? defaultFooter(input.variant, input.locale)}
      transparent={transparent}
    />,
    { ...size, fonts },
  )
  return Buffer.from(await response.arrayBuffer())
}

/** Muqovasiz post uchun brend kartochkasi (JPEG). */
export async function renderCardJpeg(input: SocialImageInput): Promise<Buffer> {
  const png = await renderCardPng(input, false)
  return toJpeg(sharp(png).flatten({ background: COLORS.background }))
}

/** Muqova + sarlavha qatlami (JPEG). */
export async function renderCoverJpeg(source: Buffer, input: SocialImageInput): Promise<Buffer> {
  const size = SOCIAL_IMAGE_SIZES[input.variant]
  const meta = await sharp(source, { failOn: 'error' }).metadata()
  const focal = { x: input.cover?.focalX, y: input.cover?.focalY }
  if (input.overlay === false) return toJpeg(cropPipeline(source, meta, size, focal))
  const [base, overlay] = await Promise.all([
    cropPipeline(source, meta, size, focal).png({ compressionLevel: 0 }).toBuffer(),
    renderCardPng(input, true),
  ])
  return toJpeg(sharp(base).composite([{ input: overlay, left: 0, top: 0 }]))
}

/**
 * Variant JPEG'i. Muqova xatosi (404, buzilgan fayl) — kartochkaga qaytadi; `source` — qaysi
 * yo'l ishlatilgani (log/sarlavha uchun).
 */
export async function renderSocialImage(
  input: SocialImageInput,
  deps: SocialImageDeps = socialImageDeps,
  onCoverError?: (error: unknown) => void,
): Promise<{ body: Buffer; source: 'cover' | 'card' }> {
  if (input.cover?.url) {
    try {
      const source = await fetchSource(input.cover.url, deps)
      return { body: await renderCoverJpeg(source, input), source: 'cover' }
    } catch (error) {
      onCoverError?.(error)
    }
  }
  return { body: await renderCardJpeg(input), source: 'card' }
}

// ---------------------------------------------------------------------------
// Instagram dayjest karuselining muqova slaydi (OBLOG-118)
// ---------------------------------------------------------------------------

/** Muqova slaydi — 4:5 (karuseldagi post slaydlari bilan bir xil), profil to'ri xavfsiz zonasi bilan. */
export const DIGEST_COVER_SIZE = SOCIAL_IMAGE_SIZES.portrait
/** Muqovadagi sarlavhalar ro'yxati — ko'pi bilan (qolgani — "va yana N ta yangilik"). */
export const DIGEST_COVER_MAX_TITLES = 5

const COVER = {
  padding: 72,
  // OBLOG-97: 4:5 profil to'rida har yondan ~34 px kesiladi — portrait bilan bir xil chekka.
  paddingX: LAYOUTS.portrait.paddingX,
  labelFont: 34,
  dateFont: 112,
  numberWidth: 64,
  itemSizes: [46, 42, 38, 34],
  itemMaxLines: 2,
  itemLineHeight: 1.12,
  itemGap: 30,
  footerFont: 30,
  wordmarkFont: 40,
} as const

const COVER_TEXT: Record<Locale, { label: string; cta: string; more: (count: number) => string }> =
  {
    'uz-Latn': {
      label: 'Kun yangiliklari',
      cta: 'Havola profilda',
      more: (count) => `va yana ${count} ta yangilik`,
    },
    'uz-Cyrl': {
      label: 'Кун янгиликлари',
      cta: 'Ҳавола профилда',
      more: (count) => `ва яна ${count} та янгилик`,
    },
  }

export interface DigestCoverInput {
  locale: Locale
  /** Sana, masalan `10-oktabr` (`digestDateParts`). */
  date: string
  /** Dayjestdagi postlarning qisqa sarlavhalari (tartib bo'yicha; birinchi 5 tasi chiziladi). */
  titles: readonly string[]
  /** Domen yozuvi (standart — `ogDomain(locale)`). */
  domain?: string
}

/**
 * Muqova ro'yxati sarlavhalari: hammasi uchun bitta (eng katta sig'adigan) shrift o'lchami, har
 * sarlavha ≤ 2 qator; eng kichik o'lchamda ham sig'masa — "…".
 */
export function fitDigestCoverTitles(
  titles: readonly string[],
  metrics: FontMetrics,
): FittedTitle[] {
  const width = DIGEST_COVER_SIZE.width - COVER.paddingX * 2 - COVER.numberWidth - 8
  const fit = (size: number) =>
    titles.map((title) =>
      fitTitle(title, metrics, {
        width,
        maxLines: COVER.itemMaxLines,
        sizes: [size],
        letterSpacingEm: TITLE_LETTER_SPACING,
      }),
    )
  for (const size of COVER.itemSizes) {
    const fitted = fit(size)
    if (fitted.every((item) => !item.truncated)) return fitted
  }
  return fit(COVER.itemSizes[COVER.itemSizes.length - 1])
}

/** Xavfsiz zona (testlar uchun): matn chap/o'ng chekkadan shuncha ichkarida. */
export function digestCoverSafeArea(): { x: number; y: number } {
  return { x: COVER.paddingX, y: COVER.padding }
}

export function DigestCoverCard({
  locale,
  date,
  items,
  more,
  domain,
}: {
  locale: Locale
  date: string
  items: FittedTitle[]
  more: number
  domain: string
}) {
  const { width, height } = DIGEST_COVER_SIZE
  const text = COVER_TEXT[locale]
  const [first, second] = BRAND_NAME[locale].split(' ')
  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: `${COVER.padding}px ${COVER.paddingX}px`,
        fontFamily: 'Inter',
        color: '#FFFFFF',
        backgroundColor: COLORS.background,
        backgroundImage: `radial-gradient(circle at 100% 0%, ${COLORS.accent600}A6 0%, ${COLORS.accent600}00 60%), radial-gradient(circle at 0% 100%, ${COLORS.accent900}CC 0%, ${COLORS.accent900}00 60%)`,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            fontFamily: 'Inter Display',
            fontSize: COVER.wordmarkFont,
            letterSpacing: '-0.025em',
          }}
        >
          <OgMark
            height={Math.round(COVER.wordmarkFont * 1.2)}
            color={COLORS.wordmarkFirst}
            style={{ marginRight: Math.round(COVER.wordmarkFont * 0.35) }}
          />
          <span style={{ fontWeight: 600, color: COLORS.wordmarkFirst }}>{first}</span>
          <span
            style={{
              fontWeight: 800,
              color: COLORS.accent400,
              marginLeft: Math.round(COVER.wordmarkFont * 0.27),
            }}
          >
            {second}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 44,
            fontSize: COVER.labelFont,
            fontWeight: 600,
            color: COLORS.accent400,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {text.label}
        </div>
        <div
          style={{
            display: 'flex',
            fontFamily: 'Inter Display',
            fontWeight: 800,
            fontSize: COVER.dateFont,
            lineHeight: 1.05,
            letterSpacing: `${TITLE_LETTER_SPACING}em`,
          }}
        >
          {date}
        </div>
        <div
          style={{
            display: 'flex',
            width: 84,
            height: 8,
            borderRadius: 9999,
            backgroundColor: COLORS.accent400,
            marginTop: 24,
          }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {items.map((item, index) => (
          <div key={index} style={{ display: 'flex', marginTop: index === 0 ? 0 : COVER.itemGap }}>
            <div
              style={{
                display: 'flex',
                width: COVER.numberWidth,
                flexShrink: 0,
                fontFamily: 'Inter Display',
                fontWeight: 800,
                fontSize: item.fontSize,
                lineHeight: COVER.itemLineHeight,
                color: COLORS.accent400,
              }}
            >
              {index + 1}
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                fontFamily: 'Inter Display',
                fontWeight: 800,
                fontSize: item.fontSize,
                lineHeight: COVER.itemLineHeight,
                letterSpacing: `${TITLE_LETTER_SPACING}em`,
              }}
            >
              {item.lines.map((line, lineIndex) => (
                <div key={lineIndex} style={{ display: 'flex', whiteSpace: 'nowrap' }}>
                  {line}
                </div>
              ))}
            </div>
          </div>
        ))}
        {more > 0 ? (
          <div
            style={{
              display: 'flex',
              marginTop: COVER.itemGap,
              marginLeft: COVER.numberWidth,
              fontSize: COVER.footerFont,
              fontWeight: 600,
              color: COLORS.domain,
            }}
          >
            {text.more(more)}
          </div>
        ) : null}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: COVER.footerFont,
          fontWeight: 600,
        }}
      >
        <div style={{ display: 'flex', color: '#FFFFFF' }}>{`${text.cta} →`}</div>
        <div style={{ display: 'flex', fontWeight: 500, color: COLORS.domain }}>{domain}</div>
      </div>
    </div>
  )
}

/** Dayjest muqova slaydi (JPEG, 1080×1350): sana, birinchi 5 sarlavha, "Havola profilda". */
export async function renderDigestCoverJpeg(input: DigestCoverInput): Promise<Buffer> {
  const [fonts, metrics] = await Promise.all([loadOgFonts(), loadTitleMetrics()])
  const shown = input.titles.slice(0, DIGEST_COVER_MAX_TITLES)
  const response = new ImageResponse(
    <DigestCoverCard
      locale={input.locale}
      date={input.date}
      items={fitDigestCoverTitles(shown, metrics)}
      more={Math.max(0, input.titles.length - shown.length)}
      domain={input.domain ?? ogDomain(input.locale)}
    />,
    { ...DIGEST_COVER_SIZE, fonts },
  )
  const png = Buffer.from(await response.arrayBuffer())
  return toJpeg(sharp(png).flatten({ background: COLORS.background }))
}
