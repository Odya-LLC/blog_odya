// Blog Odya brend fayllarini generatsiya qiladi (design/brand/*).
// Ishga tushirish: cd design/brand/scripts && npm install --no-package-lock && node build.mjs
// Manba ma'lumotlar: ../tokens.json. Shrift: Inter 4.1 (fonts.mjs yuklab oladi).
import { Resvg } from '@resvg/resvg-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pngToIco from 'png-to-ico'
import satori from 'satori'
import { loadFonts } from './fonts.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const brand = path.resolve(here, '..')
const tokens = JSON.parse(fs.readFileSync(path.join(brand, 'tokens.json'), 'utf8'))
const { fonts, licensePath } = await loadFonts()
const N = tokens.color.neutral
const ACCENTS = Object.keys(tokens.color.accent) // ['blue', 'violet']

const write = (rel, data) => {
  const p = path.join(brand, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, data)
  console.log('✓', rel)
}
const png = (svg, width) =>
  new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false } })
    .render()
    .asPng()

// ---------------------------------------------------------------------------
// Matnni kontur (path) ga aylantirish — SVG'lar o'rnatilgan shriftga bog'liq bo'lmaydi.
// ---------------------------------------------------------------------------
function textPath(fontName, text, size, x, y, tracking = 0) {
  const { font } = fonts[fontName]
  const scale = size / font.unitsPerEm
  // Shaping (ccmp/liga) kerak emas — belgilar to'g'ridan-to'g'ri glifga; kerning GPOS'dan.
  const glyphs = [...text].map((c) => font.charToGlyph(c))
  let cx = x
  const parts = []
  let x1 = Infinity
  let x2 = -Infinity
  let y1 = Infinity
  let y2 = -Infinity
  glyphs.forEach((g, i) => {
    const p = g.getPath(cx, y, size)
    const bb = p.getBoundingBox()
    if (Number.isFinite(bb.x1) && bb.x2 > bb.x1) {
      x1 = Math.min(x1, bb.x1)
      x2 = Math.max(x2, bb.x2)
      y1 = Math.min(y1, bb.y1)
      y2 = Math.max(y2, bb.y2)
    }
    parts.push(p.toPathData(2))
    const kern = i < glyphs.length - 1 ? font.getKerningValue(g, glyphs[i + 1]) : 0
    cx += (g.advanceWidth + kern) * scale + tracking * size
  })
  return { d: parts.filter(Boolean).join(''), advance: cx - x, bbox: { x1, x2, y1, y2 } }
}

// ---------------------------------------------------------------------------
// 1. Wordmark: "Blog Odya" / "Блог Одя" — ikkinchi so'z qalin va aksent rangda.
// ---------------------------------------------------------------------------
const WORDMARK = {
  latn: ['Blog', 'Odya'],
  cyrl: ['Блог', 'Одя'],
}
const WM = {
  size: 100,
  tracking: -0.025,
  gap: 0.24,
  first: 'InterDisplay-SemiBold',
  second: 'InterDisplay-ExtraBold',
}

function wordmarkGeometry(script) {
  const [a, b] = WORDMARK[script]
  const first = textPath(WM.first, a, WM.size, 0, 0, WM.tracking)
  const x2 = first.bbox.x2 + WM.gap * WM.size
  const second = textPath(
    WM.second,
    b,
    WM.size,
    x2 - textPath(WM.second, b, WM.size, 0, 0).bbox.x1,
    0,
    WM.tracking,
  )
  return { first, second }
}
// Ikkala yozuv uchun umumiy vertikal chegaralar — header'da bir xil balandlikda turadi.
const geo = { latn: wordmarkGeometry('latn'), cyrl: wordmarkGeometry('cyrl') }
const vTop = Math.floor(
  Math.min(...Object.values(geo).flatMap((g) => [g.first.bbox.y1, g.second.bbox.y1])),
)
const vBottom = Math.ceil(
  Math.max(...Object.values(geo).flatMap((g) => [g.first.bbox.y2, g.second.bbox.y2])),
)

function wordmarkSvg(script, { text, accent, title }) {
  const g = geo[script]
  const x1 = Math.floor(Math.min(g.first.bbox.x1, g.second.bbox.x1))
  const x2 = Math.ceil(Math.max(g.first.bbox.x2, g.second.bbox.x2))
  const w = x2 - x1
  const h = vBottom - vTop
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x1} ${vTop} ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${title}">
  <title>${title}</title>
  <path fill="${text}" d="${g.first.d}"/>
  <path fill="${accent}" d="${g.second.d}"/>
