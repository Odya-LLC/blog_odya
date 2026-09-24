import {
  isLexicalState,
  lexicalPlainText,
  transliterateLexical,
  type Locale,
  type TransliterateLexicalOptions,
  type Transliterator,
} from '@blog-odya/shared'
import type {
  CollectionConfig,
  Endpoint,
  Field,
  FieldHook,
  GlobalConfig,
  PayloadRequest,
} from 'payload'

import { isAdminOrEditorUser } from '@/access'

import { getTransliterator } from './transliterator'

/**
 * Lotin → kirill avtomatik sinxronlash (TZ §3.6).
 *
 * ## Qanday ishlaydi
 *
 * Payload bitta so'rovda bitta locale'ni saqlaydi. Ikkinchi so'rov (afterChange + local API
 * `update`) o'rniga kirill qiymati **o'sha saqlashning o'zida** yoziladi: maydon darajasidagi
 * `beforeChange` hook'i `siblingDocWithLocales` (hujjatning barcha locale'lardagi asl qiymatlari)
 * ga `uz-Cyrl` qiymatini yozadi. Payload maydonlarni aylanib chiqqach, `mergeLocaleActions`
 * joriy locale qiymatini shu obyektdagi boshqa locale'lar bilan birlashtirib, bitta DB yozuvi
 * qiladi. Natija: bitta tranzaksiya, bitta versiya (drafts/autosave bilan ham), tsikl yo'q,
 * `req.locale` o'zgarmaydi. Bu Payload'ning ichki xatti-harakatiga tayanadi — integration test
 * (`tests/cyrl-sync.int.test.ts`) Payload yangilanganda buni tekshiradi.
 *
 * ## Qoidalar
 *
 * - `uz-Latn` saqlanganda: lotin qiymati o'zgargan (yoki kirill bo'sh) bo'lsa → kirill qayta
 *   generatsiya qilinadi. Maydon `cyrlLocked[path]` bo'lsa kirillga tegilmaydi, lotin o'zgargan
 *   bo'lsa `cyrlStale = true`.
 * - `uz-Cyrl` saqlanganda: maydon qo'lda o'zgartirilgan bo'lsa → `cyrlLocked[path] = true` va
 *   `cyrlStale = false` (muharrir kirill versiyasini ko'rib chiqdi). Kirill tozalansa (bo'sh) —
 *   qulf olinadi va lotindan qayta generatsiya qilinadi. Kirill bo'sh bo'lib, forma fallback
 *   (lotin) qiymatini yuborgan bo'lsa — qulflanmaydi, generatsiya qilinadi.
 * - "Kirillni qayta generatsiya qilish" (`POST .../regenerate-cyrl`): qulflarni oladi,
 *   `cyrlStale = false`, `req.context.cyrlRegenerate` bilan `uz-Latn` da saqlaydi — hook
 *   ko'rsatilgan maydonlarni lotin qiymatidan qayta yozadi.
 * - `req.context.disableCyrlSync = true` — sinxronlash o'chiriladi (import, seed, migratsiya).
 */

export const LATIN_LOCALE: Locale = 'uz-Latn'
export const CYRILLIC_LOCALE: Locale = 'uz-Cyrl'

export const CYRL_LOCKED_FIELD = 'cyrlLocked'
export const CYRL_STALE_FIELD = 'cyrlStale'
export const CYRL_PANEL_FIELD = 'cyrlSyncPanel'

/** `req.context` kalitlari. */
export const CYRL_CONTEXT_REGENERATE = 'cyrlRegenerate'
export const CYRL_CONTEXT_DISABLE = 'disableCyrlSync'

export const REGENERATE_CYRL_ENDPOINT = 'regenerate-cyrl'

export type CyrlLockedMap = Record<string, boolean>

export type CyrlFieldKind = 'text' | 'richText'

export interface CyrlSyncFieldSpec {
  /** Maydon yo'li: `alt`, `meta.title` (guruh/tab ichida — nuqta bilan). Qulf kaliti ham shu. */
  path: string
  kind?: CyrlFieldKind
  /** Admin panelda ko'rsatiladigan nom (default — maydon label'i yoki path). */
  label?: string
  /** Lexical `block`/`inlineBlock` tugunlari uchun (richText). */
  transformBlock?: TransliterateLexicalOptions['transformBlock']
  /**
   * Maxsus o'girish (masalan, lokalizatsiya qilingan `array` — FAQ). Diqqat: lokalizatsiya
   * qilingan array/blocks qatorlarining `id` lari har bir locale uchun yangi bo'lishi kerak.
   */
  transform?: (value: unknown, transliterator: Transliterator) => unknown
  /** Bo'shlikni tekshirish (default: matn/Lexical matni bo'sh). */
  isEmpty?: (value: unknown) => boolean
}

