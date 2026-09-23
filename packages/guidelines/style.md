---
id: style
title: Stil qoʻllanma
version: 1.0.0
updatedAt: 2026-09-23
---

# Blog Odya — stil qoʻllanma

Ushbu qoʻllanma Blog Odya (blog.odya.uz) materiallarini yozuvchi AI agent (MCP orqali) va muharrirlar uchun majburiy. U mualliflik qoidalari (`copyright.md`), SEO qoidalari (`seo.md`) va chiqish sxemasi (`output-schema.md`) bilan birga qoʻllanadi. Qoidalar oʻzaro zid kelsa, ustuvorlik tartibi: **mualliflik qoidalari → faktlarning aniqligi → stil → SEO**.

## 1. Til va yozuv

- Matn **oʻzbek adabiy tilida**, **lotin yozuvida** yoziladi. Kirill versiyasi avtomatik tayyorlanadi — agent kirill matn yozmaydi, lotin maydonlarida kirill harflari boʻlishi mumkin emas (server buni rad etadi).
- Ogʻzaki, sheva va jargon soʻzlar ishlatilmaydi. Istisno — kibersport va IT sohasida oʻrnashib qolgan atamalar (glossariyda koʻrsatilgan).
- Ruscha va inglizcha soʻzlar oʻzbekcha muqobili keng tarqalgan boʻlsa, oʻzbekchasi tanlanadi: «ilova» (приложение, app), «yangilanish» (обновление, update), «foydalanuvchi» (пользователь, user). Atamalar uchun glossariy (`odya://glossary`) asos boʻladi.
- Gaplar qisqa va aniq: bitta gapda bitta asosiy fikr. Oʻrtacha gap uzunligi — 12–20 soʻz.
- Majhul nisbat («...tomonidan amalga oshirildi») oʻrniga iloji boricha aniq nisbat: «Apple yangi iPhone taqdim etdi».
- Kanselyariya uslubi («mazkur», «ushbu holat yuzasidan», «amalga oshirilmoqda») suiisteʼmol qilinmaydi.

### 1.1. Maxsus belgilar: `ʻ` va `ʼ`

| Holat                                     | Belgi                | Unicode | Toʻgʻri                                           | Notoʻgʻri                               |
| ----------------------------------------- | -------------------- | ------- | ------------------------------------------------- | --------------------------------------- |
| `oʻ`, `gʻ` harflari (kichik va bosh harf) | `ʻ` (turned comma)   | U+02BB  | `oʻzbek`, `gʻalaba`, `Oʻzbekiston`, `Gʻarb`       | `o'zbek`, `o‘zbek`, `o’zbek`, `g'alaba` |
| Tutuq belgisi (ayirish belgisi)           | `ʼ` (apostrof harfi) | U+02BC  | `maʼlumot`, `sunʼiy`, `taʼlim`, `sanʼat`, `eʼlon` | `ma'lumot`, `sun'iy`, `ta’lim`          |

- `oʻ`/`gʻ` uchun **faqat** `ʻ` (U+02BB) ishlatiladi — bu TZ talabi (§5.2) va shriftlar uni toʻgʻri koʻrsatadi.
- Tutuq belgisi uchun `ʼ` (U+02BC) ishlatiladi. ASCII apostrof (`'`), `‘` va `’` belgilari soʻz ichida ishlatilmaydi.
- `’` belgisi faqat brendning rasmiy yozilishida uchraganda qoladi (masalan, `Assassin’s Creed`).
- Transliteratsiya adapteri barcha apostrof variantlarini normallashtiradi, lekin agent va muharrir matnni boshidanoq toʻgʻri yozishi shart.

### 1.2. Tinish belgilari

- Qoʻshtirnoq: asosiy — `« »` (fransuzcha), ichki qoʻshtirnoq — `“ ”`. Masalan: «Kompaniya rahbari “yangi davr” haqida gapirdi».
- Tire: gap ichida — uzun tire `—` ikki tomonidan boʻshliq bilan; oraliqlar uchun — qisqa tire `–` boʻshliqsiz (`2024–2026`, `140–160 belgi`).
- Chiziqcha (`-`) faqat qoʻshma soʻzlarda: `ilmiy-texnik`, `IT-kompaniya`, `beta-versiya`.
- Ellipsis (`…`) sarlavhada ishlatilmaydi.

## 2. Oʻquvchiga murojaat

- Oʻquvchiga **«siz»** deb murojaat qilinadi, «siz» kichik harf bilan yoziladi (gap boshida — bosh harf). «Sen» murojaati taqiqlanadi.
- Matn tahririyat nomidan yoziladi. «Men» ishlatilmaydi; zarurat boʻlsa — «tahririyatimiz», «Blog Odya».
- Buyruq shaklidagi murojaat faqat amaliy maslahatlarda: «Qurilmangizni yangilang», «Parolingizni almashtiring».

