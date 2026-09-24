/**
 * Lighthouse CI (TZ §8.4, §11.7; M1-07): mobil Performance ≥ 90, SEO = 100, Accessibility ≥ 90,
 * birinchi yuklash JS ≤ 150 KB (gzip, uzatilgan hajm).
 *
 * Sahifalar: bosh sahifa, maqola, kategoriya (seed demo postlari — `pnpm seed`).
 * Lighthouse standart sozlamasi — mobil (Moto G Power emulyatsiyasi, simulyatsiya qilingan sekin 4G).
 *
 * Muhit o'zgaruvchilari:
 * - `LHCI_BASE_URL`        — tekshiriladigan sayt (standart: `http://localhost:3000`);
 * - `LHCI_PATHS`           — vergul bilan yo'llar (standart: bosh sahifa, maqola, kategoriya);
 * - `LHCI_START_SERVER=1`  — `next start` ni LHCI o'zi ishga tushiradi (CI, lokal build);
 * - `LHCI_PREVIEW=1`       — Vercel Preview: preview ataylab `noindex` (robots.txt `Disallow: /`,
 *                            `X-Robots-Tag`) va canonical production domeniga qaraydi — shuning uchun
 *                            `is-crawlable` va `canonical` auditlari o'tkazib yuboriladi
 *                            (production'da ular SEO toifasida qoladi);
 * - `VERCEL_AUTOMATION_BYPASS_SECRET` — Vercel Deployment Protection bypass (preview yopiq bo'lsa).
 *
 * Ishga tushirish: `pnpm --filter @blog-odya/web lhci` (build + seed dan keyin) —
 * `.github/workflows/lighthouse.yml` ham shuni chaqiradi.
 */
const DEFAULT_PATHS = [
  '/',
  '/kibersport/namuna-kibersport-turniri-haqidagi-maqola-tuzilmasi',
  '/kibersport',
]

const baseUrl = (process.env.LHCI_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '')
const paths = (process.env.LHCI_PATHS || DEFAULT_PATHS.join(','))
  .split(',')
  .map((path) => path.trim())
  .filter(Boolean)
const preview = process.env.LHCI_PREVIEW === '1'
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
const startServer = process.env.LHCI_START_SERVER === '1'
const port = new URL(baseUrl).port || '3000'

/** TZ §8.4: birinchi yuklash JS < 150 KB gzip. */
const JS_BUDGET_BYTES = 150 * 1024

module.exports = {
  ci: {
    collect: {
      url: paths.map((path) => `${baseUrl}${path}`),
      numberOfRuns: Number(process.env.LHCI_RUNS || 3),
      ...(startServer
        ? {
            startServerCommand: `pnpm exec next start -p ${port}`,
            startServerReadyPattern: 'Ready',
            startServerReadyTimeout: 60_000,
          }
        : {}),
      settings: {
        chromeFlags: '--no-sandbox --disable-dev-shm-usage',
        ...(bypass
          ? {
              extraHeaders: JSON.stringify({
                'x-vercel-protection-bypass': bypass,
                'x-vercel-set-bypass-cookie': 'true',
              }),
            }
          : {}),
        ...(preview ? { skipAudits: ['is-crawlable', 'canonical'] } : {}),
      },
    },
    assert: {
      // Har bir URL uchun 3 o'lchovning medianasi (tasodifiy tebranishlarga chidamli).
      aggregationMethod: 'median-run',
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:seo': ['error', { minScore: 1 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'resource-summary:script:size': ['error', { maxNumericValue: JS_BUDGET_BYTES }],
      },
    },
    upload: {
      // Hisobotlar — GitHub Actions artefakti (yopiq repo: ommaviy saqlashga yuklanmaydi).
      target: 'filesystem',
      outputDir: './.lighthouseci/reports',
    },
  },
}