</svg>
`
}

const wordmarkTitle = { latn: 'Blog Odya', cyrl: 'Блог Одя' }
for (const script of ['latn', 'cyrl']) {
  for (const accent of ACCENTS) {
    const at = tokens.accentTheme[accent]
    write(
      `wordmark/wordmark-${script}-light-${accent}.svg`,
      wordmarkSvg(script, {
        text: tokens.theme.light.text,
        accent: at.light.accent,
        title: wordmarkTitle[script],
      }),
    )
    write(
      `wordmark/wordmark-${script}-dark-${accent}.svg`,
      wordmarkSvg(script, {
        text: tokens.theme.dark.text,
        accent: at.dark.accent,
        title: wordmarkTitle[script],
      }),
    )
  }
  // Bir rangli (currentColor) — CSS orqali bo'yash uchun.
  write(
    `wordmark/wordmark-${script}-mono.svg`,
    wordmarkSvg(script, {
      text: 'currentColor',
      accent: 'currentColor',
      title: wordmarkTitle[script],
    }),
  )
}

// ---------------------------------------------------------------------------
// 2. Kvadrat belgi (monogramma "O") — favicon va ilova ikonkalari.
//    Kirillda ham "О" bir xil ko'rinadi, shuning uchun favicon ikkala yozuvga umumiy.
// ---------------------------------------------------------------------------
function glyphCentered(fontName, text, box, targetH, tracking = 0) {
  const probe = textPath(fontName, text, 100, 0, 0, tracking)
  const k = targetH / (probe.bbox.y2 - probe.bbox.y1)
  const size = 100 * k
  const t0 = textPath(fontName, text, size, 0, 0, tracking)
  const dx = box / 2 - (t0.bbox.x1 + t0.bbox.x2) / 2
  const dy = box / 2 - (t0.bbox.y1 + t0.bbox.y2) / 2
  return textPath(fontName, text, size, dx, dy, tracking)
}

function iconSvg(
  accent,
  { rounded = true, glyphScale = 0.62, text = 'O', tracking = 0, gradient = false } = {},
) {
  const S = 512
  const a = tokens.color.accent[accent]
  const g = glyphCentered('Inter-ExtraBold', text, S, S * glyphScale, tracking)
  const r = rounded ? Math.round(S * 0.22) : 0
  const fill = gradient ? 'url(#bg)' : a['600']
  const defs = gradient
    ? `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a['500']}"/><stop offset="1" stop-color="${a['700']}"/></linearGradient></defs>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">${defs}
  <rect width="${S}" height="${S}" rx="${r}" fill="${fill}"/>
  <path fill="#FFFFFF" d="${g.d}"/>
