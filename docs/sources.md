# Manbalar auditi — OBLOG (M0-04)

| Parametr | Qiymat |
|---|---|
| Vazifa | M0-04 (OBLOG-5) — Manbalar auditi va seed ma'lumotlari |
| Tekshirilgan sana | **2026-09-23** |
| User-Agent | `OdyaBlogBot/1.0 (+https://blog.odya.uz/bot)` |
| Asos | [TZ.md](TZ.md) §2.2, §2.3, §3.5, §10.1, §10.4 |
| Seed fayllar | [`packages/shared/seed/sources.json`](../packages/shared/seed/sources.json), [`packages/shared/seed/categories.json`](../packages/shared/seed/categories.json) |
| Sxema (Zod) | [`packages/shared/src/schemas/`](../packages/shared/src/schemas/) |

## 1. Tekshirish usuli

1. Har bir feed URL `curl` va Node `fetch` bilan bizning User-Agent orqali yuklandi: HTTP status, `Content-Type`, XML parse (`rss-parser`), yozuvlar soni, eng yangi yozuv sanasi.
2. **Kunlik hajm** — feeddagi yozuvlar soni / birinchi va oxirgi yozuv orasidagi vaqt (bitta namuna, 2026-09-23). Bu taxmin: kichik feedlarda (10–20 yozuv) xato katta.
3. `robots.txt` — `User-agent: *` bo'limi va bizning UA uchun (nomma-nom qoida yo'q — hamma joyda `*` qo'llanadi).
4. **ToS** — saytning footeridagi foydalanish shartlari sahifasi o'qildi, scraping / nusxalash / RSS bandlari qisqacha xulosa qilindi (to'liq matn ko'chirilmadi).
5. **Server HTML** — har bir manbadan bitta maqola sahifasi JS'siz yuklandi; `linkedom` bilan CSS selektor orqali maqola matni ajratib olindi.
6. Xulosa — TZ §2.3 qoidasi bo'yicha: **ToS'da scraping taqiqlangan bo'lsa → `rss_only`**; aks holda, agar RSS matni qisqa bo'lsa → `rss_plus_page`.

