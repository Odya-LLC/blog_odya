// Inter 4.1 (SIL OFL 1.1) shriftlarini rasmiy GitHub relizidan yuklab, keshga ochadi.
// Kesh: $BRAND_CACHE yoki <tmpdir>/blog-odya-brand. Repozitoriyga TTF qo'shilmaydi.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import opentype from 'opentype.js'

const INTER_VERSION = '4.1'
const INTER_URL = `https://github.com/rsms/inter/releases/download/v${INTER_VERSION}/Inter-${INTER_VERSION}.zip`

export const FONT_FILES = {
  'Inter-Medium': 'extras/ttf/Inter-Medium.ttf',
  'Inter-SemiBold': 'extras/ttf/Inter-SemiBold.ttf',
  'Inter-Bold': 'extras/ttf/Inter-Bold.ttf',
  'Inter-ExtraBold': 'extras/ttf/Inter-ExtraBold.ttf',
  'InterDisplay-Medium': 'extras/ttf/InterDisplay-Medium.ttf',
  'InterDisplay-SemiBold': 'extras/ttf/InterDisplay-SemiBold.ttf',
  'InterDisplay-ExtraBold': 'extras/ttf/InterDisplay-ExtraBold.ttf',
}

// Shrift albatta qamrab olishi kerak bo'lgan belgilar: oʻ/gʻ (U+02BB), tutuq belgisi (U+02BC),
// o'zbek kirilining maxsus harflari.
export const REQUIRED_CHARS = 'ʻʼ‘’«»—–ЎўҚқҒғҲҳЁёЪъЬьЭэЮюЯяБлогОдя'

export async function loadFonts() {
  const cache = process.env.BRAND_CACHE || path.join(os.tmpdir(), 'blog-odya-brand')
  const dir = path.join(cache, `inter-${INTER_VERSION}`)
  const zip = path.join(cache, `Inter-${INTER_VERSION}.zip`)
  fs.mkdirSync(cache, { recursive: true })
  if (!fs.existsSync(path.join(dir, FONT_FILES['Inter-ExtraBold']))) {
    if (!fs.existsSync(zip)) {
      console.log(`↓ ${INTER_URL}`)
      const res = await fetch(INTER_URL)
      if (!res.ok) throw new Error(`Inter yuklab olinmadi: ${res.status}`)
      fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()))
    }
    execFileSync('unzip', ['-o', '-q', zip, '-d', dir])
  }
  const fonts = {}
  for (const [name, rel] of Object.entries(FONT_FILES)) {
    const buf = fs.readFileSync(path.join(dir, rel))
    const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length))
    const missing = [...REQUIRED_CHARS].filter((c) => font.charToGlyphIndex(c) === 0)
    if (missing.length) throw new Error(`${name}: glif yo'q — ${missing.join(' ')}`)
    fonts[name] = { buf, font }
  }
  return { fonts, licensePath: path.join(dir, 'LICENSE.txt') }
}
