/**
 * Markdown hujjatlar reestri va yuklovchi (MCP resource/prompt va `pages` seed uchun).
 *
 * Fayllar paket ildizida (`packages/guidelines/*.md`, `legal/*.md`) saqlanadi va
 * ish vaqtida `node:fs` orqali o'qiladi. Vercel'da deploy qilinganda bu fayllar
 * `outputFileTracingIncludes` orqali bundle'ga qo'shilishi kerak (M2-06).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { type DocFrontMatter, docFrontMatterSchema } from './schemas'

/** `packages/guidelines` katalogining absolyut yo'li. */
export const GUIDELINES_ROOT = fileURLToPath(new URL('..', import.meta.url))

export interface DocEntry {
  /** Front-matter'dagi `id` bilan bir xil */
  id: string
  /** Paket ildiziga nisbatan fayl yo'li */
  file: string
}

export interface GuidelineEntry extends DocEntry {
  /** MCP resource URI (TZ §6.3) */
  uri: string
}

export interface LegalPageEntry extends DocEntry {
  /** `pages` kolleksiyasidagi slug (sayt manzili `/{slug}`) */
  slug: string
}

/** Tahririyat ko'rsatmalari — MCP resource'lar va `get_guidelines` tarkibi (TZ §5.2, §6.3). */
export const GUIDELINE_DOCS = [
  { id: 'style', file: 'style.md', uri: 'odya://guidelines/style' },
  { id: 'copyright', file: 'copyright.md', uri: 'odya://guidelines/copyright' },
  { id: 'seo', file: 'seo.md', uri: 'odya://guidelines/seo' },
  { id: 'output-schema', file: 'output-schema.md', uri: 'odya://guidelines/output-schema' },
] as const satisfies readonly GuidelineEntry[]

/** Huquqiy sahifalar matni — M1-02 seed'da `pages` kolleksiyasiga yuklanadi (TZ §9.6). */
export const LEGAL_PAGES = [
  { id: 'legal-about', file: 'legal/biz-haqimizda.md', slug: 'biz-haqimizda' },
  { id: 'legal-contact', file: 'legal/aloqa.md', slug: 'aloqa' },
  {
    id: 'legal-editorial-policy',
    file: 'legal/tahririyat-siyosati.md',
    slug: 'tahririyat-siyosati',
  },
  { id: 'legal-privacy-policy', file: 'legal/maxfiylik-siyosati.md', slug: 'maxfiylik-siyosati' },
  {
    id: 'legal-copyright-complaints',
    file: 'legal/mualliflik-huquqi.md',
    slug: 'mualliflik-huquqi',
  },
  { id: 'legal-terms', file: 'legal/foydalanish-shartlari.md', slug: 'foydalanish-shartlari' },
] as const satisfies readonly LegalPageEntry[]

export type GuidelineId = (typeof GUIDELINE_DOCS)[number]['id']
export type LegalPageId = (typeof LEGAL_PAGES)[number]['id']

/**
 * Huquqiy sahifalardagi o'rinbosarlar (`{{CONTACT_EMAIL}}` va h.k.) — seed paytida
 * haqiqiy qiymatlar bilan almashtiriladi.
 */
export const LEGAL_PLACEHOLDERS = [
  'CONTACT_EMAIL',
  'EDITORIAL_EMAIL',
  'COPYRIGHT_EMAIL',
  'PRIVACY_EMAIL',
  'ADS_EMAIL',
  'LEGAL_ADDRESS',
  'COMPANY_TIN',
  'EDITOR_IN_CHIEF',
  'MEDIA_REGISTRATION',
  'TELEGRAM_LATN_URL',
  'TELEGRAM_CYRL_URL',
] as const

export type LegalPlaceholder = (typeof LEGAL_PLACEHOLDERS)[number]

export interface LoadedDoc {
  /** Absolyut fayl yo'li */
  path: string
  frontMatter: DocFrontMatter
  /** Front-matter'siz Markdown */
  markdown: string
  /** Fayl to'liq holicha */
  raw: string
}

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/** Oddiy `key: value` front-matter'ni ajratadi (ichma-ich tuzilmalarsiz). */
export function parseFrontMatter(raw: string): { data: Record<string, string>; body: string } {
  const match = FRONT_MATTER_RE.exec(raw)
  if (!match) {
    throw new Error('Front-matter topilmadi (fayl `---` bilan boshlanishi kerak)')
  }
  const data: Record<string, string> = {}
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    if (!line.trim()) continue
    const sep = line.indexOf(':')
    if (sep <= 0) throw new Error(`Front-matter qatori noto'g'ri: "${line}"`)
    data[line.slice(0, sep).trim()] = line.slice(sep + 1).trim()
  }
  return { data, body: raw.slice(match[0].length).replace(/^\s+/, '') }
}

/** Absolyut yo'l. */
export function docPath(entry: DocEntry): string {
  return join(GUIDELINES_ROOT, entry.file)
}

/** Hujjatni o'qiydi va front-matter'ni Zod bilan tekshiradi. */
export function loadDoc(entry: DocEntry): LoadedDoc {
  const path = docPath(entry)
  const raw = readFileSync(path, 'utf8')
  const { data, body } = parseFrontMatter(raw)
  const frontMatter = docFrontMatterSchema.parse(data)
  if (frontMatter.id !== entry.id) {
    throw new Error(`${entry.file}: front-matter id "${frontMatter.id}" ≠ "${entry.id}"`)
  }
  return { path, frontMatter, markdown: body, raw }
}

export function loadGuideline(id: GuidelineId): LoadedDoc & GuidelineEntry {
  const entry = GUIDELINE_DOCS.find((doc) => doc.id === id)
  if (!entry) throw new Error(`Noma'lum ko'rsatma: ${id}`)
  return { ...entry, ...loadDoc(entry) }
}

export function loadAllGuidelines(): (LoadedDoc & GuidelineEntry)[] {
  return GUIDELINE_DOCS.map((entry) => ({ ...entry, ...loadDoc(entry) }))
}

export function loadLegalPages(): (LoadedDoc & LegalPageEntry)[] {
  return LEGAL_PAGES.map((entry) => ({ ...entry, ...loadDoc(entry) }))
}

/** `{{KEY}}` o'rinbosarlarini qiymatlar bilan almashtiradi; berilmaganlari o'zgarmaydi. */
export function fillPlaceholders(
  markdown: string,
  values: Partial<Record<LegalPlaceholder, string>>,
): string {
  return markdown.replace(/\{\{([A-Z_]+)\}\}/g, (whole, key: string) =>
    Object.hasOwn(values, key) ? (values[key as LegalPlaceholder] ?? whole) : whole,
  )
}