## 3. Raqamlar, sanalar, valyuta

### 3.1. Raqamlar

- Birdan toʻqqizgacha boʻlgan sonlar matnda soʻz bilan yoziladi (`uchta jamoa`, `besh kun`), 10 va undan kattalari — raqam bilan (`12 ta jamoa`). Istisno: oʻlchov birliklari, foizlar, texnik koʻrsatkichlar, hisoblar va sanalar doim raqam bilan (`5 GB`, `3 %`, `2:1`).
- Minglar boʻshliq bilan ajratiladi (bosilmas boʻshliq tavsiya etiladi): `12 500`, `1 250 000`. Oʻnli kasr — vergul bilan: `3,5 dyuym`, `2,4 GGs`.
- Katta sonlar soʻz bilan qisqartiriladi: `1,2 mln`, `3 mlrd`, `4,5 trln`. «million», «milliard» toʻliq yozilishi ham mumkin, bitta matn ichida bir xil uslub saqlanadi.
- Foiz: `15 %` (raqam va belgi orasida boʻshliq). Tartib sonlar: `3-oʻrin`, `2026-yil`, `XXI asr`.
- Oʻlchov birliklari xalqaro qisqartmada: `GB`, `TB`, `MB/s`, `GGs` (gigagers), `mAh`, `Vt`, `nm`, `fps`. Matnning birinchi uchrashida tushunarsiz birlik izohlanadi.

### 3.2. Sana va vaqt

- Sana formati: `23-sentabr`, `2026-yil 23-sentabr`. Oy nomlari kichik harf bilan: `yanvar`, `fevral`, `mart`, `aprel`, `may`, `iyun`, `iyul`, `avgust`, `sentabr`, `oktabr`, `noyabr`, `dekabr`.
- Hafta kunlari: `dushanba`, `seshanba`, `chorshanba`, `payshanba`, `juma`, `shanba`, `yakshanba`.
- Vaqt — 24 soatlik format va Toshkent vaqti: `14:30 (Toshkent vaqti)`. Manbada boshqa vaqt mintaqasi koʻrsatilgan boʻlsa, Toshkent vaqtiga (UTC+5) oʻtkaziladi.
- Nisbiy vaqt («kecha», «bugun», «oʻtgan hafta») ishlatilmaydi: material keyinroq ham oʻqiladi. Buning oʻrniga aniq sana yoziladi.

### 3.3. Valyuta

- Narx avval **asl valyutada**, keyin qavs ichida **taxminiy soʻmda** beriladi: `999 dollar (taxminan 12,6 mln soʻm)`.
- Kurs — Oʻzbekiston Respublikasi Markaziy bankining material yozilgan kundagi rasmiy kursi. Hisob yaxlitlanadi va «taxminan» soʻzi albatta yoziladi.
- Valyuta nomlari: `dollar`, `yevro`, `rubl`, `yuan`, `iyena`, `funt sterling`. Belgilar (`$`, `€`) matnda ishlatilmaydi, faqat jadvallarda ruxsat etiladi.
- Soʻm: `soʻm` (kichik harf). Katta summalar: `12,6 mln soʻm`, `1,3 mlrd soʻm`.
- Aksiya bahosi, bozor kapitallashuvi va investitsiya summalari soʻmga oʻgirilmaydi — faqat asl valyutada beriladi (keraksiz yaxlitlashlarning oldini olish uchun).

## 4. Sarlavha uslubi

- Sarlavha — maqolaning asosiy faktini aytadigan toʻliq, tushunarli gap. Uzunligi **≤ 70 belgi** (`seo.md`).
- Faqat birinchi soʻz va atoqli otlar bosh harf bilan: «Apple iPhone 18 taqdimotini oktabrga koʻchirdi».
- Sarlavha oxirida nuqta qoʻyilmaydi. Soʻroq belgisi faqat material haqiqatan savolga javob bersa.
- Focus keyword sarlavhada, iloji boricha boshiga yaqin joylashadi.
- Manba sarlavhasi tarjima qilinmaydi — sarlavha oʻzimiz tomonimizdan qaytadan tuziladi (`copyright.md`).
- Sarlavhada qoʻshtirnoq faqat asar, oʻyin yoki mahsulot nomi uchun (brendlar qoʻshtirnoqsiz yoziladi: `OpenAI`, `Dota 2`).

### 4.1. Clickbait taqiqlanadi

Quyidagilar **taqiqlanadi**:

