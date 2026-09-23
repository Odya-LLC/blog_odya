---
id: copyright
title: Mualliflik huquqi qoidalari
version: 1.0.0
updatedAt: 2026-09-23
---

# Blog Odya — mualliflik huquqi qoidalari

Tasdiqlangan model (TZ §2.3): **faktlar asosida qayta yozish + atributsiya**. Soʻzma-soʻz tarjima qilinmaydi.

Asos: faktlar mualliflik huquqi bilan himoyalanmaydi, matn esa himoyalanadi. Soʻzma-soʻz tarjima — «hosila asar» boʻlib, uni ruxsatsiz chop etish Bern konvensiyasi, Oʻzbekiston Respublikasining «Mualliflik huquqi va turdosh huquqlar toʻgʻrisida»gi qonuni va AQSHning DMCA qonuni boʻyicha taqiqlangan. Bundan tashqari, Google qoʻshimcha qiymatsiz nusxa va tarjima kontentni («scaled content abuse») qidiruvda jazolaydi.

Bu qoidalar stil va SEO qoidalaridan ustun turadi.

## 1. Faktlar asosida qayta yozish

1. Manbadan **faktlar** olinadi: kim, nima, qachon, qayerda, qancha, qanday natija.
2. Matn **oʻzimiz tomonimizdan** yoziladi: gap tuzilishi, abzaslar tartibi, sarlavha va lid manbadagidan farq qiladi.
3. Manbadagi obrazli iboralar, metaforalar, hazillar va muallifning shaxsiy uslubi koʻchirilmaydi.
4. Manba matni ketma-ket, abzasma-abzas tarjima qilinmaydi. Avval faktlar roʻyxati tuziladi, soʻng oʻzbek oʻquvchisi uchun yangi tartibda yoziladi.
5. Oʻz qiymatimiz qoʻshiladi: kontekst (oldingi voqealar, raqobatchilar), narxlar soʻmda, «Oʻzbekiston uchun ahamiyati» bloki (`style.md`, 6-boʻlim), mahalliy misollar.
6. Bir voqea haqida bir nechta manba boʻlsa (`get_source` klasterdagi boshqa elementlarni qaytaradi), faktlar ular orasida solishtiriladi va hammasi atributsiyada koʻrsatiladi.
7. **Oʻylab topilgan faktlar, raqamlar, iqtiboslar va sanalar taqiqlanadi.** Noaniq, qarama-qarshi yoki tekshirib boʻlmaydigan joylar matnga kiritilmaydi — `notesForEditor` maydoniga yoziladi.
8. Server manba bilan n-gram oʻxshashlikni tekshiradi (TZ §5.3). Ogohlantirish kelsa, matn qayta ishlanadi — faqat soʻzlarni sinonimga almashtirish yetarli emas.

### Namuna

Manba (EN): _“Apple on Tuesday unveiled the iPhone 18, which the company says is its thinnest phone ever, starting at $999.”_

**Yomon** (soʻzma-soʻz tarjima): «Apple seshanba kuni iPhone 18 ni taqdim etdi, kompaniya uning eng yupqa telefoni ekanini aytmoqda, narxi 999 dollardan boshlanadi.»

**Yaxshi** (faktlar + oʻz matnimiz): «iPhone 18 — Apple tarixidagi eng yupqa smartfon. Kompaniya uni 2026-yil 22-sentabrda taqdim etdi. Asosiy versiya 999 dollar (taxminan 12,6 mln soʻm) turadi.»

## 2. Iqtiboslar

- Iqtibos **qisqa** boʻladi: **1–2 gap**. Bitta materialda iqtiboslar umumiy hajmi matnning 10 % idan oshmaydi.
- Iqtibos qoʻshtirnoqda (`« »`) va kimga tegishli ekani bilan beriladi: «Bu bizning eng muhim relizimiz», — dedi Apple bosh direktori Tim Kuk.
- Iqtibos manbaga havola bilan: kim aytgani va qayerda chop etilgani koʻrsatiladi («The Verge nashriga bergan intervyusida»).
- Iqtibos oʻzbek tiliga maʼnosi saqlangan holda tarjima qilinadi; maʼnosi oʻzgartirilmaydi, boshqa gaplar bilan qoʻshilmaydi.
- Rasmiy bayonotlar, press-relizlar va ommaviy chiqishlardagi iqtiboslar afzal. Jurnalist yoki sharhlovchining oʻz matnidan uzun parchalar iqtibos qilinmaydi.
- Oʻylab topilgan yoki «taxminiy» iqtibos **qatʼiyan taqiqlanadi**.

## 3. Atributsiya

