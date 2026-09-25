import { readFileSync, writeFileSync } from 'node:fs'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { editorialAccess } from '@/access'
import { McpDocContent } from '@/components/admin/McpDocContent'
import type { McpContext } from '@/mcp/context'
import {
  extractRegistryBlock,
  loadMcpDoc,
  MCP_DOC_ORIGIN,
  renderRegistryMarkdown,
  replaceRegistryBlock,
  requestOrigin,
  resolveMcpDocPath,
  withOrigin,
} from '@/mcp/docs'
import { getMcpRegistry } from '@/mcp/registry'
import { MCP_INSTRUCTIONS, MCP_SERVER_INFO, registerOdyaMcp } from '@/mcp/server'
import { MEDIA_TOOL_NAMES } from '@/mcp/media-tools'
import { READ_TOOL_NAMES } from '@/mcp/tools'
import type { User } from '@/payload-types'

/**
 * MCP qo'llanmasi (OBLOG-43): reestr haqiqiy `/api/mcp` server tarkibiga mos, `docs/mcp.md`
 * dagi jadvallar reestrdan (bitta manba), admin sahifasiga ruxsat — admin/editor.
 *
 * `docs/mcp.md` ni yangilash: `UPDATE_MCP_DOCS=1 pnpm vitest run tests/mcp-docs.test.ts`.
 */

/** Haqiqiy SDK serveri ro'yxatga olgan nomlar (ichki maydonlar — faqat testda). */
function sdkRegistered() {
  const server = new McpServer(MCP_SERVER_INFO, { instructions: MCP_INSTRUCTIONS })
  registerOdyaMcp(server, {} as McpContext)
  const internal = server as unknown as {
    _registeredTools: Record<string, { inputSchema?: unknown }>
    _registeredPrompts: Record<string, unknown>
    _registeredResources: Record<string, unknown>
  }
  return {
    tools: Object.keys(internal._registeredTools),
    prompts: Object.keys(internal._registeredPrompts),
    resources: Object.keys(internal._registeredResources),
  }
}

describe('MCP reestri', () => {
  const registry = getMcpRegistry()

  it('SDK serveridagi toollar, prompts va resources bilan bir xil', () => {
    const sdk = sdkRegistered()
    expect(registry.tools.map((tool) => tool.name)).toEqual(sdk.tools)
    expect(registry.prompts.map((prompt) => prompt.name)).toEqual(sdk.prompts)
    expect(registry.resources.map((resource) => resource.uri)).toEqual(sdk.resources)
  })

  it("o'qish toollari — READ_TOOL_NAMES, yozish va media toollari; publish tool yo'q", () => {
    expect(registry.tools.filter((tool) => tool.group === 'read').map((tool) => tool.name)).toEqual(
      [...READ_TOOL_NAMES],
    )
    expect(
      registry.tools.filter((tool) => tool.group === 'write').map((tool) => tool.name),
    ).toEqual([
      'create_draft',
      'claim_draft',
      'release_draft',
      'save_rewrite',
      'set_seo',
      'preview_cyrillic',
      'submit_for_review',
    ])
    expect(
      registry.tools.filter((tool) => tool.group === 'media').map((tool) => tool.name),
    ).toEqual([...MEDIA_TOOL_NAMES])
    expect(registry.tools.find((tool) => tool.name === 'list_media')?.readOnly).toBe(true)
    expect(registry.tools.find((tool) => tool.name === 'upload_media')?.readOnly).toBe(false)
    expect(registry.tools.some((tool) => /publish|delete/.test(tool.name))).toBe(false)
  })

  it('har bir toolda sarlavha va vazifa; argumentlar sxemadan', () => {
    for (const tool of registry.tools) {
      expect(tool.title, tool.name).not.toBe('')
      expect(tool.description, tool.name).not.toBe('')
    }
    const saveRewrite = registry.tools.find((tool) => tool.name === 'save_rewrite')!
    expect(saveRewrite.args.map((arg) => [arg.name, arg.required])).toEqual([
      ['postId', true],
      ['title', true],
      ['excerpt', true],
      ['body', true],
      ['category', true],
      ['tags', false],
    ])
    expect(saveRewrite.args[0]).toMatchObject({ type: 'son' })
    const dailyBatch = registry.prompts.find((prompt) => prompt.name === 'daily_batch')!
    expect(dailyBatch.args.map((arg) => arg.name)).toEqual(['count', 'minScore'])
    expect(registry.resources.map((resource) => resource.uri)).toContain('odya://glossary')
  })
})