export interface CyrlSyncOptions {
  /** Oddiy matn maydonlari (text, textarea) yoki to'liq spetsifikatsiyalar. */
  fields?: Array<string | CyrlSyncFieldSpec>
  /** Lexical richText maydonlari. */
  richTextFields?: Array<string | Omit<CyrlSyncFieldSpec, 'kind'>>
}

// ---------------------------------------------------------------------------
// Qiymatlar bilan ishlash
// ---------------------------------------------------------------------------

type LocaleRecord = Partial<Record<string, unknown>>

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Lexical JSON'ni solishtirish uchun: kalitlar tartibi (jsonb) va ahamiyatsiz maydonlarsiz. */
const VOLATILE_LEXICAL_KEYS = new Set(['version', 'direction', 'textFormat', 'textStyle', '$'])

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      if (VOLATILE_LEXICAL_KEYS.has(key) || value[key] === undefined) continue
      out[key] = canonical(value[key])
    }
    return out
  }
  return value
}

export function isEmptyCyrlValue(value: unknown, kind: CyrlFieldKind = 'text'): boolean {
  if (value === null || value === undefined) return true
  if (kind === 'richText' || isLexicalState(value)) return lexicalPlainText(value).trim() === ''
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

export function cyrlValuesEqual(a: unknown, b: unknown, kind: CyrlFieldKind = 'text'): boolean {
  const aEmpty = isEmptyCyrlValue(a, kind)
  const bEmpty = isEmptyCyrlValue(b, kind)
  if (aEmpty || bEmpty) return aEmpty && bEmpty
  if (typeof a === 'string' || typeof b === 'string') return a === b
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
}

export function parseCyrlLocked(value: unknown): CyrlLockedMap {
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return {}
    }
  }
  if (!isPlainObject(parsed)) return {}
  const out: CyrlLockedMap = {}
  for (const [key, flag] of Object.entries(parsed)) if (flag === true) out[key] = true
  return out
}

/**
 * Saqlanayotgan `data.cyrlLocked` obyektini qaytaradi (kerak bo'lsa yaratadi). Maydon hook'lari
 * parallel ishlaydi — shuning uchun bitta obyekt joyida o'zgartiriladi (sinxron, `await` siz).
 */
function locksOf(data: Record<string, unknown>, originalDoc: unknown): CyrlLockedMap {
  const current = data[CYRL_LOCKED_FIELD]
  if (isPlainObject(current) && !Object.values(current).some((v) => typeof v !== 'boolean')) {
    return current as CyrlLockedMap
  }
  const base =
    current !== undefined
      ? parseCyrlLocked(current)
      : parseCyrlLocked((originalDoc as Record<string, unknown> | undefined)?.[CYRL_LOCKED_FIELD])
  data[CYRL_LOCKED_FIELD] = base
  return base
}

function regenerateRequested(req: PayloadRequest, path: string): boolean {
  const flag = req.context?.[CYRL_CONTEXT_REGENERATE]
  if (flag === true || flag === 'all') return true
  return Array.isArray(flag) && flag.includes(path)
}