- Matnda tasdigʻi yoʻq vaʼda: «Buni koʻrib hayratda qolasiz», «Hech kim kutmagan edi».
- Asosiy faktni yashirish: «Apple nima qilganini bilasizmi?»
- Boʻrttirish: «inqilob», «shov-shuv», «dahshat», «SHOK» — agar faktlar buni asoslamasa.
- BOSH HARFLAR bilan yozilgan soʻzlar (qisqartmalardan tashqari), undov belgilari, emoji.
- Sarlavha va matn orasidagi nomuvofiqlik.

### 4.2. Namunalar

| Yomon                                                   | Nima uchun                         | Yaxshi                                                               |
| ------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------- |
| «OpenAI SHOK qildi! Yangi model hammasini oʻzgartiradi» | Clickbait, bosh harflar, fakt yoʻq | «OpenAI GPT-6 modelini taqdim etdi: kontekst 2 mln tokengacha»       |
| «Apple yangi telefonini chiqardi»                       | Noaniq, focus keyword yoʻq         | «Apple iPhone 18 Pro smartfonini taqdim etdi: narxi 1 099 dollardan» |
| «Team Spirit va NAVI oʻrtasidagi oʻyin natijasi.»       | Natija yashirilgan, oxirida nuqta  | «Team Spirit NAVI jamoasini 2:1 hisobida yengib, finalga chiqdi»     |
| «Maʼlumotlar sizib chiqdi»                              | Kim, qancha — nomaʼlum             | «Ticketmaster: 560 mln foydalanuvchi maʼlumotlari sizib chiqdi»      |

## 5. Material tuzilishi

1. **Sarlavha** (≤ 70 belgi).
2. **Lid** (`excerpt`) — 1–2 gap, 160–300 belgi: kim, nima, qachon, qayerda. Focus keyword lidda boʻladi. Lid sarlavhani soʻzma-soʻz takrorlamaydi.
3. **Asosiy matn** — muhimlik boʻyicha kamayib boruvchi tartib («teskari piramida»): eng muhim faktlar — boshida, tafsilot va kontekst — keyin. Boʻlimlar `H2`, ichki boʻlimlar `H3` bilan ajratiladi (`H1` ishlatilmaydi — u sarlavha).
4. **«Oʻzbekiston uchun ahamiyati»** bloki (quyidagi 6-boʻlim).
5. **FAQ** (ixtiyoriy, 2–4 savol, `set_seo` orqali).
6. **Manba** — sahifada avtomatik chiqadi (`sources`); matn ichida ham manbaga havola qilinadi (`copyright.md`).

Paragraf — 2–4 gap. Roʻyxatlar texnik xususiyatlar, bosqichlar yoki taqqoslash uchun ishlatiladi. Jadval — 3 va undan ortiq mahsulot yoki koʻrsatkich solishtirilganda.

## 6. «Oʻzbekiston uchun ahamiyati» bloki

`H2` sarlavhasi: **«Oʻzbekiston uchun ahamiyati»**. 2–5 gapdan iborat.

**Qachon qoʻshiladi:**

- Mahsulot, xizmat yoki oʻyin Oʻzbekistonda mavjud boʻladi yoki mavjud emas (rasmiy sotuv, App Store / Google Play mintaqasi, toʻlov usullari).
- Narx eʼlon qilingan — soʻmdagi taxminiy narx va mahalliy bozordagi holat.
- Oʻzbekistondagi foydalanuvchilar, kompaniyalar yoki davlat xizmatlariga taʼsir qiladigan oʻzgarish (xavfsizlik zaifligi, siyosat, sanksiya, cheklov, yangi funksiyaning tilga yoki mintaqaga bogʻliqligi).
- Oʻzbekistonlik oʻyinchi, jamoa yoki kompaniya ishtirok etgan voqea (kibersport, startaplar).
- Oʻzbek tili qoʻllab-quvvatlanishi (masalan, AI modeli oʻzbek tilini tushunadimi).

**Qachon qoʻshilmaydi:**

- Aloqasi yoʻq yoki sunʼiy boʻladigan holatlarda (masalan, xorijiy kompaniyaning ichki kadrlar oʻzgarishi). Majburan yozilgan umumiy gaplar («Bu Oʻzbekiston uchun ham muhim») taqiqlanadi.
- Mahalliy maʼlumot tasdiqlanmagan boʻlsa: taxmin yozilmaydi, savol `notesForEditor` ga yoziladi.

**Yaxshi:** «iPhone 18 Oʻzbekistonda rasmiy sotuvga chiqishi eʼlon qilinmagan. Rasmiy narx 999 dollar (taxminan 12,6 mln soʻm), biroq mahalliy doʻkonlarda import xarajatlari hisobiga narx odatda yuqoriroq boʻladi.»

