import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import type { McpContext } from './context'
import { registerGuidance } from './guidance'
import { registerReadTools } from './tools'
import { registerWriteTools } from './write-tools'

/**
 * MCP server tarkibining statik reestri (OBLOG-43): toollar, prompts va resources nomi, vazifasi
 * va argumentlari. Alohida ro'yxat yuritilmaydi — `registerOdyaMcp` dagi ro'yxatga olish
 * funksiyalari (o'qish/yozish toollari, guidance) haqiqiy server o'rniga yozib oluvchi (recorder)
 * obyektga chaqiriladi, shuning uchun reestr `/api/mcp` bilan bir xil (`tests/mcp-docs.test.ts`
 * SDK serveri bilan solishtiradi). Handler'lar chaqirilmaydi (kontekst kerak emas).
 *
 * Foydalanuvchilar: admin'dagi `/admin/mcp` qo'llanmasi va `docs/mcp.md` dagi generatsiya
 * qilingan jadvallar (`src/mcp/docs.ts`).
 */

export interface McpArgInfo {
  name: string
  required: boolean
  /** Qisqa tur: `son`, `matn`, `son[]`, `a | b`, ... */
  type: string
  description?: string
}

export interface McpToolInfo {
  name: string
  title: string
  description: string
  /** O'qish (M2-06, `tools.ts`) yoki yozish (M2-07, `write-tools.ts`) toollari */
  group: 'read' | 'write'
  /** MCP `readOnlyHint` annotatsiyasi */
  readOnly: boolean
  args: McpArgInfo[]
}

export interface McpPromptInfo {
  name: string
  title: string
  description: string
  args: McpArgInfo[]
}

export interface McpResourceInfo {
  name: string
  uri: string
  title: string
  description: string
  mimeType?: string
}

export interface McpRegistry {
  tools: McpToolInfo[]
  prompts: McpPromptInfo[]
  resources: McpResourceInfo[]
}

type JsonSchema = {
  type?: string | string[]
  enum?: unknown[]
  const?: unknown
  items?: JsonSchema
  anyOf?: JsonSchema[]
  oneOf?: JsonSchema[]
  description?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
}

const TYPE_LABELS: Record<string, string> = {
  integer: 'son',
  number: 'son',
  string: 'matn',
  boolean: 'ha/yo‘q',
  object: 'obyekt',
  null: 'null',
}

function typeLabel(schema: JsonSchema | undefined): string {
  if (!schema) return 'har qanday'
  if (schema.enum) return schema.enum.map((value) => String(value)).join(' | ')
  if (schema.const !== undefined) return String(schema.const)
  const variants = schema.anyOf ?? schema.oneOf
  if (variants) return [...new Set(variants.map(typeLabel))].join(' | ')
  if (schema.type === 'array') {
    const item = typeLabel(schema.items)
    return item.includes(' ') ? `(${item})[]` : `${item}[]`
  }
  if (Array.isArray(schema.type))
    return schema.type.map((type) => TYPE_LABELS[type] ?? type).join(' | ')
  if (schema.type) return TYPE_LABELS[schema.type] ?? schema.type
  return 'har qanday'
}

/** Zod "raw shape" (`inputSchema` / `argsSchema`) → argumentlar ro'yxati (kirish sxemasi bo'yicha). */
export function describeArgs(shape: z.ZodRawShape | undefined): McpArgInfo[] {
  if (!shape) return []
  const json = z.toJSONSchema(z.object(shape), {
    io: 'input',
    unrepresentable: 'any',
  }) as JsonSchema
  const required = new Set(json.required ?? [])
  return Object.entries(json.properties ?? {}).map(([name, schema]) => ({
    name,
    required: required.has(name),
    type: typeLabel(schema),
    ...(schema.description ? { description: schema.description } : {}),
  }))
}

interface ToolConfig {
  title?: string
  description?: string
  inputSchema?: z.ZodRawShape
  annotations?: { readOnlyHint?: boolean }
}

interface PromptConfig {
  title?: string
  description?: string
  argsSchema?: z.ZodRawShape
}

interface ResourceConfig {
  title?: string
  description?: string
  mimeType?: string
}

/** `registerOdyaMcp` chaqiradigan uchta metodni yozib oluvchi server. */
function createRecorder(registry: McpRegistry, group: McpToolInfo['group']): McpServer {
  const recorder = {
    registerTool(name: string, config: ToolConfig) {
      registry.tools.push({
        name,
        title: config.title ?? name,
        description: config.description ?? '',
        group,
        readOnly: config.annotations?.readOnlyHint === true,
        args: describeArgs(config.inputSchema),
      })
    },
    registerPrompt(name: string, config: PromptConfig) {
      registry.prompts.push({
        name,
        title: config.title ?? name,
        description: config.description ?? '',
        args: describeArgs(config.argsSchema),
      })
    },
    registerResource(name: string, uri: unknown, config: ResourceConfig) {
      registry.resources.push({
        name,
        uri: typeof uri === 'string' ? uri : String((uri as { uriTemplate?: unknown }).uriTemplate),
        title: config.title ?? name,
        description: config.description ?? '',
        ...(config.mimeType ? { mimeType: config.mimeType } : {}),
      })
    },
  }
  return recorder as unknown as McpServer
}

let cached: McpRegistry | undefined

/** MCP server reestri (bir marta yig'iladi). */
export function getMcpRegistry(): McpRegistry {
  if (cached) return cached
  const registry: McpRegistry = { tools: [], prompts: [], resources: [] }
  // Ro'yxatga olishda kontekst ishlatilmaydi — faqat handler'lar ichida (closure).
  const ctx = {} as McpContext
  registerReadTools(createRecorder(registry, 'read'), ctx)
  registerWriteTools(createRecorder(registry, 'write'), ctx)
  registerGuidance(createRecorder(registry, 'read'), ctx)
  cached = registry
  return registry
}
