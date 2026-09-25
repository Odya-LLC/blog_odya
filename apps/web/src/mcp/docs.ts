import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { McpArgInfo, McpRegistry } from './registry'

/**
 * MCP qo'llanmasi — bitta manba (OBLOG-43): `docs/mcp.md`.
 *
 * - Nasr (kalit olish, ulanish, ish jarayoni, cheklovlar, muammolar) — faqat `docs/mcp.md` da;
 *   admin'dagi `/admin/mcp` sahifasi shu faylni ish vaqtida o'qib render qiladi.
 * - Toollar/prompts/resources jadvallari — MCP reestridan (`registry.ts`) generatsiya qilinadi va
 *   `docs/mcp.md` dagi markerlar orasiga yoziladi. `tests/mcp-docs.test.ts` fayldagi blok
 *   reestrga mosligini tekshiradi; yangilash: `UPDATE_MCP_DOCS=1 pnpm vitest run tests/mcp-docs.test.ts`.
 *   Admin sahifasi markerlar o'rniga jadvallarni to'g'ridan-to'g'ri reestrdan chizadi.
 *
 * Vercel'da fayl `next.config.ts` dagi `outputFileTracingIncludes` orqali admin funksiyasiga
 * qo'shiladi.
 */

export const MCP_DOC_START = '<!-- mcp-registry:start'
export const MCP_DOC_END = '<!-- mcp-registry:end -->'
const START_LINE = `${MCP_DOC_START} — src/mcp/registry.ts dan generatsiya; qo'lda tahrirlamang -->`

/** Hujjatdagi production domeni — admin sahifasida joriy domen bilan almashtiriladi. */
export const MCP_DOC_ORIGIN = 'https://blog.odya.uz'

export function mcpDocCandidates(cwd: string = process.cwd()): string[] {
  const candidates: string[] = []
  try {
    candidates.push(fileURLToPath(new URL('../../../../docs/mcp.md', import.meta.url)))
  } catch {
    // Bundle'da `import.meta.url` `file:` bo'lmasligi mumkin — keyingi nomzodlar.
  }
  candidates.push(join(cwd, '../../docs/mcp.md'), join(cwd, 'docs/mcp.md'))
  return candidates
}

export function resolveMcpDocPath(candidates: string[] = mcpDocCandidates()): string {
  return candidates.find((file) => existsSync(file)) ?? candidates[0] ?? 'docs/mcp.md'
}

export function loadMcpDoc(): string {
  return readFileSync(resolveMcpDocPath(), 'utf8')
}

// ---------------------------------------------------------------------------
// Reestr → Markdown
// ---------------------------------------------------------------------------

const cell = (text: string) =>
  text
    .replace(/\|/g, '\\|')
    .replace(/</g, '\\<')
    .replace(/\s*\n\s*/g, ' ')

/** `name?: tur` — Markdown jadval katagi uchun. */
export function formatArg(arg: McpArgInfo): string {
  return `${arg.name}${arg.required ? '' : '?'}: ${arg.type}`
}

function argsCell(args: McpArgInfo[]): string {
  return args.length === 0 ? '—' : args.map((arg) => cell(`\`${formatArg(arg)}\``)).join(', ')
}

/** Markerlar orasidagi generatsiya qilingan blok (markerlar bilan). */
export function renderRegistryMarkdown(registry: McpRegistry): string {
  const read = registry.tools.filter((tool) => tool.group === 'read')
  const write = registry.tools.filter((tool) => tool.group === 'write')
  const media = registry.tools.filter((tool) => tool.group === 'media')
  const toolTable = (tools: McpRegistry['tools']) => [
    '| Tool | Vazifasi | Argumentlar (`?` — ixtiyoriy) |',
    '| --- | --- | --- |',
    ...tools.map(
      (tool) =>
        `| \`${tool.name}\` | **${cell(tool.title)}.** ${cell(tool.description)} | ${argsCell(tool.args)} |`,
    ),
  ]
  return [
    START_LINE,
    '',
    `Jami: ${registry.tools.length} ta tool, ${registry.prompts.length} ta prompt, ${registry.resources.length} ta resource.`,
    '',
    `### O'qish toollari (${read.length})`,
    '',
    ...toolTable(read),
    '',
    `### Yozish toollari (${write.length})`,
    '',
    ...toolTable(write),
    '',
    `### Media toollari (${media.length})`,
    '',
    ...toolTable(media),
    '',
    `### Prompts (${registry.prompts.length})`,
    '',
    '| Prompt | Vazifasi | Argumentlar |',
    '| --- | --- | --- |',
    ...registry.prompts.map(
      (prompt) =>
        `| \`${prompt.name}\` | **${cell(prompt.title)}.** ${cell(prompt.description)} | ${argsCell(prompt.args)} |`,
    ),
    '',
    `### Resources (${registry.resources.length})`,
    '',
    '| URI | Nomi | Vazifasi |',
    '| --- | --- | --- |',
    ...registry.resources.map(
      (resource) =>
        `| \`${resource.uri}\` | ${cell(resource.title)} | ${cell(resource.description)} |`,
    ),
    '',
    MCP_DOC_END,
  ].join('\n')
}

/** Hujjatdagi generatsiya bloki (markerlar bilan) yoki `null`. */
export function extractRegistryBlock(markdown: string): string | null {
  const start = markdown.indexOf(MCP_DOC_START)
  const end = markdown.indexOf(MCP_DOC_END)
  if (start === -1 || end === -1 || end < start) return null
  return markdown.slice(start, end + MCP_DOC_END.length)
}

/** Hujjatdagi blokni yangisi bilan almashtiradi. */
export function replaceRegistryBlock(markdown: string, block: string): string {
  const current = extractRegistryBlock(markdown)
  if (current === null) throw new Error('docs/mcp.md: mcp-registry markerlari topilmadi')
  return markdown.replace(current, () => block)
}

// ---------------------------------------------------------------------------
// Joriy domen
// ---------------------------------------------------------------------------

const HOST_RE = /^[a-z0-9.-]+(:\d{1,5})?$/i

/**
 * Admin sahifasi ochilgan domen (`x-forwarded-host`/`host` + protokol): buyruqlardagi server
 * manzili shu domenga moslanadi (production, preview, lokal). Sarlavha shubhali bo'lsa —
 * `fallback` (Payload `serverURL`).
 */
export function requestOrigin(headers: Headers, fallback: string = MCP_DOC_ORIGIN): string {
  const host = (headers.get('x-forwarded-host') ?? headers.get('host'))?.split(',')[0]?.trim()
  if (!host || !HOST_RE.test(host)) return fallback.replace(/\/+$/, '') || MCP_DOC_ORIGIN
  const forwarded = headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const proto =
    forwarded === 'http' || forwarded === 'https'
      ? forwarded
      : /^(localhost|127\.0\.0\.1)(:|$)/.test(host)
        ? 'http'
        : 'https'
  return `${proto}://${host}`
}

/** Hujjatdagi production domenini joriy domen bilan almashtiradi. */
export function withOrigin(text: string, origin: string): string {
  return origin === MCP_DOC_ORIGIN ? text : text.split(MCP_DOC_ORIGIN).join(origin)
}
