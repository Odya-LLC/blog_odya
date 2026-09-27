# Runbook: SEO buzilishdan keyin (410 Gone, Google Search Console)

OBLOG-49 (tahlil), OBLOG-50 (410). Kod: `apps/web/src/site/gone.ts` (qoidalar), `apps/web/src/proxy.ts` (Next.js Proxy), testlar: `apps/web/tests/gone.test.ts`, `apps/web/e2e/gone.spec.ts`.

## Nima bo'lgan

`blog.odya.uz` da avval WordPress bo'lgan, u buzilgan. Google indeksida minglab mavjud bo'lmagan spam URL qolgan (GSC "Pages" hisoboti: iyulda ~227 ming, sentyabrda ~23 ming). GSC eksportidagi tanlanma (1000 URL) shakllari:

| Shakl                             | Ulush | Javob |
| --------------------------------- | ----- | ----- |
| `/products/{raqam}/`              | ~55%  | 410   |
| `/listing/{raqam}/`               | ~26%  | 410   |
| `/shop/products/{raqam}/`         | ~18%  | 410   |
| `/shop/storeSearch/…`             | yakka | 410   |
| `/clientlog?feisbot=1&bot_check`  | yakka | 410   |
| Eski WP maqolalari (ildiz slug'i) | yakka | egasi qarori (pastda) |

## Nima qilindi

`src/proxy.ts` har so'rovda (Next statik fayllari, `/api/…`, `/admin/…` dan tashqari) `isGone(url)` ni tekshiradi va mos kelsa **410 Gone** qaytaradi: kichik o'zbekcha HTML, `X-Robots-Tag: noindex`, `Cache-Control: public, max-age=0, s-maxage=86400`. 410 — trailing-slash redirect'dan **oldin**: `/products/1/` birdaniga 410 (avval 308 → 404 edi). Buning uchun `next.config.ts` da `skipTrailingSlashRedirect: true`, `/x/` → `308 /x` redirect'ni proxy o'zi qiladi (`/api`, `/admin` uchun — `next.config.ts` `redirects`).

410 qoidalari:

- **Ildiz segmentlari** (`/{segment}` va ichidagi hamma narsa): `wp-admin`, `wp-content`, `wp-includes`, `wp-json`, `feed`, `comments`, `products`, `listing`, `shop`, `clientlog`. Ular `ROUTE_RESERVED_SLUGS` da — bunday kategoriya yoki sahifa yaratib bo'lmaydi.
- **Kengaytmalar** (istalgan segment oxirida): `.php`, `.php5`, `.phtml`, `.html`, `.htm`, `.shtml`, `.xhtml`, `.asp`, `.aspx`, `.ashx`, `.asmx`, `.axd`, `.jsp`, `.jspx`, `.jsf`, `.do`, `.action`, `.cgi`, `.pl`, `.cfm`, `.cfml` (masalan `/wp-login.php`, `/xmlrpc.php`, `/cheap-viagra.html`, `/jp/….html`). Haqiqiy fayllar (`.png`, `.svg`, `.ico`, `.xml`, `.txt`, `.webmanifest`) tegilmaydi.
- **WP arxivlari:** `/YYYY/MM/…` (masalan `/2019/05/…`), `/page/N` va `/kr/page/N` (bizda sahifalash — `/{category}/page/N`).
- **Eski teg/muallif:** `/tag/{x}/feed`, `/author/{x}/feed`, slug formatiga mos kelmaydigan `/tag/…`, `/author/…` (kirill, `_`, …). Bizning `/tag/{slug}`, `/author/{slug}` (`/page/N` bilan) — o'zgarmagan.
- **Bosh sahifa (`/`, `/kr`) begona query parametrlari bilan** — `/?p=`, `/?page_id=`, `/?cat=`, `/?author=`, `/?feed=`, `/?s=` (WP qidiruvi; bizniki — `/search?q=`) va oq ro'yxatda yo'q har qanday parametr. Oq ro'yxat: `utm_*` (Telegram UTM ham), `gclid`, `gbraid`, `wbraid`, `dclid`, `fbclid`, `yclid`, `ysclid`, `msclkid`, `twclid`, `ttclid`, `igshid`, `mc_cid`, `mc_eid`, `ref`, `_rsc` (Next client navigatsiyasi), `_next*`, `__next*`, `_vercel*`, `__vercel*`, `preview`, `token`.

  Nega 410, 301 emas: `301 → /` spam URL'ni Google uchun "tirik" (yo'naltirilgan) qoldiradi va indeksda uzoq saqlanadi, 410 esa uni tez olib tashlaydi. Bosh sahifaning o'zi hech qanday parametr o'qimaydi — haqiqiy foydalanuvchi bunday URL'ga kelmaydi.

