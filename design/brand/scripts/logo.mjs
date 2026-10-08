// Blog Odya logotipi (OBLOG-96): "b" belgisi — vektor geometriya, favicon/ilova ikonkalari,
// shaffof PNG'lar, Telegram avatari va sayt (`apps/web`) fayllari shu skriptdan generatsiya qilinadi.
// Ishga tushirish: cd design/brand/scripts && npm install --no-package-lock && node logo.mjs
// Shrift kerak emas (build.mjs dan farqli — Inter yuklanmaydi).
//
// Manba: dizaynerning `logo/source-1080.jpg` (1080×1080, qora fonda oq belgi). Belgi aylanalardan
// tuzilgan — o'lchamlar JPG piksellariga moslab topilgan (IoU 0.985; farq faqat halqa yuqori doiraga
// tutashgan joydagi kulrang artefaktda, uni oq qilib chizamiz).
import { Resvg } from '@resvg/resvg-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pngToIco from 'png-to-ico'

const here = path.dirname(fileURLToPath(import.meta.url))
const brand = path.resolve(here, '..')
const repo = path.resolve(brand, '../..')
const web = path.join(repo, 'apps/web')
const tokens = JSON.parse(fs.readFileSync(path.join(brand, 'tokens.json'), 'utf8'))

/** Qorong'i fon — brend neytrali 950 (`#0B0B0F`), oq — sof oq. */
const DARK = tokens.color.neutral['950']
const LIGHT = '#FFFFFF'

const write = (abs, data) => {
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, data)
  console.log('✓', path.relative(repo, abs).replaceAll('\\', '/'))
}
const writeBrand = (rel, data) => write(path.join(brand, rel), data)
const png = (svg, width) =>
  new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false } })
    .render()
    .asPng()

// ---------------------------------------------------------------------------
// 1. Geometriya. Belgi: yuqorida to'la doira (r1), chapda vertikal ustun, pastda halqa
//    (tashqi radius R, qalinligi s). Ustun ichki burchagi — radiusi r1 − s bo'lgan yoy: u yuqori
//    doiraning pastki nuqtasidan boshlanib, halqa ichki aylanasining chap nuqtasiga urinadi.
//    Ustunning chap cheti = doiraning chap cheti = halqaning chap cheti (x = 0).
// ---------------------------------------------------------------------------
const BASE = { r1: 84.75, R: 108.75, s: 17 }

function geometry({ r1, R, s } = BASE) {
  const cx1 = r1
  const cy1 = r1
  const rf = r1 - s // ustun ichki yoyi
  const cy2 = cy1 + r1 + rf // halqa markazi (yoy markazi bilan bir balandlikda)
  const cx2 = R
  const ri = R - s
  return { r1, R, s, cx1, cy1, rf, cy2, cx2, ri, width: 2 * R, height: cy2 + R }
}

/** Ikki aylana kesishmasining o'ngdagi nuqtasi. */
function intersectRight(ax, ay, ar, bx, by, br) {
  const dx = bx - ax
  const dy = by - ay
  const d = Math.hypot(dx, dy)
  const a = (ar * ar - br * br + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, ar * ar - a * a))
  const mx = ax + (a * dx) / d
  const my = ay + (a * dy) / d
  const p1 = [mx + (h * dy) / d, my - (h * dx) / d]
  const p2 = [mx - (h * dy) / d, my + (h * dx) / d]
  return p1[0] > p2[0] ? p1 : p2
}

const n = (v) => Number(v.toFixed(2)).toString()

/** Bitta `path` (evenodd): tashqi kontur + halqa teshigi. */
function markPath(g) {
  const { r1, R, s, cx1, cy1, rf, cy2, cx2, ri } = g
  const A = intersectRight(cx1, cy1, r1, cx2, cy2, R)
  const B = intersectRight(cx1, cy1, r1, cx2, cy2, ri)
  return [
    // Tashqi: ustun chap cheti ↑ → yuqori doira (soat yo'nalishida) → halqa tashqi aylanasi
    `M0 ${n(cy2)}V${n(cy1)}`,
    `A${n(r1)} ${n(r1)} 0 1 1 ${n(A[0])} ${n(A[1])}`,
    `A${n(R)} ${n(R)} 0 1 1 0 ${n(cy2)}Z`,
    // Teshik: ustun ichki yoyi → yuqori doiraning pastki yoyi → halqa ichki aylanasi
    `M${n(s)} ${n(cy2)}`,
    `A${n(rf)} ${n(rf)} 0 0 1 ${n(cx1)} ${n(cy1 + r1)}`,
    `A${n(r1)} ${n(r1)} 0 0 0 ${n(B[0])} ${n(B[1])}`,
    `A${n(ri)} ${n(ri)} 0 1 1 ${n(s)} ${n(cy2)}Z`,
  ].join('')
}

