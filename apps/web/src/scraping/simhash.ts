import { createHash } from 'node:crypto'

/**
 * SimHash (64-bit) — `item.dedupe` (TZ §3.5 #4): matnlari deyarli bir xil yangiliklarni topish.
 *
 * Nima topiladi: bir xil yoki deyarli bir xil matn — sindikatsiya (bir maqola bir nechta
 * saytda), bitta press-reliz asosidagi qayta nashrlar, bir maqola turli URL'larda, RSS va sahifa
 * matni. Mustaqil yozilgan (boshqa so'zlar bilan) yoki boshqa tildagi maqolalar SimHash bilan
 * **topilmaydi** — bu LLM'siz yondashuvning tabiiy chegarasi.
 *
 * Normallashtirish (EN/RU va o'zbek lotin/kirill uchun):
 * 1. Unicode NFKC, kichik harf; URL'lar va Markdown belgilari olib tashlanadi.
 * 2. Apostrof/tutuq belgilari (' ʻ ʼ ‘ ’ ` ´) o'chiriladi: `o‘zbek`, `oʻzbek`, `o'zbek` → `ozbek`.
 * 3. Kirill harflari lotinga o'giriladi (o'zbek kirill ↔ lotin bir xil tokenga tushadi;
 *    rus matni uchun ham zararsiz — hamma matnga bir xil qo'llanadi).
 * 4. Tinish belgilari — ajratuvchi; tokenlar — harf/raqam ketma-ketliklari.
 * 5. Xususiyatlar — so'zlar (unigram, `SHINGLE_SIZE = 1`), vazni — takrorlanish soni (tf); har biri
 *    MD5'ning birinchi 64 biti bilan xeshlanadi.
 *
 * Nega unigram (3 so'zli shingle emas): 2026-09-24 dagi 391 ta jonli RSS yozuvida o'lchandi —
 * unigram'da o'zaro bog'liq bo'lmagan juftliklarning (76 ming) birortasi ham Hamming ≤ 6 ga
 * tushmadi, ~300 so'zli matnda 6 so'z o'zgartirilgan nusxalarning 84% i ≤ 3 da qoldi; 3-shingle
 * bilan xuddi shu tahrirlarda deyarli hech biri ≤ 3 ga tushmaydi (bitta so'z 3 xususiyatni
 * o'zgartiradi) — Hamming ≤ 3 chegarasi uchun juda sezgir.
 */

const APOSTROPHES = /['ʻʼ‘’`´ʹʽ]/g
const URL_PATTERN = /\bhttps?:\/\/\S+/gi
/** Markdown rasm/havola: `![alt](url)`, `[matn](url)` → matn. */
const MD_LINK = /!?\[([^\]]*)\]\([^)]*\)/g

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'j',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'x',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sh',
  ъ: '',
  ы: 'i',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  // O'zbek kirill harflari.
  ў: 'o',
  қ: 'q',
  ғ: 'g',
  ҳ: 'h',
}

/** Kirill → lotin (kichik harfli matn uchun). */
export function cyrillicToLatin(text: string): string {
  return text.replace(/[Ѐ-ӿ]/g, (ch) => CYRILLIC_TO_LATIN[ch] ?? ch)
}

/** Matnni SimHash uchun normallashtiradi va tokenlarga ajratadi. */
export function tokenize(text: string): string[] {
  const normalized = cyrillicToLatin(
    text
      .normalize('NFKC')
      .toLowerCase()
      .replace(MD_LINK, ' $1 ')
      .replace(URL_PATTERN, ' ')
      .replace(APOSTROPHES, ''),
  )
  return normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
}

export const SHINGLE_SIZE = 1

/** So'z shingle'lari (`size` so'zli; qisqa matnda — so'zlarning o'zi). */
export function shingles(tokens: readonly string[], size = SHINGLE_SIZE): string[] {
  if (tokens.length < size) return [...tokens]
  const result: string[] = []
  for (let i = 0; i + size <= tokens.length; i++) result.push(tokens.slice(i, i + size).join(' '))
  return result
}

function hash64(feature: string): bigint {
  return createHash('md5').update(feature).digest().readBigUInt64BE(0)
}

const BITS = 64

/**
 * 64-bit SimHash — 16 belgili hex satr. Token bo'lmasa `null` (bo'sh matn dedupe qilinmaydi).
 */
export function simhash(text: string): string | null {
  const features = shingles(tokenize(text))
  if (!features.length) return null
  const weights = new Map<string, number>()
  for (const feature of features) weights.set(feature, (weights.get(feature) ?? 0) + 1)

  const vector = new Array<number>(BITS).fill(0)
  for (const [feature, weight] of weights) {
    const h = hash64(feature)
    for (let bit = 0; bit < BITS; bit++) {
      vector[bit]! += (h >> BigInt(bit)) & 1n ? weight : -weight
    }
  }
  let result = 0n
  for (let bit = 0; bit < BITS; bit++) if (vector[bit]! > 0) result |= 1n << BigInt(bit)
  return result.toString(16).padStart(16, '0')
}

/** Ikki SimHash orasidagi Hamming masofasi (farqli bitlar soni, 0–64). */
export function hammingDistance(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`)
  let count = 0
  while (x) {
    x &= x - 1n
    count++
  }
  return count
}

export function isSimhash(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{16}$/.test(value)
}
