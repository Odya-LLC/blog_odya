# Ijtimoiy tarmoqlarga avtopost: variantlar va ishga tushirish shartlari

**Tekshirilgan sana:** 2026-10-07

**Holat:** tadqiqot va qaror hujjati; integratsiya qilinmagan, hech bir hisob ulanmagan.

**Manba tekshiruvi:** Meta Developer sahifalari tadqiqot paytida avtomatik o'qishda `429` qaytardi. Shu sababli endpoint, scope va request/response dalillari Meta'ning tasdiqlangan, o'qiladigan rasmiy Postman workspace'laridan tekshirildi; Developer havolalari kanonik reference sifatida berildi. Hisobga bog'liq quota, access va token muddati productionda API javobidan qayta tekshiriladi. Live API chaqiruvi qilinmadi.

## Qisqa xulosa

Instagram, Facebook Page, Threads va X'ga avtomatik post yuborish mumkin. Odya uchun ikki amaliy yo'l bor:

1. **Tez sinov:** `dlvr.it` orqali mavjud RSS'ni tarqatish yoki Buffer orqali CMS job'laridan boshqarish. RSS eng kam kod talab qiladi, lekin post ko'rinishi, tasdiqlash, dublikatni boshqarish va aniq yuborish holati ustidan nazorat kamroq.
2. **Uzoq muddatli yechim:** mavjud Payload Jobs va Telegram avtopost arxitekturasiga alohida platforma task'larini qo'shish. Meta API'lari bilan bevosita ishlash texnik jihatdan mumkin; X esa 2026-10-07 holatida pullik, har so'rov uchun kredit sarflaydi.

Tavsiya: avval 5 ta postlik nazoratli sinov qiling. Tahririy tasdiqlash va ikki yozuvdagi matnni aniq boshqarish muhim bo'lsa, **Buffer + CMS jobs** bilan boshlash ma'qul. Faqat RSS'dagi yangi maqolalarni tez va sodda tarqatish kerak bo'lsa, **dlvr.it**ni sinang. Bevosita API'ni Meta hisoblari tayyor, formatlar tasdiqlangan va servis xarajatidan qochish qiymati implementatsiya/operatsiya xarajatidan yuqori bo'lganda tanlang.

## Hozir noma'lum bo'lgan hisob holati

Quyidagilar tekshirilmagan; shu sababli “tayyor” deb hisoblanmaydi:

- Instagram hisobi `Business` yoki `Creator` ekanligi;
- Facebook Page mavjudligi va Odya operatorida unda kontent yaratish huquqi borligi;
- Instagram Facebook Page'ga ulanganmi yoki mustaqil Instagram Login yo'li tanlanadimi;
- Threads profili va API uchun Meta app/use case tayyormi;
- Meta Business verification, App Review va kerakli permission access darajalari;
- X Developer hisobining tasdig'i, to'lov/kredit va API app holati;
- Buffer/dlvr.it hisoblari, reja, kanal ulash huquqi va trial cheklovlari;
- kunlik post soni, lotin/kirill strategiyasi, kerakli media turlari va tasdiqlash jarayoni.

## Platformalar taqqoslanishi

