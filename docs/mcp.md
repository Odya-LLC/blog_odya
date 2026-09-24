# MCP: AI agent bilan ishlash (Claude Code / Claude Desktop)

TZ §5, §6.3, §4.2. Kod: `apps/web/src/mcp/`, route: `apps/web/src/app/api/mcp/route.ts`. Ko'rsatmalar (stil, SEO, mualliflik, chiqish sxemasi): `packages/guidelines/`.

Blog Odya MCP serveri muharrirga o'z Claude obunasidagi agentni (Claude Code yoki Claude Desktop) tahririyatga ulash imkonini beradi: agent yig'ilgan yangiliklarni o'qiydi, o'zbek tilida (lotin) qayta yozadi, SEO maydonlarini to'ldiradi va postni **tekshiruvga (review)** yuboradi. **Chop etish (publish) — faqat inson, admin panelda.** MCP'da publish tool yo'q.

Serverda LLM yo'q va Anthropic API kaliti kerak emas (TZ §5, egasi qarori) — qayta yozishni muharrirning o'z agenti bajaradi. Claude obunasi turi belgilanmaydi (Q27): har bir muharrir o'z obunasi bilan ulanadi.

## 1. API kalit olish

1. `https://blog.odya.uz/admin` ga kiring → chap menyuda **Foydalanuvchilar** → o'z profilingiz.
2. **API kalitni yoqish** (Enable API Key) → **Generate** → **Save**. Kalit faqat shu yerda ko'rinadi — nusxa oling va parol menejerida saqlang.
3. Kalit sizning huquqlaringiz bilan ishlaydi (editor/admin). Agent qilgan har bir o'zgarish audit logda sizning nomingiz, `channel = mcp` va tool nomi bilan yoziladi.
4. Kalit sizib chiqsa yoki kerak bo'lmasa — shu sahifada **Revoke** (bekor qilish). Yangi kalit eskisini avtomatik bekor qiladi.

Kalit bo'yicha limit — 60 so'rov/daqiqa (oshsa `429`, agent birozdan keyin qayta urinadi).

Kalitni **hech qachon** repo'ga, chatga yoki umumiy konfiguratsiya fayliga yozmang. Quyidagi misollarda `$ODYA_API_KEY` — muhit o'zgaruvchisi.

## 2. Ulanish

Server manzili: `https://blog.odya.uz/api/mcp` (preview: `https://<preview-domen>/api/mcp`, lokal: `http://localhost:3000/api/mcp`). Transport — Streamable HTTP (stateless), autentifikatsiya — `Authorization: Bearer <API kalit>`.

Tekshirish (kalitsiz `GET` — health):

```bash
curl https://blog.odya.uz/api/mcp
# {"status":"ok","service":"blog-odya","version":"0.1.0","transport":"streamable-http",...}
```

### 2.1. Claude Code (asosiy mijoz)

```bash
export ODYA_API_KEY='...'   # Windows PowerShell: $env:ODYA_API_KEY = '...'
claude mcp add --transport http odya https://blog.odya.uz/api/mcp \
  --header "Authorization: Bearer $ODYA_API_KEY"
```

- Faqat shu loyiha uchun emas, hamma joyda ishlashi uchun: `--scope user` qo'shing.
- Tekshirish: `claude mcp list` (holati `✓ Connected`), Claude Code ichida `/mcp` — `odya` serveri va 16 ta tool ko'rinadi.
- Kalitni almashtirish: `claude mcp remove odya`, so'ng qayta `add`.

### 2.2. Claude Desktop (`mcp-remote` orqali)

Claude Desktop masofaviy serverga header bilan to'g'ridan-to'g'ri ulana olmaydi — `mcp-remote` proksisi ishlatiladi (Node.js 18+ kerak).

