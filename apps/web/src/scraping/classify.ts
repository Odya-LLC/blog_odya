/**
 * LLM'siz klassifikatsiya va score (TZ §3.5 #5, `docs/sources.md` §5) — sof funksiyalar.
 *
 * Kategoriya:
 * 1. Element topilgan feed'ning mapping'i (`sources.feeds[].mapsTo`) — shu kategoriyaga
 *    `feeds[].mappingWeight` ball (default `FEED_MAPPING_POINTS` = 10). Bo'lim feedlari (AI,
 *    Security...) — kuchli signal (10); keng bo'limlar (The Verge "Tech") — 5; umumiy feedlar
 *    ("All", "Новости") — faqat zaxira (1): ularda kategoriyani kalit so'zlar hal qiladi.
 * 2. Manbaning `keywordRules` qoidalari sarlavha + excerpt + manba teglari bo'yicha tekshiriladi:
 *    butun so'z/ibora mosligi, so'z oxiridagi `*` — prefiks (rus morfologiyasi uchun). Har bir mos
 *    qoida o'z kategoriyasiga `boost` qo'shadi (har qoida bir marta); kategoriya bo'yicha jami
 *    `KEYWORD_CAP_PER_CATEGORY` (10) bilan cheklanadi.
 * 3. Eng ko'p ball olgan kategoriya — `suggestedCategory`; teng bo'lsa — feed mapping'i, u ham
 *    bo'lmasa — birinchi mos kelgan qoida kategoriyasi.
 *
 * Score (0–100) = manba `priority` (0–50) + yangilik (0–25, 48 soatda chiziqli so'nadi) +
 * klaster hajmi (har qo'shimcha manba +5, ≤ 15) + kalit so'z boost (g'olib kategoriya, −10…+10).
 */

export const FEED_MAPPING_POINTS = 10
/**
 * Bitta kategoriya kalit so'zlardan oladigan maksimal ball (= bo'lim feed'i bali). Bir mavzuning
 * ko'p sinonimlari (`ai`, `ml`, `llm`, `ии`...) bo'lim feed'ini (10) bosib keta olmaydi — teng
 * bo'lsa feed mapping'i qoladi; kalit so'zlar umumiy feedlarda (1) va keng bo'limlarda (5) hal
 * qiladi.
 */
export const KEYWORD_CAP_PER_CATEGORY = 10

export const SCORE_WEIGHTS = {
  maxPriority: 50,
  maxFreshness: 25,
  freshnessHours: 48,
  perClusterMember: 5,
  maxCluster: 15,
  maxKeywordBoost: 10,
} as const

export interface KeywordRule<C = number> {
  keyword: string
  category: C
  boost: number
}

interface CompiledRule<C> {
  rule: KeywordRule<C>
  words: { text: string; prefix: boolean }[]
}

