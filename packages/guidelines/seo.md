---
id: seo
title: SEO qoidalari
version: 1.0.0
updatedAt: 2026-09-23
---

# Blog Odya — SEO qoidalari

Qoidalar TZ §5.2, §5.3 va §8.5 ga asoslangan. Uzunlik chegaralari server tomonidan `save_rewrite` va `set_seo` chaqirilganda tekshiriladi (belgilar soni boʻshliqlar bilan birga hisoblanadi). SEO qoidalari stil va mualliflik qoidalaridan keyin turadi: kalit soʻz uchun matn sifati yoki faktlar aniqligi qurbon qilinmaydi.

## 1. Uzunlik chegaralari

| Maydon             | Chegara                   | Izoh                                                                                                    |
| ------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `title` (sarlavha) | **≤ 70 belgi**            | Sahifadagi `H1`                                                                                         |
| `seoTitle`         | **≤ 60 belgi**            | `<title>` va Google natijasi; brend («— Blog Odya») sayt tomonidan avtomatik qoʻshiladi, agent yozmaydi |
| `metaDescription`  | **140–160 belgi**         | Qidiruv natijasidagi tavsif                                                                             |
| `excerpt` (lid)    | 1–2 gap, 160–300 belgi    | Telegram postida ham ishlatiladi                                                                        |
| Asosiy matn        | **400–900 soʻz**          | Qisqa yangilik — kamida 400 soʻz; 900 dan uzun boʻlsa — boʻlimlarga boʻlinadi yoki qisqartiriladi       |
| Teglar             | **3–7 ta**                |                                                                                                         |
| Ichki havolalar    | **2–5 ta**                | `search_posts` orqali topiladi                                                                          |
| Tashqi havolalar   | **1+**                    | Manba (atributsiya)                                                                                     |
| FAQ                | **2–4 savol** (ixtiyoriy) |                                                                                                         |

## 2. Focus keyword (asosiy kalit soʻz)

- Har bir material uchun **bitta** asosiy kalit soʻz (`focusKeyword`) tanlanadi — oʻquvchi Googleda qidiradigan 1–4 soʻzli ibora: `iPhone 18 narxi`, `ChatGPT oʻzbek tilida`, `CS2 major 2026`.
- Kalit soʻz lotin yozuvida, oʻzbek tilida, tabiiy shaklda yoziladi. Kirill versiyasi uchun alohida kalit soʻz yozilmaydi — u avtomatik transliteratsiya qilinadi.
- Kalit soʻz albatta:
  - `title` da (iloji boricha boshiga yaqin);
  - `seoTitle` da;
  - lidda (`excerpt`);
  - `metaDescription` da;
  - kamida bitta `H2` sarlavhasida yoki birinchi abzasda boʻladi.
- Kalit soʻz matnda tabiiy takrorlanadi (100 soʻzga taxminan 1 marta). Kalit soʻzlarni tiqishtirish («keyword stuffing») taqiqlanadi.
- Brend va mahsulot nomlari asl yozilishida qoladi: `Samsung Galaxy S27`, `Dota 2`.

## 3. Sarlavhalar va meta

- `title` — oʻquvchi uchun; `seoTitle` — qidiruv uchun, qisqaroq va kalit soʻz boshida. Ikkalasi bir xil boʻlishi mumkin, agar `title` 60 belgidan oshmasa.
- `metaDescription` — maqolaning mazmuni va oʻquvchi nima olishini aytadigan 1–2 gap. Lidni soʻzma-soʻz takrorlamaydi. Oxirida harakatga undov boʻlishi mumkin («Narxlar va xususiyatlar — maqolada.»), lekin clickbait emas.
- Clickbait, bosh harflar, undov belgilari va emoji taqiqlanadi (`style.md`, 4.1).

## 4. Matn tuzilishi: H2/H3

- Maqola sarlavhasi — yagona `H1` (sayt tomonidan chiqariladi). Matn ichida `H1` (`#`) ishlatilmaydi.
- 400 soʻzdan uzun matnda kamida 2 ta `H2` (`##`) boʻladi. `H3` (`###`) faqat `H2` ichida.
- Boʻlim sarlavhalari mazmunli: «Narxi va chiqish sanasi», «Asosiy xususiyatlari», «Oʻzbekiston uchun ahamiyati». «Kirish», «Xulosa» kabi umumiy sarlavhalar ishlatilmaydi.
- Birinchi abzas (liddan keyingi) sarlavhasiz boshlanadi.
- Roʻyxatlar va jadvallar texnik xususiyatlar va taqqoslash uchun ishlatiladi — Google ularni snippetlarda koʻrsatadi.