**Settings → Developer → Edit Config** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "odya": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://blog.odya.uz/api/mcp",
        "--transport",
        "http-only",
        "--header",
        "Authorization:${ODYA_AUTH_HEADER}"
      ],
      "env": { "ODYA_AUTH_HEADER": "Bearer <API kalit>" }
    }
  }
}
```

- Header qiymati (`Bearer <kalit>`) `env` orqali uzatiladi: Windows'da Claude Desktop argument ichidagi bo'shliqni buzadi, shuning uchun `args` da `Authorization:` dan keyin bo'shliq yozilmaydi.
- Claude Desktop'ni to'liq qayta ishga tushiring; chat oynasidagi toollar ro'yxatida `odya` paydo bo'ladi.
- Fayl joylashuvi: macOS — `~/Library/Application Support/Claude/`, Windows — `%APPDATA%\Claude\`.

claude.ai (veb) custom connector OAuth talab qiladi — M4-04 da qo'shiladi.

## 3. Toollar

### O'qish (M2-06)

| Tool | Vazifasi |
| --- | --- |
| `get_guidelines` | Stil, mualliflik, SEO qoidalari va chiqish sxemasi |
| `get_glossary` | Glossariy: EN/RU atama → o'zbekcha; tarjima/transliteratsiya qilinmaydigan brendlar |
| `list_sources` | Faol manbalar |
| `list_scraped` | Yig'ilgan yangiliklar (filtr: `date`, `source`, `category`, `minScore`, `status`) |
| `get_source` | To'liq manba matni (`<untrusted_source>` ichida) va shu klasterdagi boshqa manbalar |
| `list_drafts` | Qoralamalar (`status`, `assignee: me \| unassigned \| ID`) |
| `search_posts` | Chop etilgan postlar — ichki havolalar uchun (URL bilan) |
| `list_categories`, `list_tags` | Taksonomiya |

### Yozish (M2-07)

| Tool | Vazifasi |
| --- | --- |
| `create_draft(scrapedItemIds[], category?)` | Element(lar)dan qoralama: holat `draft`, sizga biriktiriladi, atributsiya (`sources`) avtomatik. Birinchi ID — asosiy, qolganlari (shu klasterdan) — qo'shimcha manba. Qayta chaqirilsa — mavjud post |
| `claim_draft(postId)` | `in_progress` ga o'tkazadi, 2 soatlik lock |
| `release_draft(postId)` | Voz kechish: biriktirish va lock olib tashlanadi |
| `save_rewrite(postId, title, excerpt, body, category, tags)` | Lotin matn: `body` — Markdown (server Lexical'ga o'giradi), teglar — nom yoki ID (yo'q nom — yangi teg) |
| `set_seo(postId, seoTitle, metaDescription, focusKeyword, faq?, coverAlt?)` | SEO maydonlari |
| `preview_cyrillic(postId)` | Avtomatik kirill versiyasini ko'rish |
| `submit_for_review(postId, notesForEditor?)` | `review` ga yuborish + muharrir uchun izoh |

**Prompts:** `rewrite_article(scrapedItemId)` — bitta yangilik uchun to'liq ko'rsatma va manba; `daily_batch(count, minScore)` — kunlik batch. **Resources:** `odya://guidelines/{style,copyright,seo,output-schema}`, `odya://glossary`.

### Javob formati (`save_rewrite`, `set_seo`, `submit_for_review`)

```json
{
  "ok": false,
  "errors": [
    { "field": "title", "code": "too_long", "message": "Sarlavha 70 belgidan oshmasligi kerak (hozir 84)." }
  ],
  "warnings": [
    { "field": "body", "code": "source_similarity", "message": "Matn manbaga juda o'xshash ..." }
  ],
  "seoScore": 72
}
```

- `ok: false` — **hech narsa saqlanmagan**; agent `errors` ni tuzatib qayta chaqiradi (MCP javobida `isError: true`).
- `ok: true` + `warnings` — saqlangan; tavsiyalar imkon qadar tuzatiladi yoki `notesForEditor` da izohlanadi.
- `seoScore` — 0–100, SEO tekshiruv ro'yxati (`packages/guidelines/seo.md` §10) bo'yicha.