async function toCyrillicValue(
  value: unknown,
  spec: NormalizedSpec,
  req: PayloadRequest,
): Promise<unknown> {
  const transliterator = await getTransliterator(req)
  if (spec.transform) return spec.transform(value, transliterator)
  if (spec.kind === 'richText') {
    return transliterateLexical(value, transliterator.toCyrillic, {
      transformBlock: spec.transformBlock,
    })
  }
  return typeof value === 'string' ? transliterator.toCyrillic(value) : value
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface NormalizedSpec extends CyrlSyncFieldSpec {
  kind: CyrlFieldKind
}

function normalizeSpecs(options: CyrlSyncOptions): NormalizedSpec[] {
  const specs: NormalizedSpec[] = []
  for (const item of options.fields ?? []) {
    specs.push(typeof item === 'string' ? { path: item, kind: 'text' } : { kind: 'text', ...item })
  }
  for (const item of options.richTextFields ?? []) {
    specs.push(
      typeof item === 'string' ? { path: item, kind: 'richText' } : { ...item, kind: 'richText' },
    )
  }
  return specs
}

/**
 * Bitta lokalizatsiya qilingan maydon uchun `beforeChange` hook'i (maydon darajasida).
 * Odatda to'g'ridan-to'g'ri emas, `withCyrlSync` orqali ulanadi.
 */
export function createCyrlSyncFieldHook(specInput: CyrlSyncFieldSpec): FieldHook {
  const spec: NormalizedSpec = { kind: 'text', ...specInput }
  const isEmpty = (value: unknown) => spec.isEmpty?.(value) ?? isEmptyCyrlValue(value, spec.kind)
  const equal = (a: unknown, b: unknown) =>
    isEmpty(a) && isEmpty(b) ? true : cyrlValuesEqual(a, b, spec.kind)

  return async ({ data, field, originalDoc, req, siblingDocWithLocales, value }) => {
    if (!data || !siblingDocWithLocales || !('name' in field) || !field.name) return value
    if (req.context?.[CYRL_CONTEXT_DISABLE]) return value
    const locale = req.locale
    if (locale !== LATIN_LOCALE && locale !== CYRILLIC_LOCALE) return value

    const name = field.name
    const stored: LocaleRecord = isPlainObject(siblingDocWithLocales[name])
      ? (siblingDocWithLocales[name] as LocaleRecord)
      : {}
    const oldLatin = stored[LATIN_LOCALE]
    const oldCyrillic = stored[CYRILLIC_LOCALE]
    const locks = locksOf(data as Record<string, unknown>, originalDoc)
    const writeCyrillic = (cyrillic: unknown) => {
      siblingDocWithLocales[name] = { ...stored, [CYRILLIC_LOCALE]: cyrillic }
    }

    if (locale === LATIN_LOCALE) {
      const regenerate = regenerateRequested(req, spec.path)
      const latin = value !== undefined ? value : regenerate ? oldLatin : undefined
      if (latin === undefined) return value

      const latinChanged = !equal(latin, oldLatin)
      if (locks[spec.path] && !regenerate) {
        if (latinChanged) (data as Record<string, unknown>)[CYRL_STALE_FIELD] = true
        return value
      }
      if (regenerate) delete locks[spec.path]
      if (latinChanged || regenerate || isEmpty(oldCyrillic)) {
        writeCyrillic(isEmpty(latin) ? latin : await toCyrillicValue(latin, spec, req))
      }
      return value === undefined ? latin : value
    }

    // uz-Cyrl saqlanmoqda
    if (value === undefined || equal(value, oldCyrillic)) return value
    const fallbackEcho = isEmpty(oldCyrillic) && !isEmpty(oldLatin) && equal(value, oldLatin)
    if (isEmpty(value) || fallbackEcho) {
      delete locks[spec.path]
      if (isEmpty(oldLatin)) return value
      return toCyrillicValue(oldLatin, spec, req)
    }
    locks[spec.path] = true
    ;(data as Record<string, unknown>)[CYRL_STALE_FIELD] = false
    return value
  }
}

// ---------------------------------------------------------------------------
// Maydonlar, endpoint, konfiguratsiya
// ---------------------------------------------------------------------------

/** `cyrlLocked`, `cyrlStale` va admin paneli (tugma) — kolleksiya/global'ga qo'shiladi. */
export function cyrlSyncAdminFields(specs: ReadonlyArray<CyrlSyncFieldSpec> = []): Field[] {
  return [
    {
      name: CYRL_LOCKED_FIELD,
      type: 'json',
      label: 'Qulflangan kirill maydonlari',
      admin: {
        hidden: true,
        description: 'Kirill matni qoʻlda tuzatilgan maydonlar: avtomatik qayta yozilmaydi.',
      },
    },
    {
      name: CYRL_STALE_FIELD,
      type: 'checkbox',
      label: 'Kirill versiyasi eskirgan boʻlishi mumkin',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description:
          'Lotin matni oʻzgardi, lekin qulflangan kirill maydonlari yangilanmadi. Tekshirib, belgini oling yoki kirillni qayta generatsiya qiling.',
      },
    },
    {
      name: CYRL_PANEL_FIELD,
      type: 'ui',
      admin: {
        position: 'sidebar',
        components: {
          Field: {
            path: '/components/cyrl/CyrlSyncPanel#CyrlSyncPanel',
            clientProps: {
              fields: specs.map((spec) => ({ path: spec.path, label: spec.label ?? spec.path })),
            },
          },
        },
      },
    },
  ]
}