</svg>
`
}

for (const accent of ACCENTS) {
  const dir = `icons/${accent}`
  const icon = iconSvg(accent)
  const fullBleed = iconSvg(accent, { rounded: false })
  const maskable = iconSvg(accent, { rounded: false, glyphScale: 0.46 })
  // Kichik o'lchamlarda harf kattaroq — 16 px'da ham o'qiladi.
  const small = iconSvg(accent, { glyphScale: 0.7 })
  write(`${dir}/icon.svg`, icon)
  write(`${dir}/icon-512.png`, png(icon, 512))
  write(`${dir}/icon-192.png`, png(icon, 192))
  write(`${dir}/icon-maskable-512.png`, png(maskable, 512))
  write(`${dir}/apple-touch-icon.png`, png(fullBleed, 180))
  const p32 = png(small, 32)
  const p16 = png(small, 16)
  write(`${dir}/favicon-32.png`, p32)
  write(`${dir}/favicon-16.png`, p16)
  write(`${dir}/favicon.ico`, await pngToIco([p16, p32, png(small, 48)]))
}

// ---------------------------------------------------------------------------
// 3. Telegram kanal avatarlari 640×640 (Telegram doira shaklida kesadi — belgi markazda).
// ---------------------------------------------------------------------------
const AVATAR_TEXT = { latn: 'BO', cyrl: 'БО' }
for (const accent of ACCENTS) {
  for (const script of ['latn', 'cyrl']) {
    const svg = iconSvg(accent, {
      rounded: false,
      gradient: true,
      glyphScale: 0.34,
      text: AVATAR_TEXT[script],
      tracking: -0.02,
    })
    write(`telegram/avatar-${script}-${accent}.svg`, svg)
    write(`telegram/avatar-${script}-${accent}.png`, png(svg, 640))
  }
}

// ---------------------------------------------------------------------------
// 4. OG rasm namunasi (satori — next/og ichidagi dvigatel).
// ---------------------------------------------------------------------------
const satoriFonts = [
  { name: 'Inter', data: fonts['Inter-Medium'].buf, weight: 500, style: 'normal' },
  { name: 'Inter', data: fonts['Inter-SemiBold'].buf, weight: 600, style: 'normal' },
  { name: 'Inter', data: fonts['Inter-Bold'].buf, weight: 700, style: 'normal' },
  { name: 'Inter Display', data: fonts['InterDisplay-SemiBold'].buf, weight: 600, style: 'normal' },
  {
    name: 'Inter Display',
    data: fonts['InterDisplay-ExtraBold'].buf,
    weight: 800,
    style: 'normal',
  },
]
const h = (type, style, ...children) => ({
  type,
  props: {
    style: { display: 'flex', ...style },
    children: children.length === 1 ? children[0] : children,
  },
})

/** Sarlavha uzunligiga qarab shrift o'lchami (3 qatorga sig'ishi uchun). */
export function ogTitleSize(title) {
  const n = [...title].length
  if (n <= 50) return 72
  if (n <= 80) return 64
  if (n <= 110) return 56
  return 48
}

function ogElement({ script, title, category, accent, cover }) {
  const og = tokens.og
  const a = tokens.color.accent[accent]
  const cat = tokens.color.category[category]
  const [w1, w2] = WORDMARK[script]
  const glow = `${a['600']}${Math.round(og.glowAlpha * 255)
    .toString(16)
    .padStart(2, '0')}`
  const ov = og.overlay
  const rgba = (x) => `rgba(11,11,15,${x})`
  const background = cover
    ? {
        backgroundImage: `linear-gradient(180deg, ${rgba(ov.top)} 0%, ${rgba(ov.middle)} 45%, ${rgba(ov.bottom)} 100%), url(${cover})`,
        backgroundSize: '100% 100%, 1200px 630px',
      }
    : {
        backgroundColor: N['950'],
        backgroundImage: `radial-gradient(circle at 100% 0%, ${glow} 0%, ${a['600']}00 62%), radial-gradient(circle at 0% 100%, ${a['900']}66 0%, ${a['900']}00 45%)`,
      }
  const size = ogTitleSize(title)
  return h(
    'div',
    {
      width: og.width,
      height: og.height,
      padding: og.padding,
      flexDirection: 'column',
      justifyContent: 'space-between',
      fontFamily: 'Inter',
      color: '#FFFFFF',
      ...background,
    },
    // Yuqori qator: kategoriya belgisi
    h(
      'div',
      { alignItems: 'center' },
      h(
        'div',
        {
          backgroundColor: cat.solid,
          color: '#FFFFFF',
          fontSize: 26,
          fontWeight: 600,
          padding: '10px 22px',
          borderRadius: 9999,
          letterSpacing: '-0.005em',
        },
        cat.name[script === 'latn' ? 'uz-Latn' : 'uz-Cyrl'],
      ),
    ),
    // Sarlavha: Inter Display 800, 2–3 qator
    h(
      'div',
      {
        fontFamily: 'Inter Display',
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1.12,
        letterSpacing: '-0.025em',
        maxWidth: og.width - og.padding * 2,
        display: 'block',
        lineClamp: 3,
      },
      title,
    ),
    // Pastki qator: wordmark + domen
    h(
      'div',
      { justifyContent: 'space-between', alignItems: 'center', width: '100%' },
      h(
        'div',
        { fontFamily: 'Inter Display', fontSize: 40, letterSpacing: '-0.025em' },
        h('span', { fontWeight: 600, color: tokens.theme.dark.text }, w1),
        h(
          'span',
          { fontWeight: 800, color: tokens.accentTheme[accent].dark.accent, marginLeft: 11 },
          w2,
        ),
      ),
      h(
        'div',
        { fontSize: 26, fontWeight: 500, color: N['400'] },
        script === 'latn' ? 'blog.odya.uz' : 'blog.odya.uz/kr',
      ),
    ),
  )
}

async function renderOg(opts) {
  const svg = await satori(ogElement(opts), {
    width: tokens.og.width,
    height: tokens.og.height,
    fonts: satoriFonts,
  })
  return png(svg, tokens.og.width)
}

// Muqova o'rnini bosuvchi sintetik "foto" (eng yomon holat — juda yorug' rasm).
const coverSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E0F2FE"/><stop offset="1" stop-color="#FEF3C7"/></linearGradient>
<radialGradient id="sun" cx="0.78" cy="0.3" r="0.35"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient></defs>
<rect width="1200" height="630" fill="url(#s)"/><rect width="1200" height="630" fill="url(#sun)"/>
<path d="M0 470 L220 330 L380 430 L560 280 L760 440 L930 340 L1200 470 L1200 630 L0 630 Z" fill="#94A3B8"/>
<path d="M0 540 L260 450 L520 530 L800 460 L1200 560 L1200 630 L0 630 Z" fill="#CBD5E1"/></svg>`
const coverUri = `data:image/png;base64,${Buffer.from(png(coverSvg, 1200)).toString('base64')}`

