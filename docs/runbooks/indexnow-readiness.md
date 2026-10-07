# IndexNow holati va production'ga ulash

**Vazifa:** OBLOG-89. **Tekshiruv sanasi:** 2026-10-07.

## Qisqa javob

IndexNow integratsiyasi kodda tayyor: maqola chop etilganda, chop etishdan olinganda,
arxivlanganda, o'chirilganda yoki uning slug/kategoriyasi o'zgarganda lotin va `/kr` URL'lari
navbat orqali `https://api.indexnow.org/indexnow` manziliga yuboriladi. Vaqtinchalik xatolarda
1, 5 va 15 daqiqadan keyin qayta urinish bor.

Production'da haqiqatan ishlayotgani hozircha kod va ommaviy HTTP tekshiruvidan isbotlanmaydi.
Buning uchun production'da `INDEXNOW_KEY` mavjudligi, shu kalitning ommaviy fayli ochiqligi,
scheduler job'larni bajarishi va kamida bitta oddiy publish uchun `200` yoki `202` qabul logi
tasdiqlanishi kerak. Kalit qiymatini hujjat, ticket, chat yoki tekshiruv logiga ko'chirmang.

IndexNow qidiruv tizimiga o'zgarish haqida xabar beradi; u crawl, indekslanish yoki reytingni
kafolatlamaydi. `200` so'rov qabul qilinganini, `202` esa URL qabul qilinib, kalit tekshiruvi hali
kutilayotganini bildiradi. [IndexNow protokoli](https://www.indexnow.org/documentation),
[Bing qo'llanmasi](https://www.bing.com/indexnow/getstarted).

## Kodda nima bor

| Qism | Hozirgi xatti-harakat | Dalil |
| --- | --- | --- |
| Trigger | Birinchi publish/re-publish, unpublish, arxivlash, o'chirish va chop etilgan maqolaning slug yoki kategoriyasi o'zgarishi | [Post hook](../../apps/web/src/collections/Posts/indexnow.ts), [hook ulanishi](../../apps/web/src/collections/Posts/index.ts) |
| URL'lar | Har bir holat uchun lotin va `/kr` URL; URL o'zgarsa yangi va eski URL'lar | [Post hook](../../apps/web/src/collections/Posts/indexnow.ts) |
| So'rov | JSON `POST`, `host`, `key`, `keyLocation`, `urlList`; faqat o'z hostidagi HTTPS URL'lar; bir so'rovda ko'pi bilan 10 000 URL | [Yuborish kodi](../../apps/web/src/indexnow/index.ts) |
| Kalit fayli | `/{INDEXNOW_KEY}.txt` → `text/plain`, tanasi aynan kalit; noma'lum yoki sozlanmagan kalit `404` | [Route](../../apps/web/src/app/%28seo%29/indexnow/%5Bkey%5D/route.ts), [rewrite](../../apps/web/src/site/seo/rewrites.ts) |
| Navbat | `indexnow.submit` `default` navbatida; web so'rovidan keyin darhol bajarishga urinadi, qolganini scheduler oladi | [Task](../../apps/web/src/jobs/tasks/indexNowSubmit.ts), [job registri](../../apps/web/src/jobs/index.ts) |
| Retry | `429`, `5xx`, timeout/tarmoq xatosi: 1/5/15 daqiqa; `400`, `403`, `422`: qayta urinilmaydi | [Yuborish kodi](../../apps/web/src/indexnow/index.ts), [konstantalar](../../apps/web/src/jobs/constants.ts) |
| Himoya | Kalit yo'q, indekslash yopiq yoki origin HTTPS emas bo'lsa yuborilmaydi; boshqa host URL'i filtrlanadi | [Readiness](../../apps/web/src/indexnow/index.ts) |
| Test qamrovi | So'rov tanasi, statuslar, retry, URL juftlari, key route va rewrite uchun testlar bor | [IndexNow testlari](../../apps/web/tests/indexnow.test.ts) |

Fokuslangan unit test 2026-10-07 kuni mavjud lokal dependencylar va test env qiymatlari bilan
ishga tushirildi: `tests/indexnow.test.ts` — 15/15 test o'tdi. Tashqi IndexNow endpointiga so'rov
yuborilmadi; test `fetch`ni soxtalashtiradi.

Muhim bo'shliq: chop etilgan maqolaning URL'i o'zgarmasa, uning matni yoki boshqa mazmuni jiddiy
yangilanganda hook `prev.path === next.path` sabab xabar yubormaydi. Sitemap `lastmod` yangilanishi
Google va boshqa crawlerlar uchun alohida signal bo'lib qoladi, ammo IndexNow orqali “updated”
xabari ketmaydi. Buni alohida kod vazifasida, autosave va mayda o'zgarishlarni spam qilmaydigan
mezon bilan tuzatish kerak.

## Production'dan o'qish bilan olingan dalil

2026-10-07 kuni tizim ishonadigan TLS sertifikati bilan anonim HTTPS so'rovlari tekshirildi:

| Manba | Natija |
| --- | --- |
| [`robots.txt`](https://blog.odya.uz/robots.txt) | `200 text/plain`; `/` va `/api/media/file/` ochiq, `/admin`, `/api`, `/search`, `/kr/search` yopiq; sitemap va news sitemap havolalari bor |
| [`sitemap.xml`](https://blog.odya.uz/sitemap.xml) | `200 application/xml`; sitemap indexda 2026-yil oktabr va sentabr oylik post sitemaplari bor |
| [`news-sitemap.xml`](https://blog.odya.uz/news-sitemap.xml) | `200 application/xml`; 2026-10-07 dagi lotin va `/kr` URL'lari bor |
| [`rss.xml`](https://blog.odya.uz/rss.xml) | `200` |
| [Namuna lotin maqola](https://blog.odya.uz/suniy-intellekt/claude-obunasi-api-qiymati-boyicha-chatgptdan-5-6-barobar) va [`/kr` muqobili](https://blog.odya.uz/kr/suniy-intellekt/claude-obunasi-api-qiymati-boyicha-chatgptdan-5-6-barobar) | Ikkalasi `200` HTML, o'ziga canonical, meta `index, follow`; `X-Robots-Tag` yo'q |

Bu dalil ommaviy maqola va discovery fayllari oddiy anonim mijozga ochiqligini ko'rsatadi. U haqiqiy
Bing/Yandex botining WAF'dan o'tganini, IndexNow so'rovi yuborilganini, kalit fayli ochiqligini yoki
URL indekslanganini isbotlamaydi. `robots.txt`dagi crawl ruxsati ham meta/HTTP `noindex`dan alohida;
ikkalasi tekshiriladi. Admin va umumiy `/api` yo'llari yopiq qolishi to'g'ri.

Ulangan Vercel akkauntida faqat `oybekruziev's projects` ko'rindi. Odya'ning aniq
`team_Qr8Pzwhfsz8TeBdsAgYnTcGb` scope'ida project ro'yxatini o'qish ikkala read-only urinishda ham
`403` qaytardi. Shu sabab production env nomlari/qiymatlari, deploy loglari, haqiqiy kalit fayli va
IndexNow qabul statusini tekshirish imkoni bo'lmadi. Hech qanday IndexNow so'rovi yuborilmadi.

## Saytga qanday ruxsat kerak

IndexNow uchun CMS, admin panel, database yoki xususiy API'ni qidiruv tizimiga ochish shart emas.
Faqat quyidagi tor kirishlar kerak:

1. `https://blog.odya.uz/<kalit>.txt` anonim `GET` bilan `200`, `text/plain` va aynan kalit
   tanasini qaytarsin. Login, cookie, JavaScript challenge yoki boshqa domen/path'ga redirect
   bo'lmasin. Rasmiy protokol root'dagi UTF-8 kalit faylini tavsiya qiladi.
2. Yuborilgan ommaviy maqola URL'lari anonim crawler uchun `200` HTML bilan ochiq bo'lsin;
   `robots.txt` crawlni taqiqlamasin, meta va `X-Robots-Tag` esa `noindex` bermasin. Bu ikki
   mustaqil tekshiruvdir. O'chirilgan URL haqiqiy yakuniy holatini (`404`, `410` yoki kerakli
   redirect) ko'rsatsin.
3. Web runtime tashqariga HTTPS orqali `api.indexnow.org:443` ga ulana olsin.
4. CDN/WAF faqat kalit fayli va ommaviy kontentga kerakli crawler kirishini o'tkazsin. Butun WAF,
   `/admin` yoki `/api` himoyasini o'chirmang. Challenge yoki blok kuzatilsa, aniq host/path va
   tasdiqlangan bot talabi bo'yicha tor qoida qo'llang.

Kalit fayli sayt egaligini tekshiradi. IndexNow talabi bo'yicha kalit 8–128 belgidan iborat bo'lib,
`A-Z`, `a-z`, `0-9` va `-` belgilaridan foydalanadi; root'dagi UTF-8 faylning nomi va tanasi shu
kalitga mos bo'ladi. [Rasmiy kalit talabi](https://www.indexnow.org/documentation).

## Production sozlash va tekshirish

### 1. Sozlash

Avval production sirlar boshqaruvida mavjud sozlamani tekshiring. Amaldagi `INDEXNOW_KEY` formatga
mos va uning root fayli ishlayotgan bo'lsa, shu kalitni qayta ishlating; sababsiz almashtirmang.
Kalit yo'q yoki yaroqsiz bo'lsagina yangisini yarating, masalan `openssl rand -hex 16`. Quyidagi
nomlarni tekshiring; qiymatlarni ticket yoki runbookka yozmang:

- `INDEXNOW_KEY` — production scope'da, 8–128 belgilik mos kalit;
- `NEXT_PUBLIC_SITE_URL` — production HTTPS origin;
- `SEO_NOINDEX` — production indekslashini yopadigan qiymatga o'rnatilmagan;
- `JOBS_MODE` — amaldagi deploy modeliga mos;
- endpoint rejimida `JOBS_SECRET` va tashqi scheduler sozlangan.

Env o'zgargach production'ni redeploy qiling. Preview muhiti indekslash uchun ochilmaydi va unga
production IndexNow kalitini berish shart emas.

### 2. O'qish bilan tekshirish

- Sirni chiqarmaydigan env tekshiruvida faqat `INDEXNOW_KEY` **mavjud/mavjud emas** holatini
  qayd eting.
- Kalit egasi o'z terminalida `https://blog.odya.uz/<kalit>.txt` ni tekshiradi: status `200`,
  `Content-Type: text/plain`, tana kalitga aynan teng. Natijani ulashayotganda URL va tanani
  niqoblang.
- `robots.txt`, yangi ommaviy maqola va uning `/kr` muqobili ochiqligini tekshiring.
- Endpoint rejimida `/api/jobs/run` chaqiruvi har 10 daqiqada muvaffaqiyatli ekanini tekshiring.
  Faqat HTTP `200` job bajarilganini isbotlamaydi: javobdagi bajarilgan/qolgan joblar, oxirgi run,
  queue holati va `indexnow.submit` logini ham tekshiring. Batafsil tartib
  [scheduler runbook](jobs-scheduler.md)da.

### 3. Nazoratli publish bilan isbotlash

Production kontentini o'zgartirish vakolati bilan bitta oddiy yangi maqolani chop eting. Quyidagi
dalillarni sir qiymatlarisiz yozib oling:

1. `indexnow.submit` navbatga qo'yildi;
2. lotin va `/kr` URL'lari yuborildi;
3. javob `200` yoki `202`, yoki tushunarli xato statusi;
4. retry kerak bo'lsa, `waitUntil` job'i keyingi scheduler chaqiruvida bajarildi;
5. Bing Webmaster Tools → **IndexNow** bo'limida URL qabul qilinganligi va keyin crawl/index
   holati ko'rindi.

Bing ushbu panelda yuborilgan URL namunalari, yuborish vaqti/manbasi hamda crawl/index holatini
ko'rsatadi. Bu operatsion monitoring uchun ilova logidan keyingi eng foydali dalildir.
[Bing IndexNow Insights](https://blogs.bing.com/webmaster/2024/3/Optimize-your-Impact-with-IndexNow-Insights/).

## Statuslar va amallar

| Natija | Ma'nosi | Amal |
| --- | --- | --- |
| `200` | URL ro'yxati qabul qilindi | Bing panelida crawl/index holatini kuzating; indekslangan deb darhol belgilamang |
| `202` | URL qabul qilindi, kalit tekshiruvi kutilmoqda | Kalit fayli `200` va mos tana ekanini tekshiring; takroriy `202`ni kuzating |
| `400` | So'rov formati noto'g'ri | Deploy versiyasi va request formatini tekshiring; avtomatik retry yo'q |
| `403` | Kalit topilmadi yoki mos emas | Key route, WAF/challenge, redirect, cache va env/deploy mosligini tekshiring |
| `422` | URL hostga tegishli emas yoki kalit formati mos emas | `NEXT_PUBLIC_SITE_URL`, canonical host va kalit formatini tekshiring |
| `429` | Juda ko'p so'rov | Mavjud 1/5/15 daqiqalik retryni kuzating; qo'lda ketma-ket yubormang |
| `5xx` / timeout | Vaqtinchalik endpoint yoki tarmoq xatosi | Retry navbati va scheduler ishlashini tekshiring |

Ilova muvaffaqiyatda `IndexNow: ... URL yuborildi`, vaqtinchalik xatoda qayta urinish va yakuniy
xatoda `IndexNow: yuborilmadi` loglarini yozadi. Muntazam monitoring quyidagilarni qamrasin:

- qabul statuslari soni (`200`/`202`) va `403`/`422`/`429`/`5xx` xatolari;
- `indexnow.submit` kutayotgan yoki takroran xato bo'layotgan job'lar;
- `/api/jobs/run` muntazamligi va qolgan job'lar soni;
- Bing Webmaster Tools'dagi submitted/crawled/indexed tafovuti;
- yangi maqolaning sitemap/news sitemapdagi holati va Google Search Console holati.

## Qaysi qidiruv tizimlariga ta'sir qiladi

`api.indexnow.org`ga yuborish IndexNow ishtirokchilariga tarqatiladi. 2026-10-07 dagi rasmiy
ishtirokchilar ro'yxatida Bing, Yandex, Seznam, Naver, Yep, Internet Archive va Amazonbot bor;
Google yo'q. [IndexNow ishtirokchilari](https://www.indexnow.org/searchengines.json). Yandex ham
yangi, o'zgargan va o'chirilgan URL'lar uchun IndexNow'ni qo'llaydi, lekin indekslanishni
kafolatlamaydi. [Yandex IndexNow qo'llanmasi](https://yandex.com/support/webmaster/en/indexing-options/index-now).

Google uchun mavjud sitemap/news sitemap, to'g'ri `lastmod`, crawlable havolalar va Search
Console ishlatiladi. Google sitemap yuborilishini faqat signal deb hisoblaydi; u ham indekslanishni
kafolatlamaydi. Eski unauthenticated sitemap ping endpointi bekor qilingan, shuning uchun yangi
maqola uchun uni chaqirish kerak emas. [Google sitemap qo'llanmasi](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap),
[ping endpoint holati](https://developers.google.com/search/blog/2023/06/sitemaps-lastmod-ping).

## Production ishlashini tasdiqlash mezoni

- production env'da kerakli nomlar borligi qiymatlarni ochmasdan tasdiqlangan;
- root kalit fayli anonim `200`, `text/plain`, mos tana bilan ochiladi;
- odatiy publish lotin va `/kr` URL'larini navbatga qo'yadi va `200`/`202` yoki aniq xato logini
  beradi;
- scheduler retry job'larini bajaradi;
- Bing Webmaster Tools'da yuborish dalili, keyin crawl/index holati kuzatiladi;
- Google uchun sitemap/news sitemap va Search Console alohida kuzatiladi;
- bir URL'dagi mazmuniy tahrir IndexNow bo'shlig'i alohida kod vazifasi sifatida qayd etilgan.

Ushbu audit ilova kodini, production sozlamasini, tashqi akkauntlarni yoki jonli kontentni
o'zgartirmadi.