type Target = { type: 'collection'; slug: string } | { type: 'global'; slug: string }

async function readJsonBody(req: PayloadRequest): Promise<Record<string, unknown>> {
  try {
    const body = typeof req.json === 'function' ? await req.json() : undefined
    return isPlainObject(body) ? body : {}
  } catch {
    return {}
  }
}

/**
 * `POST /api/{collection}/:id/regenerate-cyrl` yoki `POST /api/globals/{slug}/regenerate-cyrl`.
 * Body (ixtiyoriy): `{ "fields": ["alt"] }` — bo'lmasa barcha sinxronlanadigan maydonlar.
 * Qulflar olinadi, `cyrlStale = false`, kirill lotin qiymatidan qayta yoziladi. Drafts yoqilgan
 * kolleksiyada natija qoralama sifatida saqlanadi (publish — odatiy jarayon orqali).
 */
export function createRegenerateCyrlEndpoint(
  target: Target,
  specs: ReadonlyArray<CyrlSyncFieldSpec>,
  options: { drafts?: boolean } = {},
): Endpoint {
  const allPaths = specs.map((spec) => spec.path)
  return {
    path:
      target.type === 'collection'
        ? `/:id/${REGENERATE_CYRL_ENDPOINT}`
        : `/${REGENERATE_CYRL_ENDPOINT}`,
    method: 'post',
    handler: async (req) => {
      if (!isAdminOrEditorUser(req.user)) {
        return Response.json({ message: 'Ruxsat yoʻq' }, { status: 403 })
      }
      const body = await readJsonBody(req)
      const requested = Array.isArray(body.fields)
        ? body.fields.filter((f): f is string => typeof f === 'string' && allPaths.includes(f))
        : allPaths
      const paths = requested.length > 0 ? requested : allPaths
      const common = {
        depth: 0,
        overrideAccess: false,
        user: req.user,
        req,
        locale: LATIN_LOCALE,
        context: { [CYRL_CONTEXT_REGENERATE]: paths },
        ...(options.drafts ? { draft: true } : {}),
      } as const

      try {
        if (target.type === 'collection') {
          const id = req.routeParams?.id
          if (typeof id !== 'string' && typeof id !== 'number') {
            return Response.json({ message: 'id kerak' }, { status: 400 })
          }
          const current = await req.payload.findByID({
            collection: target.slug as 'media',
            id,
            depth: 0,
            overrideAccess: false,
            user: req.user,
            req,
          })
          const locks = parseCyrlLocked(
            (current as unknown as Record<string, unknown>)[CYRL_LOCKED_FIELD],
          )
          for (const path of paths) delete locks[path]
          const doc = await req.payload.update({
            ...common,
            collection: target.slug as 'media',
            id,
            data: { [CYRL_LOCKED_FIELD]: locks, [CYRL_STALE_FIELD]: false },
          })
          return Response.json({ doc, regenerated: paths })
        }
        const current = await req.payload.findGlobal({
          slug: target.slug as never,
          depth: 0,
          overrideAccess: false,
          user: req.user,
          req,
        })
        const locks = parseCyrlLocked(
          (current as unknown as Record<string, unknown>)[CYRL_LOCKED_FIELD],
        )
        for (const path of paths) delete locks[path]
        const doc = await req.payload.updateGlobal({
          ...common,
          slug: target.slug as never,
          data: { [CYRL_LOCKED_FIELD]: locks, [CYRL_STALE_FIELD]: false } as never,
        })
        return Response.json({ doc, regenerated: paths })
      } catch (error) {
        const status =
          typeof (error as { status?: unknown }).status === 'number'
            ? (error as { status: number }).status
            : 500
        req.payload.logger.error({ err: error }, 'Kirillni qayta generatsiya qilib boʻlmadi')
        return Response.json({ message: (error as Error).message }, { status })
      }
    },
  }
}