const OG_SAMPLES = [
  {
    file: 'og/og-sample-latn.png',
    script: 'latn',
    category: 'suniy-intellekt',
    title:
      'Oʻzbekiston sunʼiy intellekt boʻyicha yangi strategiyani qabul qildi: gʻalaba uchun 5 qadam',
  },
  {
    file: 'og/og-sample-cyrl.png',
    script: 'cyrl',
    category: 'suniy-intellekt',
    title: 'Ўзбекистон сунъий интеллект бўйича янги стратегияни қабул қилди: ғалаба учун 5 қадам',
  },
  {
    file: 'og/og-sample-latn-cover.png',
    script: 'latn',
    category: 'kibersport',
    title: 'Oʻzbek jamoasi Osiyo chempionatida gʻalaba qozondi va finalga chiqdi',
    cover: coverUri,
  },
]
for (const s of OG_SAMPLES) {
  write(s.file, await renderOg({ ...s, accent: tokens.activeAccent }))
}
write('og/og-sample-latn-violet.png', await renderOg({ ...OG_SAMPLES[0], accent: 'violet' }))

// ---------------------------------------------------------------------------
// 5. Ko'rib chiqish rasmlari (README uchun): aksent variantlari, kategoriyalar, shrift namunasi.
// ---------------------------------------------------------------------------
async function renderSheet(el, width, height, file) {
  const svg = await satori(el, { width, height, fonts: satoriFonts })
  write(file, png(svg, width))
}

function themePanel(mode, accent, script) {
  const t = tokens.theme[mode]
  const a = tokens.accentTheme[accent][mode]
  const [w1, w2] = WORDMARK[script]
  return h(
    'div',
    {
      flexDirection: 'column',
      backgroundColor: t.bg,
      border: `1px solid ${t.border}`,
      borderRadius: 16,
      padding: 32,
      width: 520,
      gap: 18,
    },
    h(
      'div',
      { fontFamily: 'Inter Display', fontSize: 44, letterSpacing: '-0.025em' },
      h('span', { fontWeight: 600, color: t.text }, w1),
      h('span', { fontWeight: 800, color: a.accent, marginLeft: 12 }, w2),
    ),
    h(
      'div',
      { fontSize: 22, fontWeight: 700, color: t.text },
      script === 'latn' ? 'Soʻnggi yangiliklar' : 'Сўнгги янгиликлар',
    ),
    h(
      'div',
      { fontSize: 18, fontWeight: 500, color: t.textMuted },
      script === 'latn' ? 'Oʻqish vaqti: 4 daqiqa · 14:05' : 'Ўқиш вақти: 4 дақиқа · 14:05',
    ),
    h(
      'div',
      { gap: 14, alignItems: 'center' },
      h(
        'div',
        {
          backgroundColor: a.accent,
          color: a.accentFg,
          fontSize: 18,
          fontWeight: 600,
          padding: '10px 18px',
          borderRadius: 10,
        },
        script === 'latn' ? 'Obuna boʻlish' : 'Обуна бўлиш',
      ),
      h(
        'div',
        { color: a.accent, fontSize: 18, fontWeight: 600, textDecoration: 'underline' },
        script === 'latn' ? 'Havola' : 'Ҳавола',
      ),
      h(
        'div',
        {
          backgroundColor: a.accentSoft,
          color: a.accentSoftFg,
          fontSize: 16,
          fontWeight: 600,
          padding: '6px 12px',
          borderRadius: 9999,
        },
        '#ChatGPT',
      ),
    ),
  )
}

