# Savollar, qarorlar va kamchiliklar — Blog Odya

Holat: **barcha savollar yopildi (2026-09-23, 2-tur).** Egasi ishlab chiqishni boshlashni so'radi. Qarorlar [TZ.md](TZ.md) v1.2, [PLAN.md](PLAN.md) va [TASKS.md](TASKS.md) ga kiritilgan.

- ✅ **Javob berilgan** — egasi aniq javob bergan.
- ☑️ **Standart qaror** — egasi alohida javob bermagan ("tizimni quring"); TZ'dagi tavsiya qabul qilingan. Egasi istalgan vaqtda o'zgartirishi mumkin — ta'siri ko'rsatilgan.

---

## 1. Qarorlar jadvali

### 1.1. Biznes, brend, kontent
| # | Savol | Qaror | Holat | TZ/PLAN'dagi natija |
|---|---|---|---|---|
| Q1 | Domen | **blog.odya.uz** | ✅ | `media.odya.uz` — media |
| Q1-b | Brend nomi va logo | **"Blog Odya"**, logo yo'q | ✅ | Matnli wordmark, favicon, OG shablon — TASKS M0-06; TZ §12.1 |
| Q2 | Mualliflik huquqi modeli | **(a)** faktlar asosida qayta yozish + atributsiya | ✅ | TZ §2.3 |
| Q3 | Manbalar | **Ma'qul** (The Verge, TechCrunch, Habr, iXBT, Dexerto/HLTV) | ✅ | TZ §2.2, TASKS M0-04 |
| Q7 | Rollar va publish | **admin va editor**, ikkalasida publish | ✅ | TZ §4.2 |
| Q7-b | Editorlar soni, kimlar | Belgilanmaydi — **admin panelda admin foydalanuvchi yaratadi** | ✅ | Tizim editorlar soniga bog'liq emas |
| Q8 | Kunlik hajm | **Kvota yo'q** — qoralamaga tushgan va ulgurilgan hammasi | ✅ | TZ §1.3 |
| Q9 | Til va yozuv | **O'zbek: lotin va kirill** | ✅ | TZ §3.6 |
| Q29 | Kirillni har safar tekshirish kerakmi | **Yo'q, avtomatikaga ishoniladi** | ✅ | TZ §3.6 — majburiy kirill tekshiruvi yo'q |
| Q10 | AI o'zi publish qilsinmi | **Yo'q** — faqat admin/editor | ✅ | MCP'da publish tool yo'q |
| Q12 | Kategoriyalar | Egasi yordam so'radi → **9 kategoriya taklif qilindi va qabul qilindi** | ✅ | TZ §10.4 (lotin/kirill nomlar, slug'lar, mapping) |
| Q24 | Dizayn namunalari | Egasi yordam so'radi → **yo'nalish taklif qilindi** (The Verge + Habr + kun.uz, toza yangiliklar maketi, dark mode, mobil-birinchi) | ✅ | TZ §12, TASKS M0-06, M1-04 |
| Q11 | "AI yordamida tayyorlangan" belgisi | Agent qayta yozgan postlarda — ha (post sozlamasida o'chiriladi) | ☑️ | TZ §9.6 |
| Q13 | O'z (noyob) kontent | CMS qo'lda yozishni to'liq qo'llaydi; kontent rejasi — egasi ixtiyorida | ☑️ | — |
| Q14 | Muqova rasmlari manbasi | Press-kit / rasmiy rasmlar, Unsplash/Pexels, editor yaratgan rasmlar; manba rasmlari ishlatilmaydi | ☑️ | TZ §2.3 |
| Q4 | Monetizatsiya | MVP'da yo'q. **Reklamadan oldin Vercel Pro yoki Contabo majburiy** | ☑️ | TZ §3.7.2, PLAN M6-05 |
| Q5 | OAV sifatida ro'yxatdan o'tish | Egasi tizimdan mustaqil hal qiladi | ☑️ | TZ §9.6 |
| Q6 | Raqobatchilar | Farq: faqat IT/AI/kibersport, tezlik, lotin + kirill | ☑️ | — |
| Q31 | Rus tili | Hozircha yo'q; arxitektura tayyor | ☑️ | PLAN M6-03 |

### 1.2. Texnik va infratuzilma
| # | Savol | Qaror | Holat | TZ/PLAN'dagi natija |
|---|---|---|---|---|
| Q15 | Stek | **Ma'qul** — Next.js + Payload CMS 3 + PostgreSQL + S3 | ✅ | TZ §3.1 |
| Q16 | Hosting | Hozircha **Vercel + Supabase**, keyin Contabo | ✅ | TZ §3.7 |
| Q26 | Hisoblar | **Vercel, Supabase, Cloudflare — ochilgan** | ✅ | TASKS M0-02 (egasi sozlaydi) |
| Q30 | Byudjet | **Hozircha bepul tariflar** | ✅ | TZ §3.7.1–3.7.2: Vercel Hobby, Supabase Free, R2 free, scheduler `pg_cron`; **$0/oy** + domen; yangilash triggerlari |
| Q17 | LLM / API kaliti | **MCP orqali obuna yoki editor qo'lda** | ✅ | TZ §5, §6.3; server LLM — M6 (ixtiyoriy) |
| Q27 | Claude obunasi turi | Belgilanmaydi — har bir editor o'z obunasi bilan ulanadi | ✅ | `docs/mcp.md` (TASKS M2-07) |
| Q18 | Cloudflare | **Ha** | ✅ | DNS, R2, media CDN |
| Q19 | GitHub Actions | Ha (repo `Odya-LLC/blog_odya`) | ☑️ | CI, backup; bepul daqiqalar tejaladi |
| Q20 | MCP mijozlari | Claude Code (asosiy), Claude Desktop (`mcp-remote`); claude.ai — OAuth bilan M4 | ✅ | TZ §6.3 |
| Q28 | Contabo'ga qachon | TZ §3.7.2 triggerlari bo'yicha (monetizatsiya, DB ≥ 80%, pauza, kvota) | ☑️ | PLAN M4-01..03 |
| Q25 | Analitika hisoblari | Odya LLC akkaunti; ID'lar admin'da kiritiladi | ☑️ | TASKS M3-05 |

### 1.3. Kanallar
| # | Savol | Qaror | Holat | TZ/PLAN'dagi natija |
|---|---|---|---|---|
| Q21 | Telegram avtopost | **Kerak** | ✅ | TZ §7.1, TASKS M3-01 |
| Q21-b | Qaysi yozuvda, nechta kanal | **Ikkita alohida kanal** — lotin va kirill; kanallar hali yaratilmagan | ✅ | Egasi yaratadi — TASKS M0-03; ID'lar env/admin'da |
| Q22 | Izohlar | Saytda yo'q; Telegram kanal izohlarida | ☑️ | TZ §7 |
| Q23 | Newsletter | M6 (UZ serverda) | ☑️ | PLAN M6-04 |

---

## 2. Kamchilik va xatolar (asl topshiriqda) — holati

| # | Kamchilik / xato | Holat |
|---|---|---|
| 1 | Mualliflik huquqi xavfi e'tiborga olinmagan | ✅ Model (a) |
| 2 | Domen va brend yo'q edi | ✅ `blog.odya.uz`, "Blog Odya" |
| 3 | Til va yozuv aniqlanmagan | ✅ Lotin + kirill |
| 4 | Byudjet ko'rsatilmagan | ✅ $0/oy (bepul tariflar) + yangilash triggerlari |
| 5 | Tahririyat aniqlanmagan | ✅ Rollar aniq; foydalanuvchilar admin panelda |
| 6 | Kunlik hajm aniqlanmagan | ✅ Kvota yo'q |
| 7 | Monetizatsiya modeli yo'q | ☑️ Keyinroq; Hobby ToS sababli tarif o'zgarishi bilan bog'langan |
| 8 | Izohlar/moderatsiya | ☑️ Telegram izohlari |
| 9 | OAV ro'yxatdan o'tish | ☑️ Egasi mustaqil hal qiladi |
| 10 | Telegram eslatilmagan edi | ✅ 2 kanal, avtopost MVP'da |
| 11 | O'lchanadigan KPI yo'q | ✅ TZ §1.3 |
| 12 | Dizayn/brending eslatilmagan | ✅ TZ §12, M0-06, M1-04 |
| 13 | AI kontent siyosati yo'q | ✅ Inson publish qiladi + shaffoflik belgisi |
| 14 | Kibersport uchun faqat yangilik yetarli emas | ☑️ PLAN M6-06 |
| 15 | Noyob kontent rejasi yo'q | ☑️ Egasi ixtiyorida (CMS tayyor) |
| 16 | Backup, xavfsizlik, huquqiy sahifalar | ✅ TZ §9, TASKS M0-05, M3-02, M3-03 |
| 17 | Faqat rus manbalari (Habr, iXBT) | ✅ EN + RU aralash 5 manba |
| 18 | Serverlar UZ'dan tashqarida (shaxsiy ma'lumotlar qonuni) | ☑️ MVP'da o'quvchi ma'lumoti yig'ilmaydi; newsletter/izohlardan oldin UZ server |
| 19 | Kirill transliteratsiyasi 100% emas | ✅ Istisnolar lug'ati + qo'lda tuzatish; egasi avtomatikaga ishonadi |
| 20 | Agent ishi editor obunasiga bog'liq (kechasi avtomatik emas) | ☑️ Kerak bo'lsa M6-01 |
| 21 | **Yangi (v1.2):** Vercel Hobby — faqat notijorat foydalanish; Supabase Free — pauza va backup yo'q | ✅ TZ §3.7.2: xavf qabul qilingan, himoya choralari va majburiy o'tish triggerlari |

---

## 3. Takliflar (o'z kuchida)

1. **"Faktlar + kontekst"** — "O'zbekiston uchun bu nimani anglatadi" bloki (narxlar so'mda, mavjudligi).
2. **Agregatsiya** — bir mavzuda 2–3 manbani birlashtirish (M5-03).
3. **Telegram-first** — har postda kanalga obuna CTA (joriy yozuvdagi kanal).
4. **Kibersportda mahalliy burchak** — O'zbek jamoalari va turnirlari.
5. **Glossariy** — kelajakda "IT lug'at" SEO sahifasi (lotin + kirill).
6. **Google News Publisher Center** va **Yandex Webmaster** ga launch kuni ro'yxatdan o'tish (TASKS M3-05).
7. **Manbalar bilan hamkorlik** — Habr, 3DNews, Cybersport.ru ga qayta nashr ruxsati bo'yicha xat.
8. **Agent ish tartibi** — editor kuniga 1–2 marta MCP `daily_batch` prompt'i bilan 5–10 ta qoralama tayyorlaydi, keyin review qilib publish qiladi.