## 5. Havolalar

- **Ichki havolalar: 2–5 ta.** `search_posts` orqali mavzuga yaqin chop etilgan materiallar topiladi. Havola matni mazmunli boʻladi («Apple oʻtgan yilgi taqdimoti»), «bu yerda», «batafsil» kabi soʻzlar ishlatilmaydi.
- Ichki havola nisbiy URL bilan beriladi: `/{kategoriya}/{slug}` (lotin). Kirill versiyasida `/kr/...` ga sayt avtomatik oʻtkazadi.
- Bitta ichki materialga ikki marta havola berilmaydi. Havolalar matn boʻylab tarqatiladi, birinchi abzasga toʻplanmaydi.
- **Tashqi havola: kamida 1 ta** — manba (atributsiya, `copyright.md`). Birlamchi manbaga (rasmiy blog, press-reliz) havola afzal.
- Mos ichki material topilmasa, havola sunʼiy qoʻshilmaydi — bu `notesForEditor` da qayd etiladi.

## 6. Kategoriya va teglar

- Har bir material — **bitta asosiy kategoriya** (URL da). Kategoriyalar (TZ §10.4): Sunʼiy intellekt (`suniy-intellekt`), Texnologiyalar (`texnologiyalar`), Gadjetlar (`gadjetlar`), Dasturlash (`dasturlash`), Kiberxavfsizlik (`kiberxavfsizlik`), Kibersport (`kibersport`), Oʻyinlar (`oyinlar`), Startaplar va biznes (`startaplar`), Ilm-fan (`ilm-fan`).
- **Teglar: 3–7 ta.** Kompaniya, mahsulot, oʻyin, jamoa, texnologiya nomlari: `Apple`, `iPhone`, `ChatGPT`, `CS2`, `Team Spirit`. Avval `list_tags` bilan mavjud teglar tekshiriladi; yangi teg faqat mos teg yoʻq boʻlsa yaratiladi.
- Teg kategoriyani takrorlamaydi (`Sunʼiy intellekt` kategoriyasidagi materialga «sunʼiy intellekt» tegi qoʻyilmaydi).
- Teglar aniq boʻladi: umumiy «Smartfon» oʻrniga brend yoki model (`iPhone`, `Galaxy S27`). Umumiy teglar faqat zarur boʻlsa qoʻyiladi.

## 7. FAQ

- FAQ ixtiyoriy: **2–4 ta** savol-javob, oʻquvchi haqiqatan qidiradigan savollar («iPhone 18 qachon sotuvga chiqadi?», «ChatGPT oʻzbek tilini tushunadimi?»).
- Javob — 1–3 gap, faqat materialdagi faktlar asosida. Yangi fakt qoʻshilmaydi.
- FAQ matnning oʻzida takrorlanmaydi — u `set_seo` orqali alohida beriladi va sahifada `FAQPage` strukturaviy maʼlumoti bilan chiqadi.
- Savol soʻroq belgisi bilan tugaydi.

## 8. Rasm `alt` matni

- `coverAlt` — rasmda nima tasvirlanganini aniq aytadigan 5–15 soʻz: «Qora rangli iPhone 18 Pro smartfoni orqa tomondan». Kalit soʻz tabiiy boʻlsa qoʻshiladi.
- «Rasm», «surat» soʻzlari bilan boshlanmaydi. Tiqishtirilgan kalit soʻzlar taqiqlanadi.

## 9. Slug

- Slug avtomatik `slugify-uz` bilan yaratiladi: lotin, kichik harflar, `ʻ`/`ʼ` olib tashlanadi, soʻzlar `-` bilan (`iphone-18-narxi-malum-boldi`). Slug ikkala yozuvda bir xil.
- Slug unikalligini server tekshiradi; agent slug yozmaydi.

## 10. Tekshiruv roʻyxati

- [ ] `title` ≤ 70, `seoTitle` ≤ 60, `metaDescription` 140–160 belgi.
- [ ] Matn 400–900 soʻz, kamida 2 ta `H2`.
- [ ] Focus keyword: `title`, `seoTitle`, lid, `metaDescription`, `H2` yoki birinchi abzas.
- [ ] 2–5 ichki havola, 1+ tashqi havola (manba).
- [ ] 3–7 teg, bitta kategoriya.
- [ ] FAQ (agar bor boʻlsa) — 2–4 savol.
- [ ] `coverAlt` yozilgan.