const MARK = geometry()
const MARK_D = markPath(MARK)
// Kichik o'lchamlar (favicon 16–48 px) uchun halqa qalinroq — 16 px'da ham chiziq ko'rinadi.
const MARK_SMALL = geometry({ ...BASE, s: 26 })
const MARK_SMALL_D = markPath(MARK_SMALL)

/** Belgini `size×size` kvadrat ichida markazlab joylashtirish (balandligi — `ratio`). */
function placed(g, d, size, ratio, fill) {
  const k = (size * ratio) / g.height
  const x = (size - g.width * k) / 2
  const y = (size - g.height * k) / 2
  return `<path fill="${fill}" fill-rule="evenodd" transform="translate(${n(x)} ${n(y)}) scale(${Number(k.toFixed(5))})" d="${d}"/>`
}

const markSvg = (g, d, fill, title = 'Blog Odya') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(g.width)} ${n(g.height)}" width="${n(g.width)}" height="${n(g.height)}" role="img" aria-label="${title}">
  <title>${title}</title>
  <path fill="${fill}" fill-rule="evenodd" d="${d}"/>
</svg>
`

/** Kvadrat kanvas: `bg` — fon (null — shaffof), `radius` — burchak radiusi ulushi. */
function squareSvg({
  size = 512,
  bg = DARK,
  fg = LIGHT,
  ratio,
  radius = 0,
  small = false,
  extra = '',
}) {
  const g = small ? MARK_SMALL : MARK
  const d = small ? MARK_SMALL_D : MARK_D
  const rect = bg
    ? `\n  <rect class="bg" width="${size}" height="${size}" rx="${Math.round(size * radius)}" fill="${bg}"/>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${extra}${rect}
  ${placed(g, d, size, ratio, fg).replace('<path ', '<path class="fg" ')}