Ataylab **tegilmagan** (avvalgidek 308 → 404 yoki `redirects` kolleksiyasi, OBLOG-29): bitta segmentli ildiz slug'lari (`/{category}` va statik sahifalar bilan to'qnashadi), `/category/*`, maqola/kategoriya sahifalaridagi query parametrlari (canonical hal qiladi). `robots.txt` o'zgartirilmagan — Google 410 ni ko'rishi kerak (Disallow qilinsa, u sahifani ocha olmaydi va indeksdan tez chiqarmaydi).

## Egasi qarori: eski WordPress maqolalari

GSC tanlanmasida spam emas, eski blog maqolalari ham bor. Ular hozir `308 → 404`. Har biri uchun tanlang: yangi saytdagi mos maqolaga **301** (admin → Redirects, `from` — slash'siz yo'l, masalan `/veb-sayt-sinovini-avtomatlashtirish-vositasini-qanday-tanlash-mumkin`) yoki 404 da qoldirish.

- `/veb-sayt-sinovini-avtomatlashtirish-vositasini-qanday-tanlash-mumkin/`
- `/yangi-loyihangizni-tez-boshlash-uchun-eng-yaxshi-open-source-shablonlar/`
- `/yandex-market-oflayn-dokonlar-agregatori-ustida-ishlamoqda/`
- `/category/maqolalar/python/` (eski kategoriya)

To'liq ro'yxat uchun GSC eksportida `/products/`, `/listing/`, `/shop/` bo'lmagan URL'larni ajrating.

## Tekshirish (curl)

```sh
B=https://blog.odya.uz
# 410 kutiladi
for p in /products/12345/ /listing/198095525/ /shop/products/20014044/ /shop/storeSearch/KeepCriteriaInput \
  '/clientlog?feisbot=1&bot_check' /wp-login.php /wp-admin/ /xmlrpc.php /feed/ /cheap-viagra.html \
  /jp/abc.html /2019/05/eski/ /page/2/ '/?p=12345' '/?s=casino' '/?xxx=1' '/kr?page_id=2'; do
  curl -s -o /dev/null -w "%{http_code} $p\n" "$B$p"; done
# 200 kutiladi
for p in / /kr '/?utm_source=telegram&utm_medium=channel&utm_campaign=latn' '/?gclid=x' /search?q=ai \
  /robots.txt /sitemap.xml /news-sitemap.xml /rss.xml /kr/rss.xml /brand/icon-512.png; do
  curl -s -o /dev/null -w "%{http_code} $p\n" "$B$p"; done
# 308 kutiladi (trailing slash)
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "$B/kr/"
# Sarlavhalar
curl -sI "$B/products/1/" | grep -iE '^(HTTP|x-robots-tag|cache-control|content-type)'
```

Kategoriya/maqola/teg/muallif sahifalari uchun sitemap'dan bir nechta URL oling va 200 ekanini tekshiring.

## Google Search Console qadamlari

1. **Removals → New request → "Remove all URLs with this prefix"** (vaqtincha, ~6 oy yashiradi; 410 bu vaqtda doimiy olib tashlaydi):
   - `https://blog.odya.uz/products/`
   - `https://blog.odya.uz/listing/`
   - `https://blog.odya.uz/shop/`
   - `https://blog.odya.uz/clientlog`
   - `https://blog.odya.uz/wp-` (ixtiyoriy)
2. **Pages (Indexing) hisoboti:** "Not found (404)" / "Crawled – currently not indexed" va boshqa spam guruhlarida **Validate Fix** bosing. 410 lar "Not found (404)" guruhiga tushadi — bu kutilgan.
3. **Sitemaps:** `https://blog.odya.uz/sitemap.xml` va `https://blog.odya.uz/news-sitemap.xml` qayta yuboring (Google haqiqiy sahifalarni tezroq qayta ko'rsin).
4. **URL Inspection:** 2–3 spam URL uchun "Test live URL" — `410` ko'rinishi kerak; bosh sahifa va bitta maqola — "URL is available to Google".
5. **Kuzatish:** har hafta Pages hisobotidagi "indexed" soni va spam shakllari kamayishini tekshiring (odatda 2–8 hafta). Security & Manual actions bo'limi bo'sh bo'lishi kerak.
6. Yangi spam shakli paydo bo'lsa: GSC eksportidan namunalar → `apps/web/src/site/gone.ts` ga qoida + `apps/web/tests/__fixtures__/gsc-indexed-sample.csv` ga qator.
