# AI qidiruvlarda Blog Odya materiallarining topilishi

**Vazifa:** OBLOG-83 — QUESTION. **Tekshiruv sanasi:** 2026-10-05.

Saytni AI qidiruviga ochish, yangiliklarni tez topiladigan qilish va ishonchli manba sifatida tayyorlash mumkin. Birinchi o'rin yoki AI javobida havola berilishini kafolatlab bo'lmaydi. Blog Odya kodida asosiy texnik poydevor allaqachon bor; birinchi ish — uning amaldagi saytda ishlashini tekshirish, keyin maqolalarning mustaqil qiymatini oshirish.

Bu hujjat maslahat va manba auditi natijasidir. Ilova kodi, bot siyosati, tashqi akkauntlar va production sozlamalari o'zgartirilmadi.

## Uchta alohida maqsad

1. **Qidiruvda topilish:** crawler maqolani oladi, qidiruv tizimi uni indekslashi mumkin.
2. **AI javobida manba bo'lish:** tizim savolga mos materialni tanlab, javobida ishlatishi yoki unga havola berishi mumkin. Ochiq sayt bu tanlovni kafolatlamaydi.
3. **Modelni o'qitish:** kontent kelajakdagi modelni o'qitishda ishlatilishi boshqa jarayondir. O'qitishga ruxsat berish AI qidiruvda ustunlik va'dasi emas; qidiruvga ruxsat bilan alohida qaror qilinadi.

Google AI qidiruvi uchun odatdagi indekslash va foydali kontent asoslari amal qiladi; maxsus AI schema yoki `llms.txt` talab qilinmaydi. Saytning ichki matn uzunligi yoki kalit so'z zichligi qoidalari tahririy mezon bo'lishi mumkin, lekin ularni Google AI talabiga aylantirmaslik kerak. Qisqa yangilikni hajm uchun cho'zish yoki kalit so'zni sun'iy takrorlash tavsiya qilinmaydi. [Google AI qidiruvi qo'llanmasi](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide).

Search Console'dagi **Settings → Search generative AI** sozlamasida standart tanlov `Include`; ichki property ota property tanlovini meros olishi mumkin. Nashriyot AI qidiruvda qatnashmoqchi bo'lsa, samarali tanlov `Exclude` emasligi tekshiriladi. Bu Google-Extended orqali model o'qitishni boshqarishdan alohida. [Google generativ AI boshqaruvi](https://support.google.com/webmasters/answer/16908024). **Generative AI performance** hisobotida AI Overviews va AI Mode ko'rsatishlari kuzatiladi. Hisobot ko'rinmasligi yetarli ko'rsatish yo'qligi yoki joriy etilish bosqichiga bog'liq bo'lishi mumkin; bu `noindex` dalili emas. [Google hisoboti](https://support.google.com/webmasters/answer/16984139).

OpenAI `OAI-SearchBot`ni qidiruv uchun, `GPTBot`ni model o'qitish uchun ajratadi. `ChatGPT-User` foydalanuvchi so'rovi bilan tashrif qiladi va avtomatik qidiruv crawler'i emas. Qidiruv botiga kirish va o'qitish botiga ruxsat alohida boshqarilishi mumkin. Koddagi ommaviy `*` qoidasi ushbu botlar uchun alohida robots taqiqi bermaydi; o'qitish siyosati ham shu bois alohida ko'rib chiqiladi. CDN/WAF'da haqiqiy botni tekshirishda rasmiy IP ma'lumotidan foydalaniladi; User-Agent satrining o'zi yetarli emas. [OpenAI botlari](https://developers.openai.com/api/docs/bots).

Bing Webmaster Tools'dagi AI Performance Copilot, Bing va ayrim hamkorlar bo'yicha manba havolalarini kuzatishga yordam beradi; bu reyting yoki barcha AI platformalaridagi natija hisoboti emas. Kundalik namunalar va kechikishlar hisobga olinadi. [Bing AI Performance](https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c).

## Kod bo'yicha mavjud holat

Quyidagi jadval **manba kodidagi imkoniyatlarni** tasdiqlaydi. Bu production muhiti, indekslash yoki botlarning haqiqiy tashriflarini tasdiqlamaydi.