describe('docs/mcp.md — bitta manba', () => {
  const block = renderRegistryMarkdown(getMcpRegistry())

  it('generatsiya qilingan jadvallar reestrga mos', () => {
    const path = resolveMcpDocPath()
    const markdown = readFileSync(path, 'utf8')
    if (process.env.UPDATE_MCP_DOCS) {
      writeFileSync(path, replaceRegistryBlock(markdown, block))
      return
    }
    expect(
      extractRegistryBlock(markdown),
      'docs/mcp.md eskirgan: UPDATE_MCP_DOCS=1 pnpm vitest run tests/mcp-docs.test.ts',
    ).toBe(block)
  })

  it('har bir tool, prompt va resource hujjatda bor', () => {
    const markdown = loadMcpDoc()
    const registry = getMcpRegistry()
    for (const name of [...registry.tools, ...registry.prompts].map((item) => item.name)) {
      expect(markdown).toContain(`\`${name}\``)
    }
    for (const resource of registry.resources) expect(markdown).toContain(`\`${resource.uri}\``)
  })

  it("qo'llanma bo'limlari va xavfsizlik: kalit o'rniga placeholder", () => {
    const markdown = loadMcpDoc()
    for (const heading of [
      '## MCP nima va nima uchun',
      '## 1. API kalit olish',
      '### 2.1. Claude Code',
      '### 2.2. Claude Desktop',
      '## 3. Toollar, prompts va resources',
      '## 4. Ish jarayoni',
      '## 6. Cheklovlar',
      '## 7. Muammolar',
    ]) {
      expect(markdown).toContain(heading)
    }
    expect(markdown).toContain(`claude mcp add --transport http odya ${MCP_DOC_ORIGIN}/api/mcp`)
    expect(markdown).toContain('<API kalit>')
    expect(markdown).toContain('Revoke')
  })
})

describe('admin sahifasi mazmuni (McpDocContent)', () => {
  const html = renderToStaticMarkup(
    createElement(McpDocContent, {
      markdown: loadMcpDoc(),
      origin: 'http://localhost:3000',
      registry: getMcpRegistry(),
    }),
  )

  it('toollar jadvali reestrdan: har bir tool qatori bor', () => {
    const registry = getMcpRegistry()
    expect(html.match(/data-testid="mcp-tool-row"/g)).toHaveLength(registry.tools.length)
    for (const item of [...registry.tools, ...registry.prompts]) {
      expect(html).toContain(`<code>${item.name}</code>`)
    }
  })

  it('buyruqlar joriy domen bilan, nusxalash tugmalari bor; production domeni qolmaydi', () => {
    expect(html).toContain('claude mcp add --transport http odya http://localhost:3000/api/mcp')
    expect(html).toContain('&quot;http://localhost:3000/api/mcp&quot;')
    expect(html).not.toContain(MCP_DOC_ORIGIN)
    expect(html.match(/data-testid="mcp-copy"/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })

  it("xom HTML/markerlar chiqarilmaydi, bo'limlar mundarijada", () => {
    expect(html).not.toContain('mcp-registry:')
    expect(html).not.toContain('<untrusted_source>')
    expect(html).toContain('href="#1-api-kalit-olish"')
  })
})

describe('joriy domen', () => {
  const headers = (init: Record<string, string>) => new Headers(init)

  it('host / x-forwarded-* dan; shubhali host — fallback', () => {
    expect(requestOrigin(headers({ host: 'localhost:3000' }))).toBe('http://localhost:3000')
    expect(
      requestOrigin(
        headers({ 'x-forwarded-host': 'preview.odya.uz', 'x-forwarded-proto': 'https', host: 'x' }),
      ),
    ).toBe('https://preview.odya.uz')
    expect(requestOrigin(headers({ host: 'blog.odya.uz' }))).toBe('https://blog.odya.uz')
    expect(requestOrigin(headers({ host: 'evil.com/"><script>' }), 'https://blog.odya.uz/')).toBe(
      'https://blog.odya.uz',
    )
    expect(requestOrigin(headers({}), '')).toBe(MCP_DOC_ORIGIN)
  })

  it('hujjatdagi production domeni almashtiriladi', () => {
    expect(withOrigin(`curl ${MCP_DOC_ORIGIN}/api/mcp`, 'http://localhost:3000')).toBe(
      'curl http://localhost:3000/api/mcp',
    )
  })
})

describe('/admin/mcp ruxsati', () => {
  const user = (role: string | null) =>
    ({ id: 1, collection: 'users', role, email: 'x@example.com' }) as unknown as User & {
      collection: 'users'
    }

  it('admin va editor — ko‘radi; anonim — login; boshqa rol — ruxsat yo‘q', () => {
    expect(editorialAccess(user('admin'))).toBe('allowed')
    expect(editorialAccess(user('editor'))).toBe('allowed')
    expect(editorialAccess(null)).toBe('login')
    expect(editorialAccess(undefined)).toBe('login')
    expect(editorialAccess(user('author'))).toBe('forbidden')
    expect(editorialAccess(user(null))).toBe('forbidden')
  })
})