**Yomon:** «Bu yangilik oʻzbekistonliklar uchun ham juda muhim va qiziqarli boʻladi.»

## 7. Nomlar va atamalar

- Brendlar, mahsulotlar, oʻyinlar va jamoalar nomi **asl yozilishida** qoladi va tarjima ham, transliteratsiya ham qilinmaydi: `OpenAI`, `ChatGPT`, `iPhone`, `Counter-Strike 2`, `Team Spirit`. Roʻyxat — glossariyda (`doNotTranslate`, `doNotTransliterate`).
- Brend nomiga qoʻshimcha apostrofsiz qoʻshiladi. Qoʻshimcha talaffuzga tushmasa, turdosh ot yordamida yoziladi: `Apple kompaniyasining`, `NAVI jamoasini`, `OpenAI kompaniyasiga`. Tabiiy oʻqiladigan hollarda qoʻshimcha toʻgʻridan-toʻgʻri qoʻshiladi: `Googlening`, `Samsungdan`, `Telegramda`. Brend va qoʻshimcha orasiga apostrof qoʻyilmaydi — aks holda kirill versiyasida ortiqcha `ъ` paydo boʻladi.
- Kishi ismlari oʻzbek lotin yozuvida, talaffuzga koʻra: `Sem Altman` (Sam Altman), `Ilon Mask` (Elon Musk), `Jensen Xuang` (Jensen Huang). Birinchi uchrashida qavs ichida asl yozilishi beriladi: «Sem Altman (Sam Altman)».
- Lavozim ismdan oldin, kichik harf bilan: «OpenAI bosh direktori Sem Altman».
- Qisqartmalar birinchi uchrashida ochib beriladi: «katta til modeli (LLM)», «grafik protsessor (GPU)».
- Joy nomlari oʻzbek adabiy tilida qabul qilingan shaklda: `AQSH`, `Xitoy`, `Janubiy Koreya`, `Kaliforniya`, `Silikon vodiysi` (birinchi uchrashida — «Silikon vodiysi (Silicon Valley)»).

## 8. Faktlar va ishonchlilik

- Faqat manbada bor faktlar yoziladi. **Oʻylab topilgan fakt, raqam, iqtibos yoki sana taqiqlanadi.**
- Noaniq, qarama-qarshi yoki tekshirib boʻlmaydigan joylar matnga kiritilmaydi — `notesForEditor` maydoniga yoziladi.
- Mish-mish va sizib chiqqan maʼlumotlar shunday deb belgilanadi: «The Verge manbalariga koʻra», «tasdiqlanmagan maʼlumotlarga koʻra».
- Baho va fikr (review, tahlil) faktdan ajratiladi va kimga tegishli ekani koʻrsatiladi: «TechCrunch sharhlovchisi fikricha...».
- Tibbiy, moliyaviy va huquqiy maslahat berilmaydi.

## 9. Neytrallik va etika

- Siyosiy, diniy va milliy masalalarda neytral ohang saqlanadi.
- Kamsituvchi, haqoratli soʻzlar va stereotiplar ishlatilmaydi.
- Kiberhujumlar haqida yozilganda hujum usuli boʻyicha amaliy qoʻllanma berilmaydi; foydalanuvchi oʻzini qanday himoya qilishi yoziladi.
- Shaxsiy maʼlumotlar (telefon, manzil, hujjatlar) keltirilmaydi, hatto manbada boʻlsa ham.

## 10. AI shaffofligi

Agent qayta yozgan materialning oxirida avtomatik ravishda «Material AI yordamida tayyorlangan va muharrir tomonidan tekshirilgan» yozuvi chiqadi (TZ §9.6). Agent buni matnning oʻziga yozmaydi.

## 11. Tekshiruv roʻyxati (topshirishdan oldin)

- [ ] Butun matn lotin yozuvida, kirill harflari yoʻq.
- [ ] `oʻ`/`gʻ` — `ʻ` (U+02BB), tutuq belgisi — `ʼ` (U+02BC).
- [ ] Sarlavha ≤ 70 belgi, clickbait yoʻq, oxirida nuqta yoʻq.
- [ ] Lid 1–2 gap, focus keyword bor.
- [ ] Narxlar: asl valyuta + taxminiy soʻm.
- [ ] Sanalar aniq, nisbiy vaqt yoʻq.
- [ ] Brendlar asl yozilishida.
- [ ] Oʻylab topilgan fakt yoʻq; shubhali joylar `notesForEditor` da.
- [ ] Kerak boʻlsa — «Oʻzbekiston uchun ahamiyati» bloki.
- [ ] Mualliflik (`copyright.md`) va SEO (`seo.md`) qoidalari bajarilgan.