await renderSheet(
  h(
    'div',
    {
      flexDirection: 'column',
      backgroundColor: N['100'],
      padding: 32,
      gap: 24,
      fontFamily: 'Inter',
      width: 1200,
      height: 760,
    },
    ...ACCENTS.map((accent, i) =>
      h(
        'div',
        { flexDirection: 'column', gap: 10 },
        h(
          'div',
          { fontSize: 20, fontWeight: 700, color: N['700'] },
          `${i + 1}-variant: ${accent === 'blue' ? 'koʻk' : 'binafsha'} — ${tokens.color.accent[accent]['600']} / ${tokens.color.accent[accent]['400']}`,
        ),
        h(
          'div',
          { gap: 24 },
          themePanel('light', accent, 'latn'),
          themePanel('dark', accent, 'cyrl'),
        ),
      ),
    ),
  ),
  1200,
  760,
  'previews/accent-variants.png',
)

const catEntries = Object.entries(tokens.color.category)
await renderSheet(
  h(
    'div',
    { flexDirection: 'column', fontFamily: 'Inter', width: 1200, height: 520 },
    ...['light', 'dark'].map((mode) =>
      h(
        'div',
        {
          flexDirection: 'column',
          gap: 20,
          padding: 32,
          backgroundColor: tokens.theme[mode].bg,
          height: 260,
        },
        // Chip'lar (light/dark juftliklari)
        h(
          'div',
          { flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' },
          ...catEntries.map(([, c]) =>
            h(
              'div',
              {
                backgroundColor: c[mode].bg,
                color: c[mode].fg,
                fontSize: 18,
                fontWeight: 600,
                padding: '7px 14px',
                borderRadius: 9999,
              },
              c.name[mode === 'light' ? 'uz-Latn' : 'uz-Cyrl'],
            ),
          ),
        ),
        // Solid — OG chip va rasmsiz kartochka placeholder'i
        h(
          'div',
          { gap: 14 },
          ...catEntries.map(([slug, c]) =>
            h(
              'div',
              {
                backgroundColor: c.solid,
                color: '#FFFFFF',
                fontSize: 13,
                fontWeight: 600,
                padding: '0 10px 10px',
                borderRadius: 10,
                width: 112,
                height: 84,
                alignItems: 'flex-end',
              },
              slug,
            ),
          ),
        ),
      ),
    ),
  ),
  1200,
  520,
  'previews/categories.png',
)

const SPECIMEN = [
  ['Inter Display', 800, 64, 'Oʻzbekiston · gʻalaba · Ўзбекистон · ғалаба'],
  ['Inter Display', 800, 40, 'Sunʼiy intellekt · Oʻyinlar · Сунъий интеллект · Ўйинлар'],
  ['Inter', 700, 30, 'A B D E F G Gʻ H I J K L M N O Oʻ P Q R S T U V X Y Z Sh Ch Ng ʼ'],
  ['Inter', 700, 30, 'А Б В Г Ғ Д Е Ё Ж З И Й К Қ Л М Н О П Р С Т У Ў Ф Х Ҳ Ц Ч Ш Ъ Ь Э Ю Я'],
  [
    'Inter',
    500,
    26,
    'a b d e f g gʻ h i j k l m n o oʻ p q r s t u v x y z sh ch ng — soʻnggi, taʼlim',
  ],
  [
    'Inter',
    500,
    26,
    'а б в г ғ д е ё ж з и й к қ л м н о п р с т у ў ф х ҳ ц ч ш ъ ь э ю я — таълим',
  ],
  [
    'Inter',
    500,
    26,
    "Belgilar: oʻ (U+02BB)  taʼlim (U+02BC)  o‘ (U+2018)  o’ (U+2019)  o' (ASCII)",
  ],
]
await renderSheet(
  h(
    'div',
    {
      flexDirection: 'column',
      backgroundColor: '#FFFFFF',
      color: N['950'],
      padding: 48,
      gap: 20,
      width: 1400,
      height: 640,
    },
    h(
      'div',
      { fontFamily: 'Inter', fontSize: 18, fontWeight: 600, color: N['500'] },
      'Inter 4.1 (SIL OFL 1.1) — lotin (ʻ U+02BB) va oʻzbek kirili namunasi',
    ),
    ...SPECIMEN.map(([family, weight, size, text]) =>
      h(
        'div',
        {
          fontFamily: family,
          fontWeight: weight,
          fontSize: size,
          letterSpacing: size > 36 ? '-0.025em' : '0',
        },
        text,
      ),
    ),
  ),
  1400,
  640,
  'previews/type-specimen.png',
)

// Wordmark SVG'larining o'zini (konturlarni) rasterlab ko'rsatish.
const wmImg = (script, mode, accent, height) => {
  const svg = fs.readFileSync(
    path.join(brand, `wordmark/wordmark-${script}-${mode}-${accent}.svg`),
    'utf8',
  )
  const [, , vw, vh] = svg
    .match(/viewBox="([^"]+)"/)[1]
    .split(' ')
    .map(Number)
  return {
    type: 'img',
    props: {
      src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
      height,
      width: Math.round((vw / vh) * height),
    },
  }
}
await renderSheet(
  h(
    'div',
    { flexDirection: 'column', width: 1200, height: 560 },
    ...ACCENTS.flatMap((accent) =>
      ['light', 'dark'].map((mode) =>
        h(
          'div',
          {
            backgroundColor: tokens.theme[mode].bg,
            height: 140,
            alignItems: 'center',
            justifyContent: 'space-around',
          },
          wmImg('latn', mode, accent, 64),
          wmImg('cyrl', mode, accent, 64),
        ),
      ),
    ),
  ),
  1200,
  560,
  'previews/wordmarks.png',
)