Qayta tekshirish (qo'lda, CI'da o'chiq): 7-bo'limga qarang.

## 2. Xulosa jadvali

| # | Manba | Til | `fetchMode` | `priority` | `pollIntervalMin` | `rateLimitSec` | Faol feedlar | Kunlik hajm (taxm.) | RSS matni | Server HTML |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | The Verge | EN | **`rss_only`** | 45 | 15 | 10 | 7 | 30–50 | Atom, qisqa HTML (~750–1000 belgi) | ✅ (yuklanmaydi) |
| 2 | TechCrunch | EN | **`rss_only`** | 45 | 15 | 10 | 6 | ~30 | Faqat description (~150 belgi) | ✅ (yuklanmaydi) |
| 3 | Habr (faqat Новости) | RU | **`rss_plus_page`** | 35 | 15 | 10 | 4 | 50–100 | description (~370–560 belgi) | ✅ `.article-formatted-body` |
| 4 | iXBT.com | RU | **`rss_only`** | 30 | 15 | 10 | 2 | ~100 | **To'liq matn** (`content:encoded`, ~1.5–2k belgi) | ✅ (kerak emas) |
| 5a | Dexerto | EN | **`rss_plus_page`** | 30 | 20 | 10 | 2 | ~10 (gaming) + <1 (esports) | description (~140 belgi) | ✅ `#article-content` |
| 5b | HLTV.org | EN | **`rss_only`** | 25 | 20 | 15 | 1 | ~4 | Sarlavha + 1 jumla (~80 belgi) | ⚠️ Cloudflare (o'zgaruvchan) |
| — | 3DNews (zaxira) | RU | `rss_only` | 20 | 30 | 10 | 1 (manba o'chiq) | ~37 | description (~400 belgi) | tekshirilmadi |

> Dexerto va HLTV — TZ §2.2 da bitta qator, lekin `sources` da **ikkita alohida yozuv**: domen, `robots.txt`, rate limit va `fetchMode` har xil (`homepageUrl` bitta bo'lishi kerak).

Jami faol manbalar kuniga ~200–300 material beradi (feedlar orasidagi dublikatlar `urlHash` bilan olib tashlangandan keyin taxminan 150–250) — TZ §2.1 dagi 100–200 mo'ljaliga mos.

## 3. Manbalar bo'yicha batafsil

### 3.1. The Verge — `rss_only`

| Feed URL | HTTP | Yozuvlar | ~/kun | `feedCategory` | → `mapsTo` | Faol |
|---|---|---|---|---|---|---|
| `https://www.theverge.com/rss/ai-artificial-intelligence/index.xml` | 200 | 10 | 5.5 | AI | `suniy-intellekt` | ✅ |
| `https://www.theverge.com/rss/cyber-security/index.xml` | 200 | 10 | 0.4 | Security | `kiberxavfsizlik` | ✅ |
| `https://www.theverge.com/rss/reviews/index.xml` | 200 | 10 | 0.8 | Reviews | `gadjetlar` | ✅ |
| `https://www.theverge.com/rss/games/index.xml` | 200 | 10 | 3.4 | Games | `oyinlar` | ✅ |
| `https://www.theverge.com/rss/science/index.xml` | 200 | 10 | 1.5 | Science | `ilm-fan` | ✅ |
| `https://www.theverge.com/rss/tech/index.xml` | 200 | 10 | 12.6 | Tech | `texnologiyalar` | ✅ |
| `https://www.theverge.com/rss/index.xml` | 200 | 10 | 30–50 | All (umumiy) | `texnologiyalar` | ✅ |

- **Format:** Atom, har bir feedda faqat **10 ta** yozuv; `<category term>` bor (AI, Tech, Gaming, Policy...). 15 daqiqalik so'rov bilan yo'qotish xavfi past.
- **Topilgan xato:** `/rss/gaming/index.xml` — HTTP 200, lekin **bo'sh** feed (0 yozuv). To'g'ri manzil — `/rss/games/index.xml`.
- **robots.txt:** `User-agent: *` uchun maqola yo'llari ochiq (`/admin`, `/login`, `/search`, `/share` va h.k. yopiq). ~100 ta AI/crawler bot nomma-nom bloklangan (ClaudeBot, CCBot, Bytespider, Crawl4AI, FirecrawlAgent...). `OdyaBlogBot` ro'yxatda yo'q.
- **ToS:** sayt footeri **PMC Terms of Use** (`pmc.com/terms-of-use`) ga olib boradi. Unda robot, spider, crawler, scraper va **AI vositalari** bilan kontentni olish, nusxalash va agregatsiya qilish aniq taqiqlangan; RSS kontentiga reklama qo'shish va uni tijoriy maqsadda qayta nashr qilish ham taqiqlangan.
- **Server HTML:** ha — maqola matni `.duet--article--article-body-component` bloklarida (Next.js SSR). ToS sababli **ishlatilmaydi**.
- **Xulosa:** `rss_only`. RSS matnidan faktlar olinadi, post "Manba: The Verge" havolasi bilan.

### 3.2. TechCrunch — `rss_only`

| Feed URL | HTTP | Yozuvlar | ~/kun | `feedCategory` | → `mapsTo` | Faol |
|---|---|---|---|---|---|---|
| `https://techcrunch.com/category/artificial-intelligence/feed/` | 200 | 20 | 18 | AI | `suniy-intellekt` | ✅ |
| `https://techcrunch.com/category/security/feed/` | 200 | 20 | 1.3 | Security | `kiberxavfsizlik` | ✅ |
| `https://techcrunch.com/category/startups/feed/` | 200 | 20 | 7 | Startups | `startaplar` | ✅ |
| `https://techcrunch.com/category/venture/feed/` | 200 | 20 | 3.3 | Venture | `startaplar` | ✅ |
| `https://techcrunch.com/category/hardware/feed/` | 200 | 20 | 1.5 | Hardware | `gadjetlar` | ✅ |
| `https://techcrunch.com/category/gadgets/feed/` | 200 | 19 | 0.8 | Gadgets | `gadjetlar` | ➖ (sust, hardware bilan takrorlanadi) |
| `https://techcrunch.com/feed/` | 200 | 20 | ~29 | All (umumiy) | `texnologiyalar` | ✅ |

- **Format:** RSS 2.0, `<category>` bor; `content:encoded` yo'q — faqat qisqa description (~150 belgi).
- **robots.txt:** `User-agent: *` uchun faqat `/wp-admin/`, `/wp-json/`, `/search/` yopiq. AI botlar (ClaudeBot, GPTBot, CCBot, Google-Extended...) to'liq bloklangan.
- **ToS** (`techcrunch.com/terms-of-service`): robot, spider, scraper bilan ma'lumot yig'ish/nusxalash va materiallarni qayta nashr qilish taqiqlangan.
- **RSS Terms** (`techcrunch.com/rss-terms-of-use`): feed kontentini TechCrunch'ga atributsiya va **to'liq maqolaga havola** bilan ko'rsatish mumkin; kontentni o'zgartirish, atributsiyani olib tashlash va feedga reklama qo'shish mumkin emas.
- **Server HTML:** ha — `.entry-content` (WordPress). ToS sababli **ishlatilmaydi**.
- **Xulosa:** `rss_only`. RSS matni qisqa — editor/agent faktlarni tekshirish uchun asl maqolani **brauzerda qo'lda** ochadi (avtomatik yuklash yo'q).

### 3.3. Habr (faqat «Новости») — `rss_plus_page`

| Feed URL | HTTP | Yozuvlar | ~/kun | `feedCategory` | → `mapsTo` | Faol |
|---|---|---|---|---|---|---|
| `https://habr.com/ru/rss/hubs/artificial_intelligence/news/` | 200 | 40 | 18 | Хаб «Искусственный интеллект» — новости | `suniy-intellekt` | ✅ |
| `https://habr.com/ru/rss/hubs/infosecurity/news/` | 200 | 40 | 6.6 | Хаб «Информационная безопасность» — новости | `kiberxavfsizlik` | ✅ |
| `https://habr.com/ru/rss/hubs/programming/news/` | 200 | 40 | 3.4 | Хаб «Программирование» — новости | `dasturlash` | ✅ |
| `https://habr.com/ru/rss/news/` | 200 | 40 | 50–100 | Новости (umumiy) | `texnologiyalar` | ✅ |

- **Format:** RSS 2.0, `<category>` — foydalanuvchi teglari (искусственный интеллект, python...). Barcha feedlar `/news/` bilan tugaydi — **mualliflik maqolalari (UGC) olinmaydi** (test bilan tekshiriladi).
- **robots.txt:** `User-agent: *` — **`Crawl-delay: 10`**; `/search/`, profil/kompaniya obunachilari sahifalari va **`/*?*utm_`** yopiq.
- ⚠️ **Muhim:** RSS'dagi havolalarda `?utm_source=habrahabr&utm_medium=rss&utm_campaign=...` bor — bu URL'lar robots.txt bo'yicha **yopiq**. `item.fetch` sahifani yuklashdan oldin `utm_*` parametrlarini olib tashlashi **shart** (bu `urlHash` normallashtirish qoidasiga ham mos).
- **Foydalanuvchi kelishuvi** (`account.habr.com/info/agreement`): kontentni ruxsatsiz nusxalash va tijoriy foydalanish taqiqlangan; avtomatik yig'ish (parsing) alohida taqiqlanmagan. Bizning model (faktlar + o'z matnimiz + atributsiya, to'liq matn faqat ichki arxivda) bilan mos.
- **Server HTML:** ha. Selektorlar: `content` — `.article-formatted-body`, `title` — `h1.tm-title`, `author` — `.tm-user-info__username`, `publishedAt` — `.tm-article-datetime-published time[datetime]`.
- **Xulosa:** `rss_plus_page`, `rateLimitSec = 10` (Crawl-delay bilan mos). Umumiy feed va hub feedlarida bir xil maqola uchraydi — `urlHash` dedupe qiladi, mapping uchun **aniqroq (hub) feed ustun** (7-bo'lim).

### 3.4. iXBT.com — `rss_only`

| Feed URL | HTTP | Yozuvlar | ~/kun | `feedCategory` | → `mapsTo` | Faol |
|---|---|---|---|---|---|---|
| `https://www.ixbt.com/export/rss.xml?only_category_ids=66` | 200 | 50 | 2 | Мобильные устройства | `gadjetlar` | ✅ |
| `https://www.ixbt.com/export/news/rss.xml` | 200 | 50 | ~100 | Новости (umumiy) | `gadjetlar` | ✅ |

- **Topilgan o'zgarish:** TZ'dagi `ixbt.com/export/news.rss` → **301** → `/export/news/rss.xml`; `export/sec_mobile.rss` → `/export/rss.xml?only_category_ids=66`. Seed'da yakuniy URL'lar. `export/games.rss` — **404** (o'yinlar feedi yo'q; `/games/` robots.txt'da ham yopiq).
- **Format:** RSS 2.0, **`<category>` yo'q** — shuning uchun umumiy feed `gadjetlar` ga tushadi, kosmos/avto/AI yangiliklari kalit so'z qoidalari bilan qayta taqsimlanadi. `content:encoded` — **to'liq matn** (~1.5–2k belgi).
- **robots.txt:** `User-agent: *` uchun `/news/YYYY/...` va `/export/` ochiq; `/live/`, `/blogs/`, `/games/`, `/news/soft/` yopiq.
- **ToS** («О медиа iXBT.com», `ixbt.com/doc/about.html`): materiallarni shaxsiy foydalanishdan tashqari nusxalash taqiqlangan; **iqtibos uchun ma'muriyatning oldindan roziligi** va ixbt.com'ga havola talab qilinadi.
- **Server HTML:** ha (`article .prose`), lekin RSS to'liq matn bergani uchun sahifa **yuklanmaydi**.
- **Xulosa:** `rss_only`. Postlarda iXBT'dan to'g'ridan-to'g'ri iqtibos **ishlatilmaydi** (faqat faktlar + havola) — 8-bo'lim, ochiq masala #3.

### 3.5a. Dexerto — `rss_plus_page`

| Feed URL | HTTP | Yozuvlar | ~/kun | `feedCategory` | → `mapsTo` | Faol |
|---|---|---|---|---|---|---|
| `https://www.dexerto.com/feed/category/esports/` | 200 | 50 | **0.2** | Esports | `kibersport` | ✅ |
| `https://www.dexerto.com/feed/category/gaming/` | 200 | 50 | ~10 | Gaming | `oyinlar` | ✅ |
| `https://www.dexerto.com/feed/` | 200 | 50 | ~47 | All (umumiy) | `oyinlar` | ➖ (asosan ko'ngilochar: TV, food, influencerlar) |

- **Topilgan o'zgarish:** `/esports/feed/` va `/feed/esports/` → **301** → `/feed/category/esports/`. Mavjud emas (404): `/feed/category/counter-strike/`, `/dota-2/`, `/mobile-legends/`.
- ⚠️ **Esports feedi juda sust:** oxirgi 50 yozuv ~319 kunni qamraydi (eng yangisi 2026-09-18). Kibersport uchun asosiy oqim — HLTV; qo'shimcha manba kerak (8-bo'lim, #1).
- **robots.txt:** `User-agent: *` uchun faqat `/search`, `/cdn-cgi/` yopiq. AI scraper'lar (ClaudeBot, GPTBot, Scrapy, HTTrack...) to'liq bloklangan.
- **Terms and Conditions** (`dexerto.com/terms-and-conditions`): kontentni yozma ruxsatsiz tijoriy maqsadda qayta ishlab chiqarish/tarqatish taqiqlangan; scraping/avtomatik yig'ish alohida taqiqlanmagan.
- **Server HTML:** ha. Selektorlar: `content` — `#article-content`, `title` — `h1`, `publishedAt` — `meta[property='article:published_time']`. Feedda "Sponsored" yozuvlar bor — saralashda e'tibor bering.
- **Xulosa:** `rss_plus_page` (RSS description ~140 belgi — yetarli emas). To'liq matn faqat ichki arxivda.

### 3.5b. HLTV.org — `rss_only`

| Feed URL | HTTP | Yozuvlar | ~/kun | `feedCategory` | → `mapsTo` | Faol |
|---|---|---|---|---|---|---|
| `https://www.hltv.org/rss/news` | 200 / **403** (o'zgaruvchan) | 10 | ~4 | News (CS2) | `kibersport` | ✅ |

- **Format:** RSS 2.0, 10 yozuv, `<category>` yo'q, description — bitta jumla (~80 belgi); `media:content` rasm havolasi.
- ⚠️ **Cloudflare:** audit boshida feed va maqola sahifasi 200 qaytardi, lekin `robots.txt` va `/terms` **403 (Cloudflare managed challenge)** qaytardi. Bir necha so'rovdan keyin feed ham 403 challenge qaytara boshladi (curl va Node `fetch` bilan). Challenge'ni chetlab o'tish (JS/CAPTCHA) **qilinmaydi**.
- **robots.txt / ToS:** **tekshirib bo'lmadi** (403). Ehtiyotkorlik bilan — `rss_only`, `rateLimitSec = 15`, `pollIntervalMin = 20`.
- **Server HTML:** 200 bo'lganda — ha (`.newstext-con`), lekin ishlatilmaydi.
- **Xulosa:** `rss_only`. `feed.poll` 403 ni "vaqtinchalik xato" deb hisoblashi kerak (3 marta ketma-ket → ogohlantirish, TZ §3.5). Ochiq masala #2.

### 3.6. 3DNews — zaxira (`isActive = false`)

- `https://3dnews.ru/news/rss/` — 200, ~66 yozuv, ~37/kun, har bir yozuvda kategoriya bor ("игры", "Искусственный интеллект..."). → `gadjetlar`.
- robots.txt: `User-agent: *` — `Allow: /`. ToS **tekshirilmadi** — yoqishdan oldin huquqiy audit kerak.

## 4. Kategoriya mapping (feed → bizning 9 kategoriya, TZ §10.4)

| Kategoriya (slug) | Feedlar |
|---|---|
| `suniy-intellekt` | The Verge AI, TechCrunch AI, Habr хаб ИИ |
| `texnologiyalar` | The Verge Tech + All, TechCrunch All, Habr Новости (umumiy) |
| `gadjetlar` | The Verge Reviews, TechCrunch Hardware, iXBT (mobil + umumiy), 3DNews (zaxira) |
| `dasturlash` | Habr хаб «Программирование» |
| `kiberxavfsizlik` | The Verge Security, TechCrunch Security, Habr хаб «Информационная безопасность» |
| `kibersport` | Dexerto Esports, HLTV |
| `oyinlar` | The Verge Games, Dexerto Gaming |
| `startaplar` | TechCrunch Startups, TechCrunch Venture |
| `ilm-fan` | The Verge Science (+ iXBT/Habr kalit so'zlar orqali) |

Seed testi har bir kategoriya kamida bitta faol feed orqali to'ldirilishini tekshiradi.

## 5. Klassifikatsiya: feed mapping + kalit so'z qoidalari

`item.classify` (TZ §3.5, LLM'siz) uchun tavsiya etilgan algoritm (M2-03 da amalga oshiriladi):

1. Material bir nechta feedda uchrasa, **`feeds` massividagi birinchi (aniqroq) feed** mapping'i olinadi — seed'da aniq bo'lim feedlari umumiy feeddan oldin turadi.
2. Feed mapping'i → shu kategoriyaga **+10** ball.
3. `keywordRules` sarlavha + excerpt + manba teglari (`sourceTags`) bo'yicha tekshiriladi (kichik harf); har bir mos qoida → `boost` ball (har qoida bir marta).
4. Eng ko'p ball olgan kategoriya — `suggestedCategory`. Teng bo'lsa — feed mapping'i.

**Kalit so'z formati:** kichik harf; butun so'z/ibora mosligi; so'z oxiridagi `*` — prefiks (o'zak) mosligi, rus tili morfologiyasi uchun (`нейросет*` → нейросеть, нейросети, нейросетями). Iboralarda har bir so'z alohida `*` olishi mumkin (`искусственн* интеллект*`).

**Qoidalar to'plami** — tilga qarab ikkita (EN va RU), har bir kategoriya uchun **8 tadan** (texnologiyalar — 7), jami 71 ta qoida har bir manbada. Boost: aniq kategoriyalar (AI, kiberxavfsizlik, kibersport) — 5; gadjetlar, dasturlash, o'yinlar, startaplar, ilm-fan — 4; umumiy `texnologiyalar` — 2 (keng so'zlar: google, microsoft, meta...).

| Kategoriya | EN (namuna) | RU (namuna) |
|---|---|---|
| `suniy-intellekt` | openai, chatgpt, llm\*, generative ai, anthropic | нейросет\*, ии, искусственн\* интеллект\*, языков\* модел\* |
| `texnologiyalar` | big tech, social media, antitrust, google, tiktok | яндекс\*, мессенджер\*, роскомнадзор\*, социальн\* сет\* |
| `gadjetlar` | smartphone\*, iphone\*, laptop\*, gpu\*, wearable\* | смартфон\*, ноутбук\*, видеокарт\*, процессор\* |
| `dasturlash` | programming, developer\*, github, open source, python | программист\*, разработчик\*, фреймворк\*, открыт\* код\* |
| `kiberxavfsizlik` | hack\*, ransomware, data breach\*, vulnerabilit\*, zero-day | уязвимост\*, утечк\*, взлом\*, кибератак\*, фишинг\* |
| `kibersport` | esports, tournament\*, cs2, valorant, dota 2, roster\* | киберспорт\*, турнир\*, мейджор\*, трансфер\* |
| `oyinlar` | video game\*, playstation, xbox, nintendo, steam | видеоигр\*, игр\*, консол\*, геймплей\* |
| `startaplar` | startup\*, funding, series a, ipo, valuation | стартап\*, инвестиц\*, раунд\* финансировани\*, венчурн\* |
| `ilm-fan` | nasa, spacex, rocket\*, electric vehicle\*, astronom\* | космос\*, роскосмос\*, ракет\*, учен\*, электромобил\* |

To'liq ro'yxat — `sources.json` → `keywordRules`. Qoidalar admin panelda (`sources`) kodsiz tahrirlanadi; M2-03 dan keyin haqiqiy ma'lumotlarda aniqlik o'lchanib, sozlanadi.

## 6. Seed fayllar va sxema

- **`categories.json`** — TZ §10.4 dagi 9 kategoriya: `name` va `description` — `{ "uz-Latn", "uz-Cyrl" }`, `slug`, `parent: null` (tekis ro'yxat), `order` 1–9, `isInMenu` (`ilm-fan` — "Yana" menyusida, `false`). `color` — M0-06 (brend palitrasi) dan keyin qo'shiladi, sxemada ixtiyoriy. `meta` — M1-06 (SEO) da.
- **`sources.json`** — TZ §10.1 maydonlari: `name`, `slug`, `homepageUrl`, `feeds[] { url, feedCategory, mapsTo, isActive }`, `language`, `fetchMode`, `selectors`, `pollIntervalMin`, `rateLimitSec`, `robotsCheckedAt`, `tosNotes`, `priority`, `keywordRules[] { keyword, category, boost }`, `isActive`. `stats` — runtime'da to'ldiriladi, seed'da yo'q.
- **Relationship maydonlari** (`mapsTo`, `keywordRules[].category`) seed'da kategoriya **slug**'i bilan yozilgan; seed skripti (M1-02 / M2-01) avval kategoriyalarni yaratadi, keyin slug → ID almashtiradi.
- **Zod sxemalari** — `packages/shared/src/schemas/{category,source}.ts`; qo'shimcha tekshiruvlar: slug formati va takrorlanmasligi, `https` URL, feed domeni = manba domeni, `rss_plus_page` → `selectors.content` majburiy, `rateLimitSec ≥ 5` (TZ §2.3), `priority` 0–50, kirill nomlarda lotin harfi yo'q, kalit so'zlar kichik harfda.

## 7. Tekshiruvlarni ishga tushirish

```bash
cd packages/shared
pnpm install            # M0-01 dan keyin: root'da `pnpm i`
pnpm test               # seed validatsiyasi (Zod) — CI'da ishlaydi
pnpm check:feeds        # jonli RSS tekshiruvi — faqat qo'lda (RUN_FEED_CHECKS=1)
```

`check:feeds` har bir feed uchun: HTTP 200, XML `Content-Type`, `rss-parser` bilan parse, ≥ 1 yozuv, `robots.txt` ruxsati (`robots-parser`, UA `OdyaBlogBot`); `rss_plus_page` manbalar uchun — birinchi maqola sahifasini (`utm_*` olib tashlangan holda) yuklab, `selectors.content` ≥ 300 belgi matn berishini tekshiradi. Domen bo'yicha so'rovlar orasida `rateLimitSec` pauza qilinadi. `pnpm test`/CI da bu fayl umuman yig'ilmaydi (`vitest.config.ts` exclude) va qo'shimcha ravishda `RUN_FEED_CHECKS` bo'lmasa skip qilinadi.

Istisno: HLTV feedi Cloudflare challenge (403 + `cf-mitigated: challenge`) qaytarsa, test **SKIP** (PASS emas) deb belgilanadi va ogohlantirish chiqaradi — challenge chetlab o'tilmaydi. `robots.txt` o'qib bo'lmagan manba `rss_plus_page` bo'lsa — test FAIL.

**2026-09-23 natijasi:** 6 ta manba (The Verge, TechCrunch, Habr + sahifa, iXBT, Dexerto + sahifa, 3DNews) — ✅; HLTV — audit boshida 200, keyinroq 403 (Cloudflare) → SKIP.

## 8. Ochiq masalalar va tavsiyalar

| # | Masala | Tavsiya | Kimga |
|---|---|---|---|
| 1 | **Kibersport oqimi zaif:** Dexerto esports ~0.2/kun, HLTV ~4/kun (faqat CS2), Dota 2 / MLBB / PUBG Mobile yo'q. | Zaxiradan kibersport manbasi qo'shish (TZ §2.2: Esports Insider, Cybersport.ru) — alohida audit bilan. | Egasi (qaror), developer |
| 2 | **HLTV Cloudflare:** robots.txt va ToS tekshirilmadi, feed vaqti-vaqti bilan 403 qaytaradi. | ToS'ni brauzerda qo'lda o'qish; production IP'dan (Vercel) barqarorlikni kuzatish; kerak bo'lsa HLTV'dan RSS uchun ruxsat so'rash. Challenge chetlab o'tilmaydi. | Egasi |
| 3 | **iXBT iqtibos sharti:** iqtibos uchun oldindan rozilik talab qilinadi. | Stil qo'llanmada (M0-05): iXBT'dan to'g'ridan-to'g'ri iqtibos yo'q, faqat faktlar + havola. Uzoq muddatda — hamkorlik so'rovi. | M0-05 |
| 4 | **The Verge / TechCrunch — ToS scraping'ni taqiqlaydi**, RSS matni qisqa (TechCrunch ~150 belgi). | `rss_only` saqlanadi; faktlarni tekshirish uchun editor/agent asl maqolani qo'lda ochadi. Litsenziya/hamkorlik — QUESTIONS.md dagi uzoq muddatli taklif. | Egasi |
| 5 | **Habr `utm_*` havolalari** robots.txt'da yopiq. | `item.fetch` / URL normallashtirishda `utm_*` olib tashlansin (M2-01/M2-02). | M2-01, M2-02 |
| 6 | Kunlik hajm — bitta kunlik namuna asosida. | M2-01 dan keyin `sources.stats` (24 soatlik son) bo'yicha `pollIntervalMin` qayta sozlansin. | M2-03 |
| 7 | 3DNews ToS tekshirilmagan. | Yoqishdan oldin alohida audit. | developer |