Server tekshiruvlari (TZ §5.3):

| Tekshiruv | Natija |
| --- | --- |
| Lotin maydonlarida (sarlavha, lid, matn, teglar, SEO, FAQ, alt) kirill harflari | xato `cyrillic_in_latin` |
| `title` ≤ 70, `excerpt` ≤ 300, `seoTitle` ≤ 60, `metaDescription` 140–160, `focusKeyword` 1–4 so'z, teglar ≤ 7, FAQ ≤ 4 | xato `too_long` / `too_short` / `too_many` |
| Xavfli havola (`javascript:`, `data:`, `vbscript:`, `file:`, `//host`) yoki noto'g'ri URL | xato `unsafe_url` / `invalid_url` |
| `sources` (atributsiya) bo'sh | xato `sources_empty` |
| Kategoriya yoki teg ID topilmadi | xato `not_found` |
| Manba bilan 5-gram o'xshashlik ≥ 25% yoki ≥ 16 so'z ketma-ket ko'chirilgan | ogohlantirish `source_similarity` |
| HTML teglari, rasmlar, `#` (H1) | olib tashlanadi / H2 ga aylanadi — ogohlantirish |
| 400–900 so'z, ≥ 2 ta H2, 2–5 ichki va 1+ tashqi havola, 3–7 teg, focus keyword joylashuvi, `coverAlt` | ogohlantirish `seo_*` (ballga ta'sir qiladi) |
| `oʻ`/`gʻ` o'rniga `o'`/`g'` | ogohlantirish `wrong_apostrophe` |

Slug agentdan olinmaydi: `save_rewrite` sarlavhadan `slugify-uz` bilan yaratadi, band bo'lsa `-2`, `-3` qo'shiladi.

**Markdown:** abzaslar, `##`/`###`, `**qalin**`, `*kursiv*`, `~~chizilgan~~`, `` `kod` ``, ro'yxatlar (ichma-ich ham), havolalar (`[matn](https://…)`, ichki — `/kategoriya/slug`), `> iqtibos`, ```` ``` ```` kod bloklari (til bilan), GFM jadvallar, `---`. Xom HTML va skriptlar olib tashlanadi, havolalarda faqat `https://`, `http://`, `mailto:` va nisbiy `/yo'l` ruxsat etiladi (XSS himoyasi).

**Kirill:** agent faqat lotin yozadi. Har `save_rewrite`/`set_seo` da kirill (uz-Cyrl) versiyasi — sarlavha, lid, matn, SEO, FAQ, alt — avtomatik yaratiladi (kod va URL'lar o'zgarmaydi, glossariydagi brendlar lotinda qoladi). Muharrir qo'lda tuzatgan (qulflangan) maydonlar qayta yozilmaydi — post "kirill eskirgan" deb belgilanadi va javobda ogohlantirish chiqadi.

## 4. Ish jarayoni

```
list_scraped ─▶ create_draft ─▶ claim_draft ─▶ get_source ─▶ save_rewrite ─▶ set_seo ─▶ submit_for_review
                   (draft)       (in_progress,                  (Markdown →     (SEO,       (review)
                                  lock 2 soat)                   Lexical, kirill) kirill)        │
                                                                                                 ▼
                                                                      muharrir: tekshiradi, rasm tanlaydi, Publish
