import type { Payload } from 'payload'

import type { CyrlDocArgs, CyrlSyncDocOptions } from './cyrlSync'
import { LATIN_LOCALE, CYRILLIC_LOCALE } from './cyrlSync'

/**
 * Post darajasidagi transliteratsiya himoyasi (OBLOG-67): kirill versiyasida lotinda qoladigan
 * atamalar — postning `keepLatin` ro'yxati (MCP `save_rewrite` yoki admin) va postga biriktirilgan
 * "brend" teglar nomlari.
 *
 * Teg brend hisoblanadi, agar:
 * - `doNotTransliterate` belgilangan (admin yoki MCP `keepLatin` dagi nom bilan yaratilgan teg);
 * - yoki tegning kirill nomi lotin nomi bilan bir xil (muharrir kirill nomini lotinda qoldirgan).
 *
 * O'zbekcha teglar (`Sunʼiy intellekt`, `Kibersport`) himoyalanmaydi — ular odatdagidek o'giriladi.
 */

/** `keepLatin` qiymatini tozalaydi: satrlar ro'yxati, bo'shliqlarsiz, takrorlarsiz. */
export function parseKeepLatin(value: unknown): string[] {
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(parsed)) return []
  const out = new Set<string>()
  for (const item of parsed) {
    if (typeof item !== 'string') continue
    const term = item.trim()
    if (term) out.add(term)
  }
  return [...out]
}

/** Relationship qiymatidan ID'lar (son yoki `{ id }`). */
export function relationIds(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<number>()
  for (const item of value) {
    const id = typeof item === 'object' && item !== null ? (item as { id?: unknown }).id : item
    if (typeof id === 'number' && Number.isFinite(id)) ids.add(id)
    else if (typeof id === 'string' && /^\d+$/.test(id)) ids.add(Number(id))
  }
  return [...ids].sort((a, b) => a - b)
}

type LocalizedName = string | Partial<Record<string, string | null>> | null | undefined

function localized(value: LocalizedName, locale: string): string | undefined {
  if (typeof value === 'string') return value
  const out = value?.[locale]
  return typeof out === 'string' ? out : undefined
}

/** Teg brend sifatida himoyalanadimi (`doNotTransliterate` yoki kirill nomi = lotin nomi)? */
export function tagProtectedName(tag: {
  name?: LocalizedName
  doNotTransliterate?: boolean | null
}): string | undefined {
  const latin = localized(tag.name, LATIN_LOCALE)?.trim()
  if (!latin || !/[A-Za-z]/.test(latin)) return undefined
  if (tag.doNotTransliterate) return latin
  const cyrillic = localized(tag.name, CYRILLIC_LOCALE)?.trim()
  return cyrillic === latin ? latin : undefined
}

/**
 * Teglar bo'yicha himoyalangan nomlar. `req` berilmaydi (tranzaksiyadan tashqarida o'qiladi —
 * Local API `req.locale` ni o'zgartirmasin); shu saqlashda yaratilgan teg ko'rinmasligi mumkin —
 * MCP bunday nomlarni baribir `keepLatin` ga yozadi.
 */
export async function protectedTagNames(payload: Payload, tagIds: number[]): Promise<string[]> {
  if (tagIds.length === 0) return []
  const { docs } = await payload.find({
    collection: 'tags',
    where: { id: { in: tagIds } },
    locale: 'all',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { name: true, doNotTransliterate: true },
  })
  return docs.flatMap((tag) => {
    const name = tagProtectedName(tag as Parameters<typeof tagProtectedName>[0])
    return name ? [name] : []
  })
}

/** Post uchun barcha qo'shimcha himoyalangan atamalar (`keepLatin` + brend teglar). */
export async function postProtectedTerms(
  payload: Payload,
  input: { keepLatin?: unknown; tags?: unknown },
): Promise<string[]> {
  const tagNames = await protectedTagNames(payload, relationIds(input.tags))
  return [...new Set([...parseKeepLatin(input.keepLatin), ...tagNames])]
}

/** Saqlanayotgan qiymat (berilgan bo'lsa) yoki saqlashdan oldingi qiymat. */
function current(args: CyrlDocArgs, key: string): unknown {
  return args.data[key] !== undefined ? args.data[key] : args.originalDoc?.[key]
}

function changed(args: CyrlDocArgs, key: string, normalize: (value: unknown) => unknown): boolean {
  if (args.data[key] === undefined) return false
  return (
    JSON.stringify(normalize(args.data[key])) !== JSON.stringify(normalize(args.originalDoc?.[key]))
  )
}

/** `posts` kirill sinxronlash: `keepLatin` va teglar (o'zgarsa — qulflanmagan kirill yangilanadi). */
export const postCyrlTerms: CyrlSyncDocOptions = {
  protectedTerms: (args) =>
    postProtectedTerms(args.req.payload, {
      keepLatin: current(args, 'keepLatin'),
      tags: current(args, 'tags'),
    }),
  refreshWhen: (args) =>
    args.originalDoc !== undefined &&
    (changed(args, 'keepLatin', (value) => [...parseKeepLatin(value)].sort()) ||
      changed(args, 'tags', relationIds)),
}

/**
 * `tags` kirill sinxronlash: `doNotTransliterate` belgilangan teg nomi kirillda ham lotinda qoladi;
 * belgi o'zgarsa — kirill nomi (qulflanmagan bo'lsa) qayta yoziladi.
 */
export const tagCyrlTerms: CyrlSyncDocOptions = {
  protectedTerms: async (args) => {
    if (!current(args, 'doNotTransliterate')) return []
    if (args.req.locale === LATIN_LOCALE && typeof args.data.name === 'string') {
      return [args.data.name]
    }
    const id = args.originalDoc?.id
    if (typeof id !== 'number' && typeof id !== 'string') return []
    const tag = await args.req.payload.findByID({
      collection: 'tags',
      id,
      locale: LATIN_LOCALE,
      fallbackLocale: false,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
      select: { name: true },
    })
    return typeof tag?.name === 'string' ? [tag.name] : []
  },
  refreshWhen: (args) =>
    args.originalDoc !== undefined &&
    changed(args, 'doNotTransliterate', (value) => Boolean(value)),
}
