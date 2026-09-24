# @blog-odya/guidelines

Tahririyat hujjatlari: AI agent (MCP orqali) va muharrirlar ishlatadigan ko'rsatmalar, glossariy, transliteratsiya istisnolari va huquqiy sahifalar matni (TZ §2.3, §3.6, §5.2, §8.5, §9.6). Barcha matnlar o'zbek tilida, lotin yozuvida (`oʻ`/`gʻ` — `ʻ` U+02BB, tutuq belgisi — `ʼ` U+02BC).

| Fayl                            | Mazmuni                                                                                          | Foydalanuvchi                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `style.md`                      | Stil qo'llanma: til, yozuv, murojaat, raqam/sana/valyuta, sarlavhalar, namunalar                 | MCP `odya://guidelines/style`, `get_guidelines` |
| `copyright.md`                  | Mualliflik qoidalari: faktlar asosida qayta yozish, iqtiboslar, atributsiya, rasmlar             | MCP `odya://guidelines/copyright`               |
| `seo.md`                        | SEO qoidalari: uzunliklar, focus keyword, H2/H3, havolalar, teglar, FAQ                          | MCP `odya://guidelines/seo`                     |
| `output-schema.md`              | `save_rewrite` / `set_seo` / `submit_for_review` maydonlari                                      | MCP `odya://guidelines/output-schema`           |
| `glossary.seed.json`            | Glossariy: EN/RU atama → o'zbekcha, brendlar (`doNotTranslate`, `doNotTransliterate`)            | `glossary` kolleksiyasi seed (M1-03), MCP       |
| `translit-exceptions.seed.json` | Lotin → kirill istisnolari (`whole_word` / `prefix`)                                             | `translit-exceptions` kolleksiyasi seed (M1-03) |
| `legal/*.md`                    | 6 ta huquqiy sahifa (Biz haqimizda, Aloqa, Tahririyat siyosati, Maxfiylik, Mualliflik, Shartlar) | `pages` kolleksiyasi seed (M1-02)               |

Har bir Markdown faylda front-matter (`id`, `title`, `version`, `updatedAt`, huquqiy sahifalarda `slug`), JSON fayllarda yuqori darajadagi `version` va `updatedAt` bor. Mazmun o'zgarganda versiya va sana yangilanadi.

## Kod

```ts
import {
  glossarySeed, // Zod bilan tekshirilgan glossariy
  translitExceptionsSeed, // Zod bilan tekshirilgan istisnolar
  loadAllGuidelines, // [{ id, uri, file, path, frontMatter, markdown, raw }]
  loadLegalPages, // [{ id, slug, file, path, frontMatter, markdown, raw }]
  fillPlaceholders, // {{CONTACT_EMAIL}} va h.k. o'rinbosarlarini almashtirish
} from '@blog-odya/guidelines'
```

- Zod sxemalari: `src/schemas.ts` (`glossarySeedSchema`, `translitExceptionsSeedSchema`, `docFrontMatterSchema`).
- Markdown fayllar ish vaqtida `node:fs` orqali o'qiladi (`GUIDELINES_ROOT` — `resolveGuidelinesRoot()`: modul joylashuvi, Next.js bundle'ida esa `process.cwd()` ga nisbatan). Vercel'da ular `apps/web/next.config.ts` → `outputFileTracingIncludes['/api/mcp']` orqali MCP funksiyasiga qo'shiladi (M2-06).

## Transliteratsiya istisnolari qanday qo'llanadi

Adapter (M1-03) avval `whole_word` yozuvlarini, keyin eng uzun `prefix` mosligini qo'llaydi; katta-kichik harf farqlanmaydi, asl so'zning bosh harfi saqlanadi. Masalan, `sentabr` (`whole_word`) → `сентябрь`, `sentabrda` (`sentab` prefiksi) → `сентябрда`. So'z oxiridagi yumshoq belgili so'zlar (`model` → `модель`) faqat `whole_word`: qo'shimchali shakllarda `ь` tushib qoladi.

## Huquqiy sahifalardagi o'rinbosarlar

Noma'lum aloqa ma'lumotlari o'ylab topilmagan — `{{...}}` o'rinbosarlari qoldirilgan va seed paytida almashtiriladi: `CONTACT_EMAIL`, `EDITORIAL_EMAIL`, `COPYRIGHT_EMAIL`, `PRIVACY_EMAIL`, `ADS_EMAIL`, `LEGAL_ADDRESS`, `COMPANY_TIN`, `EDITOR_IN_CHIEF`, `MEDIA_REGISTRATION` (OAV guvohnomasi olingach), `TELEGRAM_LATN_URL`, `TELEGRAM_CYRL_URL`.

## Tekshiruv

```bash
pnpm --filter @blog-odya/guidelines test
```

Test JSON'larni Zod sxemasi bilan tekshiradi (glossariy ≥ 150, istisnolar ≥ 300, dublikatsiz), Markdown fayllarning front-matter'i, apostroflar va o'rinbosarlarni tekshiradi.
