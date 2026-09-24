/**
 * Lighthouse CI (TZ §8.4, §11 p.7; M1-07): mobil Performance ≥ 90, SEO = 100,
 * Accessibility ≥ 90, birinchi yuklash JS ≤ 150 KB gzip — bosh sahifa, maqola, kategoriya.
 *
 * Ishga tushirish (repo ildizidan):
 *   LHCI_BASE_URL=http://localhost:3100 npx @lhci/cli@0.15.1 autorun --config=apps/web/lighthouserc.cjs
 *
 * Muhit o'zgaruvchilari:
 * - `LHCI_BASE_URL`  — sayt manzili (standart: `http://localhost:3100`, `next start -p 3100`);
 * - `LHCI_PATHS`     — vergul bilan yo'llar (standart: demo seed — bosh sahifa, maqola, kategoriya);
 * - `LHCI_PREVIEW=1` — Vercel Preview: `is-crawlable` auditi o'tkazib yuboriladi (pastga qarang);
 * - `VERCEL_AUTOMATION_BYPASS_SECRET` — Preview "Vercel Authentication" bilan yopiq bo'lsa,
 *   `x-vercel-protection-bypass` sarlavhasi (Vercel → Settings → Deployment Protection →
 *   Protection Bypass for Automation);
 * - `LHCI_RUNS` — har bir URL necha marta o'lchanadi (standart 3; natija — mediana);
 * - `LHCI_START_SERVER=1` — `next start -p 3100` ni LHCI o'zi ishga tushiradi (CI).
 *
 * Windows'da `lhci autorun` Chrome vaqtinchalik papkasini o'chira olmay (EPERM) yiqilishi mumkin:
 * Chrome'ni `--remote-debugging-port=9333` bilan o'zingiz ishga tushirib, `lhci collect
 * --settings.port=9333` va keyin `lhci assert` qiling (yoki `patrickhulce/lhci-client` Docker).
 */
const base = (process.env.LHCI_BASE_URL || 'http://localhost:3100').replace(/\/+$/, '')

/** Demo seed (`src/seed/data.ts`, `pnpm seed`): bosh sahifa, maqola (muqova + boy bloklar), kategoriya. */
const DEFAULT_PATHS = [
  '/',
  '/suniy-intellekt/namuna-suniy-intellekt-yangiliklari-qanday-tayyorlanadi',
  '/kibersport',
]

const paths = (process.env.LHCI_PATHS || DEFAULT_PATHS.join(','))
  .split(',')
  .map((path) => path.trim())
  .filter(Boolean)

/**
 * Preview (`VERCEL_ENV=preview`) ataylab `noindex` (OBLOG-13: `X-Robots-Tag`, `<meta robots>`,
 * `robots.txt: Disallow: /`) — bu to'g'ri xatti-harakat, uni o'chirmaymiz (preview Google'ga
 * tushmasligi kerak). Shuning uchun faqat preview'da `is-crawlable` auditi o'tkazib yuboriladi:
 * o'tkazilgan audit SEO bahosiga kirmaydi, qolgan barcha SEO auditlari (title, description,
 * canonical, hreflang, link matni, `lang`, http status …) = 100 bo'lishi shart. Indekslanish
 * esa mahalliy/CI o'lchovida (`next start`, preview emas) va unit testlarda tekshiriladi.
 */
const isPreview = process.env.LHCI_PREVIEW === '1'
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET

/** Birinchi yuklash JS byudjeti (gzip, uzatilgan hajm): 150 KB (TZ §8.4). */
const JS_BUDGET_BYTES = 150 * 1024

/** CI: `next start` ni LHCI o'zi ishga tushiradi (`LHCI_START_SERVER=1`, cwd — `apps/web`). */
const startServer =
  process.env.LHCI_START_SERVER === '1'
    ? {
        startServerCommand: 'pnpm exec next start -p 3100',
        startServerReadyPattern: 'Ready in',
        startServerReadyTimeout: 120000,
      }
    : {}

module.exports = {
  ci: {
    collect: {
      ...startServer,
      url: paths.map((path) => `${base}${path}`),
      numberOfRuns: Number(process.env.LHCI_RUNS || 3),
      settings: {
        // Standart Lighthouse — mobil (Moto G Power emulyatsiyasi, simulyatsiya qilingan 4G).
        formFactor: 'mobile',
        chromeFlags: '--headless=new --no-sandbox --disable-dev-shm-usage',
        skipAudits: isPreview ? ['is-crawlable'] : [],
        ...(bypass
          ? {
              extraHeaders: JSON.stringify({
                'x-vercel-protection-bypass': bypass,
                'x-vercel-set-bypass-cookie': 'true',
              }),
            }
          : {}),
      },
    },
    assert: {
      // Har bir URL uchun mediana natija (3 ta o'lchovdan) — tasodifiy "eng yaxshi" emas.
      aggregationMethod: 'median-run',
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:seo': ['error', { minScore: 1 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'resource-summary:script:size': ['error', { maxNumericValue: JS_BUDGET_BYTES }],
      },
    },
    upload: {
      // Hisobotlar — GitHub Actions artefakti sifatida (ommaviy saqlashga yuklanmaydi).
      target: 'filesystem',
      outputDir: '.lighthouseci/reports',
    },
  },
}