| Yo'nalish | Kodda bor | Amaliy tekshiruv |
| --- | --- | --- |
| Botlar kirishi | `User-agent: *` uchun ommaviy yo'llar ochiq; `/admin`, `/api`, `/search`, `/kr/search` yopiq. `/api/media/file/` alohida ochilgan. [Robots qoidalari](../../apps/web/src/site/seo/robots.ts). | Amaldagi `robots.txt`, CDN/WAF, bot challenge va rasm domeni ham tekshiriladi. Kodda AI botlariga alohida taqiq yo'q. |
| Indekslash muhiti | `SEO_NOINDEX=1/true` yoki Vercel preview/development robots, meta va `X-Robots-Tag` orqali yopiladi. `NEXT_PUBLIC_SITE_URL` berilmasa canonical manzil `localhost`ga tushadi. [Sozlamalar](../../apps/web/src/site/seo/config.ts), [HTTP sarlavhalari](../../apps/web/next.config.ts). | Production manzil `https://blog.odya.uz`, muhit `production`, majburiy `noindex` o'chirilgan bo'lishi kerak. Preview'ni ochish talab qilinmaydi. |
| O'qiladigan maqola | Server komponenti sarlavha, lid, muallif, sana, to'liq RichText matni va manbalarni chiqaradi. [ArticleView](../../apps/web/src/site/views/ArticleView.tsx), [RichText](../../apps/web/src/components/richtext/RichText.tsx). | JavaScript bajarilmagan HTML javobida asosiy matn va havolalar borligini tekshirish. |
| Canonical va schema | Maqola metadata'si, canonical/hreflang, `NewsArticle`, `datePublished`, `dateModified`, muallif, nashriyot, rasmlar, `inLanguage`, manbalar uchun `isBasedOn` bor. [Maqola SEO](../../apps/web/src/site/seo/pages.ts), [JSON-LD](../../apps/web/src/site/seo/json-ld.ts). | Ikki yozuvdagi haqiqiy URL, ko'rinadigan ma'lumot va JSON-LD bir-biriga mosligi; rasm URL'lari ochiqligi. |
| Muallif va manba | Muallif profili va asl manbaga ko'rinadigan havola bor; muallifsiz postga “Blog Odya tahririyati” standarti qo'llanadi. [Standart muallif](../../apps/web/src/collections/Posts/defaultAuthor.ts), [SourceBox](../../apps/web/src/components/blog/SourceBox.tsx). | Haqiqiy mas'ul muallif, bio, aloqa va tahririyat siyosati mazmuni tekshiriladi. Standart muallif mavjudligi maqola tekshirilganining dalili emas. |
| Yangilikni topish | Oylik sitemap, ikkala yozuv muqobillari, oxirgi 48 soat uchun news sitemap va 30 elementli RSS mavjud. Chop etishda ma'lumot keshi yangilanadi. [SEO ma'lumotlari](../../apps/web/src/site/seo/data.ts), [XML javoblari](../../apps/web/src/site/seo/files.ts), [RSS](../../apps/web/src/site/seo/rss.ts). | Yangi maqolaning sitemap/RSSga tushishi, to'g'ri URL va sana. Kod XML uchun `s-maxage=300`, `stale-while-revalidate=3600` belgilaydi; jonli HTTP javobida esa `public, max-age=0` ko'rindi. Amaldagi CDN yangilanish vaqtini alohida o'lchash kerak. |
| IndexNow | Chop etish, chop etishdan olish, o'chirish, arxivlash va URL o'zgarishida ikkala yozuv yuboriladi. HTTPS, indekslash ochiqligi va `INDEXNOW_KEY` zarur. 429/5xx/tarmoq xatosida 1/5/15 daqiqalik kechiktirish bor. [Hook](../../apps/web/src/collections/Posts/indexnow.ts), [Yuborish](../../apps/web/src/indexnow/index.ts). | Production kalit fayli ochiqligi, yuborish natijasi va retry navbatini bajaradigan scheduler. Qabul qilingan so'rov indekslanganlikni bildirmaydi. |

## Jonli sayt tekshiruvi

