// WCAG 2.x kontrast tekshiruvi: tokens.json dagi barcha matn/fon juftliklari.
// `node contrast.mjs` — jadvalni chiqaradi va README.md dagi <!-- contrast:start/end --> orasini yangilaydi.
// AA'dan o'tmagan juftlik bo'lsa, exit code 1.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const brandDir = path.resolve(here, '..')

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const toHex = (rgb) =>
  '#' +
  rgb
    .map((v) => Math.round(v).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()

export function luminance(h) {
  const [r, g, b] = hex(h)
    .map((v) => v / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** fg rangni `alpha` shaffoflik bilan bg ustiga qo'yish (overlay hisobi uchun). */
export function blend(fg, bg, alpha) {
  const f = hex(fg)
  const b = hex(bg)
  return toHex(f.map((v, i) => v * alpha + b[i] * (1 - alpha)))
}

/** Tekshiriladigan juftliklar. min: 4.5 — oddiy matn, 3 — katta matn (≥ 24px yoki ≥ 18.66px qalin). */
export function pairs(tokens) {
  const out = []
  const add = (group, label, fg, bg, min = 4.5) => out.push({ group, label, fg, bg, min })
  for (const mode of ['light', 'dark']) {
    const t = tokens.theme[mode]
    const g = mode === 'light' ? 'Light' : 'Dark'
    add(g, 'Asosiy matn / fon', t.text, t.bg)
    add(g, 'Asosiy matn / surface', t.text, t.surface)
    add(g, 'Ikkinchi darajali matn / fon', t.textMuted, t.bg)
    add(g, 'Ikkinchi darajali matn / surface', t.textMuted, t.surface)
    add(g, 'Yordamchi matn (vaqt, meta) / fon', t.textSubtle, t.bg)
    add(g, 'Yordamchi matn / surface', t.textSubtle, t.surface)
    for (const [name, v] of Object.entries(tokens.accentTheme)) {
      const a = v[mode]
      const vg = `${g} · ${name}`
      add(vg, 'Havola / wordmark aksenti — fon', a.accent, t.bg)
      add(vg, 'Havola — surface', a.accent, t.surface)
      add(vg, 'Havola (hover) — fon', a.accentHover, t.bg)
      add(vg, 'Tugma matni / aksent fon', a.accentFg, a.accent)
      add(vg, 'Aksent chip matni / soft fon', a.accentSoftFg, a.accentSoft)
    }
  }
  for (const [slug, c] of Object.entries(tokens.color.category)) {
    add('Kategoriya', `${slug}: light chip (fg / bg)`, c.light.fg, c.light.bg)
    add('Kategoriya', `${slug}: dark chip (fg / bg)`, c.dark.fg, c.dark.bg)
    add('Kategoriya', `${slug}: oq matn / solid (OG chip, placeholder)`, '#FFFFFF', c.solid)
  }
  const n = tokens.color.neutral
  const og = tokens.og
  for (const [name, scale] of Object.entries(tokens.color.accent)) {
    const glow = blend(scale['600'], n['950'], og.glowAlpha)
    add(`OG · ${name}`, 'Sarlavha (oq) / gradient eng och nuqtasi', '#FFFFFF', glow)
    add(`OG · ${name}`, 'Wordmark aksenti / fon', tokens.accentTheme[name].dark.accent, n['950'], 3)
  }
  add('OG', 'Domen matni / fon', n['400'], n['950'])
  add(
    'OG',
    `Sarlavha (oq) / oq muqova + ${Math.round(og.overlayWorstCase * 100)}% qatlam (eng yomon holat)`,
    '#FFFFFF',
    blend(n['950'], '#FFFFFF', og.overlayWorstCase),
  )
  return out
}

export function table(tokens) {
  const rows = pairs(tokens).map((p) => {
    const r = contrast(p.fg, p.bg)
    const aa = r >= p.min
    const aaa = r >= (p.min === 3 ? 4.5 : 7)
    return { ...p, r, aa, aaa }
  })
  const lines = [
    '| Guruh | Juftlik | Matn | Fon | Nisbat | Talab | AA | AAA |',
    '|---|---|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.group} | ${r.label} | \`${r.fg}\` | \`${r.bg}\` | ${r.r.toFixed(2)}:1 | ${r.min}:1 | ${r.aa ? '✅' : '❌'} | ${r.aaa ? '✅' : '—'} |`,
    ),
  ]
  return { rows, md: lines.join('\n') }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tokens = JSON.parse(fs.readFileSync(path.join(brandDir, 'tokens.json'), 'utf8'))
  const { rows, md } = table(tokens)
  const failed = rows.filter((r) => !r.aa)
  const readme = path.join(brandDir, 'README.md')
  if (fs.existsSync(readme)) {
    const src = fs.readFileSync(readme, 'utf8')
    const re = /(<!-- contrast:start -->)[\s\S]*?(<!-- contrast:end -->)/
    if (re.test(src)) fs.writeFileSync(readme, src.replace(re, `$1\n\n${md}\n\n$2`))
  }
  console.log(md)
  console.log(`\n${rows.length} juftlik, AA'dan o'tmagan: ${failed.length}`)
  if (failed.length) process.exit(1)
}