</svg>
`
}

// ---------------------------------------------------------------------------
// 2. Belgi: SVG (tor viewBox) va shaffof PNG'lar.
// ---------------------------------------------------------------------------
writeBrand('logo/mark.svg', markSvg(MARK, MARK_D, 'currentColor'))
writeBrand('logo/mark-black.svg', markSvg(MARK, MARK_D, DARK))
writeBrand('logo/mark-white.svg', markSvg(MARK, MARK_D, LIGHT))
writeBrand('logo/mark-small.svg', markSvg(MARK_SMALL, MARK_SMALL_D, 'currentColor'))
for (const [name, fg] of [
  ['black', DARK],
  ['white', LIGHT],
]) {
  for (const size of [512, 1024]) {
    // Shaffof fon, belgi balandligi kanvasning 84% i (atrofida ozgina havo).
    writeBrand(
      `logo/mark-${name}-${size}.png`,
      png(squareSvg({ size, bg: null, fg, ratio: 0.84 }), size),
    )
  }
}
// Dizayner faylining toza vektor nusxasi (1080×1080, qora fon, belgi balandligi 32%).
const square1080 = squareSvg({ size: 1080, ratio: MARK.height / 1080 })
writeBrand('logo/logo-square-1080.svg', square1080)
writeBrand('logo/logo-square-1080.png', png(square1080, 1080))

// ---------------------------------------------------------------------------
// 3. Favicon va ilova ikonkalari: qorong'i plitka, oq belgi.
// ---------------------------------------------------------------------------
// SVG favicon: dark rejimdagi brauzer panelida plitka och rangga almashadi (qorong'i panelda
// qora plitka ko'rinmay qolmasin).
const darkSchemeStyle = `
  <style>@media (prefers-color-scheme: dark) { .bg { fill: ${LIGHT}; } .fg { fill: ${DARK}; } }</style>`
const iconSvg = squareSvg({ ratio: 0.74, radius: 0.22, small: true, extra: darkSchemeStyle })
const anyIcon = squareSvg({ ratio: 0.6, radius: 0.22 })
const fullBleed = squareSvg({ ratio: 0.6 }) // iOS burchaklarni o'zi yumaloqlaydi
// Maskable: belgi markazdagi xavfsiz doira (radius 40%) ichida — balandligi 50%.
const maskable = squareSvg({ ratio: 0.5 })
const small = squareSvg({ ratio: 0.8, radius: 0.22, small: true })

const icons = {
  'icon.svg': iconSvg,
  'icon-512.png': png(anyIcon, 512),
  'icon-192.png': png(anyIcon, 192),
  'icon-maskable-512.png': png(maskable, 512),
  'apple-touch-icon.png': png(fullBleed, 180),
  'favicon-32.png': png(small, 32),
  'favicon-16.png': png(small, 16),
}
icons['favicon.ico'] = await pngToIco([
  icons['favicon-16.png'],
  icons['favicon-32.png'],
  png(small, 48),
])
for (const [file, data] of Object.entries(icons)) writeBrand(`icons/${file}`, data)

// ---------------------------------------------------------------------------
// 4. Telegram kanal avatari 640×640 — ikkala kanal uchun bitta (belgi yozuvga bog'liq emas).
//    Telegram doira qilib kesadi — belgi markazda, balandligi 52%.
// ---------------------------------------------------------------------------
const avatar = squareSvg({ size: 640, ratio: 0.52 })
writeBrand('telegram/avatar.svg', avatar)
writeBrand('telegram/avatar.png', png(avatar, 640))

// ---------------------------------------------------------------------------
// 5. Ko'rib chiqish rasmi (README): och/qorong'i fonda belgi, ikonkalar, kichik o'lchamlar.
// ---------------------------------------------------------------------------
{
  const W = 1200
  const H = 520
  const cell = (x, y, w, h, bg) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${bg}"/>`
  const at = (g, d, x, y, height, fill) => {
    const k = height / g.height
    return `<path fill="${fill}" fill-rule="evenodd" transform="translate(${n(x)} ${n(y)}) scale(${Number(k.toFixed(5))})" d="${d}"/>`
  }
  const img = (svg, x, y, size) =>
    `<image x="${x}" y="${y}" width="${size}" height="${size}" href="data:image/png;base64,${Buffer.from(png(svg, size * 2)).toString('base64')}"/>`
  const parts = [
    cell(0, 0, W / 2, 300, LIGHT),
    cell(W / 2, 0, W / 2, 300, DARK),
    at(MARK, MARK_D, W / 4 - (MARK.width * 220) / MARK.height / 2, 40, 220, DARK),
    at(MARK, MARK_D, (3 * W) / 4 - (MARK.width * 220) / MARK.height / 2, 40, 220, LIGHT),
    cell(0, 300, W, 220, tokens.color.neutral['100'] ?? '#F4F4F5'),
    img(anyIcon, 40, 340, 140),
    img(maskable, 210, 340, 140),
    img(fullBleed, 380, 340, 140),
    // Telegram avatari — doira bo'yicha kesilgan holda.
    `<clipPath id="avatar"><circle cx="620" cy="410" r="70"/></clipPath>`,
    img(avatar, 550, 340, 140).replace('<image ', '<image clip-path="url(#avatar)" '),
    img(small, 740, 394, 32),
    img(small, 800, 402, 16),
    img(iconSvg, 850, 394, 48),
    at(MARK, MARK_D, 960, 380, 64, DARK),
    at(MARK, MARK_D, 1020, 396, 32, DARK),
    at(MARK, MARK_D, 1060, 404, 16, DARK),
  ]
  writeBrand(
    'previews/logo.png',
    png(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`,
      W,
    ),
  )
}

// ---------------------------------------------------------------------------
// 6. Sayt fayllari (apps/web): public/ va React/satori uchun geometriya moduli.
// ---------------------------------------------------------------------------
write(path.join(web, 'public/favicon.ico'), icons['favicon.ico'])
for (const file of [
  'icon.svg',
  'icon-512.png',
  'icon-192.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png',
]) {
  write(path.join(web, 'public/brand', file), icons[file])
}
write(path.join(web, 'public/brand/logo.svg'), markSvg(MARK, MARK_D, DARK))

write(
  path.join(web, 'src/components/blog/brand-mark.ts'),
  `/*
 * Brend belgisi "b" (OBLOG-96) — geometriya. Generatsiya qilingan: design/brand/scripts/logo.mjs
 * (manba — design/brand/logo/). Qo'lda tahrirlamang. Fill: \`evenodd\` (halqa teshigi).
 */
export const BRAND_MARK = {
  width: ${n(MARK.width)},
  height: ${n(MARK.height)},
  viewBox: '0 0 ${n(MARK.width)} ${n(MARK.height)}',
  d: '${MARK_D}',
} as const
`,
)