2026-10-05, **12:33–12:35 UTC** oralig'ida JavaScript bajarmaydigan odatiy HTTP so'rovlari bilan tekshirildi. Bu quyidagi URL'larning o'sha paytdagi ochiqligini ko'rsatadi.

| Tekshirilgan manba | Kuzatilgan natija |
| --- | --- |
| [Bosh sahifa](https://blog.odya.uz/) | HTTP 200; canonical production domenida, robots meta `index, follow`. |
| [robots.txt](https://blog.odya.uz/robots.txt) | HTTP 200; koddagi `*`, ochiq `/` va `/api/media/file/`, yopiq admin/api/search yo'llari, ikkala sitemap manzili bilan mos. |
| [Sitemap index](https://blog.odya.uz/sitemap.xml) | HTTP 200, to'g'ri XML; `pages`, `categories`, `posts-2026-10`, `posts-2026-09` uchun 4 child fayl manzili bor. Child fayllarning hammasi ushbu tekshiruvda tasdiqlangan deb hisoblanmaydi. |
| [News sitemap](https://blog.odya.uz/news-sitemap.xml) | HTTP 200, to'g'ri XML; 60 URL — 30 maqola ikki yozuvda. Namuna maqola mavjud. |
| [RSS](https://blog.odya.uz/rss.xml) | HTTP 200, to'g'ri XML; 30 element. Namuna maqola mavjud. |
| [Namuna maqola, lotin](https://blog.odya.uz/ilm-fan/faraz-km3net-neytrinosi-qorongi-olchov-dagi-qora-tuynukdan) va [kirill](https://blog.odya.uz/kr/ilm-fan/faraz-km3net-neytrinosi-qorongi-olchov-dagi-qora-tuynukdan) | Ikkalasi HTTP 200, o'z URL'iga canonical, `index, follow`; javob HTML'ida asosiy maqola matni bor — taxminan 6796/6507 belgi. `NewsArticle`, `BreadcrumbList`, `FAQPage` bor. Tekshirilgan NewsArticle sarlavha, muallif va sana bo'yicha ko'rinadigan ma'lumotga mos; rasm URL'lari mutlaq `media` manzillarida. |

Tekshirilgan javob sarlavhalarida `X-Robots-Tag` ko'rinmadi. Namuna maqolaning chop etilgan sanasi `2026-10-05T11:48:36.100Z`; tekshiruv vaqtida sitemap va RSSda borligi tasdiqlandi. Bu chop etishdan lentaga tushish vaqtini o'lchamaydi. Barcha maqolalar, rasm URL'larining ochiqligi, haqiqiy bot tashriflari yoki indekslanganlik bu kichik namuna orqali tasdiqlanmaydi.

Namuna maqolada “Blog Odya tahririyati” `Person` sifatida berilgan. Tahririyat jamoasi va haqiqiy shaxs uchun ko'rinadigan muallif hamda schema turi mosligini muharrir ko'rib chiqishi kerak. `isBasedOn` ikkilamchi ixbt manbasiga ishora qiladi; ilmiy da'vo uchun tekshirilgan birlamchi maqola yoki hujjatga havola qo'shish mazmuniy ustuvorlikdir. Ushbu auditda noma'lum ilmiy hujjat havolasi taxmin qilib qo'shilmadi.

Production env qiymatlari, Search Console/Bing Webmaster Tools hisobotlari, WAF sozlamalari, bot loglari va IndexNow yuborish natijalari koddan bilinmaydi. Ular tasdiqlanmaguncha “AI botlari saytni olayapti” yoki “sayt indekslangan” degan xulosa chiqarilmaydi. User-Agent'ni qo'lda yozib 200 javob olish ham haqiqiy bot tashrifini isbotlamaydi.

## Tavsiyalar va ustuvorlik

**P1 — kirish va indekslashni isbotlash.** Texnik mas'ul production robots, maqola HTML, canonical, meta/HTTP `noindex`, sitemap, rasmlar va bot himoyasini tekshiradi. Google Search Console hamda Bing Webmaster Tools'da domen egaligi va sitemap holati tasdiqlanadi. Bir necha yangi maqola uchun URL tekshiruvi qilinadi. Mavjud SEO imkoniyatlarini qayta qurishdan oldin shu dalillar yig'iladi. Ommaviy yangilikni o'qish uchun saytdagi xususiy `/api/mcp` autentifikatsiyasini ochish yoki uning tokenlarini AI botlariga berish kerak emas.

**P1 — aniq va foydali tahririy mazmun.** Muharrir maqolaning boshida kim, nima, qayerda, qachon va nima o'zgarganini qisqa aytadi. Sana, joy, shaxs/tashkilot nomi, raqam va birliklar aniq yoziladi; muhim da'voga birlamchi hujjat yoki manba havolasi yaqin qo'yiladi. Qayta yozilgan yangilikka mustaqil tekshiruv, mahalliy kontekst, intervyu yoki tushuntirish qo'shiladi. AI yoki crawler uchun yashirin matn va majburiy FAQ ko'paytirilmaydi. Asosiy maqsad — o'quvchi foydalanadigan, havola berishga arziydigan material.

**P1 — muallif va nashriyot shaffofligi.** Muharrir haqiqiy mas'ul muallifni, mos bio va aloqa yo'lini ko'rsatadi; saytning tahririyat va tuzatish siyosatlarini tekshiradi. AI ishlatilgan materiallarda mavjud `aiDisclosure` maydoni vaziyatga mos qo'llanadi. JSON-LD ko'rinadigan ma'lumotdan farq qilmasin. Namuna maqoladagi tahririyat jamoasiga `Person` berilishini muharrir ko'rib chiqsin: haqiqiy shaxs bo'lsa `Person`, jamoa bo'lsa uning tashkilot sifatidagi identifikatsiyasiga mos tur tanlanadi. Sun'iy inson muallifi yaratilmaydi. Bu elementlar kodda borligi uchun yangidan mexanizm yaratishdan ko'ra haqiqiy kontentni tekshirish zarur.

**P2 — IndexNow orqali jiddiy yangilanishni bildirish.** Hozirgi hook faqat ommaviy URL holatini solishtiradi: `prev?.path === next?.path` bo'lsa qaytadi. Shu sababli bir URL'dagi maqola matni jiddiy tuzatilganda IndexNow xabari yuborilmaydi. Bu crawl to'sig'i emas, o'zgarish haqida bildirish bo'shlig'idir. Keyingi alohida texnik vazifada jiddiy tahrirni ham bildirish mezoni ishlab chiqilsin; autosave va o'zgarishsiz saqlash xabar yubormasin. Mavjud sitemap `lastmod` esa `updatedAt`ni olib turadi; muharrir sana mazmunli tahrirga mosligini nazorat qiladi. [Dalil](../../apps/web/src/collections/Posts/indexnow.ts).

**P2 — yangilik lentalari va hajmni kuzatish.** RSS to'liq maqola o'rniga lid beradi; maqolaning asosiy manbasi ochiq HTML bo'lib qoladi. News sitemap 1000 URL bilan cheklangan: ikki yozuv chiqarilgani uchun 48 soat ichida 500 dan ko'p maqola bo'lsa eskiroq yozuvlar fayldan tushadi. Shunday hajm kuzatilsa, alohida news sitemap fayllarga ajratish vazifasi ochiladi. Hozircha bu kuzatilgan production muammosi emas. [Chegaralar](../../apps/web/src/site/seo/sitemap.ts).

**P3 — tajribalarni dalilga bog'lash.** `llms.txt`ni majburiy shart yoki reyting vositasi deb qabul qilmaslik; asosiy kirish, sifat va o'lchash ishlari ustun turadi. RSS, schema va IndexNow ham barcha AI tizimlariga kontent olishni buyurmaydi. Model o'qitish botlariga ruxsat — nashriyotning alohida siyosiy qarori.

## 0–7 kunlik reja

| Ish | Mas'ul | Tugallash dalili |
| --- | --- | --- |
| Production auditini tugatish; kirish to'sig'i tasdiqlansa tuzatish uchun alohida vazifa ochish | Texnik mas'ul | Bosh sahifa, 3 yangi maqola va kirill muqobillarining HTTP holati, canonical, robots/noindex va JSsiz matni saqlangan tekshiruv qaydi. |
| Search Console va Bing Webmaster Tools orqali sayt va sitemap holatini tekshirish | Texnik mas'ul | Egalik tasdiqlangan; sitemap qabul holati va 3 maqolaning URL tekshiruvi qaydi. **Settings → Search generative AI** uchun samarali `Include` tanlovi va ota property'dan meros olish holati tekshiriladi; **Generative AI performance** mavjud bo'lsa boshlang'ich ko'rsatkichlari qayd etiladi. Bu auditda akkaunt holati tasdiqlanmagan va sozlama o'zgartirilmagan. Indekslanmagan URL sabab bilan alohida qayd etiladi. |
| IndexNow sozlamasi va scheduler'ni tekshirish | Texnik mas'ul | Kalit fayli 200 va mos tana; navbatdagi odatiy publish uchun 200/202 yoki tushunarli xato logi. Retry navbati bajariladi. Sir qiymatlari hujjatga yozilmaydi. [Scheduler qo'llanmasi](jobs-scheduler.md). |
| Oxirgi 10 maqolani ko'rib chiqish | Muharrir | Muallif, sana, dalil manbalari, original qiymat, faktlar va tuzatishlar ro'yxati; ko'rinadigan ma'lumot/schema mosligi tekshirilgan. |
| O'lchash boshlang'ich holatini yozish | Texnik mas'ul va muharrir | 20 ta mavzuga mos o'zbekcha savolning platforma, sana, lotin/kirill shakli, javobdagi manba URL'i yoki yo'qligi qayd etilgan. |

## 7–30 kunlik reja

1. Muharrir muntazam original, tekshirilgan material chiqaradi; katta tahrirda mazmun va yangilanish sanasi mos yuritiladi. Texnik mas'ul bir odatiy publish oqimida yangi URL sitemap, news sitemap va RSSga qachon tushganini o'lchaydi. Operatsion maqsad — 15 daqiqa ichida ko'rinishi; bu auditda tasdiqlangan SLA emas. Kechikish bo'lsa kesh yoki navbat sababi tekshiriladi.
2. Texnik mas'ul IndexNow jiddiy tahrir bo'shlig'i uchun tor vazifa ochadi; ishlab chiqarishdagi zarurat va ustuvorlik alohida baholanadi. Sitemap hajmi faqat limitga yaqinlashsa kengaytiriladi.
3. Texnik mas'ul indekslash xatolari, tasdiqlangan bot kirishi va AI referral tashriflarini kuzatadi. Muharrir shu 20 savolni haftasiga bir xil usulda takrorlaydi. Javob o'zgaruvchanligi, mintaqa/shaxsiylashtirish va havolasiz tashriflar o'lchash cheklovi sifatida yoziladi; qo'lda ko'rilgan javoblar ulushi umumiy bozor ulushi deb talqin qilinmaydi.

## Bajarildi deb hisoblash mezonlari

- Ommaviy maqolalar bot himoyasi, login yoki tasodifiy `noindex` sabab yopilmagan; to'liq asosiy matn javob HTML'ida o'qiladi.
- Canonical va lotin/kirill muqobillari production domeniga mos; sitemap va RSS yangilanishi oddiy publish oqimida qayd bilan tasdiqlangan.
- `NewsArticle` va ko'rinadigan muallif, nashr/yangilanish sanasi, rasmlar, manbalar mos; muallif va tahririyat shaffofligi kontent namunasida tekshirilgan.
- IndexNow sozlangan bo'lsa qabul yoki xato holati log bilan tasdiqlangan; scheduler va yuborilmaydigan bir URL'dagi tahrir holati ma'lum.
- Indekslash va AI javobidagi manba havolalari uchun boshlang'ich o'lchov hamda 30 kunlik taqqoslash mavjud. AI javobida birinchi chiqish bu mezonlarga qo'shilmaydi.

Bu savol vazifasining natijasi — mavjud poydevor, aniqlangan bo'shliq, tekshirilmagan holatlar va bajariladigan reja. Production o'zgarishlari va keyingi texnik vazifalar ushbu auditda bajarilgan deb hisoblanmaydi.