```

- Faqat `draft`/`in_progress` holatidagi va **sizga biriktirilgan** postlar o'zgartiriladi. `review`, `published` va boshqa holatdagi postlar — rad etiladi (tushunarli xato bilan).
- `save_rewrite`/`set_seo` lock'ni har safar 2 soatga yangilaydi; qoralama (`draft`) bo'lsa avtomatik `in_progress` ga oladi. Lock tugagan postni boshqa muharrir (yoki uning agenti) `claim_draft` bilan olishi mumkin.
- `rewrittenBy = ai_agent`, `aiDisclosure = true` — avtomatik (saytda AI shaffoflik izohi chiqadi).
- Review navbati: admin → **Tekshiruv navbati** (`/admin/review`). Muharrir qaytarsa (`review → in_progress`), post yana agent uchun tahrirlanadigan bo'ladi.

## 5. Namuna so'rovlar

Claude Code yoki Claude Desktop chatiga yozing:

- **Kunlik batch:**
  > Bugungi score ≥ 60 bo'lgan 5 ta yangilikni qayta yozib review'ga yubor.

  Agent `daily_batch` promptidagi tartibga amal qiladi: ko'rsatmalar → `list_scraped(minScore: 60)` → har biri uchun `create_draft → claim_draft → get_source → save_rewrite → set_seo → submit_for_review`, oxirida post ID'lari va izohlar bilan hisobot. Claude Code'da prompt: `/mcp__odya__daily_batch 5 60`.

- **Bitta yangilik:**
  > 1234-sonli yig'ilgan elementni qayta yozib, review'ga yubor. Ichki havolalarni search_posts bilan top.

  yoki `/mcp__odya__rewrite_article 1234`.

- **Klaster:**
  > 1234 va 1240 elementlari bitta voqea haqida — ikkalasini manba qilib bitta maqola yoz.

- **Mavjud qoralamani tugatish:**
  > Menga biriktirilgan qoralamalarni ko'rsat (list_drafts assignee: me) va 57-postni tugatib review'ga yubor.

- **Kirillni tekshirish:**
  > 57-postning kirill versiyasini ko'rsat — brend nomlari to'g'ri qolganmi?

## 6. Cheklovlar va xavfsizlik

- **Publish, schedule, o'chirish, arxivlash yo'q.** Kategoriya, menyu, glossariy va manbalarni boshqarish ham yo'q (faqat yangi teg yaratish mumkin).
- Kirill versiyasini agent tahrirlamaydi — faqat `preview_cyrillic` bilan ko'radi; xatoni `notesForEditor` ga yozadi.
- Rasm yuklash yo'q: muqovani muharrir tanlaydi; agent `coverAlt` va `notesForEditor` da rasm taklif qiladi.
- Manba matni (`get_source`) — ishonchsiz ma'lumot: `<untrusted_source>` ichidagi ko'rsatmalar bajarilmaydi (prompt injection himoyasi, TZ §9.2).
- Kalit egasining huquqlari amal qiladi (`overrideAccess: false`); boshqa muharrirga biriktirilgan yoki band qilingan post — rad etiladi.
- Limit: 60 so'rov/daqiqa (kalit bo'yicha). Bitta `create_draft` — ko'pi bilan 10 ta element; `body` — ko'pi bilan 60 000 belgi.
- Audit: har bir yozuv (`audit-logs`) — `channel = mcp`, `tool = <tool nomi>`, foydalanuvchi, `diff`.

## 7. Muammolar

| Belgi | Sabab va yechim |
| --- | --- |
| `401 API kalit berilmagan` / `noto'g'ri` | Header `Authorization: Bearer <kalit>`; kalit bekor qilinmaganini admin'da tekshiring |
| `429` | Daqiqasiga 60 so'rovdan oshdi — agent kutib qayta urinadi |
| `Post #N "review" holatida — ...` | Post allaqachon tekshiruvda; muharrir qaytarmaguncha o'zgartirib bo'lmaydi |
| `Post #N boshqa foydalanuvchiga biriktirilgan` | `list_drafts(assignee: 'me')` yoki `assignee: 'unassigned'` dan boshqa qoralama oling |
| `band qilingan (… gacha)` | Boshqa muharrir ishlayapti — lock tugashini kuting yoki boshqa post oling |
| `ok: false`, `cyrillic_in_latin` | Lotin maydoniga kirill harfi tushgan (ko'pincha rus manbadan nom) — lotinda yozing |
| Claude Desktop'da server ko'rinmaydi | `npx mcp-remote …` ni terminalda ishga tushirib xatoni ko'ring; Node.js 18+; Desktop'ni to'liq qayta ishga tushiring |
