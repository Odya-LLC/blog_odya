/**
 * TTF shriftidan glif kengliklari (OBLOG-94) — sarlavhani rasmga sig'dirish uchun matn enini
 * satori chizishidan **oldin** o'lchaymiz (qatorlarni o'zimiz bo'lamiz, aks holda satori
 * 4 qatordan oshirib yuborishi mumkin).
 *
 * Minimal o'quvchi: `head` (unitsPerEm), `hhea` (numberOfHMetrics), `hmtx` (advanceWidth),
 * `cmap` format 4 (BMP — lotin, kirill, ʻ ʼ … hammasi shu yerda). Kerning hisobga olinmaydi —
 * u kenglikni odatda kamaytiradi, ya'ni o'lchov biroz "ehtiyotkor".
 */

export interface FontMetrics {
  unitsPerEm: number
  /** Glif kengligi (font birliklarida); glif yo'q — `null`. */
  advance(codePoint: number): number | null
  /** O'rtacha kenglik (glif topilmasa ishlatiladi). */
  fallbackAdvance: number
}

interface Table {
  offset: number
  length: number
}

function tables(view: DataView): Map<string, Table> {
  const count = view.getUint16(4)
  const map = new Map<string, Table>()
  for (let i = 0; i < count; i++) {
    const base = 12 + i * 16
    const tag = String.fromCharCode(
      view.getUint8(base),
      view.getUint8(base + 1),
      view.getUint8(base + 2),
      view.getUint8(base + 3),
    )
    map.set(tag, { offset: view.getUint32(base + 8), length: view.getUint32(base + 12) })
  }
  return map
}

/** cmap format 4 subjadvali → `codePoint → glyphId`. */
function readCmap4(view: DataView, offset: number): Map<number, number> {
  const segCountX2 = view.getUint16(offset + 6)
  const segCount = segCountX2 / 2
  const endBase = offset + 14
  const startBase = endBase + segCountX2 + 2
  const deltaBase = startBase + segCountX2
  const rangeBase = deltaBase + segCountX2
  const glyphs = new Map<number, number>()
  for (let s = 0; s < segCount; s++) {
    const end = view.getUint16(endBase + s * 2)
    const start = view.getUint16(startBase + s * 2)
    const delta = view.getInt16(deltaBase + s * 2)
    const rangeOffset = view.getUint16(rangeBase + s * 2)
    for (let code = start; code <= end && code !== 0xffff; code++) {
      let glyph: number
      if (rangeOffset === 0) {
        glyph = (code + delta) & 0xffff
      } else {
        const address = rangeBase + s * 2 + rangeOffset + (code - start) * 2
        glyph = view.getUint16(address)
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff
      }
      if (glyph !== 0) glyphs.set(code, glyph)
    }
  }
  return glyphs
}

export function parseFontMetrics(data: ArrayBuffer): FontMetrics {
  const view = new DataView(data)
  const dir = tables(view)
  const head = dir.get('head')
  const hhea = dir.get('hhea')
  const hmtx = dir.get('hmtx')
  const cmap = dir.get('cmap')
  if (!head || !hhea || !hmtx || !cmap) throw new Error('shrift jadvallari topilmadi')

  const unitsPerEm = view.getUint16(head.offset + 18)
  const numberOfHMetrics = view.getUint16(hhea.offset + 34)
  const advanceOf = (glyph: number) =>
    view.getUint16(hmtx.offset + Math.min(glyph, numberOfHMetrics - 1) * 4)

  // Unicode BMP subjadvali (platform 0 yoki 3/1), format 4.
  const subtables = view.getUint16(cmap.offset + 2)
  let glyphs: Map<number, number> | null = null
  for (let i = 0; i < subtables && !glyphs; i++) {
    const base = cmap.offset + 4 + i * 8
    const platform = view.getUint16(base)
    const encoding = view.getUint16(base + 2)
    const offset = cmap.offset + view.getUint32(base + 4)
    if ((platform === 0 || (platform === 3 && encoding === 1)) && view.getUint16(offset) === 4) {
      glyphs = readCmap4(view, offset)
    }
  }
  if (!glyphs) throw new Error('cmap format 4 topilmadi')
  const map = glyphs

  const sample = [...'aeiounrstlAEOUБблокнет']
    .map((char) => map.get(char.codePointAt(0)!))
    .filter((glyph): glyph is number => glyph !== undefined)
    .map(advanceOf)
  const fallbackAdvance = sample.length
    ? sample.reduce((sum, value) => sum + value, 0) / sample.length
    : unitsPerEm * 0.6

  return {
    unitsPerEm,
    fallbackAdvance,
    advance(codePoint) {
      const glyph = map.get(codePoint)
      return glyph === undefined ? null : advanceOf(glyph)
    },
  }
}

/**
 * Matn eni (px): glif kengliklari × `fontSize / unitsPerEm` + har belgiga `letterSpacing` (em).
 */
export function measureText(
  metrics: FontMetrics,
  text: string,
  fontSize: number,
  letterSpacingEm = 0,
): number {
  let units = 0
  let count = 0
  for (const char of text) {
    units += metrics.advance(char.codePointAt(0)!) ?? metrics.fallbackAdvance
    count++
  }
  return (units / metrics.unitsPerEm) * fontSize + count * letterSpacingEm * fontSize
}