/** Maydonni nuqtali yo'l bo'yicha topadi (row/collapsible/unnamed tab — shaffof). */
function mapFieldAtPath(
  fields: Field[],
  segments: string[],
  update: (field: Field) => Field,
): { fields: Field[]; found: boolean } {
  const [head, ...rest] = segments
  let found = false
  const next = fields.map((field): Field => {
    if (found) return field
    if ('name' in field && field.name === head) {
      if (rest.length === 0) {
        found = true
        return update(field)
      }
      if (field.type === 'group') {
        const result = mapFieldAtPath(field.fields, rest, update)
        found = result.found
        return { ...field, fields: result.fields } as Field
      }
      return field
    }
    if (
      (field.type === 'row' || field.type === 'collapsible') &&
      !('name' in field && field.name)
    ) {
      const result = mapFieldAtPath(field.fields, segments, update)
      found = result.found
      return { ...field, fields: result.fields } as Field
    }
    if (field.type === 'tabs') {
      const tabs = field.tabs.map((tab) => {
        if (found) return tab
        if ('name' in tab && tab.name) {
          if (tab.name !== head || rest.length === 0) return tab
          const result = mapFieldAtPath(tab.fields, rest, update)
          found = result.found
          return { ...tab, fields: result.fields }
        }
        const result = mapFieldAtPath(tab.fields, segments, update)
        found = result.found
        return { ...tab, fields: result.fields }
      })
      return { ...field, tabs }
    }
    return field
  })
  return { fields: next, found }
}

function attachHook(fields: Field[], spec: NormalizedSpec): Field[] {
  const result = mapFieldAtPath(fields, spec.path.split('.'), (field) => {
    if (!('localized' in field) || !field.localized) {
      throw new Error(`withCyrlSync: "${spec.path}" maydoni localized: true boʻlishi kerak`)
    }
    const hooks = 'hooks' in field ? field.hooks : undefined
    return {
      ...field,
      hooks: {
        ...hooks,
        beforeChange: [...(hooks?.beforeChange ?? []), createCyrlSyncFieldHook(spec)],
      },
    } as Field
  })
  if (!result.found) throw new Error(`withCyrlSync: "${spec.path}" maydoni topilmadi`)
  return result.fields
}

function labelOf(fields: Field[], path: string): string | undefined {
  let label: string | undefined
  mapFieldAtPath(fields, path.split('.'), (field) => {
    if ('label' in field && typeof field.label === 'string') label = field.label
    return field
  })
  return label
}

function applyCyrlSync<T extends CollectionConfig | GlobalConfig>(
  config: T,
  options: CyrlSyncOptions,
  targetType: Target['type'],
): T {
  const specs = normalizeSpecs(options).map((spec) => ({
    ...spec,
    label: spec.label ?? labelOf(config.fields, spec.path),
  }))
  if (specs.length === 0) return config

  let fields = config.fields
  for (const spec of specs) fields = attachHook(fields, spec)

  const drafts = Boolean(
    config.versions && typeof config.versions === 'object' && config.versions.drafts,
  )
  const endpoint = createRegenerateCyrlEndpoint({ type: targetType, slug: config.slug }, specs, {
    drafts,
  })

  return {
    ...config,
    fields: [...fields, ...cyrlSyncAdminFields(specs)],
    endpoints: [...(Array.isArray(config.endpoints) ? config.endpoints : []), endpoint],
  }
}

/**
 * Kolleksiyaga kirill sinxronlashni ulaydi: maydon hook'lari, `cyrlLocked`/`cyrlStale` maydonlari,
 * admin paneli (tugma) va `POST /api/{slug}/:id/regenerate-cyrl` endpoint'i.
 *
 * ```ts
 * export const Posts = withCyrlSync(PostsBase, {
 *   fields: ['title', 'excerpt', 'meta.title', 'meta.description'],
 *   richTextFields: ['content'],
 * })
 * ```
 */
export function withCyrlSync(config: CollectionConfig, options: CyrlSyncOptions): CollectionConfig {
  return applyCyrlSync(config, options, 'collection')
}

/** Global uchun xuddi shu (`POST /api/globals/{slug}/regenerate-cyrl`). */
export function withCyrlSyncGlobal(config: GlobalConfig, options: CyrlSyncOptions): GlobalConfig {
  return applyCyrlSync(config, options, 'global')
}