| Platforma | Hisob va kirish | Minimal publish huquqi | Asosiy oqim | Havola/media xulqi | Limitni boshqarish |
| --- | --- | --- | --- | --- | --- |
| Instagram | Faqat Professional: Business yoki Creator. Yangi **Instagram Login** yo'lida Facebook Page shart emas; eskiroq **Facebook Login** yo'lida Professional hisob Page'ga ulangan bo'lishi kerak. | Instagram Login: `instagram_business_basic`, `instagram_business_content_publish`. Facebook Login: `pages_show_list`, `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`. | Media container yaratish → tayyor bo'lishini tekshirish → `media_publish`. | Feed post faqat matn/havola ko'rinishida emas: rasm/video kerak. `image_url`/`video_url` Meta serveridan olinadigan ochiq URL bo'lishi kerak. Caption URL'i bosiladigan link o'rnini bosmaydi; trafik uchun bio/link-in-bio kerak. | Har publish oldidan `content_publishing_limit` javobidagi `quota_usage` va `config`ni o'qish; sonni kodga qotirmaslik. |
| Facebook Page | Shaxsiy profilga emas, boshqariladigan Page'ga publish qilinadi. User token orqali `/me/accounts`dan Page va Page access token olinadi; foydalanuvchida Page uchun kontent yaratish task'i bo'lishi kerak. | `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`; endpointga Page access token. | Matn/havola: `/{page-id}/feed`; rasm: `/{page-id}/photos`; video va Reels uchun alohida upload/publish oqimi. | Feed endpoint havola preview'ini yarata oladi. Hosted Reel'da CDN URL `file_url` bilan beriladi; odatiy photo/video endpoint talablarini tanlangan formatga qarab tekshirish kerak. | Graph API usage headerlari va endpoint xatolarini kuzatish; universal “kunlik post soni”ni taxmin qilib kodlamaslik. |
| Threads | Meta app'da **Threads use case**, Threads foydalanuvchisining OAuth roziligi va access token kerak. | `threads_basic`, `threads_content_publish`. | `/{threads-user-id}/threads`da text/image/video container → `threads_publish`; text uchun `auto_publish_text=true` bilan bir bosqich ham mumkin. | Text postda `link_attachment` bor; u bo'lmasa matndagi birinchi URL preview bo'ladi. Rasm/video URL'i ommaviy serverda bo'lishi kerak. | `/{threads-user-id}/threads_publishing_limit?fields=quota_usage,config`ni o'qish. Rasmiy collection konfiguratsiyani API'dan olish imkonini beradi; sonni qotirmaslik. |
| X | User OAuth kerak. OAuth 2.0 PKCE yoki OAuth 1.0a user context ishlatiladi. | `tweet.write`, `tweet.read`, `users.read`; media upload uchun `media.write`; uzoq ishlash uchun `offline.access`. | Rasm/video avval media endpointga upload qilinadi, qaytgan `media_id` `POST /2/tweets`ga biriktiriladi. Matn yoki linkning o'zi bilan ham post mumkin. | Instagram/Threads kabi public media URL'ni platformaning o'zi olib ketmaydi: media upload qilinadi. Standart post 280 weighted character; URL 23 belgi hisoblanadi. | Pay-per-use kreditlar. 2026-10-07 jadvalida oddiy create-post $0.015, URL qatnashgan create-post $0.200/request; media, read, retry va hosting alohida sarf bo'lishi mumkin. |

## Meta: login, review va tokenlar

### Instagram

Meta hozir ikkita publish yo'lini ko'rsatadi:

- **Instagram API with Instagram Login** — Page talab qilmaydigan tor yo'l: `graph.instagram.com`, Business Login for Instagram, Professional hisobning o'zi token beradi. Eski `business_*` scope nomlari 2025-01-27da eskirgan; `instagram_business_*` nomlarini ishlatish kerak. [Meta'ning rasmiy Instagram Postman collectioni](https://www.postman.com/meta/instagram/folder/6raa77c/instagram-api-with-instagram-login)
- **Instagram API with Facebook Login** — `graph.facebook.com`, Facebook Login for Business, Instagram Professional hisob Facebook Page'ga ulangan bo'lishi shart. Page ro'yxati va Page tokeni `/me/accounts?fields=name,access_token,tasks,instagram_business_account` orqali olinadi. [Meta'ning Facebook Login Instagram collectioni](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api) va [Page token so'rovi](https://www.postman.com/meta/instagram/request/lpx8lul/get-access-tokens-of-pages-you-manage)

Publishing permission faqat organik kontent yaratishni qoplaydi; comments, DM va insights kerak bo'lmasa ularning permissionlarini so'ramaslik kerak. Rasmiy permissions reference App Review uchun to'liq login va real publish oqimini ko'rsatadigan screencast talabini beradi. [Meta permissions reference](https://developers.facebook.com/docs/permissions/)

Instagram Login'da browser OAuth tokeni qisqa muddatli; uni server tomonda long-lived token'ga almashtirish, javobdagi `expires_in`ni saqlash va muddati tugashidan oldin refresh qilish kerak. Aniq muddat va refresh eligibility'ni hisobning real API javobidan olish lozim. Token, app secret va refresh jarayoni faqat serverda saqlanadi. [Access token exchange](https://developers.facebook.com/docs/instagram-platform/reference/access_token) va [refresh](https://developers.facebook.com/docs/instagram-platform/reference/refresh_access_token)

Instagram feed uchun “maqola havolasi + matn” alohida post turi yo'q. Amaliy shablon: maqola muqovasi + qisqa caption + “havola bio'da”. Har post URL'ini o'lchash kerak bo'lsa, bio'dagi linkni yangilash yoki link-in-bio sahifasidan foydalanish alohida mahsulot qarori. Stories faqat mos Business hisoblarida va alohida format shartlari bilan ishlaydi; API link sticker qo'sha oladi deb taxmin qilinmaydi, pilotda faqat rasmlar sinovdan o'tkaziladi. [Instagram content publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/)

### Facebook Page

User OAuth'dan olingan token bilan `/me/accounts` chaqiriladi; javobdagi `tasks` orasida kontent yaratish vakolati bo'lishi va keyingi publish so'rovlarida Page access token ishlatilishi kerak. [Meta rasmiy Facebook token collectioni](https://www.postman.com/meta/facebook/request/bqfxwbp/get-access-tokens-of-pages-you-manage) Publish uchun `pages_manage_posts`, Page'ni tanish/ko'rish uchun `pages_show_list` va `pages_read_engagement` talab qilinadi. [Pages API posts](https://developers.facebook.com/docs/pages-api/posts/)

Token “doimiy” deb taxmin qilinmasin. Long-lived user token'dan hosil qilingan Page token uzoq ishlashi mumkin, ammo parol/rol/app permission o'zgarishi, xavfsizlik yoki revoke sabab yaroqsiz bo'lishi mumkin. Integratsiya tavsiyasi sifatida davriy (masalan, har kuni) yengil token health-check, 401/permission xatosida kanalni pauza qilish va operatorga qayta ulash vazifasi kerak. [Long-lived token qo'llanmasi](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/)

Reels oqimi `start → upload → status → finish`; Meta'ning rasmiy collectioni hosted faylni `rupload.facebook.com`ga `file_url` headeri bilan berishni va yakunda `PUBLISHED`, `SCHEDULED` yoki `DRAFT` holatini tanlashni ko'rsatadi. [Facebook Reels publishing collectioni](https://www.postman.com/meta/facebook/documentation/r56bjfd/facebook-api)

### Threads

Meta app'da Threads use case yaratiladi, redirect URI bilan OAuth code olinadi, code access token'ga almashadi. Short-lived token `th_exchange_token` bilan long-lived token'ga almashtiriladi; rasmiy javobdagi `expires_in=5184000` — 60 kun. Unexpired long-lived token `th_refresh_token` bilan yangilanadi. [Threads auth collectioni](https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api?entity=request-34203612-ee0a2365-9d95-4cbe-8087-1cfb04d38c05)

Text, image, video va carousel qo'llanadi. Media postlarda Meta URL'ni o'zi yuklaydi, shu sabab CDN URL auth/cookie talab qilmasligi, Meta user-agentiga ochiq bo'lishi va publish tugaguncha amal qilishi kerak. Container statusi `FINISHED` bo'lmaguncha publish qilinmaydi. Text postning birinchi URL'i preview bo'lishi mumkin yoki aniq `link_attachment` beriladi. [Threads publishing collectioni](https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api?entity=folder-34203612-995a4593-61de-4558-9b26-6c8becae85e4)

Quota uchun rasmiy endpoint `GET /me/threads_publishing_limit?fields=quota_usage,config`. Launch paytida qaytgan `quota_total`/`quota_duration`ni saqlab, limitga yaqinlashganda navbatni kutishga o'tkazish kerak. [Meta rasmiy quota so'rovi](https://www.postman.com/meta/threads/request/w3x0n4g/retrieve-publishing-quota-limit)

### Development, Live va tashqi foydalanuvchilar

Standard Access faqat app'da roli bor admin/developer/tester hisoblari uchun yetadi. Odya faqat o'z brend hisoblariga post yuborsa, shu hisoblarni app role/tester sifatida qo'shib, Standard Access bilan pilot qilish mumkin. App roliga ega bo'lmagan tashqi mijozlar o'z hisoblarini ulashi kerak bo'lsa, tegishli permissionlarning har biri uchun Advanced Access, App Review va Business Verification kerak. Advanced Access bo'lgan app'lar yillik Data Use Checkup talabiga ham tushadi. [Meta access levels](https://developers.facebook.com/docs/graph-api/overview/access-levels/)

Demak birinchi bosqichda “ommaviy SaaS OAuth” qurish shart emas. Biroq appni tashqi foydalanuvchilarga ochish rejalansa, privacy policy, data deletion, review credentials, screencast va permission justification alohida launch blokiga kiradi.

## Tayyor servislar

| Variant | Qachon tanlash | Xarajat va cheklov | Odya uchun izoh |
| --- | --- | --- | --- |
| **Buffer** | Kanal bo'yicha alohida matn, draft/approval, schedule va yuborish holati kerak bo'lsa. | Free: 3 kanal va har kanalga 10 queued post, shu sabab 4 kanal sig'maydi. Annual billing ekvivalenti: Essentials $5/kanal/oy, 4 kanal $20/oy yoki $240/yil; Team $10/kanal/oy, 4 kanal $40/oy yoki $480/yil, approval bor. Reja/trialni xarid vaqtida qayta tekshirish kerak. | Hozirgi API GraphQL va shaxsiy API key bilan serverdan ishlaydi. 15 daqiqada 100 request; 24 soatda Free 250, Essentials 250, Team 500. Har kanalga create va sent-status poll alohida request, shuning uchun accepted javobni yakuniy sent deb bo'lmaydi. [Pricing](https://buffer.com/pricing), [API](https://buffer.com/api), [scheduling guide](https://developers.buffer.com/guides/posts-and-scheduling.html) |
| **dlvr.it** | Mavjud RSS'dan eng kam kod bilan barcha kanallarga tarqatish kerak bo'lsa. | Pricing dinamik; hujjatda raqam qotirilmadi. Trial'da aynan 4 profil, X allowance, RSS polling kechikishi va Instagram media mapping tekshirilsin. | Instagram, Threads va RSS auto-post mahsulotlari bor. Tez pilot uchun eng sodda, ammo provider qanday `media:content` olishi, caption/havola va xato reconciliation trial'da tekshiriladi. [Sayt](https://dlvrit.com/), [Instagram](https://dlvrit.com/instagram-auto-poster/), [Threads](https://dlvrit.com/threads-auto-poster/), [pricing](https://dlvrit.com/pricing/) |
| **Make/Zapier** | Vizual workflow, filtr va qo'shimcha tizimlar kerak bo'lsa. | Make Free 1,000 credit/oy va 15 daqiqalik interval. 300 maqola × 4 kanalning o'zi kamida 1,200 create action; poll/filter/retry bundan tashqari, demak Free yetmaydi. Zapier paid narxini xarid vaqtida tekshirish kerak; Buffer haqi alohida. [Make pricing](https://www.make.com/en/pricing) | Orchestrator platforma permissionlarini chetlab o'tmaydi. Make X connectori 2025da bekor qilingan; Buffer yoki o'z X credentialli HTTP oqimi kerak. [Make social integrations](https://www.make.com/en/integrations/category/social-media), [Make X notice](https://help.make.com/x-formerly-twitter-app-integration-discontinued), [Zapier pricing](https://zapier.com/pricing) |
| **n8n self-hosted** | Jamoa workflow serverini yurita olsa va ko'p integratsiya kerak bo'lsa. | License nol bo'lishi mumkin, lekin server, backup, monitoring va yangilash bepul emas; X krediti baribir alohida. | X va Facebook Graph node'lari bor, Threads uchun HTTP oqimi kerak. [X node](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.twitter/), [X credentials](https://docs.n8n.io/integrations/builtin/credentials/twitter/) va [Facebook Graph node](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.facebookgraphapi/) |

Buffer FAQ hozir **public** Threads profili va unga bog'langan Instagram profilini so'raydi; private profil ishlaydi deb qabul qilinmaydi. Bu Threads native API'sining universal talabi emas, Buffer xizmatining onboarding sharti. [Buffer Threads qo'llanmasi](https://support.buffer.com/en-us/articles/using-threads-with-buffer-HN9ZUFnVZv) Trial'da X kanali tanlangan rejada borligini va Buffer'dan tashqari alohida X invoice chiqmasligini tekshirish kerak; “cheksiz X publish” deb taxmin qilinmaydi. RSS → Zapier → Buffer oqimida har Zap alohida Buffer kanalini nishonga oladi. [Buffer + Zapier](https://support.buffer.com/articles/using-zapier-with-buffer-EapRng2lI7)

## X narxi va siyosati

X'da `POST /2/tweets` user-context auth bilan ishlaydi. OAuth 2.0 access token odatda 2 soat; `offline.access` scope refresh token beradi. [Create Post](https://docs.x.com/x-api/posts/create-post) va [OAuth 2.0 PKCE](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code)

MVP shabloni: qisqa sarlavha + maqola URL'i. Standart post 280 weighted character, barcha URL'lar 23 belgi hisoblanadi; Unicode sabab oddiy JavaScript `length` tekshiruvi yetarli emas, `twitter-text` qoidasi bilan validatsiya qilish kerak. Premium uzun post mavjud deb hisoblanmaydi. [X character counting](https://docs.x.com/fundamentals/counting-characters)

2026-10-07 pay-per-use jadvaliga ko'ra URL qatnashgan 10 post/kun ≈ 300 request/oy × $0.200 = **$60/oy**, 30 post/kun ≈ 900 × $0.200 = **$180/oy** faqat create-post uchun. Media upload, read/poll, xatoli retry va hosting qo'shimcha bo'lishi mumkin. Legacy Free/Basic/Pro fixed tierga tayangan hisob qilinmadi. [X API pricing](https://docs.x.com/x-api/getting-started/pricing) Media uchun avval upload, keyin `media_id` ishlatiladi. [Media upload](https://docs.x.com/x-api/media/upload-media)

Faqat Odya'ning o'z yangiliklarini, dublikatsiz va spam bo'lmagan tarzda tarqatish kerak; avtomatik reply/follow/engagement bu scope'ga kirmaydi. [X automation policy](https://help.x.com/en/rules-and-policies/x-automation)

## Repo bilan integratsiya dizayni

Mavjud kod bevosita API yoki Buffer uchun yaxshi asos beradi:

- [Posts/telegram.ts](../../apps/web/src/collections/Posts/telegram.ts) publish bo'lganda har yozuv uchun Payload job qo'yadi va `after()` orqali darhol ishlatishga urinadi;
- [telegramPost.ts](../../apps/web/src/jobs/tasks/telegramPost.ts) retry/backoffli task namunasi;
- [runner.ts](../../apps/web/src/jobs/runner.ts) navbatni deadline bilan ishlatadi; [jobs/index.ts](../../apps/web/src/jobs/index.ts) `endpoint` rejimida serverless `autoRun` yo'qligini, pg_cron 10 daqiqalik asosiy trigger va GitHub Actions zaxirasini ko'rsatadi;
- Telegram holati post ichida tashqi message ID, hash, vaqt va xato bilan saqlanadi. Shu modelni `socialPublishes[]` yoki alohida collectionga umumlashtirish mumkin.

Taklif etiladigan oqim:

1. Post ilk marta `published` bo'lganda `social.publish` joblarini `(postId, platform, account, locale)` bo'yicha yarating.
2. Idempotency key sifatida aynan shu tuple ishlating; pending job yoki successful external ID bo'lsa yangi post yaratilmang.
3. Job postning so'nggi holatini o'qib, platformaga mos caption/havola/media hosil qilsin. Lotin va kirill bir hisobga ikki marta yuboriladimi yoki kanal/hisoblar ajratiladimi — owner qarori.
4. Instagram/Threads uchun `MEDIA_PUBLIC_URL`dagi ochiq variantni yuboring, container statusini poll qiling, so'ng publish qiling. Timeoutdan keyin qayta publish qilishdan oldin external container/post holatini reconcile qiling.
5. Buffer ishlatilsa har kanal uchun alohida Buffer ID saqlang va `sent/failed` holatini poll qiling.
6. 429/5xx uchun exponential backoff; 401/403da kanalni pauza qilib operatorga ogohlantirish; invalid media/captionni avtomatik qayta urmaslik.
7. Cover yoki matn tahriri yangi social post yaratmasin. Birinchi versiyada edit ham qilinmasin; admin qo'lda qaror qilsin.

RSS yo'li ham tayyor: [RSS generator](../../apps/web/src/site/seo/rss.ts) `/rss.xml`, `/kr/rss.xml` va kategoriya lentalarida 30 item, `<ttl>30</ttl>`, cover `media:content`, maqola URL'ini GUID sifatida beradi. [SEO file response](../../apps/web/src/site/seo/files.ts) CDN uchun `s-maxage=300` va `stale-while-revalidate=3600` qo'yadi. Natijada RSS publish “darhol” kafolatlanmaydi; provider poll intervali ham qo'shiladi. URL/path o'zgarsa GUID o'zgarib dublikat berishi mumkin. Birinchi ulashda mavjud GUID'larni baseline qilib, faqat keyingi yangi postlardan boshlash, provider `media:content`ni Instagram rasmi sifatida haqiqatan xaritalashini 5 postda sinash kerak. Uzoq uzilishda 30 itemdan eski postlar feed oynasidan tushib qolishi mumkin.

## Ishga tushirish mezonlari

Implementatsiya vazifasi berilishidan oldin quyidagilar yozma tanlansin:

- hisoblar: Instagram turi, Facebook Page ID, Threads/X profili va owner access;
- lotin/kirill: bir hisobda bitta tanlangan yozuvmi yoki alohida hisob/kanallarmi;
- hajm: normal va pik post/kun;
- format: faqat cover+caption+linkmi, video/Reels/Stories/carousel ham bormi;
- URL siyosati: Instagram uchun bio/link-in-bio, qolganlari uchun maqola UTM linki;
- workflow: darhol auto-publish, draft, yoki muharrir approval;
- yechim: dlvr.it RSS, Buffer, yoki direct APIs;
- oylik budget va X kredit limiti;
- Meta/X app, verification/review va production tokenlar tayyorligi.

Rollout: avtopost default o'chiq → test hisoblarida 5 ta qo'lda tasdiqlangan post → format, link, UTM, external ID va dublikat tekshiruvi → bitta platformani productionda yoqish → qolganlarini ketma-ket qo'shish. Sirlar faqat server secret storage'da bo'ladi; log va Payload hujjatlariga access token yozilmaydi.