const APOSTROPHES = /['ʻʼ‘’`´]/g

/**
 * Qoidalar bilan solishtirish uchun tokenlar: kichik harf, `ё → е`, apostroflar o'chiriladi;
 * so'z ichidagi `. + #` saqlanadi (`c++`, `c#`, `node.js`), chetidagi nuqta olinadi. Chiziqcha —
 * ajratuvchi: `zero-day` = `zero day`, `ии-компания` → `ии` + `компания`, `gpt-5` → `gpt` + `5`
 * (qoidalarga ham xuddi shunday qo'llanadi).
 */
export function keywordTokens(text: string): string[] {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(APOSTROPHES, '')
    .split(/[^\p{L}\p{N}.+#]+/u)
    .map((token) => token.replace(/^\.+|\.+$/g, ''))
    .filter(Boolean)
}

export function compileRules<C>(rules: readonly KeywordRule<C>[]): CompiledRule<C>[] {
  const compiled: CompiledRule<C>[] = []
  for (const rule of rules) {
    const words = rule.keyword
      .trim()
      .split(/\s+/)
      .flatMap((part) => {
        const prefix = part.endsWith('*')
        const tokens = keywordTokens(prefix ? part.slice(0, -1) : part)
        // `*` faqat so'zning oxirgi bo'lagiga tegishli (`мини-пк*` → `мини` + `пк*`).
        return tokens.map((text, i) => ({ text, prefix: prefix && i === tokens.length - 1 }))
      })
    if (words.length) compiled.push({ rule, words })
  }
  return compiled
}

function wordMatches(token: string, word: { text: string; prefix: boolean }): boolean {
  return word.prefix ? token.startsWith(word.text) : token === word.text
}

function ruleMatches(tokens: readonly string[], words: CompiledRule<unknown>['words']): boolean {
  // Rule'lar ~80 ta, tokenlar ~100 ta — oddiy siljuvchi taqqoslash yetarli (< 1 ms).
  outer: for (let i = 0; i + words.length <= tokens.length; i++) {
    for (let j = 0; j < words.length; j++) {
      if (!wordMatches(tokens[i + j]!, words[j]!)) continue outer
    }
    return true
  }
  return false
}

/** Matnga mos keladigan qoidalar (har qoida bir marta). */
export function matchRules<C>(text: string, rules: readonly KeywordRule<C>[]): KeywordRule<C>[] {
  const tokens = keywordTokens(text)
  if (!tokens.length) return []
  return compileRules(rules)
    .filter(({ words }) => ruleMatches(tokens, words))
    .map(({ rule }) => rule)
}

export interface ClassifyInput<C> {
  /** Feed mapping'i (`feeds[].mapsTo`). */
  feedCategory?: C | null
  /** Mapping bali (`feeds[].mappingWeight`); default `FEED_MAPPING_POINTS`. */
  feedWeight?: number | null
  rules: readonly KeywordRule<C>[]
  title?: string | null
  excerpt?: string | null
  tags?: readonly string[] | null
}

export interface ClassifyResult<C> {
  category: C | null
  /** Kategoriya → ball. */
  points: Map<C, number>
  matched: KeywordRule<C>[]
  /** G'olib kategoriya bo'yicha kalit so'z boost'lari yig'indisi. */
  keywordBoost: number
}

export function classifyText<C>(input: ClassifyInput<C>): ClassifyResult<C> {
  const text = [input.title, input.excerpt, ...(input.tags ?? [])].filter(Boolean).join(' \n ')
  const matched = matchRules(text, input.rules)
  const points = new Map<C, number>()
  const add = (category: C, value: number) =>
    points.set(category, (points.get(category) ?? 0) + value)

  const feedCategory = input.feedCategory ?? null
  const feedWeight =
    typeof input.feedWeight === 'number' && Number.isFinite(input.feedWeight)
      ? input.feedWeight
      : FEED_MAPPING_POINTS
  const keywordPoints = new Map<C, number>()
  for (const rule of matched)
    keywordPoints.set(rule.category, (keywordPoints.get(rule.category) ?? 0) + rule.boost)
  if (feedCategory !== null) add(feedCategory, feedWeight)
  for (const [category, value] of keywordPoints)
    add(category, Math.min(value, KEYWORD_CAP_PER_CATEGORY))

  let category: C | null = feedCategory
  let best = feedCategory !== null ? (points.get(feedCategory) ?? 0) : Number.NEGATIVE_INFINITY
  for (const [candidate, value] of points) {
    // Qat'iy katta — teng bo'lsa feed mapping'i (yoki birinchi topilgani) qoladi.
    if (value > best) {
      best = value
      category = candidate
    }
  }
  // Faqat manfiy boost'lar bo'lsa va feed mapping'i yo'q — kategoriya taklif qilinmaydi.
  if (feedCategory === null && best <= 0) category = null

  const keywordBoost =
    category === null
      ? 0
      : matched.filter((rule) => rule.category === category).reduce((s, r) => s + r.boost, 0)
  return { category, points, matched, keywordBoost }
}

export interface ScoreInput {
  priority?: number | null
  /** Manbada chop etilgan vaqt (bo'lmasa — yig'ilgan vaqt). */
  publishedAt?: string | Date | null
  now: number
  /** Klasterdagi elementlar soni (o'zi bilan). */
  clusterSize: number
  keywordBoost: number
}

export interface ScoreParts {
  priority: number
  freshness: number
  cluster: number
  keywords: number
  total: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function computeScore(input: ScoreInput): ScoreParts {
  const w = SCORE_WEIGHTS
  const priority = clamp(Number(input.priority ?? 0) || 0, 0, w.maxPriority)

  const published = input.publishedAt ? new Date(input.publishedAt).getTime() : NaN
  const ageHours = Number.isNaN(published) ? w.freshnessHours : (input.now - published) / 3_600_000
  const freshness = w.maxFreshness * clamp(1 - Math.max(0, ageHours) / w.freshnessHours, 0, 1)

  const cluster = clamp((Math.max(1, input.clusterSize) - 1) * w.perClusterMember, 0, w.maxCluster)
  const keywords = clamp(input.keywordBoost, -w.maxKeywordBoost, w.maxKeywordBoost)
  const total = Math.round(clamp(priority + freshness + cluster + keywords, 0, 100))
  return {
    priority,
    freshness: Math.round(freshness * 10) / 10,
    cluster,
    keywords,
    total,
  }
}