// ---------------------------------------------------------------------------
// 6. tokens.css (CSS o'zgaruvchilari — Tailwind v4 @theme uchun) va litsenziya.
// ---------------------------------------------------------------------------
function cssVars(obj, prefix) {
  return Object.entries(obj).map(
    ([k, v]) => `  --${prefix}-${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}: ${v};`,
  )
}
const act = tokens.activeAccent
const catVars = (mode) =>
  catEntries.flatMap(([slug, c]) => [
    `  --cat-${slug}-bg: ${c[mode].bg};`,
    `  --cat-${slug}-fg: ${c[mode].fg};`,
  ])
const css = `/* Generatsiya qilingan: design/brand/scripts/build.mjs (manba — tokens.json). Qo'lda tahrirlamang. */
/* Faol aksent: ${act}. Boshqa variant: <html data-accent="${ACCENTS.find((x) => x !== act)}">. */

:root {
  --font-sans: 'Inter', ${tokens.font.fallback.join(', ')};
  --font-display: 'Inter Display', var(--font-sans);
${cssVars(tokens.theme.light, 'color').join('\n')}
${cssVars(tokens.accentTheme[act].light, 'color').join('\n')}
${catEntries.map(([slug, c]) => `  --cat-${slug}-solid: ${c.solid};`).join('\n')}
${catVars('light').join('\n')}
}

${ACCENTS.filter((x) => x !== act)
  .map(
    (x) => `[data-accent='${x}'] {\n${cssVars(tokens.accentTheme[x].light, 'color').join('\n')}\n}`,
  )
  .join('\n\n')}

.dark,
[data-theme='dark'] {
${cssVars(tokens.theme.dark, 'color').join('\n')}
${cssVars(tokens.accentTheme[act].dark, 'color').join('\n')}
${catVars('dark').join('\n')}
}

${ACCENTS.filter((x) => x !== act)
  .map(
    (x) =>
      `.dark[data-accent='${x}'],\n[data-theme='dark'][data-accent='${x}'] {\n${cssVars(tokens.accentTheme[x].dark, 'color').join('\n')}\n}`,
  )
  .join('\n\n')}
`
write('tokens.css', css)
fs.mkdirSync(path.join(brand, 'fonts'), { recursive: true })
write('fonts/OFL.txt', fs.readFileSync(licensePath))