- Har bir materialda ochiq atributsiya boʻladi. Sahifada «Manba» bloki `sources` maydonidan avtomatik chiqadi; `sources` boʻsh boʻlsa server materialni rad etadi.
- Format: **«Manba: [The Verge](https://www.theverge.com/...)»** — bosiladigan havola, asl material manzili. Bir nechta manba boʻlsa, hammasi vergul bilan: «Manba: [TechCrunch](...), [The Verge](...)».
- Matn ichida ham manba tilga olinadi, ayniqsa eksklyuziv maʼlumot, sizib chiqqan maʼlumot yoki baho keltirilganda: «TechCrunch xabariga koʻra», «The Verge manbalariga koʻra», «Habr foydalanuvchilari aniqlashicha».
- Manba nomi asl yozilishida: `The Verge`, `TechCrunch`, `Habr`, `iXBT`, `Dexerto`, `HLTV`.
- Manba boshqa nashrga tayansa, birlamchi manba ham koʻrsatiladi: «Bloomberg maʼlumotiga koʻra (TechCrunch orqali)».
- Tashqi havolalar birlamchi manbaga olib boradi (rasmiy blog, press-reliz, hisobot) — `seo.md` dagi «1+ tashqi havola» talabi shu bilan bajariladi.

## 4. Rasmlar siyosati

**Manba rasmlari ommaga chiqarilmaydi.** Ular faqat ichki arxivda (tahririyat uchun maʼlumot sifatida) saqlanadi.

Ruxsat etilgan rasmlar (`media.license` maydoni):

| Manba                                             | `license`      | Talab                                                                                            |
| ------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------ |
| Kompaniyaning press-kiti yoki rasmiy press-relizi | `press_kit`    | Kredit: «Rasm: Apple»                                                                            |
| Unsplash                                          | `unsplash`     | Kredit: «Rasm: Muallif ismi / Unsplash»                                                          |
| Pexels                                            | `pexels`       | Kredit: «Rasm: Muallif ismi / Pexels»                                                            |
| Wikimedia Commons                                 | `cc_by`        | Litsenziya shartlariga koʻra (CC BY, CC BY-SA); muallif va litsenziya havolasi (`licenseUrl`)    |
| Oʻzimiz yaratgan rasm yoki skrinshot              | `own`          | Skrinshot — fair use doirasida: sharh yoki yangilik uchun zarur, kichik qism                     |
| AI yordamida yaratilgan rasm                      | `ai_generated` | Kredit: «Rasm: AI yordamida yaratilgan». Real shaxs yoki voqeani aldamchi tasvirlash taqiqlanadi |
| Boshqa (maxsus ruxsat)                            | `other`        | Yozma ruxsat va izoh majburiy                                                                    |

Qoidalar:

- Har bir rasmda `alt` matni (majburiy), kerak boʻlsa `caption` va `credit` boʻladi.
- Agent rasm yuklamaydi va tanlamaydi — rasmni muharrir tanlaydi. Agent `set_seo` orqali muqova uchun `coverAlt` taklif qiladi va `notesForEditor` da qanday rasm mos kelishini yozishi mumkin (masalan, «Apple press-kitidan iPhone 18 rasmi»).
- Getty Images, Reuters, AP, AFP kabi agentliklar rasmlari litsenziyasiz ishlatilmaydi.
- Rasm ustiga boshqa nashr logotipi yoki suv belgisi tushgan boʻlsa, u ishlatilmaydi.

## 5. Manbalarga hurmat

- `robots.txt` va manbalarning foydalanish shartlari (ToS) hurmat qilinadi; RSS birinchi navbatda ishlatiladi.
- Paywall yoki login orqali yopiq kontentga kirish **taqiqlanadi**. Faqat RSS matni saqlanadigan manbalardan (`fetchMode = rss_only`) toʻliq matn olinmaydi.
- Toʻliq manba nusxasi — faqat ichki arxiv, ommaga ochiq emas.

## 6. Shikoyatlar

Mualliflik huquqi boʻyicha shikoyatlar «Mualliflik huquqi / shikoyatlar» sahifasi (`legal/mualliflik-huquqi.md`, sayt manzili `/mualliflik-huquqi`) orqali qabul qilinadi va **48 soat** ichida koʻrib chiqiladi. Asosli shikoyatda material tahrirlanadi yoki olib tashlanadi.

## 7. Tekshiruv roʻyxati

- [ ] Matn faktlar asosida qayta yozilgan, soʻzma-soʻz tarjima emas.
- [ ] Sarlavha va lid manbadagidan farq qiladi.
- [ ] Iqtiboslar 1–2 gap, qoʻshtirnoqda, kimga tegishli ekani koʻrsatilgan.
- [ ] Barcha manbalar `sources` da va matn ichida koʻrsatilgan.
- [ ] Oʻylab topilgan fakt yoki iqtibos yoʻq; noaniq joylar `notesForEditor` da.
- [ ] Manba rasmlari ishlatilmagan.
